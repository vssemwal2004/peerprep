import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AnviAttempt } from "../src/modules/anviInterview/anviInterview.models.js";
import {
  OUTPUT_TOKENS_PER_ITEM, PROMPT_VERSION, clipAnswer, createAnviEvaluator, estimateTokens, evaluationPrompt, packEvaluationBatches, scoreItem,
} from "../src/modules/anviInterview/anviInterview.evaluation.js";

// WP16: batched evaluation packed by token estimate, an explicit model chain, no shared cache for hybrid
// attempts and per-qid judgements kept between retries.
const RUBRIC = [{ id: "r1", name: "Clarity", weight: 60, description: "Explains clearly" }, { id: "r2", name: "Depth", weight: 40 }];
const LONG = "REST APIs expose resources at URLs and every request carries everything the server needs, so servers stay stateless and scale out.";
const CONFIG = Object.freeze({
  generateModel: "generate-model", evaluateModel: "eval-a", evaluateFallbackModels: Object.freeze(["eval-b"]),
  evaluationBatchSize: 8, evaluationMaxInputTokens: 6000, evaluationMaxOutputTokens: 1500,
});

const answered = (qid, n, sectionId, extra = {}) => ({
  qid, n, sectionId, sectionName: sectionId === "s1" ? "Technical" : "Behavioral", competency: "", questionText: `Question ${qid}?`,
  answerText: LONG, answerSeconds: 30, status: "answered", expectedKeyPoints: ["Stateless", "Resources"], maxMarks: 10, weight: 1, ...extra,
});
const twenty = () => Array.from({ length: 20 }, (_, i) => answered(`q${i + 1}`, i + 1, i % 3 ? "s1" : "s2"));

test("packing respects the item, input and output caps and clips an answer too long for a batch", () => {
  const prompt = (args) => evaluationPrompt({ ...args, rubric: RUBRIC, language: "English", role: "Backend engineer" });
  const caps = { batchSize: 8, maxInputTokens: 6000, maxOutputTokens: 1500, prompt };
  assert.deepEqual(packEvaluationBatches(twenty(), caps).map((batch) => batch.length), [8, 8, 4]);

  const heavy = Array.from({ length: 6 }, (_, i) => answered(`h${i + 1}`, i + 1, "s1", { answerText: `${"word ".repeat(1800)}end ${i}` }));
  const batches = packEvaluationBatches(heavy, caps);
  assert.ok(batches.length > 1, "long answers make smaller batches");
  for (const batch of batches) {
    const { systemText, userText } = prompt({ items: batch });
    assert.ok(estimateTokens(systemText) + estimateTokens(userText) <= 6000, "no batch exceeds the input estimate");
    assert.ok(batch.length * OUTPUT_TOKENS_PER_ITEM <= 1500);
  }
  assert.deepEqual(batches.flat().map((item) => item.qid), heavy.map((item) => item.qid), "order is kept");

  const huge = answered("big", 1, "s1", { answerText: `HEAD ${"x".repeat(40_000)} TAIL` });
  const [[clipped]] = packEvaluationBatches([huge], caps);
  assert.equal(clipped.clipped, true);
  assert.ok(clipped.answerText.startsWith("HEAD") && clipped.answerText.endsWith("TAIL"), "head and tail are kept");
  const { systemText, userText } = prompt({ items: [clipped] });
  assert.ok(estimateTokens(systemText) + estimateTokens(userText) <= 6000);
  assert.equal(clipAnswer("short", 100), "short");
  assert.deepEqual(packEvaluationBatches([{ ...huge, status: "skipped" }], caps), [], "unanswered items are never sent");
});

// --- Evaluator against MongoDB -------------------------------------------------------------

let mongo;
let skipped = false;
before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } }); }
  catch (error) { if (error?.code === "EPERM") { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: "anvi_evaluation_batched_test" });
  await AnviAttempt.init();
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => { if (!skipped) await AnviAttempt.deleteMany({}); });

