// Ordered interview plan from a published snapshot (normalizeDefinition shape). The plan is stored on the
// live session and rendered into the Live system prompt; key points never leave the server.
import { createHash } from "node:crypto";
import {
  ANVI_DEFAULTS, ANVI_LANGUAGE, RESUME_MODES, RESUME_SOURCES, TERMS_LIMIT, derivedResumeMode, durationMaxQuestions,
  englishOnlyLanguage, liveTopicCounts, priorityOf,
} from "../../services/aiInterviewDefinition.js";
import { durationBucket } from "./anviInterview.config.js";
import { TOPIC_PREFIX, promptLine, questionGenerationPrompt } from "./anviInterview.prompts.js";
import { normalizeProctoring } from "./anviInterview.proctoring.js";

export const MAX_PLAN_QUESTIONS = 40;
// Older snapshots may hold more; validation caps authored plus AI follow-ups at 5 for new ones.
export const MAX_FOLLOW_UPS = 5;
export const DEFAULT_TURNS = ANVI_DEFAULTS.turns;
// A scored "Tell me about yourself" is the first planned question, under this id.
export const WARMUP_QID = "tell_me_about_yourself";
export const WARMUP_TEXT = "Please tell me about yourself.";
const WARMUP_KEY_POINTS = [
  "Education and current focus",
  "A relevant project, internship or experience",
  "Key skills that fit the role",
  "Goals or motivation for this role",
];
// Planning time for the unscored warm-up: about half a minute per icebreaker and 1.5 minutes for the introduction.
const ICEBREAKER_MINUTES = 0.5;
const INTRODUCTION_MINUTES = 1.5;
const RESUME_FOCUS = "Projects, internships, skills and achievements in the resume; ask about the candidate's own contribution and decisions.";
const MAX_KEY_POINTS = 6;
const DEFAULT_RESPONSE_SECONDS = 120;
const DEFAULT_MARKS = 10;
const MAX_EXPECTED_ANSWER = 4000;
const TONES = ["warm", "formal", "friendly"];
const PACES = ["slow", "normal", "brisk"];
const GENERIC_RESUME_QUESTIONS = [
  "Tell me about a project you are proud of. What was your role in it?",
  "Describe a difficult technical problem you faced in a project and how you solved it.",
  "Tell me about a time you worked in a team and had to handle a disagreement.",
  "What is a skill you learned recently, and how have you used it?",
  "Tell me about a mistake you made in a project and what you learned from it.",
];
/** The generic resume questions asked without a usable resume or generation (same for every student). */
export const genericResumeQuestions = () => [...GENERIC_RESUME_QUESTIONS];

// Question text is spoken after the "Question <n>:" marker, so authored or generated labels must not
// add a second marker the conductor would misread as a cursor jump.
export function questionText(value, max = 1200) {
  return promptLine(value, max)
    .replace(/^(?:question|q)\s*\d{1,3}\s*[:.)-]\s*/i, "")
    .replace(/\bquestion\s+(\d{1,3})(?=\s*[:.,-])/gi, "question number $1");
}

/** Spoken text as the TTS cache hashes it: NFC, trimmed, whitespace collapsed; punctuation kept. */
export const normalizeSpokenText = (value) => String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
/** sha256 (hex) of the normalized spoken text: identifies a line without storing it in a key. */
export const textHashOf = (value) => createHash("sha256").update(normalizeSpokenText(value), "utf8").digest("hex");

/** A specific question as the plan (and its pre-generated audio) speaks it: the prompt, then "(a) ..." parts. */
export function specificQuestionText(question) {
  const prompt = questionText(question?.prompt);
  const subquestions = (question?.subquestions || []).map((sub) => questionText(sub.prompt, 400)).filter(Boolean);
  return [prompt, ...subquestions.map((sub, i) => `(${String.fromCharCode(97 + i)}) ${sub}`)].join(" ");
}

/** A question's authored follow-ups as the plan stores them (item.authoredFollowUps, index i = `${qid}:f${i}`). */
export const authoredFollowUpsOf = (question) =>
  (question?.followUps || []).map((followUp) => questionText(followUp.prompt, 600)).filter(Boolean);

