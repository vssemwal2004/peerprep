import mongoose from "mongoose";
import AIInterview from "../../models/AIInterview.js";
import Resume from "../../models/Resume.js";
import AIAvatar from "../../models/AIAvatar.js";
import { createAvatarStorage } from "../../services/avatarStorage.js";
import { AVATAR_GESTURE_IDS } from "../../services/avatarDefinition.js";
import { HttpError } from "../../utils/errors.js";
import { observeVerifiedInterview } from "../../services/interviewEngagementService.js";
import { runForPlatform, runForTenant, currentTenant } from "../../platform/tenantContext.js";
import { anviConfig, budgetThresholds, durationBucket, liveCapSeconds } from "./anviInterview.config.js";
import { AnviAttempt, AnviLiveSession, AnviResumeContext, runtimeModeOf } from "./anviInterview.models.js";
import { currentTenantKey, defaultAudioAssets } from "./anviInterview.audioAssets.js";
import { createAudioStorage } from "./anviInterview.audioStorage.js";
import { createBudget as defaultCreateBudget } from "./anviInterview.budget.js";
import { lineAssetSpec } from "./anviInterview.hybridConductor.js";
import { anviPricing } from "./anviInterview.pricing.js";
import { ensureResumeProfile, resumeProfileText } from "./anviInterview.resume.js";
import { runtimeModeFor } from "./anviInterview.rollout.js";
import {
  attemptLanguageOf, buildPlan as defaultBuildPlan, createPlanGenerator, languageSetupOf, normalizeResumeSettings, resumeSetupOf, termsOf,
} from "./anviInterview.plan.js";
import { studentQuestionText } from "./anviInterview.prompts.js";
import { createGeminiClient } from "./anviInterview.gemini.js";
import { liveProctoringView, proctoringSetupOf, proctoringSummaryOfLive, studentProctoringView } from "./anviInterview.proctoring.js";
import { defaultUsageLedger } from "./anviInterview.usage.js";
import { stopAnviAttempt } from "./anviInterview.socket.js";
import {
  EVALUATED_ENDINGS, cohortForAttempt, evaluateAttemptSoon, evaluationQueueFields, itemInsightFields, reportOverall, reportSkills,
} from "./anviInterview.evaluation.js";

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const RESUME_TEXT_LIMIT = 6000;
const EXPECTED_ANSWER_LIMIT = 4000;
// Attempt statuses that mean the student reached the end (evaluation may still be running).
const FINISHED = new Set(["completed", "evaluating", "ready", "failed"]);
const MINUTE = 60_000;

const fail = (status, code, message) => { throw new HttpError(status, message, { code }); };
// The scheduling service builds on this module, so it is loaded on first use (no import cycle).
let schedulingModule;
const loadScheduling = () => (schedulingModule ||= import("./anviInterview.scheduling.service.js"));
// HTTP status for a refused assigned start; anything not listed is a 403.
const START_REFUSAL_STATUS = Object.freeze({
  INVALID_IDENTIFIER: 400, ASSIGNMENT_NOT_FOUND: 404, NOT_ASSIGNED: 404, NOT_FOUND: 404, INTERVIEW_NOT_FOUND: 404,
  ATTEMPT_LIMIT: 409, ATTEMPT_IN_PROGRESS: 409,
});
export const validAnviId = (value) => OBJECT_ID.test(String(value || ""));
// What the student accepted at the start, from the attempt.
const attemptTerms = (attempt) => ({ text: attempt?.termsText || "", acceptedAt: attempt?.termsAcceptedAt || null });
const objectId = (value, label = "identifier") => {
  if (!validAnviId(value)) fail(400, "INVALID_IDENTIFIER", `Invalid ${label}.`);
  return new mongoose.Types.ObjectId(String(value));
};

const PREVIOUS_ATTEMPTS = 2;
const hasGeneratedSlots = (data, resumeText) =>
  Boolean(resumeText) || (data?.sections || []).some((section) => (section?.groups || []).some((group) => group?.source === "annu"));

/**
 * The questions this student was asked in their last attempts of this interview ([{qid, text}]), so newly
 * generated questions avoid them. Only read when the plan generates questions; a failure never blocks a start.
 */
async function previousGeneratedQuestions(studentId, interviewId, data, resumeText) {
  if (!hasGeneratedSlots(data, resumeText)) return [];
  try {
    const attempts = await AnviAttempt.find({ studentId, interviewId, "items.0": { $exists: true } })
      .select("items.qid items.questionText").sort({ startedAt: -1 }).limit(PREVIOUS_ATTEMPTS).maxTimeMS(3000).lean();
    return attempts.flatMap((attempt) => (attempt.items || []).map((item) => ({ qid: item.qid, text: item.questionText })));
  } catch (error) {
    console.warn(`[ANVI] Previous questions unavailable for planning: ${error?.message || error}`);
    return [];
  }
}

// The real plan builder without a generator: same count and time estimate as a start, but
// generated questions fall back to placeholders, so listing never calls Gemini.
async function summarizeSnapshot(data, maxQuestions) {
  const { estimatedMinutes } = await defaultBuildPlan(data, { seed: "list", maxQuestions });
  return { estimatedMinutes };
}

// Plain-text view of the saved resume builder for question generation. Contact details are left out.
export function resumeToText(resume) {
  if (!resume) return "";
  const hidden = new Set(resume.hiddenSections || []);
  const lines = [];
  const entries = (title, rows = []) => {
    if (!rows.length) return;
    lines.push(`${title}:`);
    for (const row of rows) {
      const head = [row.title, row.subtitle, row.date].filter(Boolean).join(" | ");
      if (head) lines.push(`- ${head}`);
      if (row.technologies) lines.push(`  Technologies: ${row.technologies}`);
      for (const bullet of row.bullets || []) if (bullet.text) lines.push(`  * ${bullet.text}`);
    }
  };
  if (resume.basics?.headline) lines.push(`Headline: ${resume.basics.headline}`);
  if (!hidden.has("education") && resume.education?.length) {
    lines.push("Education:");
    for (const row of resume.education) lines.push(`- ${[row.degree, row.institute, row.year, row.score].filter(Boolean).join(" | ")}`);
  }
  if (!hidden.has("experience")) entries("Experience", resume.experience);
  if (!hidden.has("projects")) entries("Projects", resume.projects);
  if (!hidden.has("skills") && resume.skills?.length) {
    lines.push("Skills:");
    for (const row of resume.skills) lines.push(`- ${[row.category, row.skills].filter(Boolean).join(": ")}`);
  }
  if (!hidden.has("achievements")) entries("Achievements", resume.achievements);
  for (const section of resume.customSections || []) if (!hidden.has(section.id)) entries(section.title, section.entries);
  return lines.join("\n").slice(0, RESUME_TEXT_LIMIT);
}

