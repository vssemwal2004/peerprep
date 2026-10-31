import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, mock, test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import AIInterview from "../src/models/AIInterview.js";
import Resume from "../src/models/Resume.js";
import User from "../src/models/User.js";
import { InterviewEngagementReceipt } from "../src/models/AdaptiveEngagement.js";
import { PlatformCoinPricing } from "../src/platform/models.js";
import { getCoinPricing } from "../src/platform/coinSpend.js";
import { normalizeDefinition } from "../src/services/aiInterviewDefinition.js";
import { aiInterviewStarted } from "../src/services/coinEntitlements.js";
import { engagementTenant } from "../src/services/engagementPolicyService.js";
import { errorHandler } from "../src/utils/errors.js";
import { createAuthoringRouter } from "../src/routes/aiInterviews.js";
import { assignmentGuard } from "../src/controllers/aiInterviewController.js";
import { createAnviStudentRouter } from "../src/modules/anviInterview/anviInterview.routes.js";
import { createAnviService } from "../src/modules/anviInterview/anviInterview.service.js";
import { createAnviAdminReportRouter } from "../src/modules/anviInterview/anviInterview.adminRoutes.js";
import { createAnviEvaluator } from "../src/modules/anviInterview/anviInterview.evaluation.js";
import { sweepStaleAnviAttempts } from "../src/modules/anviInterview/anviInterview.maintenance.js";
import { registerAnviSocketHandlers } from "../src/modules/anviInterview/anviInterview.socket.js";
import { AnviAttempt, AnviLiveSession } from "../src/modules/anviInterview/anviInterview.models.js";
import { AnviAssignment, AnviAssignmentTarget, AnviBooking } from "../src/modules/anviInterview/anviInterview.scheduling.models.js";

// Phase 3 integration: assigned starts, practice blocking, coin entitlements, finalize and visibility
// hooks, authoring guards and the cohort report. The scheduling service is a fake (its own tests cover
// it); MongoDB is ephemeral and Gemini is never called.
let mongo, server, base;
let skipped = false;
const student = new mongoose.Types.ObjectId().toString();
const admin = new mongoose.Types.ObjectId();
const config = Object.freeze({ apiKey: "test", generateModel: "fake-generate", maxSessionMinutes: 45, resumeWindowMinutes: 15, maxAttemptsPerDay: 5 });
const MINUTE = 60_000;
const planCalls = [];
const evaluations = [];
const evaluateSoon = (attemptId) => { evaluations.push(String(attemptId)); return null; };
const gemini = { generateJson: async () => ({ questions: [] }) };
async function buildPlan(data, options) {
  planCalls.push({ data, options });
  return {
    plan: [
      { qid: "q1", n: 1, sectionId: "s1", sectionName: "Technical", text: data.sections[0].groups[0].questions[0].prompt, keyPoints: ["Stateless requests"], competency: "APIs" },
      { qid: "q2", n: 2, sectionName: "Technical", text: "Explain caching.", keyPoints: ["TTL"] },
    ],
    persona: { displayName: "ANVI" },
    rules: { language: "English" },
    estimatedMinutes: 30,
  };
}

const definition = (title, prompt = "Explain REST.") => normalizeDefinition({
  title, role: "Backend engineer", experience: "junior", difficulty: "medium",
  rules: { language: "English", responseSeconds: 90 },
  interviewer: { profileId: "p1", displayName: "ANVI" },
  sections: [{ id: "s1", name: "Technical", weight: 100, groups: [{ id: "g1", name: "APIs", weight: 100, source: "manual", questions: [
    { id: "q1", kind: "specific", prompt, expectedAnswer: "Stateless requests." },
  ] }] }],
  rubric: [{ id: "r1", name: "Clarity", weight: 100 }],
});
const publish = (title, extra = {}) => {
  const data = definition(title);
  return AIInterview.create({
    ownerId: admin, creationKey: crypto.randomUUID(), title, role: data.role, data,
    publishedSnapshot: { data, revision: 3, at: new Date() }, publishedAt: new Date(), publishedRevision: 3, ...extra,
  });
};

// The fake scheduling service: each test sets `check` and inspects `calls`.
const calls = { check: [], record: [], finalized: [], blocked: [] };
const sched = {
  blocked: new Set(),
  check: async () => ({ ok: false, code: "NOT_ASSIGNED", message: "Not assigned." }),
  recordFailure: null,
  visibility: null,
  practiceBlocked: async (id) => { calls.blocked.push(String(id)); return sched.blocked.has(String(id)); },
  active: false,
  assignmentActive: async () => sched.active,
  checkAssignedStart: async (...args) => { calls.check.push(args); return sched.check(...args); },
  recordAssignedAttempt: async (payload) => { calls.record.push(payload); if (sched.recordFailure) throw sched.recordFailure; },
  onAttemptFinalized: async (attempt) => { calls.finalized.push(attempt); },
  visibilityForAttempt: async () => sched.visibility,
};
// What checkAssignedStart returns for a student who may start now.
function allowed({ interviewId, cap = new Date(Date.now() + 20 * MINUTE), mode = "mock", prompt = "PINNED: explain REST." } = {}) {
  const assignment = {
    _id: new mongoose.Types.ObjectId(), interviewId, snapshotRevision: 7, snapshotData: definition("Pinned title", prompt),
    title: "Campus drive", role: "Backend engineer", mode, status: "open",
  };
  const booking = { _id: new mongoose.Types.ObjectId(), startsAt: new Date(), endsAt: new Date(Date.now() + 30 * MINUTE) };
  const target = { _id: new mongoose.Types.ObjectId(), studentId: student };
  return { ok: true, assignment, target, booking, hardDeadlineCap: cap };
}

