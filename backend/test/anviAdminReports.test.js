import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import AIInterview from "../src/models/AIInterview.js";
import User from "../src/models/User.js";
import { errorHandler } from "../src/utils/errors.js";
import { createAnviAdminReportRouter } from "../src/modules/anviInterview/anviInterview.adminRoutes.js";
import { createAnviEvaluator } from "../src/modules/anviInterview/anviInterview.evaluation.js";
import { AnviAttempt } from "../src/modules/anviInterview/anviInterview.models.js";

// Admin report routes over an ephemeral MongoDB; evaluation is recorded or run with a fake Gemini.
let mongo, server, base;
let skipped = false;
const adminA = new mongoose.Types.ObjectId();
const adminB = new mongoose.Types.ObjectId();
const evaluations = [];
const evaluateSoon = (attemptId) => { evaluations.push(String(attemptId)); return null; };

before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } }); }
  catch (error) { if (error?.code === "EPERM") { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: "anvi_admin_reports_test" });
  await Promise.all([AIInterview.init(), AnviAttempt.init()]);
  const app = express();
  app.use(express.json());
  app.use("/api/ai-interviews/reports", createAnviAdminReportRouter((req, _res, next) => {
    req.user = { _id: new mongoose.Types.ObjectId(req.get("X-Test-Admin") || String(adminA)), role: req.get("X-Test-Role") || "admin" };
    next();
  }, { evaluateSoon }));
  app.use(errorHandler);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/ai-interviews/reports`;
});
after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  if (skipped) return;
  evaluations.length = 0;
  await Promise.all([AIInterview, AnviAttempt, User].map((model) => model.deleteMany({})));
});

const call = async (path = "", method = "GET", headers = {}) => {
  const result = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...headers } });
  return { status: result.status, body: await result.json() };
};
const interview = (ownerId, title) => AIInterview.create({ ownerId, creationKey: crypto.randomUUID(), title, data: { title } });
const scoredItem = {
  qid: "q1", n: 1, sectionId: "s1", sectionName: "Technical", questionText: "Explain REST.", answerText: "REST keeps every request stateless so servers scale out easily.",
  answerSeconds: 20, status: "answered", expectedAnswer: "AUTHORED: stateless requests over HTTP.", expectedKeyPoints: ["Stateless requests"], maxMarks: 10,
  matched: ["Stateless requests"], partial: [], missed: [], marks: 10, percentCorrect: 100, feedback: "You nailed it.",
};
const attempt = (studentId, interviewId, fields = {}) => AnviAttempt.create({
  studentId, interviewId, snapshotRevision: 1, title: "Backend practice", hardDeadline: new Date(), startedAt: new Date(), ...fields,
});

async function seed() {
  const [asha, ravi] = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  await User.collection.insertMany([
    { _id: asha, name: "Asha Verma", email: "asha@example.com", studentId: "GEU-101", role: "student" },
    { _id: ravi, name: "Ravi Kumar", email: "ravi@example.com", studentId: "GEU-102", role: "student" },
  ]);
  const mine = await interview(adminA, "Backend round");
  const theirs = await interview(adminB, "Other admin round");
  const ready = await attempt(asha, mine._id, {
    status: "ready", endedAt: new Date(), startedAt: new Date(Date.now() - 60_000), items: [scoredItem],
    overall: { score: 10, max: 10, percent: 100, band: "Excellent", partial: false, answered: 1, total: 1, strengths: [], improvements: [] },
    eval: { modelId: "m", promptVersion: "anvi-eval-v1", scoredAt: new Date(), attempts: 1 }, pendingWork: { status: "done", attempts: 1 },
  });
  const running = await attempt(ravi, mine._id, { status: "in_progress", startedAt: new Date() });
  const foreign = await attempt(asha, theirs._id, { status: "ready", items: [scoredItem] });
  return { asha, ravi, mine, theirs, ready, running, foreign };
}

test("report routes are mounted ahead of the interview id routes", () => {
  const source = readFileSync(new URL("../src/routes/index.js", import.meta.url), "utf8");
  const reports = source.indexOf("router.use('/ai-interviews/reports'");
  assert.ok(reports > 0);
  assert.ok(reports < source.indexOf("router.use('/ai-interviews', "), "/reports must not be captured by /ai-interviews/:id");
});

test("lists only attempts of the admin's own interviews, with filters and paging", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const { mine, theirs, ready, running } = await seed();
  assert.equal((await call("/attempts", "GET", { "X-Test-Role": "coordinator" })).status, 403);
  const listed = await call("/attempts");
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.attempts.map((row) => row.attemptId), [String(running._id), String(ready._id)], "newest first, own interviews only");
  const row = listed.body.attempts[1];
  assert.deepEqual(row.student, { id: row.student.id, name: "Asha Verma", email: "asha@example.com", studentId: "GEU-101" });
  assert.equal(row.interviewTitle, "Backend round");
  assert.equal(row.status, "ready");
  assert.deepEqual(row.overall, { score: 10, max: 10, percent: 100, band: "Excellent", partial: false, answered: 1, total: 1 });
  assert.equal(listed.body.attempts[0].overall, null);
  assert.deepEqual(listed.body.interviews, [{ id: String(mine._id), title: "Backend round" }]);
  assert.deepEqual(listed.body.pagination, { page: 1, limit: 25, total: 2, pages: 1 });
  assert.doesNotMatch(JSON.stringify(listed.body), /AUTHORED|Other admin/);

  assert.deepEqual((await call("/attempts?status=ready")).body.attempts.map((r) => r.attemptId), [String(ready._id)]);
  assert.equal((await call(`/attempts?interviewId=${mine._id}&limit=25&page=2`)).body.attempts.length, 0);
  assert.equal((await call(`/attempts?interviewId=${theirs._id}`)).status, 404, "another admin's interview is not visible");
  assert.equal((await call("/attempts?interviewId=nope")).status, 400);
  const badStatus = await call("/attempts?status=weird");
  assert.equal(badStatus.status, 400);
  assert.equal(badStatus.body.code, "INVALID_STATUS");
  assert.equal((await call("/attempts", "GET", { "X-Test-Admin": String(adminB) })).body.attempts.length, 1);
});

test("the unfiltered list covers an admin's older interviews beyond the first 500", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const old = await interview(adminA, "Oldest round");
  await AIInterview.collection.updateOne({ _id: old._id }, { $set: { updatedAt: new Date("2020-01-01T00:00:00Z") } });
  await AIInterview.collection.insertMany(Array.from({ length: 500 }, (_, index) => ({
    ownerId: adminA, creationKey: crypto.randomUUID(), title: `Round ${index}`, data: {}, lifecycle: "draft", updatedAt: new Date(), createdAt: new Date(),
  })));
  const studentId = new mongoose.Types.ObjectId();
  const row = await attempt(studentId, old._id, { status: "ready" });
  const listed = await call("/attempts");
  assert.deepEqual(listed.body.attempts.map((entry) => entry.attemptId), [String(row._id)]);
  assert.equal(listed.body.attempts[0].interviewTitle, "Backend practice", "the attempt's own title when the interview is not in the filter list");
  assert.equal(listed.body.pagination.total, 1);
});

test("the detail includes the authored answer; other admins get a 404", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const { ready, foreign } = await seed();
  const detail = await call(`/attempts/${ready._id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.items[0].expectedAnswer, "AUTHORED: stateless requests over HTTP.");
  assert.deepEqual(detail.body.items[0].matched, ["Stateless requests"]);
  assert.equal(detail.body.student.name, "Asha Verma");
  assert.equal(detail.body.eval.promptVersion, "anvi-eval-v1");
  assert.equal((await call(`/attempts/${foreign._id}`)).status, 404);
  assert.equal((await call(`/attempts/${new mongoose.Types.ObjectId()}`)).status, 404);
  const bad = await call("/attempts/123");
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, "INVALID_IDENTIFIER");
});