// Hybrid attempts have no Live model to phrase a topic, so a topic left without a generated question is
// asked with this concrete line instead of the Live-only "Ask one question about:" instruction.
export const topicFallbackText = (topic) =>
  `Let's talk about ${promptLine(topic, 200) || "your core skills"}. Can you explain the key ideas and give an example of where you would use them?`;

/** Questions a hybrid attempt plans for its duration (the bucket at or below it), or null without one. */
export function hybridMaxQuestions(durationMinutes) {
  const minutes = Number(durationMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return durationMaxQuestions(durationBucket(minutes));
}

const stripBullet = (line) => line.replace(/^\s*(?:[-*•‣▪–—]|\d{1,2}[.)]|[a-zA-Z][.)])\s+/, "").trim();

// Expected answers are free text: bullets or lines first, otherwise sentences.
export function splitKeyPoints(text) {
  const source = String(text || "").trim();
  if (!source) return [];
  const lines = source.split(/\r?\n+/).map(stripBullet).filter(Boolean);
  // A sentence break needs a non-digit before the stop, so inline "1. ... 2. ..." numbering is not split off.
  const pieces = lines.length > 1 ? lines : source.split(/(?<=[^\d\s][.!?;])\s+(?=[A-Z0-9"'(])/).map(stripBullet);
  const points = new Map();
  for (const piece of pieces) {
    const point = promptLine(piece, 200).replace(/;$/, "");
    if (point && !points.has(point.toLowerCase())) points.set(point.toLowerCase(), point);
  }
  return [...points.values()].slice(0, MAX_KEY_POINTS);
}

function seededRandom(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic per seed (the attempt id), so the same attempt always gets the same order.
export function seededShuffle(items, seed) {
  const out = [...items];
  const random = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Per-attempt variation hints for generated questions, so every student gets a different set.
const SCENARIO_DOMAINS = Object.freeze([
  "e-commerce", "banking and payments", "healthcare", "education", "logistics and delivery", "social media",
  "travel and booking", "online gaming", "food delivery", "ride sharing", "video streaming", "agriculture",
  "public services", "manufacturing", "telecom", "insurance",
]);
// Questions this student was asked in their last attempts, kept per generated slot.
const MAX_PREVIOUS_PER_SLOT = 20;

/**
 * Variation hints for one generated slot of one attempt: a short id, a scenario domain and the topic's
 * sub-topics in an attempt-specific order. Null without a seed (listing, tests).
 */
export function variationOf(seed, key, subtopics = []) {
  if (!seed) return null;
  const random = seededRandom(`${seed}:${key}:variation`);
  return {
    id: Math.floor(random() * 2 ** 32).toString(36),
    scenarioDomain: SCENARIO_DOMAINS[Math.floor(random() * SCENARIO_DOMAINS.length)],
    subtopicOrder: seededShuffle(subtopics.filter(Boolean), `${seed}:${key}:subtopics`).slice(0, 12),
  };
}

// Earlier generated questions ({qid, text}) that belong to the slot with this qid base (numbered qids).
function previousFor(previous, qidBase) {
  const prefix = String(qidBase);
  return previous
    .filter((entry) => entry.qid.startsWith(prefix) && /^\d+(?:-\d+)?$/.test(entry.qid.slice(prefix.length)))
    .map((entry) => entry.text)
    .slice(0, MAX_PREVIOUS_PER_SLOT);
}

const previousEntries = (list) => (Array.isArray(list) ? list : [])
  .map((entry) => ({ qid: String(entry?.qid || ""), text: questionText(entry?.text ?? entry?.questionText, 300) }))
  .filter((entry) => entry.qid && entry.text.length >= 8 && !entry.text.startsWith(TOPIC_PREFIX));

const responseSecondsOf = (...layers) => {
  const merged = Object.assign({}, ...layers.map((layer) => layer || {}));
  return merged.responseSeconds === undefined ? DEFAULT_RESPONSE_SECONDS : merged.responseSeconds;
};

const budgetOf = (value) => Math.min(MAX_FOLLOW_UPS, Math.max(0, Math.round(Number(value) || 0)));
const marksOf = (value) => (Number.isFinite(Number(value)) && Number(value) >= 1 ? Math.min(100, Math.round(Number(value))) : DEFAULT_MARKS);
const expectedAnswerOf = (value) => String(value ?? "").trim().slice(0, MAX_EXPECTED_ANSWER);

// Each level's share of its siblings' weights; unweighted (older) definitions count every entry as 1.
function shareOf(entry, siblings) {
  const total = siblings.reduce((sum, sibling) => sum + (Number(sibling?.weight) > 0 ? Number(sibling.weight) : 0), 0);
  if (!(total > 0)) return 1;
  return (Number(entry?.weight) > 0 ? Number(entry.weight) : 0) / total;
}

const clampNumber = (value, min, max, fallback, step = 1) => {
  const number = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number / step) * step));
};

/** The definition's `anvi.turns`, clamped, with defaults for anything missing (older interviews). */
export function normalizeTurns(input) {
  const turns = input && typeof input === "object" ? input : {};
  return {
    silenceSeconds: clampNumber(turns.silenceSeconds, 1.5, 4, DEFAULT_TURNS.silenceSeconds, 0.5),
    nudgeSeconds: clampNumber(turns.nudgeSeconds, 15, 120, DEFAULT_TURNS.nudgeSeconds),
    maxNudges: clampNumber(turns.maxNudges, 0, 3, DEFAULT_TURNS.maxNudges),
    voiceCommands: turns.voiceCommands !== false,
  };
}

const settingsOf = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

/** The definition's `anvi.warmup`, with defaults for anything missing (older interviews). */
export function normalizeWarmup(input) {
  const warmup = settingsOf(input);
  const d = ANVI_DEFAULTS.warmup;
  return {
    enabled: warmup.enabled !== undefined && warmup.enabled !== null ? warmup.enabled !== false : d.enabled,
    icebreakers: clampNumber(warmup.icebreakers, 0, 3, d.icebreakers),
    tellMeAboutYourself: warmup.tellMeAboutYourself !== undefined && warmup.tellMeAboutYourself !== null ? warmup.tellMeAboutYourself !== false : d.tellMeAboutYourself,
    scored: warmup.scored === true,
  };
}

/** The definition's `anvi.conduct`; terms can only be required when there is text to accept. */
export function normalizeConduct(input) {
  const conduct = settingsOf(input);
  const termsText = String(conduct.termsText ?? "").trim().slice(0, TERMS_LIMIT);
  return {
    endByVoice: conduct.endByVoice === true,
    finishAllQuestions: conduct.finishAllQuestions !== false,
    noPersonalQuestions: conduct.noPersonalQuestions !== false,
    termsText,
    requireTermsAcceptance: Boolean(termsText) && conduct.requireTermsAcceptance !== false,
  };
}

/** The interview's resume settings from a snapshot (`anvi.resume`), deriving the mode for older ones. */
export function normalizeResumeSettings(snapshotData) {
  const data = snapshotData || {};
  const resume = settingsOf(data.anvi?.resume);
  const sources = Array.isArray(resume.sources) ? RESUME_SOURCES.filter((source) => resume.sources.includes(source)) : [];
  return {
    mode: RESUME_MODES.includes(resume.mode) ? resume.mode : derivedResumeMode(data),
    sources: sources.length ? sources : [...RESUME_SOURCES],
    questionCount: clampNumber(resume.questionCount, 0, 5, ANVI_DEFAULTS.resume.questionCount),
  };
}

/**
 * The interview language settings. Every interview is English only (DECISIONS #0), so a snapshot published
 * earlier with Hindi, Hinglish or a student choice is read as English, strict, remind and flag. `choices`:
 * every language a student may start in.
 */
export function normalizeLanguageSettings() {
  const language = englishOnlyLanguage();
  return { ...language, choices: [language.primary] };
}

/** What the lobby or booking step shows about the interview language: { primary, choices, strict, onOtherLanguage }. */
export function languageSetupOf(snapshotData) {
  const { primary, choices, strict, onOtherLanguage } = normalizeLanguageSettings(snapshotData);
  return { primary, choices, strict, onOtherLanguage };
}

/**
 * The language an attempt runs in: the student's choice when the interview allows it, else the primary
 * language. Returns null for a choice the interview does not allow (matched case-insensitively).
 */
export function attemptLanguageOf(snapshotData, requested) {
  const { primary, choices } = normalizeLanguageSettings(snapshotData);
  if (requested === undefined || requested === null || requested === "") return primary;
  if (typeof requested !== "string") return null;
  return choices.find((value) => value.toLowerCase() === requested.trim().toLowerCase()) || null;
}

/** The terms a student must see (and, when required, accept) before starting this interview. */
export function termsOf(snapshotData) {
  const conduct = normalizeConduct(snapshotData?.anvi?.conduct);
  return { text: conduct.termsText, required: conduct.requireTermsAcceptance };
}

/**
 * What the lobby or booking step shows about the resume: the interview's settings, plus whether this student
 * already provided one (`context`: their stored resume for this interview or assignment, if any).
 */
export function resumeSetupOf(snapshotData, context) {
  const settings = normalizeResumeSettings(snapshotData);
  const usable = context && settings.sources.includes(context.source) ? context : null;
  return { ...settings, provided: Boolean(usable), source: usable?.source || null, providedAt: usable?.createdAt || null };
}

/** Whether the warm-up asks "Tell me about yourself" as part of the introduction (not as Question 1). */
export const introductionInWarmup = (warmup) => Boolean(warmup?.enabled && warmup.tellMeAboutYourself && !warmup.scored);
const scoredIntroduction = (warmup) => Boolean(warmup?.enabled && warmup.tellMeAboutYourself && warmup.scored);

function cleanGenerated(list, count) {
  const seen = new Set();
  const out = [];
  for (const entry of Array.isArray(list) ? list : []) {
    const text = questionText(typeof entry === "string" ? entry : entry?.text, 600);
    if (text.length < 8 || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    const keyPoints = (Array.isArray(entry?.keyPoints) ? entry.keyPoints : [])
      .map((point) => promptLine(point, 200)).filter(Boolean).slice(0, MAX_KEY_POINTS);
    out.push({ text, keyPoints });
    if (out.length === count) break;
  }
  return out;
}

/**
 * `seed` (the attempt id) varies generated questions per attempt: variation hints in the generation request
 * and a seeded order within each generated topic. `previousQuestions` ([{qid, text}], from this student's
 * last attempts of the interview) are passed as questions not to repeat. `language` is accepted for callers
 * and ignored: every interview is English (DECISIONS #0).
 *
 * `runtimeMode: "hybrid"` plans a turn-based attempt: at most hybridMaxQuestions(durationMinutes, else
 * anvi.durationMinutes) questions, topic items phrased as concrete questions by `generate` (a concrete
 * fallback line when it fails), `resumeProfile` (the compact resume profile, at most 600 characters) in
 * place of the full resume in generation requests, and `priority` and `textHash` on every item.
 * Without it the Live plan is unchanged.
 */
export async function buildPlan(snapshotData, {
  resumeText = "", generate, seed, attemptId, previousQuestions = [], maxQuestions = MAX_PLAN_QUESTIONS,
  runtimeMode, durationMinutes, resumeProfile = "",
} = {}) {
  const data = snapshotData || {};
  const languageSettings = normalizeLanguageSettings(data);
  const hybrid = runtimeMode === "hybrid";
  const hybridDuration = hybrid ? Number(durationMinutes ?? data.anvi?.durationMinutes) || null : null;
  const planMax = hybrid ? Math.min(maxQuestions, hybridMaxQuestions(hybridDuration) ?? maxQuestions) : maxQuestions;
  // rules.language is the one interview language every later step reads (prompt, Live locale, transcription,
  // evaluation): always English (DECISIONS #0), whatever an older snapshot or the request says.
  const rules = {
    mode: "mock", responseSeconds: DEFAULT_RESPONSE_SECONDS, ...(data.rules || {}),
    language: ANVI_LANGUAGE,
  };
  const shuffleSeed = String(seed ?? attemptId ?? "");
  const resume = String(resumeText || "").trim();
  // What generation requests carry about the resume: the compact profile in hybrid attempts, when there is one.
  const profile = hybrid ? String(resumeProfile || "").trim().slice(0, 600) : "";
  const promptResume = profile || resume;
  const previous = previousEntries(previousQuestions);
  const liveCounts = liveTopicCounts(data);
  const warnings = new Set();
  const slots = [];
  let reserved = 0;
  const take = (wanted) => {
    const granted = Math.max(0, Math.min(wanted, planMax - reserved));
    if (granted < wanted) warnings.add("PLAN_TRUNCATED");
    reserved += granted;
    return granted;
  };
  const shared = {
    role: data.role, companyName: data.companyName, experience: data.experience, language: rules.language,
  };
  const avoid = [];
  const warmup = normalizeWarmup(data.anvi?.warmup);
  const resumeSettings = normalizeResumeSettings(data);
  // Items the server adds (scored introduction, resume questions) take the smallest authored weight afterwards.
  const added = new Set();
  // What a generated slot's request carries for per-attempt variety (nothing without a seed).
  const variationFields = (qidBase, subtopics = []) => {
    const variation = variationOf(shuffleSeed, qidBase, subtopics);
    const asked = previousFor(previous, qidBase);
    return { ...(variation ? { variation } : {}), ...(asked.length ? { previouslyAsked: asked } : {}) };
  };

  // Warm-up first: a scored "Tell me about yourself" is Question 1.
  if (scoredIntroduction(warmup) && take(1)) {
    added.add(WARMUP_QID);
    slots.push({
      qidBase: WARMUP_QID, numbered: false, count: 1, priority: "medium",
      item: () => ({
        sectionId: "warmup", sectionName: "Warm-up", topic: "Introduction", competency: "Communication",
        text: WARMUP_TEXT, context: "", keyPoints: [...WARMUP_KEY_POINTS], authoredFollowUps: [],
        followUpBudget: 0, responseSeconds: responseSecondsOf(rules), marks: DEFAULT_MARKS, weight: 1, skippable: true,
        expectedAnswer: WARMUP_KEY_POINTS.join("\n"), source: "manual", kind: "warmup",
      }),
    });
  }
  // Then the resume questions, when the student provided a resume and the interview asks for some.
  if (resume && resumeSettings.mode !== "none" && resumeSettings.questionCount > 0) {
    const count = take(resumeSettings.questionCount);
    if (count) {
      slots.push({
        qidBase: "resume-q", numbered: true, count, addedByServer: true, priority: "medium",
        item: (entry) => ({
          sectionId: "resume", sectionName: "Resume", topic: "Resume", competency: "Resume", context: "",
          text: entry.text, keyPoints: entry.keyPoints, authoredFollowUps: [], followUpBudget: 1,
          responseSeconds: responseSecondsOf(rules), marks: DEFAULT_MARKS, weight: 1, skippable: true,
          expectedAnswer: expectedAnswerOf(entry.keyPoints.join("\n")), source: "resume", kind: "resume",
        }),
        request: {
          ...shared, difficulty: data.difficulty, sectionName: "Resume", kind: "resume", count, focus: RESUME_FOCUS, resumeText: promptResume,
          ...variationFields("resume-q"),
        },
        // Resume questions keep the model's order (a walk-through question usually comes first).
        fallback: (i) => ({ text: GENERIC_RESUME_QUESTIONS[i % GENERIC_RESUME_QUESTIONS.length], keyPoints: [] }),
      });
    }
  }

  const sections = data.sections || [];
  for (const section of sections) {
    const groups = section.groups || [];
    const sectionShare = shareOf(section, sections);
    for (const group of groups) {
      const groupRules = [rules, section.ruleOverrides, group.ruleOverrides];
      const base = {
        sectionId: section.id, sectionName: section.name || "", topic: group.name || section.name || "",
        competency: section.category || "",
        weight: Math.round(sectionShare * shareOf(group, groups) * 10000) / 10000,
        marks: DEFAULT_MARKS, skippable: true, expectedAnswer: "",
      };
      const request = {
        ...shared, difficulty: group.difficulty || data.difficulty, sectionName: section.name,
        sectionInstructions: section.instructions, groupName: group.name,
      };
      // Time-low order in hybrid attempts (stored on hybrid plan items only).
      const priority = priorityOf(group.priority);

      if (group.source === "annu") {
        const annu = group.annu || {};
        const count = take(Math.max(0, liveCounts[group.id] || 0));
        if (!count) continue;
        const qidBase = `${group.id}-g`;
        const item = (entry) => ({
          ...base, text: entry.text, context: "", keyPoints: entry.keyPoints, authoredFollowUps: [],
          expectedAnswer: expectedAnswerOf((entry.keyPoints || []).join("\n")),
          followUpBudget: budgetOf(annu.maxFollowUps), responseSeconds: responseSecondsOf(...groupRules),
          source: "annu", kind: entry.kind || "generated",
        });
        // Without generated questions, ANVI still covers the group by phrasing one question per skill.
        const topics = [...(annu.skills || []), promptLine(annu.requirements, 300), group.name, section.name, data.role]
          .map((topic) => promptLine(topic, 300)).filter(Boolean);
        slots.push({
          qidBase, numbered: true, count, item, priority,
          request: {
            ...request, kind: "annu", count, requirements: annu.requirements, skills: annu.skills, exclusions: annu.exclusions,
            priority: priorityOf(group.priority),
            // With a resume, live topic questions may relate to the student's own projects and skills.
            ...(resume && resumeSettings.mode !== "none" ? { resumeText: promptResume } : {}),
            ...variationFields(qidBase, annu.skills || []),
          },
          fallback: (i) => (hybrid
            ? { text: topicFallbackText(topics[i % topics.length]), keyPoints: [], kind: "topic" }
            : { text: `${TOPIC_PREFIX}${topics[i % topics.length] || "the candidate's core skills"}`, keyPoints: [], kind: "topic" }),
          shuffleSeed: shuffleSeed ? `${shuffleSeed}:${qidBase}` : "",
        });
        continue;
      }

      const questions = group.shuffle ? seededShuffle(group.questions || [], `${shuffleSeed}:${group.id}`) : group.questions || [];
      for (const question of questions) {
        const authoredFollowUps = authoredFollowUpsOf(question);
        const common = {
          ...base, context: promptLine(question.context, 600), authoredFollowUps,
          followUpBudget: budgetOf(authoredFollowUps.length + (Number(question.maxFollowUps) || 0)),
          responseSeconds: responseSecondsOf(...groupRules, question.ruleOverrides),
          marks: marksOf(question.marks),
          competency: promptLine(question.competency, 60) || base.competency,
          skippable: question.skippable !== false,
          expectedAnswer: expectedAnswerOf(question.expectedAnswer),
        };
        if (question.kind === "resume") {
          const count = take(Math.max(1, question.resumeCount || 1));
          if (!count) continue;
          const expected = splitKeyPoints(question.expectedAnswer);
          slots.push({
            qidBase: count === 1 ? question.id : `${question.id}-r`, numbered: count > 1, count, priority,
            item: (entry) => ({
              ...common, text: entry.text, keyPoints: entry.keyPoints.length ? entry.keyPoints : expected,
              expectedAnswer: entry.keyPoints.length ? expectedAnswerOf(entry.keyPoints.join("\n")) : common.expectedAnswer,
              source: "resume", kind: "resume",
            }),
            request: resume ? { ...request, kind: "resume", count, focus: question.prompt, resumeText: promptResume, ...variationFields(count === 1 ? question.id : `${question.id}-r`) } : null,
            fallback: (i) => ({ text: GENERIC_RESUME_QUESTIONS[i % GENERIC_RESUME_QUESTIONS.length], keyPoints: [] }),
          });
          continue;
        }
        const prompt = questionText(question.prompt);
        const topic = question.kind === "topic";
        if (!prompt && !(topic && base.topic)) continue;
        if (!take(1)) continue;
        if (topic && hybrid) {
          // No Live model phrases the topic in a hybrid attempt: one generated question, else a concrete line.
          const topicName = prompt || promptLine(base.topic, 300);
          const authoredPoints = splitKeyPoints(question.expectedAnswer);
          slots.push({
            qidBase: question.id, numbered: false, count: 1, priority,
            item: (entry) => ({
              ...common, text: entry.text, keyPoints: authoredPoints.length ? authoredPoints : entry.keyPoints || [],
              expectedAnswer: common.expectedAnswer || expectedAnswerOf((entry.keyPoints || []).join("\n")),
              source: "manual", kind: "topic",
            }),
            request: {
              ...request, kind: "topic", count: 1, requirements: topicName,
              focus: "Ask one concrete, spoken interview question about this topic.", ...variationFields(question.id),
            },
            fallback: () => ({ text: topicFallbackText(topicName), keyPoints: [] }),
          });
          continue;
        }
        const text = topic ? `${TOPIC_PREFIX}${prompt || promptLine(base.topic, 300)}` : specificQuestionText(question);
        if (!topic) avoid.push(prompt);
        slots.push({
          qidBase: question.id, numbered: false, count: 1, priority,
          item: () => ({ ...common, text, keyPoints: splitKeyPoints(question.expectedAnswer), source: "manual", kind: topic ? "topic" : "specific" }),
        });
      }
    }
  }

  // Generation runs in parallel so start latency is one model call, not one per group. A live topic that may
  // draw on the resume (two or more questions) waits for the resume questions instead, which join its "avoid"
  // list: in parallel, a topic question re-asked a resume question in most real-Gemini plans (2026-10-22).
  const generateSlot = async (slot) => {
    if (!slot.request) return slot.fallback ? Array.from({ length: slot.count }, (_, i) => slot.fallback(i)) : [{}];
    let generated = [];
    if (typeof generate === "function") {
      try {
        generated = cleanGenerated(await generate({ ...slot.request, avoid: avoid.slice(0, MAX_PLAN_QUESTIONS) }), slot.count);
        // A seeded order within the topic, so two attempts with similar output still differ in sequence.
        if (slot.shuffleSeed) generated = seededShuffle(generated, slot.shuffleSeed);
      } catch {
        warnings.add("GENERATION_FAILED");
      }
    } else warnings.add("GENERATION_UNAVAILABLE");
    if (generated.length < slot.count && generated.length) warnings.add("GENERATION_SHORT");
    return Array.from({ length: slot.count }, (_, i) => generated[i] || slot.fallback(i - generated.length));
  };
  const resumeSlots = slots.some((slot) => slot.request?.kind === "annu" && slot.request.resumeText && slot.count >= 2)
    ? slots.filter((slot) => slot.request?.kind === "resume")
    : [];
  const early = new Map(await Promise.all(resumeSlots.map(async (slot) => [slot, await generateSlot(slot)])));
  for (const list of early.values()) for (const entry of list) if (entry?.text) avoid.push(entry.text);
  const entries = await Promise.all(slots.map((slot) => early.get(slot) || generateSlot(slot)));

  const used = new Set();
  const plan = [];
  slots.forEach((slot, index) => {
    entries[index].forEach((entry, i) => {
      const baseId = slot.numbered ? `${slot.qidBase}${i + 1}` : String(slot.qidBase);
      let qid = baseId;
      for (let k = 2; used.has(qid); k += 1) qid = `${baseId}-${k}`;
      used.add(qid);
      if (slot.addedByServer) added.add(qid);
      const item = { qid, n: plan.length + 1, ...slot.item(entry) };
      // Hybrid items carry their time-low priority and the hash their pre-generated audio is found by.
      if (hybrid) Object.assign(item, { priority: slot.priority || "medium", textHash: textHashOf(item.text) });
      plan.push(item);
    });
  });
  // Server-added items weigh no more than the lightest authored question in competency rollups.
  const authoredWeights = plan.filter((item) => !added.has(item.qid)).map((item) => Number(item.weight)).filter((value) => value > 0);
  if (authoredWeights.length) {
    const lightest = Math.min(...authoredWeights);
    for (const item of plan) if (added.has(item.qid)) item.weight = lightest;
  }

  const interviewer = data.interviewer || {};
  const anviPersona = data.anvi?.persona && typeof data.anvi.persona === "object" ? data.anvi.persona : {};
  const script = (value, fallback) => (String(value ?? "").trim() ? String(value).trim() : fallback || "");
  const persona = {
    // Profiles saved before the rename still carry the old default name.
    displayName: !interviewer.displayName || /^annu$/i.test(String(interviewer.displayName).trim()) ? "ANVI" : interviewer.displayName,
    // The ANVI settings tone (warm|formal|friendly) wins; snapshots published before it keep the profile tone.
    tone: TONES.includes(anviPersona.tone) ? anviPersona.tone : interviewer.tone || "Professional",
    pace: PACES.includes(anviPersona.pace) ? anviPersona.pace : "normal",
    acknowledgements: anviPersona.acknowledgements !== false,
    language: rules.language,
    introduction: script(anviPersona.introduction, interviewer.introduction),
    closing: script(anviPersona.closing, interviewer.closing),
    // The admin's Live voice and accent locale ("" = the server voice / the interview language's locale).
    voice: String(data.anvi?.voice?.name || ""),
    // English only (DECISIONS #0): an older hi-IN accent falls back to the interview language's en-IN.
    voiceLanguageCode: data.anvi?.voice?.languageCode === "en-IN" ? "en-IN" : "",
  };
  const turns = normalizeTurns(data.anvi?.turns);
  const conduct = normalizeConduct(data.anvi?.conduct);
  const seconds = plan.reduce((total, item) => total + (item.responseSeconds || DEFAULT_RESPONSE_SECONDS), 0);
  // The unscored warm-up happens before Question 1, so it needs time of its own before the deadline.
  const warmupMinutes = warmup.enabled ? warmup.icebreakers * ICEBREAKER_MINUTES + (introductionInWarmup(warmup) ? INTRODUCTION_MINUTES : 0) : 0;
  // How strictly ANVI keeps to rules.language; stored with the plan for the prompt and the conductor.
  const languagePolicy = { strict: languageSettings.strict, onOtherLanguage: languageSettings.onOtherLanguage };
  // Proctoring rules stored with the plan for the socket layer; never part of ANVI's prompt.
  const proctoring = normalizeProctoring(data.anvi?.proctoring);
  return {
    plan, persona, rules, turns, warmup, conduct, languagePolicy, proctoring, resume: resumeSettings,
    estimatedMinutes: Math.ceil((seconds / 60) * 1.6 + 2 + warmupMinutes), warnings: [...warnings],
    ...(hybrid ? { runtimeMode: "hybrid", durationMinutes: hybridDuration, maxQuestions: planMax } : {}),
  };
}

// Production `generate` for buildPlan, backed by the Gemini REST client.
// `onUsage` meters each generation call (usage kind "generate") against the attempt.
// Live topics are sampled warmer than resume questions so every student gets a different set; neither is
// ever served from the JSON cache (each request is one attempt's own).
export const LIVE_TEMPERATURE = 0.9;
export const RESUME_TEMPERATURE = 0.7;
export function createPlanGenerator(gemini, { model, timeoutMs = 30000, onUsage = null } = {}) {
  return async (request) => {
    // Generated questions are personalised (user decision 5, 2026-10-23): every request is this attempt's
    // own, with its variation hints, and is never shared with another student through the JSON cache.
    const { systemText, userText, schema } = questionGenerationPrompt(request);
    const result = await gemini.generateJson({
      model, systemText, parts: [{ text: userText }], schema,
      temperature: request?.kind === "annu" ? LIVE_TEMPERATURE : RESUME_TEMPERATURE,
      timeoutMs, cache: false,
      ...(onUsage ? { usageKind: "generate", onUsage } : {}),
    });
    return Array.isArray(result?.questions) ? result.questions : [];
  };
}