before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } }); }
  catch (error) { if (error?.code === "EPERM") { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: "anvi_assigned_start_test" });
  await Promise.all([AIInterview, AnviAttempt, AnviLiveSession, InterviewEngagementReceipt, Resume, AnviAssignment, AnviAssignmentTarget, AnviBooking].map((model) => model.init()));
  // A priced start: anything requireCoins does not exempt tries to charge (and fails here without a
  // replica set), so a 201 for an assigned start proves it was exempt.
  await PlatformCoinPricing.collection.insertOne({ _id: "current", version: 1, features: { "ai_interview.start": { price: 5, freePerMonth: 0 } } });
  await getCoinPricing({ fresh: true });
  const app = express();
  app.use(express.json());
  const authStudent = (req, _res, next) => {
    req.user = { _id: req.get("X-Test-Student") || student, role: "student", accessScope: "full", college: "Test College" };
    next();
  };
  const authAdmin = (req, _res, next) => {
    req.user = { _id: new mongoose.Types.ObjectId(req.get("X-Test-Admin") || String(admin)), role: "admin" };
    next();
  };
  app.use("/api/student/ai-interviews", createAnviStudentRouter(authStudent, { gemini, buildPlan, config, evaluateSoon, scheduling: sched }));
  app.use("/api/ai-interviews/reports", createAnviAdminReportRouter(authAdmin, { evaluateSoon, models: { AnviAssignment, AnviAssignmentTarget, AnviBooking } }));
  app.use("/api/ai-interviews", createAuthoringRouter(authAdmin));
  app.use(errorHandler);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  if (skipped) return;
  planCalls.length = 0;
  evaluations.length = 0;
  for (const list of Object.values(calls)) list.length = 0;
  Object.assign(sched, { blocked: new Set(), active: false, recordFailure: null, visibility: null, check: async () => ({ ok: false, code: "NOT_ASSIGNED", message: "Not assigned." }) });
  await Promise.all([AIInterview, AnviAttempt, AnviLiveSession, InterviewEngagementReceipt, Resume, User, AnviAssignment, AnviAssignmentTarget, AnviBooking]
    .map((model) => model.deleteMany({})));
});
const call = async (path, method = "GET", body, headers = {}) => {
  const result = await fetch(`${base}${path}`, {
    method, headers: { "Content-Type": "application/json", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await result.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* CSV */ }
  return { status: result.status, body: parsed, headers: result.headers };
};
const me = { _id: student, college: "Test College" };
const skip = (t) => (skipped ? t.skip("Local sockets are unavailable in this sandbox") : false);

test("the assigned start route lives in the ANVI student router and nothing mounted earlier shadows it", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(read("../src/modules/anviInterview/anviInterview.routes.js"), /router\.post\("\/assignments\/:aid\/start"/);
  assert.doesNotMatch(read("../src/modules/anviInterview/anviInterview.scheduling.routes.js"), /\/start"/, "the scheduling router defines no start route");
  const index = read("../src/routes/index.js");
  const mount = (router) => index.search(new RegExp(`router\\.use\\('/student/ai-interviews',[^\\n]*\\b${router}\\b`));
  assert.ok(mount("createAnviSchedulingStudentRouter") > 0);
  assert.ok(mount("createAnviSchedulingStudentRouter") < mount("aiInterviewStudentRoutes"));
});

test("an allowed assigned start is free, uses the pinned snapshot, the mode and the capped deadline", async (t) => {
  if (skip(t)) return;
  // No AIInterview row at all: the start never reads the live definition.
  const interviewId = new mongoose.Types.ObjectId();
  const cap = new Date(Date.now() + 20 * MINUTE);
  const grant = allowed({ interviewId, cap });
  sched.check = async () => grant;
  const started = await call(`/student/ai-interviews/assignments/${grant.assignment._id}/start`, "POST", {});
  assert.equal(started.status, 201, JSON.stringify(started.body));
  assert.equal(started.body.resumed, false);
  assert.equal(started.body.assignmentId, String(grant.assignment._id));
  assert.equal(String(calls.check[0][1]), String(grant.assignment._id));
  assert.equal(calls.check.length, 2, "the coin exemption and the handler ask the same question");
  assert.match(planCalls[0].data.sections[0].groups[0].questions[0].prompt, /^PINNED/, "the plan comes from assignment.snapshotData");
  const attempt = await AnviAttempt.findById(started.body.id).lean();
  assert.equal(attempt.mode, "mock");
  assert.equal(String(attempt.assignmentId), String(grant.assignment._id));
  assert.equal(String(attempt.bookingId), String(grant.booking._id));
  assert.equal(attempt.snapshotRevision, 7);
  assert.equal(attempt.title, "Pinned title");
  assert.equal(attempt.hardDeadline.getTime(), cap.getTime(), "the 30 minute plan is cut to the window cap");
  const live = await AnviLiveSession.findOne({ attemptId: attempt._id }).lean();
  assert.equal(live.expiresAt - attempt.hardDeadline, 15 * MINUTE);
  assert.equal(calls.record.length, 1);
  assert.equal(String(calls.record[0].attempt._id), started.body.id);
  assert.equal(calls.record[0].booking, grant.booking);
  // The engagement receipt exists, but a free scheduled attempt never makes practice free.
  assert.ok(await InterviewEngagementReceipt.exists({ sessionId: started.body.id }));
  assert.equal(await aiInterviewStarted(me, String(interviewId)), false);

  // Rejoining resumes without asking the scheduler again (its attempt is already used).
  sched.check = async () => ({ ok: false, code: "ATTEMPT_LIMIT", message: "No attempts left." });
  const again = await call(`/student/ai-interviews/assignments/${grant.assignment._id}/start`, "POST", {});
  assert.equal(again.status, 201);
  assert.deepEqual(again.body, { id: started.body.id, status: "active", resumed: true, assignmentId: String(grant.assignment._id), terms: { text: "", acceptedAt: null }, language: "English" });
  assert.equal(calls.check.length, 2);
  assert.equal(calls.record.length, 1);

  const detail = await call(`/student/ai-interviews/attempts/${started.body.id}`);
  assert.equal(detail.body.mode, "mock");
  assert.equal(detail.body.assignmentId, String(grant.assignment._id));
});

test("an assigned start is English only (DECISIONS #0), refuses any other language, and a rejoin keeps it", async (t) => {
  if (skip(t)) return;
  const grant = allowed({ interviewId: new mongoose.Types.ObjectId() });
  // A snapshot published before the decision, still offering Hindi.
  grant.assignment.snapshotData.anvi.language = { primary: "English", studentChoice: ["Hindi"], strict: true, onOtherLanguage: "remind" };
  sched.check = async () => grant;
  const path = `/student/ai-interviews/assignments/${grant.assignment._id}/start`;
  const refused = await call(path, "POST", { language: "Hindi" });
  assert.equal(refused.status, 400);
  assert.deepEqual(refused.body, { code: "LANGUAGE_NOT_ALLOWED", error: "This interview is conducted in English only." });
  assert.equal((await call(path, "POST", { language: 7 })).body.code, "LANGUAGE_NOT_ALLOWED");
  assert.equal(await AnviAttempt.countDocuments(), 0);
  assert.equal(calls.record.length, 0);

  const started = await call(path, "POST", { language: "english" });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  assert.equal(started.body.language, "English");
  assert.equal(planCalls[0].options.language, "English");
  const attempt = await AnviAttempt.findById(started.body.id).lean();
  assert.equal(attempt.language, "English");
  assert.equal((await AnviLiveSession.findOne({ attemptId: attempt._id }).lean()).rules.language, "English");
  const again = await call(path, "POST", { language: "Hindi" });
  assert.equal(again.body.resumed, true);
  assert.equal(again.body.language, "English");
  assert.equal((await call(`/student/ai-interviews/attempts/${started.body.id}`)).body.language, "English");
});

test("a refused assigned start returns the scheduler's reason before any charge and creates nothing", async (t) => {
  if (skip(t)) return;
  const aid = new mongoose.Types.ObjectId();
  sched.check = async () => ({ ok: false, code: "NOT_YET_OPEN", message: "Join opens at 10:50 am IST." });
  const early = await call(`/student/ai-interviews/assignments/${aid}/start`, "POST", {});
  assert.equal(early.status, 403);
  assert.deepEqual(early.body, { code: "NOT_YET_OPEN", error: "Join opens at 10:50 am IST." });
  sched.check = async () => ({ ok: false, code: "NOT_ASSIGNED", message: "Not assigned." });
  assert.equal((await call(`/student/ai-interviews/assignments/${aid}/start`, "POST", {})).status, 404);
  sched.check = async () => ({ ok: false, code: "ATTEMPT_LIMIT", message: "Used." });
  assert.equal((await call(`/student/ai-interviews/assignments/${aid}/start`, "POST", {})).status, 409);
  const bad = await call("/student/ai-interviews/assignments/nope/start", "POST", {});
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, "INVALID_IDENTIFIER");
  assert.equal(await AnviAttempt.countDocuments(), 0);
  assert.equal(planCalls.length, 0);
  assert.equal(calls.record.length, 0);

  // A deadline cap under a minute away cannot run an interview.
  const grant = allowed({ interviewId: new mongoose.Types.ObjectId(), cap: new Date(Date.now() + 20_000) });
  sched.check = async () => grant;
  const late = await call(`/student/ai-interviews/assignments/${grant.assignment._id}/start`, "POST", {});
  assert.equal(late.status, 403);
  assert.equal(late.body.code, "WINDOW_CLOSED");
  assert.equal(await AnviAttempt.countDocuments(), 0);
});

test("starting the assigned interview supersedes an in-progress practice attempt of it", async (t) => {
  if (skip(t)) return;
  const interview = await publish("Practice first");
  const service = createAnviService({ gemini, buildPlan, config, evaluateSoon, scheduling: sched });
  const practice = await service.startAttempt(me, String(interview._id));
  assert.equal(await aiInterviewStarted(me, String(interview._id)), true, "practice was paid for");
  const grant = allowed({ interviewId: interview._id, mode: "adaptive" });
  sched.check = async () => grant;
  const assigned = await service.startAssignedAttempt(me, String(grant.assignment._id));
  assert.notEqual(assigned.id, practice.id);
  const old = await AnviAttempt.findById(practice.id).lean();
  assert.equal(old.status, "abandoned");
  assert.equal(old.endReason, "superseded_by_assigned");
  assert.ok(evaluations.includes(practice.id), "the practice attempt still gets its partial report");
  assert.equal(calls.finalized.length, 0, "a practice attempt never touches the schedule");
  assert.equal((await AnviAttempt.findById(assigned.id).lean()).mode, "adaptive");

  // Practice start now refuses to resume the scheduled attempt (it would be charged as practice).
  await assert.rejects(service.startAttempt(me, String(interview._id)), (error) => error.status === 409 && error.details?.code === "ASSIGNED_ATTEMPT_ACTIVE");
  const [card] = await service.listStudentInterviews(me);
  assert.equal(card.status, "not_started", "practice cards ignore scheduled attempts");
  assert.equal(card.activeAttemptId, null);
  assert.equal(card.lastAttempt.id, practice.id);
});

test("a failed schedule record removes the new attempt so no attempt is used up", async (t) => {
  if (skip(t)) return;
  const grant = allowed({ interviewId: new mongoose.Types.ObjectId() });
  sched.check = async () => grant;
  sched.recordFailure = new Error("db blip");
  const service = createAnviService({ gemini, buildPlan, config, evaluateSoon, scheduling: sched });
  await assert.rejects(service.startAssignedAttempt(me, String(grant.assignment._id)), /db blip/);
  assert.equal(await AnviAttempt.countDocuments(), 0);
  assert.equal(await AnviLiveSession.countDocuments(), 0);
  assert.equal(await InterviewEngagementReceipt.countDocuments(), 0);
});

test("a start that loses the last attempt to a parallel one is discarded with 409", async (t) => {
  if (skip(t)) return;
  const grant = allowed({ interviewId: new mongoose.Types.ObjectId() });
  sched.check = async () => grant;
  const lost = { ...sched, recordAssignedAttempt: async () => false };
  const service = createAnviService({ gemini, buildPlan, config, evaluateSoon, scheduling: lost });
  await assert.rejects(service.startAssignedAttempt(me, String(grant.assignment._id)), (error) => error.status === 409 && error.details?.code === "ATTEMPTS_EXHAUSTED");
  assert.equal(await AnviAttempt.countDocuments(), 0);
  assert.equal(await AnviLiveSession.countDocuments(), 0);
});

test("with the real scheduling service: window start, attempt accounting, finalize, blocking and guards", async (t) => {
  if (skip(t)) return;
  const interview = await publish("Real schedule");
  const assignment = await AnviAssignment.create({
    ownerId: admin, interviewId: interview._id, snapshotRevision: 3, snapshotData: definition("Real pinned", "REAL-PINNED question"), title: "Real drive",
    mode: "mock", audience: { source: "selected", studentCount: 1 }, status: "open",
    window: { opensAt: new Date(Date.now() - 10 * MINUTE), closesAt: new Date(Date.now() + 25 * MINUTE) },
  });
  const target = await AnviAssignmentTarget.create({ assignmentId: assignment._id, studentId: student });
  const service = createAnviService({ gemini, buildPlan, config, evaluateSoon });
  // Practice of the scheduled interview is blocked for every student.
  const [card] = await service.listStudentInterviews({ _id: new mongoose.Types.ObjectId() });
  assert.equal(card.practiceBlocked, true);
  await assert.rejects(service.startAttempt(me, String(interview._id)), (error) => error.details?.code === "PRACTICE_BLOCKED");

  const started = await service.startAssignedAttempt(me, String(assignment._id));
  assert.equal(started.resumed, false);
  const attempt = await AnviAttempt.findById(started.id).lean();
  assert.equal(String(attempt.assignmentId), String(assignment._id));
  assert.ok(attempt.hardDeadline <= assignment.window.closesAt, "the deadline never passes the window close");
  assert.match(planCalls.at(-1).data.sections[0].groups[0].questions[0].prompt, /REAL-PINNED/);
  const used = await AnviAssignmentTarget.findById(target._id).lean();
  assert.deepEqual([used.attemptsUsed, used.outcome, String(used.lastAttemptId)], [1, "in_progress", started.id]);
  assert.equal((await service.startAssignedAttempt(me, String(assignment._id))).resumed, true);

  await service.endAttemptRest(me, started.id);
  const ended = await AnviAssignmentTarget.findById(target._id).lean();
  assert.equal(ended.outcome, "completed", "the only attempt was used, so the target is done");
  assert.equal(ended.partial, true);
  await assert.rejects(service.startAssignedAttempt(me, String(assignment._id)), (error) => error.status === 409 && error.details?.code === "ATTEMPTS_EXHAUSTED");
  await assert.rejects(service.startAssignedAttempt({ _id: new mongoose.Types.ObjectId() }, String(assignment._id)), (error) => error.status === 404);

  // Authoring guard with the real lookup.
  const refused = await call(`/ai-interviews/${interview._id}/archive`, "POST", { revision: 1 });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, "ASSIGNMENT_ACTIVE");
  assert.equal(refused.body.assignmentId, String(assignment._id));
  assert.match(refused.body.error, /Real drive/);
});

test("practice is blocked while an assignment holds the interview, and the card says so", async (t) => {
  if (skip(t)) return;
  const blocked = await publish("Blocked");
  const open = await publish("Open");
  sched.blocked.add(String(blocked._id));
  const listed = await call("/student/ai-interviews");
  assert.equal(listed.status, 200);
  const byTitle = Object.fromEntries(listed.body.map((row) => [row.title, row]));
  assert.equal(byTitle.Blocked.practiceBlocked, true);
  assert.equal(byTitle.Open.practiceBlocked, false);
  const refused = await call(`/student/ai-interviews/${blocked._id}/start`, "POST", {});
  assert.equal(refused.status, 403, "refused before requireCoins tries to charge");
  assert.equal(refused.body.code, "PRACTICE_BLOCKED");
  assert.equal(await AnviAttempt.countDocuments(), 0);
  // The open interview is priced: requireCoins really tries to charge it (no replica set here).
  assert.equal((await call(`/student/ai-interviews/${open._id}/start`, "POST", {})).status, 500);
  const service = createAnviService({ gemini, buildPlan, config, evaluateSoon, scheduling: sched });
  await assert.rejects(service.startAttempt(me, String(blocked._id)), (error) => error.details?.code === "PRACTICE_BLOCKED");
});

test("ending an assigned attempt at once lists no question ANVI never asked", async (t) => {
  if (skip(t)) return;
  const grant = allowed({ interviewId: new mongoose.Types.ObjectId() });
  sched.check = async () => grant;
  const service = createAnviService({ gemini, buildPlan, config, evaluateSoon, scheduling: sched });
  const started = await service.startAssignedAttempt(me, String(grant.assignment._id));
  const ended = await service.endAttemptRest(me, started.id);
  assert.equal(ended.status, "abandoned");
  assert.deepEqual(ended.items, [], "the intro never reached Question 1, so nothing is listed");
  assert.doesNotMatch(JSON.stringify(ended), /PINNED|Explain caching/);
  const stored = await AnviAttempt.findById(started.id).lean();
  assert.deepEqual(stored.items.map((item) => item.asked), [false, false], "the record keeps every item, marked unasked");
});

test("released reports keep key points and unasked questions back while the questions are still in use", async (t) => {
  if (skip(t)) return;
  const service = createAnviService({ gemini, buildPlan, config, evaluateSoon, scheduling: sched });
  const interviewId = new mongoose.Types.ObjectId();
  const items = [
    { qid: "q1", n: 1, questionText: "Explain REST.", answerText: "Stateless.", status: "answered", asked: true, expectedKeyPoints: ["KP-STATELESS"], matched: ["KP-STATELESS"], marks: 10, maxMarks: 10 },
    { qid: "q2", n: 2, questionText: "UNASKED caching question", status: "not_attempted", asked: false, expectedKeyPoints: ["KP-TTL"], missed: ["KP-TTL"], marks: 0, maxMarks: 10 },
  ];
  const ready = (fields) => AnviAttempt.create({
    studentId: student, interviewId, snapshotRevision: 1, status: "ready", hardDeadline: new Date(), endedAt: new Date(),
    visibleToStudentAt: new Date(Date.now() - 1000), overall: { score: 10, max: 20, percent: 50, band: "Fair" }, items, ...fields,
  });
  // Immediate visibility (or an early release) while the assignment is still open, with retakes allowed.
  const assigned = await ready({ mode: "mock", assignmentId: new mongoose.Types.ObjectId() });
  sched.active = true;
  let view = await service.getAttemptForStudent(me, String(assigned._id));
  assert.equal(view.report, "ready");
  assert.equal(view.keyPointsWithheld, true);
  assert.deepEqual(view.items.map((item) => item.n), [1]);
  assert.doesNotMatch(JSON.stringify(view), /KP-STATELESS|KP-TTL|UNASKED/);
  sched.active = false;
  view = await service.getAttemptForStudent(me, String(assigned._id));
  assert.equal(view.keyPointsWithheld, undefined);
  assert.deepEqual(view.items[0].expectedKeyPoints, ["KP-STATELESS"], "after close the full report shows");
  assert.equal(view.items.length, 2);

  // An earlier practice report of an interview whose practice is now blocked by a schedule.
  const practice = await ready({});
  sched.blocked.add(String(interviewId));
  view = await service.getAttemptForStudent(me, String(practice._id));
  assert.equal(view.keyPointsWithheld, true);
  assert.doesNotMatch(JSON.stringify(view), /KP-STATELESS|KP-TTL/);
});

test("the practice per-day cap ignores scheduled attempts, and parallel starts plan once", async (t) => {
  if (skip(t)) return;
  const interview = await publish("Capped");
  await AnviAttempt.insertMany(Array.from({ length: config.maxAttemptsPerDay }, () => ({
    studentId: student, interviewId: interview._id, snapshotRevision: 3, mode: "mock", assignmentId: new mongoose.Types.ObjectId(),
    status: "abandoned", startedAt: new Date(), hardDeadline: new Date(),
  })));
  const service = createAnviService({ gemini, buildPlan, config, evaluateSoon, scheduling: sched });
  const results = await Promise.all(Array.from({ length: 6 }, () => service.startAttempt(me, String(interview._id))));
  assert.equal(new Set(results.map((row) => row.id)).size, 1, "one attempt for every parallel request");
  assert.equal(planCalls.length, 1, "a burst of starts plans (and calls Gemini) only once");
  assert.equal(results.filter((row) => row.resumed === false).length, 1);
});

test("coin entitlement ignores scheduled attempts and their receipts", async (t) => {
  if (skip(t)) return;
  const interviewId = new mongoose.Types.ObjectId();
  const assigned = await AnviAttempt.create({
    studentId: student, interviewId, snapshotRevision: 1, mode: "mock", assignmentId: new mongoose.Types.ObjectId(), status: "ready", hardDeadline: new Date(),
  });
  const tenantKey = engagementTenant(me);
  await InterviewEngagementReceipt.create({ tenantKey, studentId: student, sessionId: String(assigned._id), interviewId: String(interviewId) });
  assert.equal(await aiInterviewStarted(me, String(interviewId)), false);
  await AnviAttempt.create({ studentId: student, interviewId, snapshotRevision: 1, status: "abandoned", hardDeadline: new Date() });
  assert.equal(await aiInterviewStarted(me, String(interviewId)), true, "a practice attempt still counts");
  await AnviAttempt.deleteMany({ assignmentId: null });
  await InterviewEngagementReceipt.create({ tenantKey, studentId: student, sessionId: String(new mongoose.Types.ObjectId()), interviewId: String(interviewId) });
  assert.equal(await aiInterviewStarted(me, String(interviewId)), true, "a practice receipt still counts");
});

test("REST end, the stale sweep and the socket finalize settle the schedule for assigned attempts only", async (t) => {
  if (skip(t)) return;
  const service = createAnviService({ gemini, buildPlan, config, evaluateSoon, scheduling: sched });
  const grant = allowed({ interviewId: new mongoose.Types.ObjectId() });
  sched.check = async () => grant;
  const started = await service.startAssignedAttempt(me, String(grant.assignment._id));
  await service.endAttemptRest(me, started.id);
  assert.equal(calls.finalized.length, 1);
  assert.equal(String(calls.finalized[0]._id), started.id);
  assert.equal(String(calls.finalized[0].assignmentId), String(grant.assignment._id));
  assert.equal(calls.finalized[0].status, "abandoned");
  assert.equal(calls.finalized[0].partial, true);
  await service.endAttemptRest(me, started.id);
  assert.equal(calls.finalized.length, 1, "ending twice settles once");

  // The sweeper closes an orphaned assigned attempt (no live doc, past the create grace).
  const orphan = await AnviAttempt.create({
    studentId: student, interviewId: new mongoose.Types.ObjectId(), snapshotRevision: 1, mode: "mock", assignmentId: grant.assignment._id,
    startedAt: new Date(Date.now() - 10 * MINUTE), hardDeadline: new Date(Date.now() + 20 * MINUTE),
  });
  const practice = await AnviAttempt.create({
    studentId: student, interviewId: new mongoose.Types.ObjectId(), snapshotRevision: 1, startedAt: new Date(Date.now() - 10 * MINUTE), hardDeadline: new Date(Date.now() + 20 * MINUTE),
  });
  const swept = await sweepStaleAnviAttempts(new Date(), { config, evaluateSoon, onFinalized: sched.onAttemptFinalized });
  assert.equal(swept.closed, 2);
  assert.deepEqual(calls.finalized.slice(1).map((row) => String(row._id)), [String(orphan._id)]);
  assert.ok(!calls.finalized.some((row) => String(row._id) === String(practice._id)));

  // Socket finalize (fake conductor that ends at once).
  await User.collection.insertOne({ _id: new mongoose.Types.ObjectId(student), name: "Asha", role: "student", isActive: true, accessScope: "full" });
  const io = { listeners: [], on(event, fn) { if (event === "connection") this.listeners.push(fn); } };
  registerAnviSocketHandlers(io, {
    config, getTenant: async () => null, log: { warn() {} }, evaluateSoon, scheduling: sched,
    observeInterview: async () => {}, timers: { setTimeout: () => 0, clearTimeout() {} },
    createConductor: ({ persist }) => ({
      on() {}, isFinalizing: () => false, dispose() {}, flushed: async () => {}, pushAudio() {}, adoptAnswer() {},
      start: async () => ({ phase: "intro" }),
      end: (endReason) => persist.finalize({ status: "completed", endReason, items: [] }),
    }),
  });
  const socket = {
    userId: student, universityId: "platform", userRole: "student", connected: true, handlers: new Map(), emit() {},
    on(event, fn) { this.handlers.set(event, fn); },
    call(event, payload) { return new Promise((resolve) => this.handlers.get(event)(payload, resolve)); },
  };
  for (const listener of io.listeners) listener(socket);
  const live = await service.startAssignedAttempt(me, String(grant.assignment._id));
  assert.equal((await socket.call("anvi:join", { attemptId: live.id })).ok, true);
  const ended = await socket.call("anvi:end", {});
  assert.equal(ended.ok, true, JSON.stringify(ended));
  const last = calls.finalized.at(-1);
  assert.equal(String(last._id), live.id);
  assert.equal(last.status, "completed");
  assert.equal(last.partial, false);

  // A practice attempt cannot be rejoined once a schedule blocks practice of its interview.
  const interview = await publish("Practice then scheduled");
  const practiceRun = await service.startAttempt(me, String(interview._id));
  sched.blocked.add(String(interview._id));
  const refused = await socket.call("anvi:join", { attemptId: practiceRun.id });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "PRACTICE_BLOCKED");
});

