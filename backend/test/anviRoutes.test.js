import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import AIInterview from "../src/models/AIInterview.js";
import Resume from "../src/models/Resume.js";
import { InterviewEngagementReceipt } from "../src/models/AdaptiveEngagement.js";
import { ANVI_DEFAULTS, normalizeDefinition } from "../src/services/aiInterviewDefinition.js";
import { aiInterviewStarted } from "../src/services/coinEntitlements.js";
import { errorHandler } from "../src/utils/errors.js";
import { createAnviStudentRouter } from "../src/modules/anviInterview/anviInterview.routes.js";
import { createAnviService } from "../src/modules/anviInterview/anviInterview.service.js";
import { sweepStaleAnviAttempts } from "../src/modules/anviInterview/anviInterview.maintenance.js";
import { AnviAttempt, AnviLiveSession } from "../src/modules/anviInterview/anviInterview.models.js";
import { createAnviEvaluator } from "../src/modules/anviInterview/anviInterview.evaluation.js";

// Ephemeral MongoDB only; Gemini and the plan builder are fakes, so no network call is made.
let mongo, server, base;
let skipped = false;
const student = new mongoose.Types.ObjectId().toString();
const config = Object.freeze({ apiKey: "test", generateModel: "fake-generate", maxSessionMinutes: 45, resumeWindowMinutes: 15 });
const planCalls = [];
const generateCalls = [];
// Evaluation is triggered right after an attempt ends; here it is only recorded.
const evaluations = [];
const evaluateSoon = (attemptId) => { evaluations.push(String(attemptId)); return null; };
let planFailure = null;
const gemini = {
  generateJson: async (request) => { generateCalls.push(request); return { questions: [{ text: "Tell me about PeerPrep", keyPoints: [] }] }; },
};
async function buildPlan(data, options) {
  planCalls.push({ data, options });
  if (planFailure) throw planFailure;
  const generated = data.sections.some((s) => s.groups.some((g) => (g.questions || []).some((q) => q.kind === "resume")))
    ? await options.generate({ kind: "resume", count: 1, role: data.role, language: "Hinglish", resumeText: options.resumeText }) : [];
  return {
    plan: [
      { qid: "q1", n: 1, sectionId: "s1", sectionName: "Technical", text: "Explain REST.", keyPoints: ["Stateless requests"], followUpBudget: 1,
        marks: 20, weight: 0.5, competency: "APIs", expectedAnswer: "SECRET-EXPECTED stateless requests." },
      { qid: "q2", n: 2, sectionName: "Technical", text: generated[0]?.text || "Explain caching.", keyPoints: ["TTL"], followUpBudget: 0 },
    ],
    persona: { displayName: "ANVI" },
    rules: { language: "Hinglish" },
    turns: { silenceSeconds: 2.5, nudgeSeconds: 30, maxNudges: 1, voiceCommands: false },
    ...(data.anvi?.proctoring?.enabled ? { proctoring: data.anvi.proctoring } : {}),
    estimatedMinutes: 10,
  };
}

const definition = (title, questions, anvi) => normalizeDefinition({
  ...(anvi ? { anvi } : {}),
  title, role: "Backend engineer", experience: "junior", difficulty: "medium",
  rules: { language: "Hinglish", responseSeconds: 90 },
  interviewer: { profileId: "p1", displayName: "ANVI" },
  sections: [{ id: "s1", name: "Technical", weight: 100, groups: [{ id: "g1", name: "APIs", weight: 100, source: "manual", questions }] }],
  rubric: [{ id: "r1", name: "Clarity", weight: 100 }],
});
const publish = (title, questions, extra = {}) => {
  const data = definition(title, questions);
  return AIInterview.create({
    ownerId: new mongoose.Types.ObjectId(), creationKey: crypto.randomUUID(), title, role: data.role, data,
    publishedSnapshot: { data, revision: 3, at: new Date() }, publishedAt: new Date(), publishedRevision: 3, ...extra,
  });
};
const specific = [
  { id: "q1", kind: "specific", prompt: "Explain REST.", expectedAnswer: "SECRET-EXPECTED stateless requests.", followUps: [{ id: "f1", prompt: "SECRET-FOLLOWUP" }] },
  { id: "q2", kind: "topic", prompt: "Caching" },
];

