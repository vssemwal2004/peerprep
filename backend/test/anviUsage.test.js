import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import AIInterview from "../src/models/AIInterview.js";
import { currentTenant, runForTenant } from "../src/platform/tenantContext.js";
import { errorHandler } from "../src/utils/errors.js";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";
import { createAnviAdminReportRouter } from "../src/modules/anviInterview/anviInterview.adminRoutes.js";
import { createAnviEvaluator } from "../src/modules/anviInterview/anviInterview.evaluation.js";
import { AnviAttempt } from "../src/modules/anviInterview/anviInterview.models.js";
import { AnviUsage, createUsageLedger, defaultUsageLedger, usageRow } from "../src/modules/anviInterview/anviInterview.usage.js";

const settle = async (rounds = 6) => { for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
const north = { universityId: "north", connection: { id: "north-connection" } };
const south = { universityId: "south", connection: { id: "south-connection" } };
const id = () => new mongoose.Types.ObjectId();

function fakeTimers() {
  const queue = [];
  return {
    timers: { setTimeout: (fn, ms) => { const entry = { fn, ms, cleared: false }; queue.push(entry); return entry; }, clearTimeout: (entry) => { if (entry) entry.cleared = true; } },
    fire: () => { for (const entry of queue.splice(0)) if (!entry.cleared) entry.fn(); },
    pending: () => queue.filter((entry) => !entry.cleared).length,
  };
}
const memoryModel = () => {
  const writes = [];
  return { writes, indexed: [], createIndexes: async function () { this.indexed.push(currentTenant()?.universityId || "platform"); }, insertMany: async (rows) => { writes.push({ tenant: currentTenant()?.universityId || "platform", rows }); } };
};

// --- Ledger --------------------------------------------------------------------------------------

test("usageRow keeps only known kinds, whole token counts, ids and safe model names", () => {
  const attemptId = id();
  const row = usageRow(
    { kind: "live", model: "gemini-live", tokens: { input: 10.4, output: 2, total: 0, cached: -1, inputByModality: { AUDIO: 9, "bad key": 3, TEXT: 0 } }, audioSeconds: 1.234 },
    { attemptId, studentId: "not-an-id", interviewId: String(attemptId), tenantKey: "north" },
    new Date(0),
  );
  assert.deepEqual({ ...row, attemptId: String(row.attemptId), interviewId: String(row.interviewId) }, {
    attemptId: String(attemptId), studentId: null, interviewId: String(attemptId), tenantKey: "north", kind: "live", model: "gemini-live",
    inputTokens: 10, outputTokens: 2, totalTokens: 12, cachedTokens: 0, thoughtsTokens: 0, inputByModality: { AUDIO: 9 },
    audioSeconds: 1.23, sessionSeconds: 0, at: new Date(0),
  });
  assert.equal(usageRow({ kind: "other" }), null);
  assert.equal(usageRow({ kind: "generate", model: "bad model/../" }).model, "");
});

test("the ledger batches rows and flushes each university's rows inside its own tenant context", async () => {
  const model = memoryModel();
  const time = fakeTimers();
  const ledger = createUsageLedger({ model, timers: time.timers, log: { warn() {} } });
  assert.equal(ledger.record({ kind: "generate", model: "m", tokens: { input: 1, output: 1 } }, { tenant: north }), true);
  assert.equal(ledger.record({ kind: "evaluate", model: "m", tokens: { input: 2, output: 2 } }, { tenant: south }), true);
  // Without an explicit tenant the caller's current context is used.
  runForTenant(north, () => ledger.record({ kind: "transcribe", model: "m", tokens: { input: 3 } }));
  assert.equal(ledger.record({ kind: "nope" }), false);
  assert.equal(model.writes.length, 0, "nothing is written synchronously");
  assert.equal(time.pending(), 1, "one flush timer for the batch");
  assert.deepEqual(ledger.stats(), { buffered: 3, dropped: 0, scheduled: true });

  time.fire();
  await ledger.flush();
  assert.deepEqual(model.writes.map((write) => [write.tenant, write.rows.map((row) => row.kind)]).sort(), [["north", ["generate", "transcribe"]], ["south", ["evaluate"]]]);
  assert.ok(model.writes.every((write) => write.rows.every((row) => row.tenantKey === write.tenant)));
  assert.deepEqual(model.indexed.sort(), ["north", "south"], "indexes are ensured once per connection");

  ledger.record({ kind: "generate", model: "m", tokens: { input: 1 } }, { tenant: north });
  await ledger.flush();
  assert.deepEqual(model.indexed.sort(), ["north", "south"]);
  assert.equal(ledger.stats().scheduled, false, "an explicit flush cancels the timer");
});

test("a recorder binds the attempt and the tenant current when it was created", async () => {
  const model = memoryModel();
  const ledger = createUsageLedger({ model, log: { warn() {} } });
  const attemptId = id();
  const onUsage = runForTenant(south, () => ledger.recorder({ attemptId }));
  // Called later from a Gemini callback, outside any tenant context.
  onUsage({ kind: "live", model: "live", tokens: { input: 5, output: 6 } });
  await ledger.flush();
  assert.equal(model.writes[0].tenant, "south");
  assert.equal(String(model.writes[0].rows[0].attemptId), String(attemptId));
});

test("a failing write is logged without details and dropped; a full buffer drops new rows", async () => {
  const warnings = [];
  const ledger = createUsageLedger({ model: { insertMany: async () => { throw new Error("mongodb://user:secret@host refused"); } }, log: { warn: (message) => warnings.push(message) }, maxBuffered: 2 });
  ledger.record({ kind: "generate", tokens: { input: 1 } }, { tenant: null });
  ledger.record({ kind: "generate", tokens: { input: 1 } }, { tenant: null });
  assert.equal(ledger.record({ kind: "generate", tokens: { input: 1 } }, { tenant: null }), false);
  assert.equal(ledger.stats().dropped, 1);
  await ledger.flush();
  assert.equal(warnings.length, 1);
  assert.doesNotMatch(warnings[0], /secret/);
  assert.match(warnings[0], /2 usage row\(s\) not saved/);
});

test("the default ledger is off under node --test", () => {
  assert.equal(defaultUsageLedger().record({ kind: "generate", tokens: { input: 1 } }), false);
});

// --- MongoDB: evaluation metering and the admin usage report --------------------------------------

let mongo, server, base;
let skipped = false;
const adminA = id();
const adminB = id();
const PRICED = anviConfig({ ANVI_PRICE_GENERATE_INPUT: "1", ANVI_PRICE_GENERATE_OUTPUT: "4", ANVI_PRICE_EVALUATE_INPUT: "2", ANVI_PRICE_EVALUATE_OUTPUT: "8" });

before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } }); }
  catch (error) { if (error?.code === "EPERM") { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: "anvi_usage_test" });
  await Promise.all([AIInterview.init(), AnviAttempt.init(), AnviUsage.init()]);
  const app = express();
  app.use("/api/ai-interviews/reports", createAnviAdminReportRouter((req, _res, next) => {
    req.user = { _id: new mongoose.Types.ObjectId(req.get("X-Test-Admin") || String(adminA)), role: req.get("X-Test-Role") || "admin" };
    next();
  }, { evaluateSoon: () => null, config: PRICED }));
  app.use(errorHandler);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/ai-interviews/reports/usage`;
});
after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  if (!skipped) await Promise.all([AIInterview, AnviAttempt, AnviUsage].map((model) => model.deleteMany({})));
});

const call = async (query = "", headers = {}) => {
  const result = await fetch(`${base}${query}`, { headers });
  return { status: result.status, body: await result.json() };
};
const interview = (ownerId, title) => AIInterview.create({ ownerId, creationKey: crypto.randomUUID(), title, data: { title } });

test("evaluation records its Gemini usage against the attempt in the job's tenant", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const rows = [];
  const ledger = createUsageLedger({ model: { insertMany: async (batch) => { rows.push(...batch.map((row) => ({ ...row, writtenIn: currentTenant()?.universityId }))); } }, log: { warn() {} } });
  const requests = [];
  const gemini = {
    async generateJson(request) {
      requests.push(request);
      request.onUsage({ kind: request.usageKind, model: "eval-model", tokens: { input: 900, output: 120, total: 1020 } });
      return { items: [{ qid: "q1", keyPoints: [{ index: 1, verdict: "matched" }], rubric: [], feedback: "Good.", strengths: [], improvements: [] }] };
    },
  };
  const clock = { now: () => Date.parse("2026-10-22T11:00:00Z") };
  const evaluator = createAnviEvaluator({ gemini, config: { generateModel: "eval-model" }, clock, notify: async () => true, usage: ledger, log: { warn() {} } });
  const at = new Date("2026-10-22T10:00:00Z");
  const attempt = await AnviAttempt.create({
    studentId: id(), interviewId: id(), snapshotRevision: 1, status: "completed", hardDeadline: at, endedAt: at,
    items: [{ qid: "q1", n: 1, questionText: "Explain REST.", answerText: "REST keeps every request stateless so any server can answer it.", answerSeconds: 20, status: "answered", expectedKeyPoints: ["Stateless"], maxMarks: 10 }],
    pendingWork: { status: "pending", attempts: 0, nextAttemptAt: at },
  });
  const tenant = { universityId: "north", connection: mongoose.connection };
  const result = await runForTenant(tenant, () => evaluator.evaluateNow(attempt._id));
  assert.equal(result.status, "ready");
  assert.equal(requests[0].usageKind, "evaluate");
  assert.equal(requests[0].cache, true, "a first run may reuse an identical recent reply");
  await ledger.flush();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].writtenIn, "north");
  assert.deepEqual([rows[0].kind, String(rows[0].attemptId), String(rows[0].studentId), String(rows[0].interviewId), rows[0].totalTokens],
    ["evaluate", String(attempt._id), String(attempt.studentId), String(attempt.interviewId), 1020]);
});

test("admin usage report: totals by kind, model and IST day, sessions, cost, scoped to the admin", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const mine = await interview(adminA, "Backend round");
  const second = await interview(adminA, "Frontend round");
  const theirs = await interview(adminB, "Other admin round");
  const attempt = id();
  const day1 = new Date("2026-10-20T20:00:00Z"); // 21 Oct IST
  const day2 = new Date("2026-10-21T20:00:00Z"); // 22 Oct IST
  const row = (interviewId, fields) => usageRow(fields, { interviewId, attemptId: attempt, tenantKey: "platform" }, fields.at);
  await AnviUsage.insertMany([
    row(mine._id, { kind: "generate", model: "gen", tokens: { input: 1_000_000, output: 500_000 }, at: day1 }),
    row(mine._id, { kind: "evaluate", model: "gen", tokens: { input: 500_000, output: 250_000 }, at: day2 }),
    row(mine._id, { kind: "transcribe", model: "stt", tokens: { input: 2000, output: 100 }, audioSeconds: 30, at: day2 }),
    row(mine._id, { kind: "live", model: "live", tokens: { input: 4000, output: 3000 }, at: day2 }),
    row(mine._id, { kind: "session", model: "live", sessionSeconds: 600, at: day2 }),
    row(mine._id, { kind: "session", model: "live", sessionSeconds: 300, at: day2 }),
    row(second._id, { kind: "generate", model: "gen", tokens: { input: 10, output: 10 }, at: day2 }),
    row(theirs._id, { kind: "generate", model: "gen", tokens: { input: 9_999_999, output: 9_999_999 }, at: day2 }),
  ]);

  const range = "?from=2026-10-21&to=2026-10-22";
  const { status, body } = await call(`${range}&interviewId=${mine._id}`);
  assert.equal(status, 200);
  assert.equal(body.interviewId, String(mine._id));
  assert.equal(body.range.from, "2026-10-20T18:30:00.000Z");
  assert.equal(body.range.to, "2026-10-22T18:30:00.000Z");
  assert.deepEqual(body.sessions, { count: 2, attempts: 1, liveMinutes: 15 });
  assert.deepEqual(body.byKind.map((entry) => [entry.kind, entry.calls, entry.inputTokens, entry.outputTokens, entry.estimatedCost]), [
    ["evaluate", 1, 500_000, 250_000, 3], ["generate", 1, 1_000_000, 500_000, 3], ["live", 1, 4000, 3000, null], ["transcribe", 1, 2000, 100, null],
  ]);
  assert.equal(body.byKind.find((entry) => entry.kind === "transcribe").audioSeconds, 30);
  assert.deepEqual(body.totals, { calls: 4, inputTokens: 1_506_000, outputTokens: 753_100, totalTokens: 2_259_100, audioSeconds: 30, estimatedCost: 6, complete: false });
  assert.deepEqual(body.pricing.unpricedKinds, ["live", "transcribe"]);
  assert.deepEqual(body.pricing.prices.generate, { input: 1, output: 4 });
  assert.equal(body.pricing.currency, "USD");
  assert.deepEqual(body.byDay.map((day) => [day.day, day.calls, day.sessions, day.liveMinutes]), [["2026-10-21", 1, 0, 0], ["2026-10-22", 3, 2, 15]]);
  assert.equal(body.byDay[0].estimatedCost, 3);
  assert.equal(body.byDay[1].estimatedCost, null, "a day with an unpriced kind has no single estimate");
  assert.ok(body.byModel.some((entry) => entry.kind === "live" && entry.model === "live"));

  // Every owned interview, never another admin's.
  const all = await call(range);
  assert.equal(all.body.interviewId, null);
  assert.equal(all.body.totals.calls, 5);
  assert.equal(all.body.byKind.find((entry) => entry.kind === "generate").inputTokens, 1_000_010);
  // Per interview, heaviest first, with titles; another admin's interview never appears.
  assert.deepEqual(all.body.byInterview.map((entry) => [entry.title, entry.calls, entry.totalTokens, entry.sessions, entry.liveMinutes, entry.estimatedCost]), [
    ["Backend round", 4, 2_259_100, 2, 15, null],
    ["Frontend round", 1, 20, 0, 0, 0.0001],
  ]);
  assert.equal((await call(`${range}&interviewId=${theirs._id}`)).status, 404);
  const other = await call(range, { "X-Test-Admin": String(adminB) });
  assert.equal(other.body.totals.inputTokens, 9_999_999);
  // Rows outside the range are left out.
  assert.equal((await call("?from=2026-10-22&to=2026-10-22")).body.totals.calls, 4);
});

test("admin usage report validates its input and is admin-only", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  assert.equal((await call("", { "X-Test-Role": "student" })).status, 403);
  const empty = await call();
  assert.equal(empty.status, 200);
  assert.equal(empty.body.totals.calls, 0);
  assert.equal(empty.body.totals.complete, true);
  assert.equal(new Date(empty.body.range.to) - new Date(empty.body.range.from), 30 * 24 * 60 * 60_000, "defaults to the last 30 days");
  assert.equal((await call("?from=yesterday")).body.code, "INVALID_DATE");
  assert.equal((await call("?from=2026-10-22&to=2026-10-01")).body.code, "INVALID_RANGE");
  assert.equal((await call("?from=2025-01-01&to=2026-10-01")).body.code, "INVALID_RANGE");
  assert.equal((await call("?interviewId=nope")).body.code, "INVALID_IDENTIFIER");
  await settle();
});