test("the detail shows the question the candidate heard; the raw plan text is a secondary field", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const studentId = new mongoose.Types.ObjectId();
  const mine = await interview(adminA, "Backend round");
  const row = await attempt(studentId, mine._id, {
    status: "ready",
    items: [
      { ...scoredItem, qid: "q1", n: 1, questionText: "How would you cache an API response?" },
      { ...scoredItem, qid: "q2", n: 2, questionText: "Ask one question about: HTTP caching" },
    ],
  });
  const detail = await call(`/attempts/${row._id}`);
  assert.equal(detail.status, 200);
  const [spoken, topic] = detail.body.items;
  assert.equal(spoken.questionText, "How would you cache an API response?", "ANVI's captured wording is shown as is");
  assert.equal("planText" in spoken, false, "no secondary field when nothing was rewritten");
  assert.equal(topic.questionText, "A question about HTTP caching", "the same rewrite as the student report");
  assert.equal(topic.planText, "Ask one question about: HTTP caching");
});

test("the detail names the company: the attempt's own, else the interview's, else empty", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const studentId = new mongoose.Types.ObjectId();
  const acme = await AIInterview.create({ ownerId: adminA, creationKey: crypto.randomUUID(), title: "Acme round", companyName: "Acme Corp", data: { title: "Acme round" } });
  const bare = await interview(adminA, "No company round");
  const own = await attempt(studentId, acme._id, { status: "abandoned", companyName: "Acme at start" });
  const older = await attempt(studentId, acme._id, { status: "abandoned" });
  const none = await attempt(studentId, bare._id, { status: "abandoned" });
  assert.equal((await call(`/attempts/${own._id}`)).body.companyName, "Acme at start");
  assert.equal((await call(`/attempts/${older._id}`)).body.companyName, "Acme Corp", "an attempt without one falls back to the interview");
  assert.equal((await call(`/attempts/${none._id}`)).body.companyName, "");
});