test("evaluation sets visibility from the assignment for scheduled attempts and keeps practice immediate", async (t) => {
  if (skip(t)) return;
  const item = {
    qid: "q1", n: 1, sectionId: "s1", sectionName: "Technical", questionText: "Explain REST.", answerText: "REST keeps each request stateless so any server can answer it.",
    status: "answered", expectedKeyPoints: ["Stateless requests"], maxMarks: 10,
  };
  const make = (fields) => AnviAttempt.create({
    studentId: student, interviewId: new mongoose.Types.ObjectId(), snapshotRevision: 1, status: "completed", hardDeadline: new Date(),
    items: [item], pendingWork: { status: "pending", attempts: 0, nextAttemptAt: new Date(Date.now() - 1000) }, ...fields,
  });
  const judge = { async generateJson() { return { items: [{ qid: "q1", keyPoints: [{ index: 1, verdict: "matched" }], rubric: [], feedback: "Good.", strengths: [], improvements: [] }] }; } };
  const notes = [];
  const evaluator = createAnviEvaluator({ gemini: judge, config, scheduling: sched, notify: async (note) => { notes.push(note); return true; }, log: { warn() {} } });
  const service = createAnviService({ gemini, buildPlan, config, evaluateSoon, scheduling: sched });

  const held = await make({ mode: "mock", assignmentId: new mongoose.Types.ObjectId() });
  sched.visibility = null;
  assert.equal((await evaluator.evaluateNow(held._id)).status, "ready");
  assert.equal((await AnviAttempt.findById(held._id).lean()).visibleToStudentAt, null);
  assert.equal(notes.length, 0, "an unreleased report is not announced");
  const hidden = await service.getAttemptForStudent(me, String(held._id));
  assert.equal(hidden.report, "preparing");
  assert.doesNotMatch(JSON.stringify(hidden), /Stateless requests/, "key points stay hidden until release");

  const immediate = await make({ mode: "mock", assignmentId: new mongoose.Types.ObjectId() });
  sched.visibility = new Date(Date.now() - 1000);
  assert.equal((await evaluator.evaluateNow(immediate._id)).status, "ready");
  assert.ok((await AnviAttempt.findById(immediate._id).lean()).visibleToStudentAt);
  assert.equal(notes.length, 1);
  assert.equal((await service.getAttemptForStudent(me, String(immediate._id))).report, "ready");

  const practice = await make({});
  sched.visibility = null;
  assert.equal((await evaluator.evaluateNow(practice._id)).status, "ready");
  assert.ok((await AnviAttempt.findById(practice._id).lean()).visibleToStudentAt, "practice reports are visible at once");
  assert.equal(notes.length, 2);
});