// The published rubric as it was when the attempt started.
const rubricSnapshotOf = (data) => (Array.isArray(data?.rubric) ? data.rubric : [])
  .filter((criterion) => criterion?.id)
  .map((criterion) => ({ id: String(criterion.id), name: criterion.name || "", weight: Number(criterion.weight) || 0, description: criterion.description || "" }));

// Same rules as the conductors' own finalize: an item shows what ANVI actually asked when that was
// captured, and a skip only counts when the candidate said little else.
const SKIP_MAX_WORDS = 12;

/** Durable per-question record built from the plan and whatever answers the live doc holds. */
export function itemsFromLive(live) {
  const answers = live?.answers || {};
  const cursor = Number(live?.cursor) || 0;
  const started = Boolean(live?.phase) && live.phase !== "intro";
  return (live?.plan || []).map((planned, index) => {
    const answer = answers[planned.qid] || {};
    const text = String(answer.text || "").trim();
    const skipped = Boolean(answer.skipRequested) && (Number(answer.substantiveWords) || 0) <= SKIP_MAX_WORDS;
    return {
      // Whether ANVI ever presented this question; unasked questions never reach a student response.
      asked: Boolean(answer.asked) || Boolean(text) || (started && index <= cursor),
      qid: planned.qid,
      n: planned.n,
      sectionId: planned.sectionId,
      sectionName: planned.sectionName,
      topic: planned.topic,
      competency: planned.competency,
      // The line the candidate heard (Live captures it for topic items only; hybrid for every question).
      questionText: answer.spokenQuestion || planned.text,
      followUpsAsked: Array.isArray(answer.followUpsAsked) ? answer.followUpsAsked : [],
      answerText: text,
      answerSource: text ? (answer.source === "transcribe" ? "transcribe" : "live") : "none",
      answerSeconds: Number(answer.seconds) || 0,
      candidateTurns: Number(answer.candidateTurns) || 0,
      status: skipped ? "skipped" : text ? "answered" : "not_attempted",
      expectedKeyPoints: planned.keyPoints || [],
      expectedAnswer: String(planned.expectedAnswer || "").slice(0, EXPECTED_ANSWER_LIMIT),
      maxMarks: planned.marks ?? 10,
      weight: planned.weight ?? 1,
      flags: [...(Array.isArray(answer.flags) ? answer.flags : []), ...(answer.silent && !text ? ["silent"] : [])],
    };
  });
}

/**
 * itemsFromLive plus, for hybrid answers only (Live answers never carry them), the transcript* fields and
 * `turns` that hybridRuntime.buildItems adds, so a REST end or a sweep stores what the conductor would.
 * itemsFromLive itself keeps its shape, skip and status semantics.
 */
export function durableItemsFromLive(live) {
  const answers = live?.answers || {};
  return itemsFromLive(live).map((item) => ({ ...item, ...hybridItemFields(answers[item.qid] || {}) }));
}

// The same hybrid-only fields hybridRuntime.buildItems copies.
const HYBRID_ITEM_FIELDS = [
  "transcriptModel", "transcriptAttempts", "transcriptEscalated", "transcriptAudioSeconds", "transcriptTokenUsage", "transcriptLowConfidence",
];
function hybridItemFields(answer) {
  const out = {};
  for (const field of HYBRID_ITEM_FIELDS) if (answer[field] !== undefined) out[field] = answer[field];
  if (Array.isArray(answer.turns) && answer.turns.length) {
    out.turns = answer.turns.map((turn) => ({ kind: String(turn?.kind || "answer"), text: String(turn?.text || "") }));
  }
  return out;
}

/** Tells scheduling that an assigned attempt ended (target outcome, booking); a failure is logged, never thrown. */
export async function notifyAssignedFinalized(attempt, onFinalized) {
  if (!attempt?.assignmentId) return;
  try {
    await (onFinalized || (await loadScheduling()).onAttemptFinalized)(attempt);
  } catch (error) {
    console.warn(`[ANVI] Assigned attempt ${attempt._id} ended but its schedule was not updated: ${error?.message || error}`);
  }
}

/**
 * Removes the resume text an ended attempt was planned from: its questions are already in the plan and
 * report, so the text is not kept any longer. A failure is logged, never thrown (the TTL still removes it).
 */
export async function discardResumeContext(attempt) {
  try {
    const owner = attempt?.studentId && attempt?.interviewId
      ? attempt
      : await AnviAttempt.findById(attempt?._id).select("studentId interviewId assignmentId").lean();
    if (!owner?.studentId || !owner?.interviewId) return;
    await AnviResumeContext.deleteOne({ studentId: owner.studentId, interviewId: owner.interviewId, assignmentId: owner.assignmentId || null });
  } catch (error) {
    console.warn(`[ANVI] Resume text of attempt ${attempt?._id} not removed: ${error?.message || error}`);
  }
}

/**
 * Ends an in-progress attempt from its stored answers and queues its evaluation in the same write.
 * Returns false if something else already ended it. `attempt` must carry `assignmentId` (when it has one)
 * so an assigned attempt also settles its schedule.
 */
export async function finalizeFromLive(attempt, { status, endReason, now = new Date(), evaluateSoon = evaluateAttemptSoon, onFinalized }) {
  const live = await AnviLiveSession.findOne({ attemptId: attempt._id }).lean();
  const set = { status, endReason, endedAt: now, ...evaluationQueueFields(status, now) };
  const proctoring = live ? proctoringSummaryOfLive(live, now) : null;
  if (live) Object.assign(set, { items: durableItemsFromLive(live), totalQuestions: live.plan.length, ...(live.warmupTranscript ? { warmup: live.warmupTranscript } : {}), ...(proctoring ? { proctoring } : {}) });
  const result = await AnviAttempt.updateOne({ _id: attempt._id, status: "in_progress" }, { $set: set });
  await AnviLiveSession.deleteOne({ attemptId: attempt._id });
  const applied = result.modifiedCount > 0;
  if (applied) await discardResumeContext(attempt);
  if (applied && EVALUATED_ENDINGS.has(status)) evaluateSoon?.(attempt._id);
  if (applied) await notifyAssignedFinalized({ ...attempt, status, endReason, endedAt: now, partial: Boolean(set.partial) }, onFinalized);
  return applied;
}

// What the student sees of the evaluation pipeline for a finished attempt.
function reportState(attempt) {
  if (attempt.status === "in_progress") return null;
  if (attempt.status === "ready") return "ready";
  if (attempt.status === "failed") return "failed";
  if (attempt.status === "completed" || attempt.status === "evaluating") return "preparing";
  return ["pending", "processing", "failed"].includes(attempt.pendingWork?.status) ? "preparing" : "unavailable";
}