before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } }); }
  catch (error) { if (error?.code === "EPERM") { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: "anvi_routes_test" });
  await Promise.all([AIInterview.init(), AnviAttempt.init(), AnviLiveSession.init(), InterviewEngagementReceipt.init(), Resume.init()]);
  const app = express();
  app.use(express.json());
  app.use("/api/student/ai-interviews", createAnviStudentRouter((req, _res, next) => {
    req.user = { _id: req.get("X-Test-Student") || student, role: req.get("X-Test-Role") || "student", accessScope: req.get("X-Test-Scope") || "full", college: "Test College" };
    next();
  }, { gemini, buildPlan, config, evaluateSoon }));
  app.use(errorHandler);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/student/ai-interviews`;
});
after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  if (skipped) return;
  planCalls.length = 0;
  generateCalls.length = 0;
  evaluations.length = 0;
  planFailure = null;
  await Promise.all([AIInterview, AnviAttempt, AnviLiveSession, InterviewEngagementReceipt, Resume].map((model) => model.deleteMany({})));
});
const call = async (path = "", method = "GET", body, headers = {}) => {
  const result = await fetch(`${base}${path}`, {
    method, headers: { "Content-Type": "application/json", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: result.status, body: await result.json() };
};

test("lists only published interviews without answers, follow-ups or rubric", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const shown = await publish("Visible", specific);
  await AIInterview.create({ ownerId: new mongoose.Types.ObjectId(), creationKey: "draft", title: "Draft only", data: definition("Draft only", specific) });
  await publish("Archived", specific, { lifecycle: "archived" });
  const listed = await call();
  assert.equal(listed.status, 200);
  assert.equal(listed.body.length, 1);
  const [row] = listed.body;
  assert.deepEqual(row, {
    id: String(shown._id), title: "Visible", role: "Backend engineer", companyName: "", difficulty: "medium", experience: "junior",
    // The default warm-up (two icebreakers, half a minute each, and a 1.5-minute introduction) adds 2.5 minutes.
    // No question count: students are never told how many prompts the interview has.
    language: "English", requiresResume: false, estimatedMinutes: Math.ceil(((2 * 90) / 60) * 1.6 + 2 + 2.5),
    // The interview language as the lobby shows it: always "English only" (DECISIONS #0), even for rules.language Hinglish.
    languageSetup: { primary: "English", choices: ["English"], strict: true, onOtherLanguage: "remind_and_flag" },
    status: "not_started", activeAttemptId: null, lastAttempt: null, practiceBlocked: false,
    terms: { text: "", required: false },
    resumeSetup: { mode: "none", sources: ["builder", "upload"], questionCount: 2, provided: false, source: null, providedAt: null },
    // Proctoring is off unless the admin turns it on (the pre-start proctoring step is skipped).
    proctoring: { ...ANVI_DEFAULTS.proctoring, ai: { ...ANVI_DEFAULTS.proctoring.ai } },
  });
  assert.doesNotMatch(JSON.stringify(listed.body), /SECRET|rubric|Clarity/);
});

test("start creates the attempt, live state and receipt before 201, and a second start resumes", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const interview = await publish("Start flow", specific);
  const started = await call(`/${interview._id}/start`, "POST", {});
  assert.equal(started.status, 201);
  assert.equal(started.body.status, "active");
  assert.equal(started.body.resumed, false);
  assert.equal(planCalls[0].options.seed, started.body.id, "the attempt id seeds group shuffles");
  assert.equal(planCalls[0].options.resumeText, "");
  const attempt = await AnviAttempt.findById(started.body.id).lean();
  assert.equal(attempt.status, "in_progress");
  assert.equal(attempt.snapshotRevision, 3);
  assert.equal(attempt.totalQuestions, 2);
  assert.equal(attempt.language, "English");
  assert.equal(attempt.hardDeadline - attempt.startedAt, 10 * 60_000);
  const live = await AnviLiveSession.findOne({ attemptId: attempt._id }).lean();
  assert.equal(live.plan.length, 2);
  assert.deepEqual(live.plan[0].keyPoints, ["Stateless requests"]);
  assert.equal(live.expiresAt - attempt.hardDeadline, 15 * 60_000);
  const receipt = await InterviewEngagementReceipt.findOne({ sessionId: started.body.id }).lean();
  assert.equal(receipt.interviewId, String(interview._id));
  assert.equal(await aiInterviewStarted({ _id: student, college: "Test College" }, String(interview._id)), true);

  const again = await call(`/${interview._id}/start`, "POST", {});
  assert.equal(again.status, 201);
  assert.deepEqual(again.body, { id: started.body.id, status: "active", resumed: true, terms: { text: "", acceptedAt: null }, language: "English" });
  assert.equal(planCalls.length, 1, "a resume never rebuilds the plan");
  const [row] = (await call()).body;
  assert.equal(row.status, "active");
  assert.equal(row.activeAttemptId, started.body.id);
});

test("a practice start is English only (DECISIONS #0) and refuses any other language before planning", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const data = normalizeDefinition({
    ...definition("Languages", specific),
    anvi: { language: { primary: "English", studentChoice: ["Hindi", "English"], strict: true, onOtherLanguage: "ignore" } },
  });
  assert.equal(data.rules.language, "English", "rules.language follows the primary language");
  const interview = await AIInterview.create({
    ownerId: new mongoose.Types.ObjectId(), creationKey: crypto.randomUUID(), title: "Languages", role: data.role, data,
    publishedSnapshot: { data, revision: 1, at: new Date() }, publishedAt: new Date(), publishedRevision: 1,
  });
  const [row] = (await call()).body;
  assert.equal(row.language, "English");
  assert.deepEqual(row.languageSetup, { primary: "English", choices: ["English"], strict: true, onOtherLanguage: "remind_and_flag" });

  const refused = await call(`/${interview._id}/start`, "POST", { language: "Hindi" });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.code, "LANGUAGE_NOT_ALLOWED");
  assert.equal(planCalls.length, 0);
  assert.equal(await AnviAttempt.countDocuments(), 0);

  const started = await call(`/${interview._id}/start`, "POST", { language: "English" });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  assert.equal(started.body.language, "English");
  const attempt = await AnviAttempt.findById(started.body.id).lean();
  assert.equal(attempt.language, "English");
  const live = await AnviLiveSession.findOne({ attemptId: attempt._id }).lean();
  assert.equal(live.rules.language, "English");
  // A rejoin keeps the attempt's language and never re-validates the request.
  const again = await call(`/${interview._id}/start`, "POST", { language: "Tamil" });
  assert.equal(again.status, 201);
  assert.equal(again.body.language, "English");
  assert.equal((await call(`/attempts/${started.body.id}`)).body.language, "English");
});

test("parallel starts share one attempt", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const interview = await publish("Race", specific);
  const results = await Promise.all([1, 2].map(() => call(`/${interview._id}/start`, "POST", {})));
  assert.deepEqual(results.map((r) => r.status), [201, 201]);
  assert.equal(results[0].body.id, results[1].body.id);
  assert.equal(await AnviAttempt.countDocuments({ interviewId: interview._id }), 1);
});

test("resume text is used only with consent, from the saved resume, without contact details", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const interview = await publish("Resume round", [{ id: "q1", kind: "resume", resumeCount: 1 }], { requiresResume: true });
  await Resume.create({
    student, basics: { name: "Asha", headline: "Backend developer", email: "asha@example.com", mobile: "+91 99999 00000" },
    projects: [{ title: "PeerPrep clone", technologies: "Node, MongoDB", bullets: [{ text: "Built the judge queue" }] }],
    skills: [{ category: "Languages", skills: "JavaScript" }],
  });
  // Resume questions make the resume required: no consent and no stored resume refuses the start before planning.
  const refused = await call(`/${interview._id}/start`, "POST", { resumeConsent: false });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.code, "RESUME_REQUIRED");
  assert.equal(planCalls.length, 0);
  assert.equal(await AnviAttempt.countDocuments(), 0);
  assert.equal((await call(`/${interview._id}/start`, "POST", { resumeConsent: true })).status, 201);
  const text = planCalls[0].options.resumeText;
  assert.match(text, /PeerPrep clone/);
  assert.match(text, /Built the judge queue/);
  assert.match(text, /JavaScript/);
  assert.doesNotMatch(text, /asha@example\.com|99999|Asha/);
  assert.equal(generateCalls.at(-1).model, "fake-generate", "generation runs on the configured model");
  const live = await AnviLiveSession.findOne().lean();
  assert.equal(live.plan[1].text, "Tell me about PeerPrep");
  const attempt = await AnviAttempt.findOne().lean();
  assert.equal(attempt.resumeConsent, true);
  assert.equal(attempt.resumeSource, "builder");
});

test("attempt detail hides answers until the end; REST end keeps stored answers as abandoned", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const interview = await publish("End flow", specific);
  const { body: started } = await call(`/${interview._id}/start`, "POST", {});
  const running = await call(`/attempts/${started.id}`);
  assert.equal(running.status, 200);
  assert.equal(running.body.status, "in_progress");
  assert.deepEqual(running.body.items, []);
  await AnviLiveSession.updateOne({ attemptId: started.id }, { $set: {
    "answers.q1": { text: "REST uses stateless requests.", source: "transcribe", seconds: 42 },
    "answers.q2": { skipRequested: true, substantiveWords: 1 },
  } });
  const other = await call(`/attempts/${started.id}/end`, "POST", {}, { "X-Test-Student": new mongoose.Types.ObjectId().toString() });
  assert.equal(other.status, 404, "another student cannot end it");
  const ended = await call(`/attempts/${started.id}/end`, "POST", {});
  assert.equal(ended.status, 200);
  assert.equal(ended.body.status, "abandoned");
  assert.deepEqual(ended.body.items, [
    { n: 1, questionText: "Explain REST.", answerText: "REST uses stateless requests.", status: "answered" },
    { n: 2, questionText: "Explain caching.", answerText: "", status: "skipped" },
  ]);
  assert.doesNotMatch(JSON.stringify(ended.body), /Stateless requests|TTL/, "key points never reach the student");
  const stored = await AnviAttempt.findById(started.id).lean();
  assert.equal(stored.endReason, "ended_by_student");
  assert.equal(stored.items[0].answerSource, "transcribe");
  assert.equal(stored.items[0].answerSeconds, 42);
  assert.equal(await AnviLiveSession.countDocuments({ attemptId: started.id }), 0);
  assert.equal((await call(`/attempts/${started.id}/end`, "POST", {})).body.status, "abandoned", "ending twice is harmless");
  const [row] = (await call()).body;
  assert.equal(row.status, "not_started");
  assert.equal(row.lastAttempt.id, started.id);
  assert.equal(row.lastAttempt.status, "abandoned");
  assert.equal(await aiInterviewStarted({ _id: student, college: "Other" }, String(interview._id)), true, "an attempt alone proves the start");
});

test("proctoring: settings are listed and stored with the plan; REST end copies the log; the student sees counts only", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const proctoring = { enabled: true, fullscreen: "required", tabSwitch: "warn", refresh: "record", maxViolations: 3, ai: { enabled: true, detectMobile: false } };
  const data = definition("Proctored", specific, { proctoring });
  const interview = await AIInterview.create({
    ownerId: new mongoose.Types.ObjectId(), creationKey: crypto.randomUUID(), title: "Proctored", role: data.role, data,
    publishedSnapshot: { data, revision: 3, at: new Date() }, publishedAt: new Date(), publishedRevision: 3,
  });
  const [row] = (await call()).body;
  assert.deepEqual(row.proctoring, { ...ANVI_DEFAULTS.proctoring, ...proctoring, ai: { ...ANVI_DEFAULTS.proctoring.ai, enabled: true, detectMobile: false } });
  const { body: started } = await call(`/${interview._id}/start`, "POST", {});
  const live = await AnviLiveSession.findOne({ attemptId: started.id }).lean();
  assert.equal(live.rules.proctoring.enabled, true, "the running attempt keeps its own snapshot of the rules");
  const at = new Date();
  await AnviLiveSession.updateOne({ attemptId: started.id }, { $set: { proctoring: {
    events: [{ type: "tab_hidden", at, questionN: 1 }, { type: "ai_multiple_persons", at, questionN: 1, severity: "high", confidence: 0.91 }],
    counts: { tab_hidden: 1, ai_multiple_persons: 1 }, violations: 2, endedForViolations: false, joins: 1,
    ai: { totalViolations: 1, multiplePersons: 1, riskLevel: "medium" },
  } } });
  // While it runs, the detail carries the rules the room and the rejoin lobby apply, never the event log.
  const running = await call(`/attempts/${started.id}`);
  assert.equal(running.body.status, "in_progress");
  assert.deepEqual(Object.keys(running.body.proctoring).sort(), ["counts", "enabled", "endedForViolations", "settings", "violations"]);
  assert.equal(running.body.proctoring.enabled, true);
  assert.equal(running.body.proctoring.violations, 2);
  assert.equal(running.body.proctoring.counts.tab_hidden, 1);
  assert.deepEqual(running.body.proctoring.settings, {
    ...ANVI_DEFAULTS.proctoring, ...proctoring, ai: { ...ANVI_DEFAULTS.proctoring.ai, enabled: true, detectMobile: false },
  });
  assert.doesNotMatch(JSON.stringify(running.body), /"events"|"severity"|"confidence"/);
  const ended = await call(`/attempts/${started.id}/end`, "POST", {});
  assert.equal(ended.status, 200);
  assert.equal(ended.body.proctoring.enabled, true);
  assert.equal(ended.body.proctoring.violations, 2);
  assert.equal(ended.body.proctoring.endedForViolations, false);
  assert.equal(ended.body.proctoring.counts.tab_hidden, 1);
  assert.deepEqual(Object.keys(ended.body.proctoring).sort(), ["counts", "enabled", "endedForViolations", "violations"], "never the event log");
  const stored = await AnviAttempt.findById(started.id).lean();
  assert.equal(stored.proctoring.settings.maxViolations, 3);
  assert.equal(stored.proctoring.events.length, 2);
  assert.equal(stored.proctoring.violations, 2);
  assert.deepEqual(stored.proctoring.aiEvents.map((event) => [event.type, event.severity, event.confidence]), [["ai_multiple_persons", "high", 0.91]]);
  assert.equal(stored.proctoring.ai.multiplePersons, 1);
  // An unproctored attempt shows proctoring as off.
  const plain = await publish("Plain", specific);
  const { body: other } = await call(`/${plain._id}/start`, "POST", {});
  const detail = await call(`/attempts/${other.id}`);
  assert.deepEqual(detail.body.proctoring.enabled, false);
  assert.equal(detail.body.proctoring.violations, 0);
  assert.equal(detail.body.proctoring.settings.enabled, false, "a running unproctored attempt shows its (off) rules");
});

test("proctoring: a REST end within 5 s of a join does not report the join hold as a pause", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const proctoring = { enabled: true, fullscreen: "required", pauseOutsideFullscreen: true };
  const data = definition("Held", specific, { proctoring });
  const interview = await AIInterview.create({
    ownerId: new mongoose.Types.ObjectId(), creationKey: crypto.randomUUID(), title: "Held", role: data.role, data,
    publishedSnapshot: { data, revision: 3, at: new Date() }, publishedAt: new Date(), publishedRevision: 3,
  });
  const endWith = async (pauses) => {
    const { body: started } = await call(`/${interview._id}/start`, "POST", {});
    await AnviLiveSession.updateOne({ attemptId: started.id }, { $set: { proctoring: { joins: 2, pauses } } });
    assert.equal((await call(`/attempts/${started.id}/end`, "POST", {})).status, 200);
    return (await AnviAttempt.findById(started.id).lean()).proctoring.pauses;
  };
  const ago = (ms) => new Date(Date.now() - ms);
  const real = { from: ago(60_000), to: ago(50_000), reason: "tab_hidden" };
  // The socket opened a join hold 1 s ago and the student ended over REST before the room reported back.
  const fresh = await endWith([real, { from: ago(1_000), to: null, reason: "fullscreen_exit", joinHold: true }]);
  assert.deepEqual(fresh.map((pause) => pause.reason), ["tab_hidden"], "only the real pause");
  // A join hold that lasted longer was a real pause (the room never got back to fullscreen); it ends at the end.
  const long = await endWith([{ from: ago(20_000), to: null, reason: "fullscreen_exit", joinHold: true }]);
  assert.equal(long.length, 1);
  assert.ok(long[0].to instanceof Date);
  assert.equal(long[0].joinHold, undefined, "the marker stays in the live doc");
});

test("a stale in-progress attempt is expired before a new start", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const interview = await publish("Stale", specific);
  const old = await AnviAttempt.create({
    studentId: student, interviewId: interview._id, snapshotRevision: 3, startedAt: new Date(Date.now() - 90 * 60_000),
    hardDeadline: new Date(Date.now() - 30 * 60_000), totalQuestions: 2,
  });
  const started = await call(`/${interview._id}/start`, "POST", {});
  assert.equal(started.status, 201);
  assert.equal(started.body.resumed, false);
  assert.notEqual(started.body.id, String(old._id));
  assert.equal((await AnviAttempt.findById(old._id).lean()).status, "expired");
});

test("guards: ids, unknown interviews, roles, scopes and Gemini outages", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const bad = await call("/not-an-id/start", "POST", {});
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, "INVALID_IDENTIFIER");
  assert.equal((await call("/attempts/123")).status, 400);
  const missing = await call(`/${new mongoose.Types.ObjectId()}/start`, "POST", {});
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, "INTERVIEW_NOT_FOUND");
  assert.equal((await call(`/attempts/${new mongoose.Types.ObjectId()}`)).status, 404);
  assert.equal((await call("", "GET", undefined, { "X-Test-Role": "admin" })).status, 403);
  assert.equal((await call("", "GET", undefined, { "X-Test-Scope": "assessment_only" })).status, 403);
  const interview = await publish("Outage", specific);
  planFailure = Object.assign(new Error("upstream down"), { code: "GEMINI_UNAVAILABLE" });
  const outage = await call(`/${interview._id}/start`, "POST", {});
  assert.equal(outage.status, 503);
  assert.equal(await AnviAttempt.countDocuments(), 0, "no attempt means the coin verify refunds");
  assert.equal(await aiInterviewStarted({ _id: student, college: "Test College" }, String(interview._id)), false);
});

test("an aborted start creates no attempt (so its charge is refunded), and new attempts per day are capped", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const interview = await publish("Abort", specific);
  const me = { _id: student, college: "Test College" };
  const service = createAnviService({ gemini, buildPlan, config, evaluateSoon });
  const controller = new AbortController();
  controller.abort(new Error("Client disconnected"));
  await assert.rejects(service.startAttempt(me, String(interview._id), { signal: controller.signal }), (error) => error.status === 499 && error.details?.code === "REQUEST_ABORTED");
  assert.equal(await AnviAttempt.countDocuments({ interviewId: interview._id }), 0);
  assert.equal(await aiInterviewStarted(me, String(interview._id)), false, "coin verify sees no start, so it refunds");

  const capped = createAnviService({ gemini, buildPlan, evaluateSoon, config: { ...config, maxAttemptsPerDay: 1 } });
  const first = await capped.startAttempt(me, String(interview._id));
  await capped.endAttemptRest(me, first.id);
  await assert.rejects(capped.startAttempt(me, String(interview._id)), (error) => error.status === 429 && error.details?.code === "ATTEMPT_LIMIT");
});

test("a REST end after the time limit records the attempt as expired", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const interview = await publish("Late end", specific);
  const { body: started } = await call(`/${interview._id}/start`, "POST", {});
  await AnviAttempt.updateOne({ _id: started.id }, { $set: { hardDeadline: new Date(Date.now() - 1000) } });
  const ended = await call(`/attempts/${started.id}/end`, "POST", {});
  assert.equal(ended.body.status, "expired");
  assert.equal((await AnviAttempt.findById(started.id).lean()).endReason, "deadline");
});

test("the maintenance sweep closes attempts nobody can resume and leaves live ones", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const now = new Date();
  const ago = (minutes) => new Date(now.getTime() - minutes * 60_000);
  const attempt = (fields) => AnviAttempt.create({ studentId: new mongoose.Types.ObjectId(), interviewId: new mongoose.Types.ObjectId(), snapshotRevision: 1, ...fields });
  const plan = [{ qid: "q1", n: 1, text: "Ask one question about: REST", keyPoints: ["Stateless"] }, { qid: "q2", n: 2, text: "Explain caching." }];
  const idle = await attempt({ startedAt: ago(80), hardDeadline: ago(30) });
  await AnviLiveSession.create({
    attemptId: idle._id, studentId: idle.studentId, plan, lastActivityAt: ago(40), expiresAt: new Date(now.getTime() + 60_000),
    answers: { q1: { text: "Partial answer", source: "live", spokenQuestion: "How would you design a REST API?" }, q2: { silent: true } },
  });
  const orphan = await attempt({ startedAt: ago(10), hardDeadline: new Date(now.getTime() + 30 * 60_000) });
  const fresh = await attempt({ startedAt: now, hardDeadline: new Date(now.getTime() + 30 * 60_000) });
  const running = await attempt({ startedAt: ago(5), hardDeadline: new Date(now.getTime() + 25 * 60_000) });
  await AnviLiveSession.create({ attemptId: running._id, studentId: running.studentId, plan, lastActivityAt: now, expiresAt: new Date(now.getTime() + 40 * 60_000) });
  const result = await sweepStaleAnviAttempts(now, { config, evaluateSoon });
  assert.equal(result.closed, 2);
  assert.deepEqual(evaluations.sort(), [String(idle._id), String(orphan._id)].sort(), "closed attempts are queued for a partial report");
  const idleAfter = await AnviAttempt.findById(idle._id).lean();
  assert.equal(idleAfter.status, "expired");
  assert.equal(idleAfter.partial, true);
  assert.equal(idleAfter.pendingWork.status, "pending");
  assert.equal(idleAfter.items[0].answerText, "Partial answer");
  assert.equal(idleAfter.items[0].answerSource, "live");
  assert.equal(idleAfter.items[0].questionText, "How would you design a REST API?", "topic items keep what ANVI asked");
  assert.deepEqual(idleAfter.items[0].expectedKeyPoints, ["Stateless"]);
  assert.equal(idleAfter.items[1].status, "not_attempted");
  assert.deepEqual(idleAfter.items[1].flags, ["silent"]);
  assert.equal(await AnviLiveSession.countDocuments({ attemptId: idle._id }), 0);
  assert.equal((await AnviAttempt.findById(orphan._id).lean()).status, "abandoned");
  assert.equal((await AnviAttempt.findById(fresh._id).lean()).status, "in_progress", "a start still creating its live doc is left alone");
  assert.equal((await AnviAttempt.findById(running._id).lean()).status, "in_progress");
});

test("an ended attempt is queued for evaluation; the report shows key points and verdicts, never the authored answer", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const interview = await publish("Report flow", specific);
  const { body: started } = await call(`/${interview._id}/start`, "POST", {});
  const live = await AnviLiveSession.findOne({ attemptId: started.id }).lean();
  assert.deepEqual(live.rules.turns, { silenceSeconds: 2.5, nudgeSeconds: 30, maxNudges: 1, voiceCommands: false }, "the conductor reads turn settings from the live rules");
  assert.equal(live.rules.language, "English");
  assert.equal(live.plan[0].marks, 20);
  const begun = await AnviAttempt.findById(started.id).lean();
  assert.deepEqual(begun.rubricSnapshot, [{ id: "r1", name: "Clarity", weight: 100, description: "" }]);

  await AnviLiveSession.updateOne({ attemptId: started.id }, { $set: { "answers.q1": { text: "REST keeps requests stateless, so any server can answer and the API scales out easily.", source: "transcribe", seconds: 30 } } });
  const ended = await call(`/attempts/${started.id}/end`, "POST", {});
  assert.equal(ended.body.status, "abandoned");
  assert.equal(ended.body.report, "preparing");
  assert.equal(ended.body.partial, true);
  assert.deepEqual(evaluations, [started.id], "evaluation starts as soon as the attempt ends");
  const queued = await AnviAttempt.findById(started.id).lean();
  assert.equal(queued.pendingWork.status, "pending");
  assert.equal(queued.pendingWork.attempts, 0);
  assert.deepEqual(
    { sectionId: queued.items[0].sectionId, maxMarks: queued.items[0].maxMarks, weight: queued.items[0].weight, competency: queued.items[0].competency, expectedAnswer: queued.items[0].expectedAnswer },
    { sectionId: "s1", maxMarks: 20, weight: 0.5, competency: "APIs", expectedAnswer: "SECRET-EXPECTED stateless requests." },
  );
  assert.equal(queued.items[1].maxMarks, 10, "plan items without marks default to 10");
  assert.doesNotMatch(JSON.stringify(ended.body), /SECRET|Stateless requests/);

  const judge = {
    async generateJson(request) {
      const items = JSON.parse(request.parts[0].text.match(/<items>([\s\S]*)<\/items>/)[1]);
      return { items: items.map((item) => ({ qid: item.qid, keyPoints: [{ index: 1, verdict: "matched" }], rubric: [{ id: "r1", level: 3 }], feedback: "You explained statelessness clearly.", strengths: ["Clear"], improvements: ["Mention caching"] })) };
    },
  };
  const evaluator = createAnviEvaluator({ gemini: judge, config, notify: async () => true, log: { warn() {} } });
  assert.equal((await evaluator.evaluateNow(started.id)).status, "ready");
  const report = (await call(`/attempts/${started.id}`)).body;
  assert.equal(report.status, "ready");
  assert.equal(report.report, "ready");
  assert.equal(report.endReason, "ended_by_student");
  assert.deepEqual({ score: report.overall.score, max: report.overall.max, percent: report.overall.percent, partial: report.overall.partial }, { score: 20, max: 30, percent: 67, partial: true });
  assert.deepEqual(report.items[0].expectedKeyPoints, ["Stateless requests"]);
  assert.deepEqual(report.items[0].matched, ["Stateless requests"]);
  assert.equal(report.items[0].feedback, "You explained statelessness clearly.");
  assert.equal(report.items[1].feedback, "Not attempted.");
  assert.ok(report.items[0].metrics.wpm > 0);
  assert.deepEqual(report.byRubric, [{ id: "r1", name: "Clarity", weight: 100, percent: 75 }]);
  assert.ok(report.actionItems.length >= 3);
  assert.equal("expectedAnswer" in report.items[0], false);
  assert.doesNotMatch(JSON.stringify(report), /SECRET/, "the authored answer never reaches the student");
  const [row] = (await call()).body;
  assert.equal(row.status, "not_started", "a scored abandoned attempt does not complete the interview");
  assert.equal(row.lastAttempt.status, "ready");
  assert.equal(row.lastAttempt.partial, true);
});