test("unpublish and archive are refused while a schedule is active", async (t) => {
  if (skip(t)) return;
  const interview = await publish("Guarded", { revision: 4 });
  const assignmentId = new mongoose.Types.ObjectId();
  let active = { _id: assignmentId, title: "Campus drive <b>", status: "open" };
  const guard = mock.method(assignmentGuard, "activeAssignmentFor", async (id) => (String(id) === String(interview._id) ? active : null));
  try {
    for (const [path, method, body] of [
      [`/ai-interviews/${interview._id}/unpublish`, "POST", { revision: 4 }],
      [`/ai-interviews/${interview._id}/archive`, "POST", { revision: 4 }],
    ]) {
      const refused = await call(path, method, body);
      assert.equal(refused.status, 409, path);
      assert.equal(refused.body.code, "ASSIGNMENT_ACTIVE");
      assert.equal(refused.body.assignmentId, String(assignmentId));
      assert.match(refused.body.error, /Campus drive/);
    }
    const stored = await AIInterview.findById(interview._id).lean();
    assert.ok(stored.publishedAt, "still published");
    assert.equal(stored.revision, 4);
    active = null;
    const unpublished = await call(`/ai-interviews/${interview._id}/unpublish`, "POST", { revision: 4 });
    assert.equal(unpublished.status, 200, JSON.stringify(unpublished.body));
    assert.ok(guard.mock.calls.length >= 3);
  } finally {
    guard.mock.restore();
  }
});