// Questions the student actually heard: an item stored before `asked` existed counts as asked.
const presented = (item) => item?.asked !== false || item.status === "answered" || item.status === "skipped";

const reportItem = (item, { withKeyPoints = true } = {}) => ({
  n: item.n,
  sectionName: item.sectionName || "",
  competency: item.competency || "",
  questionText: studentQuestionText(item.questionText),
  answerText: item.answerText || "",
  status: item.status,
  marks: item.marks ?? 0,
  maxMarks: item.maxMarks ?? 10,
  percentCorrect: item.percentCorrect ?? 0,
  feedback: item.feedback || "",
  // Practice mode shows the key points and how each one was judged; the authored answer never leaves.
  // They stay hidden while the interview's questions are still in use by a schedule (see keyPointsWithheld).
  expectedKeyPoints: withKeyPoints ? item.expectedKeyPoints || [] : [],
  matched: withKeyPoints ? item.matched || [] : [],
  partial: withKeyPoints ? item.partial || [] : [],
  missed: withKeyPoints ? item.missed || [] : [],
  ...(withKeyPoints ? {} : { keyPointsWithheld: true }),
  strengths: item.strengths || [],
  improvements: item.improvements || [],
  metrics: item.metrics ? { words: item.metrics.words ?? 0, wpm: item.metrics.wpm ?? null, fillerCount: item.metrics.fillerCount ?? 0 } : null,
  // Time the student spent on this question, and (report v2) its dimensions and functional split.
  answerSeconds: Number(item.answerSeconds) || 0,
  ...itemInsightFields(item),
});