const parseItems = (request) => JSON.parse(request.parts[0].text.match(/<items>([\s\S]*)<\/items>/)[1]);
const goodJudge = (item) => ({
  qid: item.qid,
  keyPoints: item.keyPoints.map((point, i) => ({ index: point.index, verdict: i === 0 ? "matched" : "partial" })),
  relevanceLevel: 3, rubric: [{ id: "r1", level: 3 }], feedback: `You covered the main idea of ${item.qid}.`,
  strengths: ["Clear definition"], improvements: ["Add an example"], practice: `Practise question ${item.qid} with an example.`,
});
// Answers like the real client: with `withMeta` it resolves to { value, model, tokens }.
function fakeGemini({ fail = () => null, answeredBy = () => "eval-a" } = {}) {
  const calls = [];
  return {
    calls,
    async generateJson(request) {
      calls.push(request);
      const error = fail(calls.length, request);
      if (error) throw error;
      request.onUsage?.({ kind: request.usageKind, model: answeredBy(calls.length), tokens: { input: 100, output: 50, total: 150 } });
      const value = { items: parseItems(request).map(goodJudge) };
      return request.withMeta ? { value, model: answeredBy(calls.length), tokens: { input: 100, output: 50 } } : value;
    },
  };
}
function fakeClock(start = Date.parse("2026-10-22T10:00:00Z")) {
  let now = start;
  return { now: () => now, advance: (ms) => { now += ms; } };
}
const makeAttempt = (fields = {}, at = new Date("2026-10-22T10:00:00Z")) => AnviAttempt.create({
  studentId: new mongoose.Types.ObjectId(), interviewId: new mongoose.Types.ObjectId(), snapshotRevision: 2, title: "Backend practice",
  language: "English", role: "Backend engineer", status: "completed", hardDeadline: at, endedAt: at, rubricSnapshot: RUBRIC,
  runtimeMode: "hybrid", pendingWork: { status: "pending", attempts: 0, nextAttemptAt: at }, ...fields,
});
const evaluatorWith = (gemini, extra = {}) => createAnviEvaluator({ gemini, config: CONFIG, clock: fakeClock(), notify: async () => true, log: { warn() {} }, ...extra });

test("20 answers take 3 calls on the explicit evaluate chain, never cached for a hybrid attempt", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const gemini = fakeGemini();
  const reserved = [];
  const budget = { recordReserved: async (usage) => { reserved.push(usage); return "hard"; } };
  const evaluator = evaluatorWith(gemini, { budgetFor: () => budget });
  const attempt = await makeAttempt({ items: twenty() });
  assert.equal((await evaluator.evaluateNow(attempt._id)).status, "ready");
  assert.deepEqual(gemini.calls.map((call) => parseItems(call).length), [8, 8, 4]);
  for (const call of gemini.calls) {
    assert.equal(call.model, "eval-a");
    assert.deepEqual(call.fallbackModels, ["eval-b"]);
    assert.equal(call.includeDefaultFallback, false, "generateModel is never appended");
    assert.equal(call.withMeta, true);
    assert.equal(call.cache, false);
    assert.equal(call.temperature, 0);
    assert.equal(call.usageKind, "evaluate");
    assert.ok(call.maxOutputTokens <= 1500);
    assert.ok(estimateTokens(call.systemText) + estimateTokens(call.parts[0].text) <= 6000);
  }
  assert.ok(new Set(parseItems(gemini.calls[0]).map((item) => item.section)).size > 1, "batches cross sections");
  assert.equal(reserved.length, 3, "evaluation spend goes to the reserved budget path");
  assert.ok(reserved.every((usage) => usage.kind === "evaluate"));
  const stored = await AnviAttempt.findById(attempt._id).lean();
  assert.equal(stored.status, "ready");
  assert.equal(stored.eval.calls, 3);
  assert.equal(stored.eval.modelId, "eval-a");
  assert.equal(stored.eval.promptVersion, PROMPT_VERSION);
  assert.equal(stored.pendingWork.judged, undefined, "cleared on success");
});

test("a Live attempt's first run may still use the short-lived reply cache", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const gemini = fakeGemini();
  const attempt = await makeAttempt({ runtimeMode: "live", items: [answered("q1", 1, "s1")] });
  assert.equal((await evaluatorWith(gemini).evaluateNow(attempt._id)).status, "ready");
  assert.equal(gemini.calls[0].cache, true);
  assert.equal(gemini.calls[0].model, "eval-a");
});

test("a batch-2 failure keeps batch 1's judgements; the retry re-sends only the qids still missing", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const unavailable = () => Object.assign(new Error("down"), { code: "GEMINI_UNAVAILABLE" });
  let failing = true;
  const gemini = fakeGemini({ fail: (n) => (failing && n === 2 ? unavailable() : null) });
  const clock = fakeClock();
  const evaluator = createAnviEvaluator({ gemini, config: CONFIG, clock, notify: async () => true, log: { warn() {} } });
  const attempt = await makeAttempt({ items: twenty() });
  assert.equal((await evaluator.evaluateNow(attempt._id)).status, "retry");
  const firstRun = gemini.calls.map((call) => parseItems(call).map((item) => item.qid));
  assert.equal(firstRun.length, 2);
  const pending = await AnviAttempt.findById(attempt._id).lean();
  assert.deepEqual(pending.pendingWork.judged.items.map((row) => row.qid), firstRun[0], "batch 1 is persisted");
  assert.equal(pending.pendingWork.judged.promptVersion, PROMPT_VERSION);

  failing = false;
  clock.advance(15_000);
  assert.equal((await evaluator.evaluateNow(attempt._id)).status, "ready");
  const retry = gemini.calls.slice(2).map((call) => parseItems(call).map((item) => item.qid));
  assert.deepEqual(retry[0], firstRun[1], "the retry starts with exactly the failed batch");
  assert.ok(retry.flat().every((qid) => !firstRun[0].includes(qid)), "judged qids are never re-sent");
  assert.equal(retry.flat().length, 12);
  const stored = await AnviAttempt.findById(attempt._id).lean();
  assert.ok(stored.items.every((item) => item.marks === 7.5), "every item is scored, reused or fresh");
  assert.equal(stored.eval.attempts, 2);
  assert.equal(stored.pendingWork.judged, undefined);
});