test("mark complete hides the interview from students, closes its schedules, and reopen brings it back", async (t) => {
  if (skip(t)) return;
  const interview = await publish("Finished drive", { revision: 4 });
  const closing = mock.method(assignmentGuard, "completeInterview", async () => ({ ended: 1, closed: 2, cancelled: 0 }));
  try {
    const completed = await call(`/ai-interviews/${interview._id}/complete`, "POST", { revision: 4 });
    assert.equal(completed.status, 200, JSON.stringify(completed.body));
    assert.equal(completed.body.lifecycle, "completed");
    assert.deepEqual(completed.body.closing, { ended: 1, closed: 2, cancelled: 0 });
    assert.deepEqual(closing.mock.calls.map((row) => String(row.arguments[1])), [String(interview._id)]);
    const stored = await AIInterview.findById(interview._id).lean();
    assert.ok(stored.completedAt && stored.publishedSnapshot, "the published snapshot and its reports are kept");

    // Students no longer see or start it; the admin still lists it under All and Completed.
    assert.deepEqual((await call("/student/ai-interviews")).body.map((row) => row.title), []);
    assert.equal((await call(`/student/ai-interviews/${interview._id}/start`, "POST", {})).status, 404);
    assert.deepEqual((await call("/ai-interviews")).body.items.map((row) => row.lifecycle), ["completed"]);
    assert.equal((await call("/ai-interviews?status=completed")).body.items.length, 1);
    assert.equal((await call("/ai-interviews?status=complete")).body.items.length, 0, "the draft filters list drafts only");
    assert.equal((await call("/ai-interviews?published=true")).body.items.length, 0, "it cannot be scheduled again");
    // Read-only until reopened; repeating complete only retries the closing.
    const edit = await call(`/ai-interviews/${interview._id}/validate`, "POST", { revision: 5 });
    assert.equal(edit.status, 409);
    assert.match(edit.body.error, /Reopen/);
    assert.equal((await call(`/ai-interviews/${interview._id}/complete`, "POST", { revision: 5 })).status, 200);
    assert.equal(closing.mock.calls.length, 2);
    assert.equal((await call(`/ai-interviews/${interview._id}/restore`, "POST", { revision: 5 })).status, 409);

    const reopened = await call(`/ai-interviews/${interview._id}/reopen`, "POST", { revision: 5 });
    assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
    assert.equal(reopened.body.lifecycle, "draft");
    assert.deepEqual((await call("/student/ai-interviews")).body.map((row) => row.title), ["Finished drive"]);
    assert.equal(closing.mock.calls.length, 2, "reopening closes nothing");
    // A draft that was never published cannot be marked complete.
    const unpublished = await AIInterview.create({ ownerId: admin, creationKey: crypto.randomUUID(), title: "Unpublished", data: definition("Unpublished") });
    assert.equal((await call(`/ai-interviews/${unpublished._id}/complete`, "POST", { revision: 1 })).body.code, "INTERVIEW_NOT_PUBLISHED");
  } finally {
    closing.mock.restore();
  }
});