// `scheduling` replaces the scheduling service in tests ({ practiceBlocked, checkAssignedStart,
// recordAssignedAttempt, onAttemptFinalized }); by default the real one is loaded on first use.
// `usage` replaces the shared Gemini usage ledger.
// Hybrid runtime (tests): `pricing` (anviPricing object), `audioStorage` ({ready}), `audioAssets` ({ensure, load}),
// `createBudget`, `log`. They are only read when the hybrid flag is on, or for the audio route.
export function createAnviService({
  gemini, buildPlan = defaultBuildPlan, config, clock = Date, evaluateSoon = evaluateAttemptSoon, scheduling, usage, avatarModel = AIAvatar, avatarStorage,
  pricing, audioStorage, audioAssets, createBudget = defaultCreateBudget, log = console,
} = {}) {
  const settings = () => config || anviConfig();
  const ledger = () => usage || defaultUsageLedger();
  let client = gemini;
  const geminiClient = () => (client ||= createGeminiClient({ config: settings() }));
  const now = () => new Date(clock.now());
  const schedule = async () => scheduling || loadScheduling();
  const onFinalized = scheduling?.onAttemptFinalized;
  const mediaStorage = avatarStorage || createAvatarStorage();
  const finalize = (attempt, outcome) => finalizeFromLive(attempt, { ...outcome, evaluateSoon, ...(onFinalized ? { onFinalized } : {}) });

  async function avatarSnapshot(data) {
    const setting = data?.anvi?.avatar;
    if (!setting?.enabled || !validAnviId(setting.avatarId)) return undefined;
    const doc = await avatarModel.findOne({ _id: setting.avatarId, active: true }).select("data.name gestures").lean();
    if (!doc) return undefined;
    const gestures = Object.fromEntries(Object.entries(doc.gestures || {})
      .filter(([id, asset]) => AVATAR_GESTURE_IDS.includes(id) && asset?.key)
      .map(([id, asset]) => [id, { key: asset.key, mime: asset.mime || "video/mp4" }]));
    if (!gestures.idle || !gestures.speaking_neutral) return undefined;
    return { enabled: true, avatarId: String(doc._id), name: doc.data?.name || "ANVI", gestures };
  }

  function studentAvatarView(snapshot) {
    if (!snapshot?.enabled || !mediaStorage.ready) return { enabled: false };
    return {
      enabled: true,
      name: snapshot.name || "ANVI",
      gestures: Object.fromEntries(Object.entries(snapshot.gestures || {}).map(([id, asset]) => [id, {
        mime: asset.mime || "video/mp4",
        url: mediaStorage.signedUrl(asset.key, "GET", 4 * 60 * 60),
      }])),
    };
  }

  // The engagement receipt lets Prep Score and coin verification see the start; it never blocks one.
  const recordStart = (student, interviewId, attemptId) =>
    observeVerifiedInterview({ user: student, path: `/${interviewId}/start`, method: "POST" }, { id: String(attemptId), status: "active" })
      .catch((error) => console.warn(`[ANVI] Interview receipt pending: ${error.message}`));

  async function listStudentInterviews(student) {
    const interviews = await AIInterview.find({ lifecycle: "draft", publishedAt: { $ne: null } })
      .select("title role companyName requiresResume publishedAt publishedSnapshot.data")
      .sort({ publishedAt: -1, _id: -1 }).limit(200).maxTimeMS(8000).lean();
    if (!interviews.length) return [];
    // Practice cards only: scheduled attempts are listed by the scheduling service.
    const attempts = await AnviAttempt.find({ studentId: student._id, interviewId: { $in: interviews.map((row) => row._id) }, assignmentId: null })
      .select("interviewId status partial startedAt endedAt hardDeadline").sort({ startedAt: -1 }).maxTimeMS(8000).lean();
    const at = now();
    const maxMinutes = settings().maxSessionMinutes;
    const resumes = await AnviResumeContext.find({ studentId: student._id, assignmentId: null, interviewId: { $in: interviews.map((row) => row._id) }, expiresAt: { $gt: at } })
      .select("interviewId source createdAt").maxTimeMS(8000).lean();
    const resumeByInterview = new Map(resumes.map((row) => [String(row.interviewId), row]));
    const { practiceBlocked, practiceBlockedIds } = await schedule();
    // One query for the page when the scheduling service offers it.
    const blockedIds = practiceBlockedIds ? await practiceBlockedIds(interviews.map((row) => String(row._id))) : null;
    const isBlocked = (id) => (blockedIds ? blockedIds.has(String(id)) : practiceBlocked(id));
    return Promise.all(interviews.filter((row) => row.publishedSnapshot?.data).map(async (row) => {
      const data = row.publishedSnapshot.data;
      const own = attempts.filter((attempt) => String(attempt.interviewId) === String(row._id));
      const active = own.find((attempt) => attempt.status === "in_progress" && new Date(attempt.hardDeadline) > at);
      const last = own.find((attempt) => attempt.status !== "in_progress");
      const [{ estimatedMinutes }, blocked] = await Promise.all([summarizeSnapshot(data, settings().maxQuestionsPerInterview), isBlocked(row._id)]);
      const languageSetup = languageSetupOf(data);
      return {
        id: String(row._id),
        title: data.title || row.title,
        role: data.role || row.role || "",
        companyName: row.companyName || data.companyName || "",
        difficulty: data.difficulty || "",
        experience: data.experience || "",
        // The primary interview language (a string, as before); languageSetup has the student's choices.
        language: languageSetup.primary,
        languageSetup,
        requiresResume: Boolean(row.requiresResume),
        estimatedMinutes: Math.min(maxMinutes, estimatedMinutes),
        // A scored abandoned attempt (partial) still does not count as completing the interview.
        status: active ? "active" : own.some((attempt) => FINISHED.has(attempt.status) && !attempt.partial) ? "completed" : "not_started",
        activeAttemptId: active ? String(active._id) : null,
        lastAttempt: last ? { id: String(last._id), status: last.status, endedAt: last.endedAt, partial: Boolean(last.partial) } : null,
        // A scheduled assignment of this interview keeps it out of practice for everyone (no question leaks).
        practiceBlocked: Boolean(blocked),
        // The lobby shows the terms to accept and the resume step (mode, allowed sources, already provided).
        terms: termsOf(data),
        resumeSetup: resumeSetupOf(data, resumeByInterview.get(String(row._id))),
        // The proctoring step before the start (fullscreen, tab switches, rejoins, the violation limit).
        proctoring: proctoringSetupOf(data),
      };
    }));
  }

  /**
   * Language, terms and resume checks for a new attempt (resuming one never asks again). Returns what the
   * attempt stores: its language, the resume text for planning, its source, and the accepted terms.
   */
  async function startRequirements(student, data, { interviewId, assignmentId = null, termsAccepted = false, resumeConsent = false, language: requested }) {
    const language = attemptLanguageOf(data, requested);
    if (!language) {
      const { choices } = languageSetupOf(data);
      fail(400, "LANGUAGE_NOT_ALLOWED", choices.length === 1
        ? `This interview is conducted in ${choices[0]} only.`
        : `Choose one of the interview languages: ${choices.join(", ")}.`);
    }
    const terms = termsOf(data);
    if (terms.required && termsAccepted !== true)
      fail(400, "TERMS_REQUIRED", "Please read and accept the interview terms before starting.");
    const resume = normalizeResumeSettings(data);
    let resumeText = "";
    let resumeSource = null;
    // The stored row, so a hybrid attempt can reuse (or store) its compact profile.
    let resumeRow = null;
    if (resume.mode !== "none") {
      const stored = await AnviResumeContext.findOne({ studentId: student._id, interviewId, assignmentId, expiresAt: { $gt: now() } })
        .select("studentId text source contentHash profile profilePromptVersion profileModel").lean();
      if (stored?.text && resume.sources.includes(stored.source)) {
        resumeText = stored.text;
        resumeSource = stored.source;
        resumeRow = stored;
      } else if (resumeConsent && resume.sources.includes("builder")) {
        resumeText = resumeToText(await Resume.findOne({ student: student._id }).lean());
        if (resumeText) resumeSource = "builder";
      }
      if (!resumeText && resume.mode === "required")
        fail(400, "RESUME_REQUIRED", "This interview asks about your resume. Add it from your Resume Builder or upload one before starting.");
    }
    return {
      language, resumeText, resumeSource, resumeRow,
      termsText: terms.text || undefined,
      termsAcceptedAt: terms.text && termsAccepted === true ? now() : null,
    };
  }

  /** The practice start's language, terms and resume checks, run before any Prep Coin charge; an active attempt skips them. */
  async function assertPracticeStartReady(student, interviewId, { termsAccepted = false, resumeConsent = false, language } = {}) {
    const definitionId = objectId(interviewId, "interview");
    if (await AnviAttempt.exists({ studentId: student._id, interviewId: definitionId, status: "in_progress" })) return;
    const interview = await AIInterview.findOne({ _id: definitionId, lifecycle: "draft", publishedAt: { $ne: null } }).select("publishedSnapshot.data").lean();
    // A missing interview is left to the handler's 404.
    if (interview?.publishedSnapshot?.data) await startRequirements(student, interview.publishedSnapshot.data, { interviewId: definitionId, termsAccepted, resumeConsent, language });
  }

  /** 403 PRACTICE_BLOCKED while a scheduled or open assignment of this interview blocks practice. */
  async function assertPracticeAllowed(interviewId) {
    const { practiceBlocked } = await schedule();
    if (await practiceBlocked(objectId(interviewId, "interview")))
      fail(403, "PRACTICE_BLOCKED", "This interview is scheduled by your institution, so practice is unavailable until the schedule ends.");
  }

  // Returns the in-progress attempt when it can still be joined; a stale one is closed first.
  async function resumable(student, filter) {
    const attempt = await AnviAttempt.findOne({ studentId: student._id, ...filter, status: "in_progress" }).lean();
    if (!attempt) return null;
    const at = now();
    const live = await AnviLiveSession.exists({ attemptId: attempt._id });
    if (live && new Date(attempt.hardDeadline) > at) return attempt;
    await finalize(attempt, { status: at >= new Date(attempt.hardDeadline) ? "expired" : "abandoned", endReason: "stale", now: at });
    return null;
  }

  const assignedElsewhere = () =>
    fail(409, "ASSIGNED_ATTEMPT_ACTIVE", "This interview is in progress as a scheduled interview. Continue it from Scheduled for you.");

  // --- Hybrid runtime -----------------------------------------------------------------------
  let hybridPricing = pricing;
  let hybridStorage = audioStorage;
  const assetStore = () => audioAssets || defaultAudioAssets();

  /** "hybrid" or "live" for a new attempt (rollout.runtimeModeFor). With the flag off nothing else is read. */
  function chooseRuntimeMode(student, fields = {}, language) {
    const cfg = settings();
    if (!cfg.hybridEnabled) return "live";
    try {
      hybridPricing ||= anviPricing(process.env, cfg);
      hybridStorage ||= createAudioStorage({ config: cfg });
      return runtimeModeFor({
        config: cfg, tenantKey: currentTenantKey(), studentId: String(student?._id || ""), mode: fields.mode || "practice",
        scheduled: Boolean(fields.assignmentId), language, pricing: hybridPricing, storage: hybridStorage,
      }, { log }).runtimeMode;
    } catch (error) {
      log.warn?.(`[ANVI] Runtime mode check failed; the attempt runs Live (${error?.name || "Error"}).`);
      return "live";
    }
  }

  // The compact resume profile (<= 600 characters) for a hybrid plan; "" when extraction fails (the plan then
  // uses the full text, as a Live plan does). A builder resume has no stored row, so its profile is not kept.
  async function compactResume(student, row, text, onUsage) {
    try {
      const profile = await ensureResumeProfile(row?.text ? row : { studentId: student._id, text }, {
        gemini: geminiClient(), model: settings().generateModel, tenantKey: currentTenantKey(), onUsage,
      });
      return profile ? resumeProfileText(profile) : "";
    } catch {
      return "";
    }
  }

  // Attempt-scoped TTS for the per-student lines (generated, resume, topic questions), fire-and-forget under
  // the captured tenant: the conductor finds them ready (or waits at most 3 s for Q1, then shows text). Static
  // lines resolve their publish-time asset by hash on first use. A start never waits for or fails on TTS.
  // `spent`: the start's planning calls (question generation, resume profile). They and the warm-up TTS are
  // also charged to the attempt's budget (recordReserved, never gated), so the room's budget, seeded from
  // Valkey and the live-doc mirror, starts from what the start already spent.
  function warmQuestionAudio(attempt, built, onUsage, spent = []) {
    const cfg = settings();
    const tenant = currentTenant();
    const persona = built?.persona || {};
    const voice = /^[A-Za-z]{2,30}$/.test(String(persona.voice || "")) ? persona.voice : cfg.ttsVoice || cfg.liveVoice;
    const specs = (built?.plan || []).map((item) => lineAssetSpec(item, { attempt })).filter((spec) => spec?.scope === "attempt");
    const budget = startBudget(attempt);
    if (!specs.length && (!budget || !spent.length)) { budget?.dispose(); return; }
    const charges = [];
    const reserve = (payload) => {
      if (budget) charges.push(Promise.resolve().then(() => budget.recordReserved(payload)).catch(() => null));
    };
    const charge = Object.assign((payload) => { onUsage(payload); reserve(payload); }, { metric: (...args) => onUsage.metric?.(...args) });
    const work = async () => {
      for (const payload of spent) reserve(payload);
      const store = specs.length ? assetStore() : null;
      for (const spec of specs) {
        // One at a time, in plan order, so Q1's clip is ready first and TTS calls stay at about one per second.
        await Promise.resolve(store.ensure({ ...spec, language: "English", voice, onUsage: charge })).catch(() => null);
      }
      if (!budget) return;
      await Promise.all(charges);
      try { await budget.flush(); } finally { budget.dispose(); }
    };
    Promise.resolve()
      .then(() => (tenant ? runForTenant(tenant, work) : runForPlatform(work)))
      .catch((error) => log.warn?.(`[ANVI] Question audio warm-up failed (${error?.name || "Error"}).`));
  }

  // The start's own view of the attempt's budget (no lease yet; the mirror only ever goes up through $max).
  function startBudget(attempt) {
    try {
      const cfg = settings();
      return createBudget({
        tenantKey: currentTenantKey(), attemptId: attempt._id, runtimeMode: "hybrid",
        durationMinutes: attempt.durationMinutes ?? null, liveCapSeconds: attempt.liveCapSeconds ?? null, hardDeadline: attempt.hardDeadline,
        config: cfg, clock, log,
        ...(typeof hybridPricing?.conservativeUsd === "function" ? { pricing: hybridPricing } : {}),
        mirror: {
          read: () => AnviLiveSession.findOne({ attemptId: attempt._id }).select("budget liveSecondsUsed").lean(),
          write: (update) => AnviLiveSession.updateOne({ attemptId: attempt._id }, update),
        },
      });
    } catch (error) {
      log.warn?.(`[ANVI] Start spend not charged to the attempt budget (${error?.name || "Error"}).`);
      return null;
    }
  }

  /**
   * The bytes of one question clip for the student's running attempt (the socket's fallback), or null: the
   * attempt must be theirs and in progress, and audioAssets.load authorizes the asset against it (same
   * tenant, its interview revision, a tenant template, or this attempt). There is no listing.
   */
  async function attemptAudio(student, attemptId, assetId) {
    if (!validAnviId(attemptId) || !validAnviId(assetId)) return null;
    const attempt = await AnviAttempt.findOne({ _id: attemptId, studentId: student._id })
      .select("_id studentId interviewId snapshotRevision status hardDeadline runtimeMode").lean();
    if (!attempt || attempt.status !== "in_progress" || new Date(attempt.hardDeadline) <= now()) return null;
    return assetStore().load(assetId, attempt);
  }

  /**
   * Plans and creates an attempt plus its live state. `fields` are the attempt's own fields (mode,
   * revision, assignment), `deadlineCap` shortens the deadline, `onRace` decides about an in-progress
   * attempt that a parallel request created first, and `afterCreate` runs before the start is recorded.
   */
  async function launchAttempt(student, { definitionId, data, prepared, signal, fields, deadlineCap = null, onRace, afterCreate }) {
    const cfg = settings();
    const { language = null, resumeText = "", resumeSource = null, resumeRow = null, termsText, termsAcceptedAt = null } = prepared || {};
    const attemptId = new mongoose.Types.ObjectId();
    // Chosen once here and stamped on the attempt; a resumed or raced attempt keeps its own mode.
    const hybrid = chooseRuntimeMode(student, fields, language || languageSetupOf(data).primary) === "hybrid";
    // Question generation (ANVI-prompt topics, resume questions) is metered against the new attempt.
    const onUsage = ledger().recorder({ attemptId, studentId: student._id, interviewId: definitionId, ...(hybrid ? { runtimeMode: "hybrid" } : {}) });
    // Hybrid: the planning calls are kept too, to be charged to the attempt's budget once it exists.
    const planSpend = [];
    const meter = hybrid ? Object.assign((payload) => { onUsage(payload); planSpend.push(payload); }, { metric: (...args) => onUsage.metric?.(...args) }) : onUsage;
    const generate = createPlanGenerator(geminiClient(), { model: cfg.generateModel, onUsage: meter });
    const previousQuestions = await previousGeneratedQuestions(student._id, definitionId, data, resumeText);
    // A hybrid attempt plans for its duration and sends the compact resume profile, not the full resume.
    // An admin duration above ANVI_MAX_SESSION_MINUTES becomes the longest duration that fits, so the plan,
    // the deadline, the Live cap and the budget thresholds all agree.
    const adminMinutes = hybrid ? Number(data?.anvi?.durationMinutes) || null : null;
    const plannedMinutes = adminMinutes && adminMinutes > cfg.maxSessionMinutes ? durationBucket(cfg.maxSessionMinutes) : adminMinutes;
    const resumeProfile = hybrid && resumeText ? await compactResume(student, resumeRow, resumeText, meter) : "";
    let built;
    try {
      built = await buildPlan(data, {
        resumeText, generate, seed: String(attemptId), previousQuestions,
        maxQuestions: cfg.maxQuestionsPerInterview,
        ...(language ? { language } : {}),
        ...(hybrid ? { runtimeMode: "hybrid", ...(plannedMinutes ? { durationMinutes: plannedMinutes } : {}), resumeProfile } : {}),
      });
      built.plan = built.plan.map((item) => ({
        ...item,
        followUpBudget: Math.min(Number(item.followUpBudget) || 0, Number(cfg.maxFollowUpsPerQuestion ?? Infinity)),
      }));
    } catch (error) {
      if (String(error?.code || "").startsWith("GEMINI_"))
        fail(503, "AI_UNAVAILABLE", "ANVI could not prepare this interview right now. Please try again in a minute.");
      throw error;
    }
    if (!built?.plan?.length) fail(422, "INTERVIEW_EMPTY", "This interview has no questions yet.");
    const avatar = await avatarSnapshot(data);
    const startedAt = now();
    // A hybrid attempt with an admin duration runs for that duration; otherwise the plan's estimate (as before).
    const minutes = Math.max(1, Math.min(cfg.maxSessionMinutes, Math.ceil(plannedMinutes || built.estimatedMinutes || cfg.maxSessionMinutes)));
    // anvi.durationMinutes, else the legacy estimate; the Live cap is the bucket at or below it.
    const durationMinutes = hybrid ? plannedMinutes || minutes : null;
    const hybridFields = hybrid ? { runtimeMode: "hybrid", durationMinutes, liveCapSeconds: liveCapSeconds(durationMinutes, cfg) } : null;
    let deadline = startedAt.getTime() + minutes * MINUTE;
    const cap = deadlineCap ? new Date(deadlineCap).getTime() : NaN;
    if (Number.isFinite(cap) && cap < deadline) deadline = cap;
    if (deadline - startedAt.getTime() < MINUTE) fail(403, "WINDOW_CLOSED", "There is not enough time left in this interview window to start.");
    const hardDeadline = new Date(deadline);
    if (signal?.aborted) fail(499, "REQUEST_ABORTED", "The start request was cancelled.");
    let attempt;
    try {
      attempt = await AnviAttempt.create({
        _id: attemptId,
        studentId: student._id,
        interviewId: definitionId,
        ...fields,
        // The one interview language of this attempt (validated choice > anvi.language.primary > rules.language).
        language: language || built.rules?.language || languageSetupOf(data).primary,
        startedAt,
        hardDeadline,
        totalQuestions: built.plan.length,
        resumeConsent: Boolean(resumeText),
        resumeSource,
        ...(termsText ? { termsText } : {}),
        termsAcceptedAt,
        rubricSnapshot: rubricSnapshotOf(data),
        ...(hybridFields || {}),
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      // A parallel request (another tab, a retry) created it first: join that one.
      const winner = await AnviAttempt.findOne({ studentId: student._id, interviewId: definitionId, status: "in_progress" }).select("_id assignmentId termsText termsAcceptedAt language").lean();
      if (!winner) throw error;
      onRace(winner);
      await recordStart(student, definitionId, winner._id);
      return { id: String(winner._id), status: "active", resumed: true, terms: attemptTerms(winner), language: winner.language || null };
    }
    // Without its runtime state (or its schedule record) the attempt can never run; it is removed so a
    // coin charge is refunded and no assigned attempt is used up.
    const discard = async () => {
      await AnviLiveSession.deleteOne({ attemptId }).catch(() => {});
      await AnviAttempt.deleteOne({ _id: attemptId }).catch(() => {});
    };
    try {
      await AnviLiveSession.create({
        attemptId,
        studentId: student._id,
        plan: built.plan.map((item) => (item.expectedAnswer ? { ...item, expectedAnswer: String(item.expectedAnswer).slice(0, EXPECTED_ANSWER_LIMIT) } : item)),
        persona: built.persona || {},
        // The conductor reads the interview's turn settings (silence, nudges, voice commands), the warm-up
        // and the conduct rules from here; the terms text stays on the attempt.
        rules: {
          ...(built.rules || {}),
          ...(built.turns ? { turns: built.turns } : {}),
          ...(built.warmup ? { warmup: built.warmup } : {}),
          ...(built.conduct ? { conduct: { endByVoice: built.conduct.endByVoice, finishAllQuestions: built.conduct.finishAllQuestions, noPersonalQuestions: built.conduct.noPersonalQuestions } } : {}),
          language: attempt.language,
          ...(built.languagePolicy ? { languagePolicy: built.languagePolicy } : {}),
          // Read by the socket layer only (events, rejoins, the violation limit); the conductor's prompt never sees it.
          ...(built.proctoring ? { proctoring: built.proctoring } : {}),
          ...(avatar ? { avatar } : {}),
          // Hybrid only: the mode, duration, Live cap and budget thresholds (scaled by duration), and the
          // admin's hybrid options (conversational sections, Live warm-up, "Talk freely").
          ...(hybridFields ? {
            ...hybridFields,
            budgetThresholds: { ...budgetThresholds(durationMinutes, cfg) },
            ...(data?.anvi?.hybrid ? { hybrid: data.anvi.hybrid } : {}),
          } : {}),
        },
        lastActivityAt: startedAt,
        expiresAt: new Date(hardDeadline.getTime() + cfg.resumeWindowMinutes * MINUTE),
      });
      if (afterCreate) await afterCreate(attempt.toObject());
    } catch (error) {
      await discard();
      throw error;
    }
    if (hybrid) warmQuestionAudio(attempt.toObject(), built, onUsage, planSpend);
    await recordStart(student, definitionId, attemptId);
    return { id: String(attemptId), status: "active", resumed: false, terms: attemptTerms(attempt), language: attempt.language };
  }

  // Parallel starts of one interview by one student (a scripted burst, double clicks, two tabs) share
  // one in-flight start in this process, so only one of them plans with Gemini; the others join it.
  // The unique one-active-attempt index still decides between processes.
  const startsInFlight = new Map();
  function coalesceStart(key, work) {
    const running = startsInFlight.get(key);
    if (running) return running.then((result) => ({ ...result, resumed: true }));
    const task = Promise.resolve().then(work).finally(() => { if (startsInFlight.get(key) === task) startsInFlight.delete(key); });
    startsInFlight.set(key, task);
    return task;
  }

  // `signal` is the request's abort signal: a start whose client went away (or that timed out) never
  // creates the attempt, so the Prep Coin charge for it is refunded instead of buying a free interview.
  async function startAttempt(student, interviewId, options = {}) {
    const definitionId = objectId(interviewId, "interview");
    return coalesceStart(`practice:${student._id}:${definitionId}`, () => startPracticeAttempt(student, definitionId, options));
  }

  async function startPracticeAttempt(student, definitionId, { resumeConsent = false, termsAccepted = false, signal = null, language } = {}) {
    await assertPracticeAllowed(definitionId);
    const current = await resumable(student, { interviewId: definitionId });
    if (current) {
      // A scheduled attempt is free and runs to its own deadline; it is never resumed as (paid) practice.
      if (current.assignmentId) assignedElsewhere();
      await recordStart(student, definitionId, current._id);
      // Rejoining keeps the attempt's own language, whatever this request asked for.
      return { id: String(current._id), status: "active", resumed: true, terms: attemptTerms(current), language: current.language || null };
    }
    const interview = await AIInterview.findOne({ _id: definitionId, lifecycle: "draft", publishedAt: { $ne: null } })
      .select("title role companyName requiresResume publishedRevision publishedSnapshot").lean();
    const data = interview?.publishedSnapshot?.data;
    if (!data) fail(404, "INTERVIEW_NOT_FOUND", "This interview is not available.");
    const cfg = settings();
    // Retakes cost no coins once an attempt exists, so new attempts (each one re-plans with Gemini) are capped.
    const perDay = Number(cfg.maxAttemptsPerDay) || 5;
    // Only practice counts: a scheduled attempt is free and capped by its own attemptsAllowed.
    const recent = await AnviAttempt.countDocuments({ studentId: student._id, interviewId: definitionId, assignmentId: null, startedAt: { $gte: new Date(now().getTime() - 24 * 60 * MINUTE) } });
    if (recent >= perDay) fail(429, "ATTEMPT_LIMIT", `You can start this interview ${perDay} times a day. Try again tomorrow.`);
    const prepared = await startRequirements(student, data, { interviewId: definitionId, termsAccepted, resumeConsent, language });
    return launchAttempt(student, {
      definitionId, data, prepared, signal,
      fields: {
        snapshotRevision: interview.publishedSnapshot.revision || interview.publishedRevision || 1,
        mode: "practice",
        title: data.title || interview.title,
        role: data.role || interview.role || "",
        companyName: interview.companyName || data.companyName || "",
      },
      onRace: (winner) => { if (winner.assignmentId) assignedElsewhere(); },
    });
  }

  /**
   * Whether this student may start (or resume) the assignment now. The route's coin exemption and
   * startAssignedAttempt both use it, so a free start is only ever granted for what the handler allows.
   * Returns { ok: true, resume } for an attempt that can be rejoined, { ok: true, assignment, target,
   * booking, hardDeadlineCap } for a new start, or { ok: false, status, code, message }.
   */
  async function assignedStartGate(student, assignmentId) {
    const id = objectId(assignmentId, "assignment");
    const current = await resumable(student, { assignmentId: id });
    if (current) return { ok: true, resume: current };
    const { checkAssignedStart } = await schedule();
    const check = await checkAssignedStart(student, String(id), now());
    // A parallel request created the attempt after the lookup above: rejoin it instead of planning again.
    if (check?.ok && check.code === "RESUME" && check.activeAttemptId) {
      const attempt = await AnviAttempt.findOne({ _id: check.activeAttemptId, studentId: student._id, status: "in_progress" }).lean();
      if (attempt) return { ok: true, resume: attempt };
    }
    if (check?.ok) return { ...check, ok: true, resume: null };
    const code = check?.code || "START_UNAVAILABLE";
    return {
      ok: false,
      status: Number.isInteger(check?.status) ? check.status : START_REFUSAL_STATUS[code] || 403,
      code,
      message: check?.message || "This scheduled interview cannot be started right now.",
    };
  }

  /** Starts (or resumes) an assigned attempt from the assignment's pinned snapshot; never charged. */
  async function startAssignedAttempt(student, assignmentId, options = {}) {
    const id = objectId(assignmentId, "assignment");
    return coalesceStart(`assigned:${student._id}:${id}`, () => startAssigned(student, id, options));
  }

  async function startAssigned(student, assignmentId, { resumeConsent = false, termsAccepted = false, signal = null, language } = {}) {
    const gate = await assignedStartGate(student, assignmentId);
    if (gate.ok && gate.resume) {
      await recordStart(student, gate.resume.interviewId, gate.resume._id);
      return {
        id: String(gate.resume._id), status: "active", resumed: true, assignmentId: String(gate.resume.assignmentId),
        terms: attemptTerms(gate.resume), language: gate.resume.language || null,
      };
    }
    if (!gate.ok) fail(gate.status, gate.code, gate.message);
    const { assignment, target, booking, hardDeadlineCap } = gate;
    const data = assignment?.snapshotData;
    if (!data) fail(404, "INTERVIEW_NOT_FOUND", "This interview is not available.");
    const definitionId = new mongoose.Types.ObjectId(String(assignment.interviewId));
    const ownAssignment = (attempt) => String(attempt?.assignmentId || "") === String(assignment._id);
    // Terms and resume are checked before a practice attempt gives way below, so a refused start changes nothing.
    const prepared = await startRequirements(student, data, { interviewId: definitionId, assignmentId: assignment._id, termsAccepted, resumeConsent, language });
    // A practice attempt of the same interview gives way to the scheduled one (one active attempt each).
    const practice = await AnviAttempt.findOne({ studentId: student._id, interviewId: definitionId, status: "in_progress" }).lean();
    if (practice) {
      if (practice.assignmentId) {
        if (!ownAssignment(practice)) fail(409, "ATTEMPT_IN_PROGRESS", "Finish your other scheduled attempt of this interview first.");
      } else {
        const outcome = { status: "abandoned", endReason: "superseded_by_assigned" };
        if (await finalize(practice, { ...outcome, now: now() })) stopAnviAttempt(practice._id, outcome);
      }
    }
    const { recordAssignedAttempt } = await schedule();
    const started = await launchAttempt(student, {
      definitionId, data, prepared, signal,
      fields: {
        snapshotRevision: Number(assignment.snapshotRevision) || 1,
        mode: assignment.mode === "adaptive" ? "adaptive" : "mock",
        assignmentId: assignment._id,
        bookingId: booking?._id || null,
        title: data.title || assignment.title || "",
        role: data.role || assignment.role || "",
        companyName: data.companyName || "",
      },
      deadlineCap: hardDeadlineCap,
      onRace: (winner) => { if (!ownAssignment(winner)) fail(409, "ATTEMPT_IN_PROGRESS", "Another attempt of this interview is in progress."); },
      // false: the target's last attempt was taken by a parallel start; this attempt is discarded.
      afterCreate: async (attempt) => {
        if ((await recordAssignedAttempt({ assignment, target, booking, attempt })) === false)
          fail(409, "ATTEMPTS_EXHAUSTED", "You have used every attempt for this interview.");
      },
    });
    return { ...started, assignmentId: String(assignment._id) };
  }

  async function getAttemptForStudent(student, attemptId) {
    const attempt = await AnviAttempt.findOne({ _id: objectId(attemptId, "attempt"), studentId: student._id })
      .select("status endReason partial mode interviewId assignmentId title role companyName startedAt endedAt hardDeadline language items overall insights skills bySection byCompetency byRubric actionItems eval.scoredAt pendingWork.status visibleToStudentAt termsText termsAcceptedAt resumeSource proctoring runtimeMode")
      .lean();
    if (!attempt) fail(404, "ATTEMPT_NOT_FOUND", "Interview attempt not found.");
    const finished = attempt.status !== "in_progress";
    const report = reportState(attempt);
    const visible = report === "ready" && attempt.visibleToStudentAt && new Date(attempt.visibleToStudentAt) <= now();
    // A running attempt: the rules the room and the rejoin lobby apply (from the live doc), with the counts so far.
    const live = finished ? null : await AnviLiveSession.findOne({ attemptId: attempt._id })
      .select("rules.proctoring rules.avatar proctoring.counts proctoring.violations proctoring.endedForViolations").lean();
    const base = {
      id: String(attempt._id),
      status: attempt.status,
      endReason: attempt.endReason || null,
      partial: Boolean(attempt.partial),
      report: report === "ready" && !visible ? "preparing" : report,
      title: attempt.title || "",
      role: attempt.role || "",
      companyName: attempt.companyName || "",
      startedAt: attempt.startedAt,
      endedAt: attempt.endedAt,
      hardDeadline: attempt.hardDeadline,
      language: attempt.language,
      // Scheduled attempts are labelled in the room ("Your institution scheduled this interview").
      mode: attempt.mode || "practice",
      // Which room runs it: the Live call or the turn-based (hybrid) one. Never changes for an attempt.
      runtimeMode: runtimeModeOf(attempt),
      assignmentId: attempt.assignmentId ? String(attempt.assignmentId) : null,
      // The terms shown (and accepted) at the start, and where the resume for resume questions came from.
      terms: attemptTerms(attempt),
      resumeSource: attempt.resumeSource || null,
      // Counts only (plus the settings while it runs); the event log is for admins.
      proctoring: finished ? studentProctoringView(attempt.proctoring) : liveProctoringView(live),
      avatar: finished ? { enabled: false } : studentAvatarView(live?.rules?.avatar),
    };
    // Until the report is released: the questions ANVI actually asked and the student's own words only;
    // key points and questions never reached stay server side (ending at once must not list the whole set).
    if (!visible) {
      return {
        ...base,
        items: finished ? (attempt.items || []).filter(presented).map((item) => ({
          n: item.n, questionText: studentQuestionText(item.questionText), answerText: item.answerText || "", status: item.status,
        })) : [],
      };
    }
    const [withheld, cohort] = await Promise.all([keyPointsWithheld(attempt), cohortForAttempt({ ...attempt, studentId: student._id })]);
    return {
      ...base,
      scoredAt: attempt.eval?.scoredAt || null,
      // Report v2 fields (functional, nonFunctional, dimensions, summary) are merged in when the attempt has them.
      overall: reportOverall(attempt),
      skills: reportSkills(attempt),
      // Other students' aggregate only (null under five of them); never an identity.
      cohort,
      bySection: attempt.bySection || [],
      byCompetency: attempt.byCompetency || [],
      byRubric: attempt.byRubric || [],
      actionItems: attempt.actionItems || [],
      ...(withheld ? { keyPointsWithheld: true } : {}),
      // While the questions are still in use by a schedule, unasked questions stay hidden too.
      items: (attempt.items || []).filter((item) => !withheld || presented(item)).map((item) => reportItem(item, { withKeyPoints: !withheld })),
    };
  }

  /**
   * True while this report's questions are still live for others: an assigned attempt whose assignment
   * has not closed (a retake or a classmate could use the key points), or a practice attempt of an
   * interview whose practice is blocked by a schedule. A lookup failure withholds (fails closed).
   */
  async function keyPointsWithheld(attempt) {
    try {
      const scheduler = await schedule();
      if (attempt.assignmentId) return scheduler.assignmentActive ? Boolean(await scheduler.assignmentActive(attempt.assignmentId)) : false;
      return attempt.interviewId && scheduler.practiceBlocked ? Boolean(await scheduler.practiceBlocked(attempt.interviewId)) : false;
    } catch (error) {
      console.warn(`[ANVI] Report key point check failed for ${attempt._id}: ${error?.message || error}`);
      return true;
    }
  }

  // Used when the socket is gone (closed tab, failed upstream): keeps whatever was answered.
  async function endAttemptRest(student, attemptId) {
    const attempt = await AnviAttempt.findOne({ _id: objectId(attemptId, "attempt"), studentId: student._id }).select("_id studentId interviewId assignmentId bookingId status hardDeadline").lean();
    if (!attempt) fail(404, "ATTEMPT_NOT_FOUND", "Interview attempt not found.");
    if (attempt.status === "in_progress") {
      const at = now();
      const outcome = at >= new Date(attempt.hardDeadline) ? { status: "expired", endReason: "deadline" } : { status: "abandoned", endReason: "ended_by_student" };
      if (await finalize(attempt, { ...outcome, now: at })) {
        // A conductor still holding the attempt in this process stops its Live session now; one on another
        // instance notices on its next save, which no longer matches a live doc.
        stopAnviAttempt(attempt._id, outcome);
      }
    }
    return getAttemptForStudent(student, attemptId);
  }

  return {
    listStudentInterviews, assertPracticeAllowed, assertPracticeStartReady, startAttempt, assignedStartGate, startAssignedAttempt,
    getAttemptForStudent, endAttemptRest, attemptAudio,
  };
}

let shared;
const defaultService = () => (shared ||= createAnviService());
export const listStudentInterviews = (student) => defaultService().listStudentInterviews(student);
export const startAttempt = (...args) => defaultService().startAttempt(...args);
export const startAssignedAttempt = (...args) => defaultService().startAssignedAttempt(...args);
export const getAttemptForStudent = (...args) => defaultService().getAttemptForStudent(...args);
export const endAttemptRest = (...args) => defaultService().endAttemptRest(...args);