test("judgements from another prompt version or revision are not reused", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const gemini = fakeGemini();
  const stale = { promptVersion: "anvi-eval-v1", revision: 0, items: [{ qid: "q1", model: "old", judgement: goodJudge({ qid: "q1", keyPoints: [{ index: 1 }, { index: 2 }] }) }] };
  const attempt = await makeAttempt({ items: [answered("q1", 1, "s1")], pendingWork: { status: "pending", attempts: 0, nextAttemptAt: new Date("2026-10-22T10:00:00Z"), judged: stale } });
  assert.equal((await evaluatorWith(gemini).evaluateNow(attempt._id)).status, "ready");
  assert.equal(gemini.calls.length, 1);
});

test("the model that actually answered is recorded, including a fallback", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const gemini = fakeGemini({ answeredBy: () => "eval-b" });
  const attempt = await makeAttempt({ items: [answered("q1", 1, "s1"), answered("q2", 2, "s2")] });
  assert.equal((await evaluatorWith(gemini).evaluateNow(attempt._id)).status, "ready");
  assert.equal((await AnviAttempt.findById(attempt._id).lean()).eval.modelId, "eval-b");

  const mixed = fakeGemini({ answeredBy: (n) => (n === 1 ? "eval-a" : "eval-b") });
  const other = await makeAttempt({ items: twenty() });
  assert.equal((await evaluatorWith(mixed).evaluateNow(other._id)).status, "ready");
  const stored = (await AnviAttempt.findById(other._id).lean()).eval;
  assert.equal(stored.modelId, "eval-b", "the model that judged most items");
  assert.deepEqual(stored.models, ["eval-b", "eval-a"]);
});

test("an unparseable reply is asked for again in halves", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const invalid = () => Object.assign(new Error("cut off"), { code: "GEMINI_INVALID_RESPONSE" });
  const gemini = fakeGemini({ fail: (n) => (n === 1 ? invalid() : null) });
  const attempt = await makeAttempt({ items: twenty().slice(0, 8) });
  assert.equal((await evaluatorWith(gemini).evaluateNow(attempt._id)).status, "ready");
  assert.deepEqual(gemini.calls.map((call) => parseItems(call).length), [8, 4, 4]);
  assert.equal((await AnviAttempt.findById(attempt._id).lean()).eval.calls, 3);
});

test("identical judgements give identical marks, the same as scoreItem (AC9)", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const items = [...twenty().slice(0, 5), answered("topic", 6, "s2", { expectedKeyPoints: [] })];
  const first = await makeAttempt({ items });
  const second = await makeAttempt({ items });
  await evaluatorWith(fakeGemini()).evaluateNow(first._id);
  await evaluatorWith(fakeGemini()).evaluateNow(second._id);
  const [a, b] = await Promise.all([first, second].map((row) => AnviAttempt.findById(row._id).lean()));
  const marks = (doc) => doc.items.map((item) => [item.qid, item.marks, item.percentCorrect]);
  assert.deepEqual(marks(a), marks(b));
  assert.deepEqual(a.overall, b.overall);
  const direct = items.map((item) => scoreItem(item, goodJudge({ qid: item.qid, keyPoints: item.expectedKeyPoints.map((_, i) => ({ index: i + 1 })) }), RUBRIC));
  assert.deepEqual(marks(a), direct.map((item) => [item.qid, item.marks, item.percentCorrect]));
});

test("a clipped answer is flagged on its scored item while the stored answer stays whole", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const text = `HEAD ${"y".repeat(30_000)} TAIL`;
  const gemini = fakeGemini();
  const attempt = await makeAttempt({ items: [answered("long", 1, "s1", { answerText: text })] });
  assert.equal((await evaluatorWith(gemini).evaluateNow(attempt._id)).status, "ready");
  const sent = parseItems(gemini.calls[0])[0].answer;
  assert.ok(sent.length < text.length && sent.startsWith("HEAD") && sent.endsWith("TAIL"));
  const [item] = (await AnviAttempt.findById(attempt._id).lean()).items;
  assert.ok(item.flags.includes("evaluation_answer_clipped"));
  assert.equal(item.answerText, text);
});