test("cohort summary, CSV export and the assignment filter cover only the admin's own schedules", async (t) => {
  if (skip(t)) return;
  const interview = await publish("Cohort round");
  const otherAdmin = new mongoose.Types.ObjectId();
  const students = [0, 1, 2, 3].map(() => new mongoose.Types.ObjectId());
  await User.collection.insertMany(students.map((id, index) => ({
    _id: id, name: index === 0 ? "=cmd() Asha" : index === 1 ? "\t=HYPERLINK(1)" : `Student ${index}`, email: `s${index}@example.com`, studentId: `GEU-${index}`, role: "student",
  })));
  const assignment = await AnviAssignment.create({
    ownerId: admin, interviewId: interview._id, snapshotRevision: 3, snapshotData: interview.data, title: "Campus drive", mode: "mock",
    audience: { source: "selected", studentCount: 4 }, window: { opensAt: new Date(Date.now() - 3600_000), closesAt: new Date(Date.now() + 3600_000) }, status: "open",
  });
  const outcomes = ["completed", "completed", "no_show", "booked"];
  await AnviAssignmentTarget.insertMany(students.map((studentId, index) => ({ assignmentId: assignment._id, studentId, outcome: outcomes[index], attemptsUsed: index < 2 ? 1 : 0 })));
  await AnviAssignmentTarget.create({ assignmentId: assignment._id, studentId: new mongoose.Types.ObjectId(), status: "removed", outcome: "completed" });
  await AnviBooking.create({ assignmentId: assignment._id, studentId: students[3], startsAt: new Date("2026-10-23T05:00:00Z"), endsAt: new Date("2026-10-23T05:30:00Z") });
  const scored = (studentId, percent, verdict, competency, extraItems = []) => AnviAttempt.create({
    studentId, interviewId: interview._id, assignmentId: assignment._id, mode: "mock", snapshotRevision: 3, status: "ready", hardDeadline: new Date(),
    startedAt: new Date("2026-10-22T05:00:00Z"), endedAt: new Date("2026-10-22T05:25:00Z"),
    overall: { score: percent / 10, max: 10, percent, band: percent >= 85 ? "Excellent" : percent >= 50 ? "Fair" : "Needs work", answered: 1, total: 1 },
    byCompetency: [{ name: competency, percent }],
    items: [{ qid: "q1", n: 1, questionText: "Explain REST.", competency: "APIs", answerText: "SECRET-ANSWER", status: "answered", expectedKeyPoints: ["Stateless requests", "Uniform interface"], [verdict]: ["Stateless requests"] }, ...extraItems],
  });
  // The same key point in a second question counts once for this student, with its best verdict.
  await scored(students[0], 90, "matched", "APIs", [{ qid: "q2", n: 2, questionText: "REST again.", competency: "APIs", status: "answered", expectedKeyPoints: ["Uniform  interface"], matched: ["Uniform interface"] }]);
  // A topic question ANVI never phrased (its stored text is still the plan instruction).
  await scored(students[1], 40, "partial", "APIs", [{ qid: "q3", n: 3, questionText: "Ask one question about: idempotency", competency: "APIs", status: "answered", expectedKeyPoints: ["Idempotency"] }]);
  // A practice attempt of the same interview stays out of the cohort report.
  await AnviAttempt.create({ studentId: students[2], interviewId: interview._id, snapshotRevision: 3, status: "ready", hardDeadline: new Date(), overall: { percent: 10, band: "Needs work" } });

  // One proctored attempt, ended for violations.
  await AnviAttempt.updateOne({ studentId: students[1], assignmentId: assignment._id }, { $set: { proctoring: { settings: { enabled: true }, violations: 3, endedForViolations: true } } });

  const summary = await call(`/ai-interviews/reports/assignments/${assignment._id}/summary`);
  assert.equal(summary.status, 200, JSON.stringify(summary.body));
  assert.deepEqual(summary.body.proctoring, { flagged: 1, endedForViolations: 1 });
  assert.equal(summary.body.assignment.title, "Campus drive");
  assert.deepEqual(summary.body.kpis, {
    assigned: 4, outcomes: { pending: 0, booked: 1, in_progress: 0, completed: 2, no_show: 1, missed: 0, cancelled: 0 },
    started: 2, scored: 2, averagePercent: 65, medianPercent: 65, completionRate: 50,
  });
  assert.equal(summary.body.distribution.length, 10);
  assert.equal(summary.body.distribution[9].count, 1);
  assert.equal(summary.body.distribution[4].count, 1);
  assert.deepEqual(summary.body.bands.find((row) => row.band === "Excellent"), { band: "Excellent", count: 1 });
  assert.deepEqual(summary.body.competencies, [{ name: "APIs", percent: 65, students: 2 }]);
  assert.deepEqual(summary.body.weakestKeyPoints.map((row) => [row.point, row.seen, row.matched, row.partial, row.missed, row.missRate]), [
    ["Idempotency", 1, 0, 0, 1, 100],
    ["Uniform interface", 2, 1, 0, 1, 50],
    ["Stateless requests", 2, 1, 1, 0, 25],
  ]);
  assert.doesNotMatch(JSON.stringify(summary.body), /SECRET-ANSWER/);
  // A key point's question reads as the candidate's report shows it, never as a plan instruction.
  assert.equal(summary.body.weakestKeyPoints[0].questionText, "A question about idempotency");
  assert.equal(summary.body.weakestKeyPoints[2].questionText, "Explain REST.");
  assert.doesNotMatch(JSON.stringify(summary.body), /Ask one question about/i);

  const csv = await call(`/ai-interviews/reports/assignments/${assignment._id}/export.csv`);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type"), /text\/csv/);
  assert.match(csv.headers.get("content-disposition"), /attachment; filename="anvi-campus-drive-/);
  const lines = csv.body.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines.length, 5, "header plus the four assigned students");
  assert.match(lines[0], /^Name,Email,Student ID,Outcome/);
  assert.match(lines[1], /^'=cmd\(\) Asha,s0@example.com,GEU-0,completed,1,,,ready,no,9,10,90,Excellent,/, "formula cells are neutralised");
  assert.match(lines[2], /^'\t=HYPERLINK\(1\),s1@example.com,/, "a tab before a formula is neutralised too");
  assert.match(lines[0], /,Proctoring violations$/);
  assert.match(lines[2], /,3$/, "the proctored attempt's violations");
  assert.match(lines[1], /,$/, "blank for an attempt that was not proctored");
  assert.match(lines[4], /Student 3,s3@example.com,GEU-3,booked,0,"23 Oct 2026, 10:30 am IST",booked,/i);

  const filtered = await call(`/ai-interviews/reports/attempts?assignmentId=${assignment._id}`);
  assert.equal(filtered.body.attempts.length, 2);
  assert.ok(filtered.body.attempts.every((row) => row.assignmentId === String(assignment._id) && row.mode === "mock"));
  assert.equal((await call("/ai-interviews/reports/attempts")).body.attempts.length, 3);

  const foreign = { "X-Test-Admin": String(otherAdmin) };
  assert.equal((await call(`/ai-interviews/reports/assignments/${assignment._id}/summary`, "GET", undefined, foreign)).status, 404);
  assert.equal((await call(`/ai-interviews/reports/assignments/${assignment._id}/export.csv`, "GET", undefined, foreign)).status, 404);
  assert.equal((await call(`/ai-interviews/reports/attempts?assignmentId=${assignment._id}`, "GET", undefined, foreign)).body.attempts.length, 0);
  assert.equal((await call("/ai-interviews/reports/assignments/nope/summary")).status, 400);
  assert.equal((await call(`/ai-interviews/reports/assignments/${new mongoose.Types.ObjectId()}/summary`)).status, 404);
});