test("re-evaluation queues fresh work, keeps at most five old evaluations and notifies again", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const { ready, running, foreign } = await seed();
  const busy = await call(`/attempts/${running._id}/re-evaluate`, "POST");
  assert.equal(busy.status, 409);
  assert.equal(busy.body.code, "ATTEMPT_IN_PROGRESS");
  assert.equal((await call(`/attempts/${foreign._id}/re-evaluate`, "POST")).status, 404);

  const queued = await call(`/attempts/${ready._id}/re-evaluate`, "POST");
  assert.equal(queued.status, 200);
  assert.equal(queued.body.status, "evaluating");
  assert.equal(queued.body.pendingWork.status, "pending");
  assert.equal(queued.body.eval.history.length, 1);
  assert.equal(queued.body.eval.history[0].overall.score, 10);
  assert.deepEqual(evaluations, [String(ready._id)]);
  const again = await call(`/attempts/${ready._id}/re-evaluate`, "POST");
  assert.equal(again.status, 409);
  assert.equal(again.body.code, "EVALUATION_RUNNING");

  const notes = [];
  const judge = {
    async generateJson(request) {
      const items = JSON.parse(request.parts[0].text.match(/<items>([\s\S]*)<\/items>/)[1]);
      return { items: items.map((item) => ({ qid: item.qid, keyPoints: [{ index: 1, verdict: "partial" }], rubric: [], feedback: "Add detail.", strengths: [], improvements: [] })) };
    },
  };
  const evaluator = createAnviEvaluator({ gemini: judge, config: { generateModel: "fake" }, notify: async (note) => { notes.push(note); return true; }, log: { warn() {} } });
  for (let round = 0; round < 6; round += 1) {
    assert.equal((await evaluator.evaluateNow(ready._id)).status, "ready");
    if (round < 5) assert.equal((await call(`/attempts/${ready._id}/re-evaluate`, "POST")).status, 200);
  }
  const stored = await AnviAttempt.findById(ready._id).lean();
  assert.equal(stored.status, "ready");
  assert.equal(stored.overall.score, 5);
  assert.equal(stored.eval.history.length, 5, "history is capped at five");
  assert.equal(new Set(notes.map((note) => note.dedupeKey)).size, notes.length, "each new evaluation notifies once");
});

test("the admin attempt report returns the full proctoring log; the list shows violations", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const studentId = new mongoose.Types.ObjectId();
  const mine = await interview(adminA, "Proctored round");
  const at = new Date();
  const proctoring = {
    settings: { enabled: true, fullscreen: "required", maxViolations: 2, onLimit: "end", ai: { enabled: true } },
    events: [{ type: "fullscreen_exit", at, questionN: 1 }, { type: "ai_mobile_detected", at, questionN: 2, severity: "high", confidence: 0.8 }],
    counts: { fullscreen_exit: 1, ai_mobile_detected: 1 }, violations: 2, endedForViolations: true, limitReached: true, warningsGiven: 1,
    ai: { totalViolations: 1, mobileDetected: 1, riskLevel: "medium" },
    aiEvents: [{ type: "ai_mobile_detected", at, questionN: 2, severity: "high", confidence: 0.8 }],
  };
  const proctored = await attempt(studentId, mine._id, { status: "abandoned", endReason: "proctoring_limit", partial: true, proctoring });
  const plain = await attempt(studentId, mine._id, { status: "abandoned", startedAt: new Date(Date.now() - 60_000) });
  const report = await call(`/attempts/${proctored._id}`);
  assert.equal(report.status, 200);
  assert.equal(report.body.endReason, "proctoring_limit");
  assert.deepEqual(report.body.proctoring, JSON.parse(JSON.stringify(proctoring)));
  assert.equal((await call(`/attempts/${plain._id}`)).body.proctoring, null);
  const rows = (await call("/attempts")).body.attempts;
  assert.equal(rows.find((row) => row.attemptId === String(proctored._id)).violations, 2);
  assert.equal(rows.find((row) => row.attemptId === String(plain._id)).violations, null);
});
