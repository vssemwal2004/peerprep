import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import AIInterview from "../src/models/AIInterview.js";
import { errorHandler } from "../src/utils/errors.js";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";
import { anviPricing } from "../src/modules/anviInterview/anviInterview.pricing.js";
import { createAnviAdminReportRouter } from "../src/modules/anviInterview/anviInterview.adminRoutes.js";
import { AnviAttempt } from "../src/modules/anviInterview/anviInterview.models.js";
import {
  AnviUsage, BILLED_KINDS, LEDGER_KINDS, METRIC_NAMES, costDistribution, createUsageLedger, defaultUsageLedger, flushAnviUsage, summarizeUsage, usageRow,
} from "../src/modules/anviInterview/anviInterview.usage.js";

// WP5: ledger kinds, metric rows, write-time pricing and the cost report (AC11, AC12).
const id = () => new mongoose.Types.ObjectId();
const PRICES = { ANVI_PRICE_GENERATE_INPUT: "1", ANVI_PRICE_GENERATE_OUTPUT: "4", ANVI_PRICE_EVALUATE_INPUT: "2", ANVI_PRICE_EVALUATE_OUTPUT: "8", ANVI_PRICING_REVISION: "test" };
const RATED = anviPricing({ ...PRICES, ANVI_USD_INR_RATE: "100" });
const NO_RATE = anviPricing(PRICES);
const memoryModel = () => {
  const rows = [];
  return { rows, createIndexes: async () => {}, insertMany: async (batch) => { rows.push(...batch); } };
};

// --- Ledger rows ----------------------------------------------------------------------------------

test("the ledger knows the hybrid kinds and a non-billable metric kind", () => {
  for (const kind of ["tts", "decision", "transcribe_accurate", "metric"]) assert.ok(LEDGER_KINDS.includes(kind), kind);
  assert.ok(!BILLED_KINDS.includes("metric") && !BILLED_KINDS.includes("session"));
  for (const kind of ["tts", "decision", "transcribe_accurate"]) {
    const row = usageRow({ kind, model: "m", tokens: { input: 10, output: 5 }, audioSeconds: 2.5 });
    assert.equal(row.kind, kind);
    assert.equal(row.totalTokens, 15);
  }
  assert.deepEqual(METRIC_NAMES, ["ttsCacheHit", "ttsCacheMiss", "transcriptCacheHit", "transcriptCacheMiss", "repeatedQuestionReplay",
    "liveEscalation", "accurateTranscriptionEscalation", "avoidedTtsCall", "avoidedLiveTurn", "budgetMode"]);
});

test("metric rows carry a known name and a count, and no tokens or price", () => {
  const row = usageRow({ kind: "metric", name: "ttsCacheHit", count: 3 }, { attemptId: id(), pricing: RATED, mode: "economical" });
  assert.equal(row.kind, "metric");
  assert.equal(row.name, "ttsCacheHit");
  assert.equal(row.count, 3);
  assert.equal(row.totalTokens, 0);
  assert.equal(row.mode, "economical");
  assert.equal("estimatedUsd" in row, false, "metrics are never priced");
  assert.equal(usageRow({ kind: "metric", name: "made up" }), null);
  assert.equal(usageRow({ kind: "metric", name: "ttsCacheHit", count: 0 }), null);
  assert.equal(usageRow({ kind: "metric", name: "ttsCacheHit" }).count, 1, "count defaults to 1");
});

test("billed rows store their estimate and pricing revision at write time; unknown is null, never 0", () => {
  const priced = usageRow({ kind: "generate", model: "m", tokens: { input: 1_000_000, output: 0 } }, { pricing: RATED });
  assert.equal(priced.estimatedUsd, 1);
  assert.equal(priced.estimatedInr, 100);
  assert.equal(priced.pricingRevision, RATED.revision);
  assert.match(priced.pricingRevision, /^test:[a-f0-9]{12}$/);

  const unknown = usageRow({ kind: "tts", model: "m", tokens: { input: 10, output: 500 }, audioSeconds: 20 }, { pricing: RATED });
  assert.equal(unknown.estimatedUsd, null, "a missing price is unknown (AC12)");
  assert.equal(unknown.estimatedInr, null);

  const noRate = usageRow({ kind: "generate", model: "m", tokens: { input: 1_000_000 } }, { pricing: NO_RATE });
  assert.equal(noRate.estimatedUsd, 1);
  assert.equal(noRate.estimatedInr, null, "INR is null without ANVI_USD_INR_RATE");

  const session = usageRow({ kind: "session", model: "live", sessionSeconds: 60 }, { pricing: RATED });
  assert.equal("estimatedUsd" in session, false, "session rows are not calls");
  const legacy = usageRow({ kind: "generate", model: "m", tokens: { input: 1 } });
  for (const field of ["estimatedUsd", "estimatedInr", "pricingRevision", "runtimeMode", "durationMinutes", "mode", "liveSeconds"]) {
    assert.equal(field in legacy, false, `${field} only when known`);
  }
});

test("attempt fields come from the context (mode may be a function) and are validated", () => {
  let mode = "normal";
  const row = usageRow({ kind: "decision", model: "m", tokens: { input: 5 }, liveSeconds: 12.345 }, { runtimeMode: "hybrid", durationMinutes: 30, mode: () => mode });
  assert.deepEqual([row.runtimeMode, row.durationMinutes, row.mode, row.liveSeconds], ["hybrid", 30, "normal", 12.35]);
  mode = "cached_only";
  assert.equal(usageRow({ kind: "decision", tokens: {} }, { mode: () => mode }).mode, "cached_only");
  const bad = usageRow({ kind: "decision", tokens: {} }, { runtimeMode: "turbo", durationMinutes: 9999, mode: "panic" });
  assert.equal("runtimeMode" in bad || "durationMinutes" in bad || "mode" in bad, false);
});

test("recorder().metric records a metric row for the bound attempt; the ledger prices with its pricing", async () => {
  const model = memoryModel();
  const ledger = createUsageLedger({ model, log: { warn() {} }, pricing: RATED });
  const attemptId = id();
  const onUsage = ledger.recorder({ attemptId, tenant: null, runtimeMode: "hybrid", durationMinutes: 15 });
  onUsage({ kind: "evaluate", model: "eval", tokens: { input: 500_000, output: 0 } });
  assert.equal(onUsage.metric("repeatedQuestionReplay"), true);
  assert.equal(onUsage.metric("budgetMode", 1, { mode: "economical" }), true);
  assert.equal(onUsage.metric("nope"), false);
  await ledger.flush();
  assert.deepEqual(model.rows.map((row) => [row.kind, row.name || "", row.count ?? null, String(row.attemptId) === String(attemptId)]), [
    ["evaluate", "", null, true], ["metric", "repeatedQuestionReplay", 1, true], ["metric", "budgetMode", 1, true],
  ]);
  assert.equal(model.rows[0].estimatedUsd, 1);
  assert.equal(model.rows[0].estimatedInr, 100);
  assert.equal(model.rows[2].mode, "economical");
  assert.ok(model.rows.every((row) => row.runtimeMode === "hybrid" && row.durationMinutes === 15));
  // A ledger with pricing off stores no estimate.
  const plain = memoryModel();
  const off = createUsageLedger({ model: plain, log: { warn() {} }, pricing: null });
  off.record({ kind: "generate", tokens: { input: 1 } }, { tenant: null });
  await off.flush();
  assert.equal("estimatedUsd" in plain.rows[0], false);
});

test("the default (test) ledger's recorder has metric, and flushAnviUsage is idempotent", async () => {
  assert.equal(typeof defaultUsageLedger().recorder({}).metric, "function");
  assert.equal(defaultUsageLedger().recorder({}).metric("ttsCacheHit"), false);
  await flushAnviUsage();
  await flushAnviUsage();
});

test("costDistribution: average and nearest-rank p50/p90", () => {
  assert.deepEqual(costDistribution([]), { avg: null, p50: null, p90: null });
  assert.deepEqual(costDistribution([7]), { avg: 7, p50: 7, p90: 7 });
  assert.deepEqual(costDistribution([100, 10, 20, 30, 40, 50, 60, 70, 80, 90]), { avg: 55, p50: 50, p90: 90 });
  assert.deepEqual(costDistribution([1, 2, 3, 4]), { avg: 2.5, p50: 2, p90: 4 });
  assert.deepEqual(costDistribution([40, 50, 61]), { avg: 50.33, p50: 50, p90: 61 });
});

// --- MongoDB: the cost report ---------------------------------------------------------------------

let mongo, server, base;
let skipped = false;
const adminA = id();
const adminB = id();

before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } }); }
  catch (error) { if (error?.code === "EPERM") { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: "anvi_usage_cost_test" });
  await Promise.all([AIInterview.init(), AnviAttempt.init(), AnviUsage.init()]);
  const app = express();
  app.use("/api/ai-interviews/reports", createAnviAdminReportRouter((req, _res, next) => {
    req.user = { _id: new mongoose.Types.ObjectId(req.get("X-Test-Admin") || String(adminA)), role: "admin" };
    next();
  }, { evaluateSoon: () => null, config: anviConfig(PRICES), pricing: RATED }));
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

const AT = new Date("2026-10-21T06:00:00Z");
const ALL = { at: { $gte: new Date("2026-10-01T00:00:00Z"), $lt: new Date("2026-11-01T00:00:00Z") } };
const rowOf = (usage, context = {}, pricing = RATED) => usageRow(usage, { tenantKey: "platform", pricing, ...context }, AT);
// Generation tokens that cost exactly `inr` at INR 100 per USD and USD 1 per 1M input tokens.
const generateFor = (inr) => ({ kind: "generate", model: "gen", tokens: { input: Math.round(inr * 10_000), output: 0 } });

test("metric rows are excluded from calls and cost; cache hit rates come from them (AC11)", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const attemptId = id();
  await AnviUsage.insertMany([
    rowOf(generateFor(10), { attemptId }),
    rowOf({ kind: "tts", model: "tts", tokens: { input: 20, output: 600 }, audioSeconds: 24 }, { attemptId }, null),
    rowOf({ kind: "transcribe", model: "stt", tokens: { input: 1500, output: 40 }, audioSeconds: 60 }, { attemptId }, null),
    rowOf({ kind: "metric", name: "ttsCacheHit", count: 7 }, { attemptId }),
    rowOf({ kind: "metric", name: "ttsCacheMiss", count: 3 }, { attemptId }),
    rowOf({ kind: "metric", name: "repeatedQuestionReplay", count: 2 }, { attemptId }),
    rowOf({ kind: "metric", name: "avoidedTtsCall", count: 4 }, { attemptId }),
    rowOf({ kind: "metric", name: "transcriptCacheMiss", count: 5 }, { attemptId }),
  ]);
  const pricing = anviPricing({ ...PRICES, ANVI_USD_INR_RATE: "100", ANVI_PRICE_TTS_TEXT_INPUT: "1", ANVI_PRICE_TTS_AUDIO_OUTPUT: "20", ANVI_PRICE_TRANSCRIBE_INPUT: "1", ANVI_PRICE_TRANSCRIBE_OUTPUT: "2" });
  const report = await summarizeUsage(ALL, { pricing });
  assert.equal(report.totals.calls, 3, "three Gemini calls; metric rows are not calls");
  assert.deepEqual(report.byKind.map((row) => row.kind).sort(), ["generate", "transcribe", "tts"]);
  assert.ok(report.byModel.every((row) => row.kind !== "metric"));
  assert.deepEqual(report.cache.tts, { hits: 7, misses: 3, hitRate: 0.7 });
  assert.deepEqual(report.cache.transcript, { hits: 0, misses: 5, hitRate: 0 });
  assert.equal(report.cache.replays, 2);
  assert.equal(report.cache.avoidedTtsCalls, 4);
  assert.deepEqual(report.minutes, { live: 0, studentAudio: 1, tts: 0.4 });
  // Generation was stored at write time; TTS and transcription were repriced with today's table.
  const tts = (20 * 1 + 600 * 20) / 1e6;
  const stt = (1500 * 1 + 40 * 2) / 1e6;
  assert.equal(report.cost.usd, Math.round((0.1 + tts + stt) * 1e6) / 1e6);
  assert.equal(report.cost.complete, true);
  assert.equal(report.cost.repriced, true, "legacy rows are labelled repriced");
  assert.equal(report.byKind.find((row) => row.kind === "generate").repriced, undefined);
  assert.equal(report.byKind.find((row) => row.kind === "tts").repriced, true);
});

test("an unknown price leaves the cost null and incomplete; INR is null without a rate (AC12)", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  await AnviUsage.insertMany([
    rowOf(generateFor(10), { attemptId: id() }),
    rowOf({ kind: "decision", model: "dec", tokens: { input: 900, output: 60 } }, { attemptId: id() }),
  ]);
  const report = await summarizeUsage(ALL, { pricing: RATED });
  assert.equal(report.cost.usd, null);
  assert.equal(report.cost.inr, null);
  assert.equal(report.cost.complete, false);
  assert.deepEqual(report.cost.unpricedKinds, ["decision"]);
  assert.equal(report.byKind.find((row) => row.kind === "decision").estimatedUsd, null);
  assert.equal(report.byKind.find((row) => row.kind === "decision").estimatedCost, null, "the legacy figure is unknown too, not 0");
  assert.equal(report.byKind.find((row) => row.kind === "generate").estimatedInr, 10);
  assert.equal(report.warnings.find((warning) => warning.code === "pricesIncomplete").unpricedKinds[0], "decision");

  await AnviUsage.deleteMany({});
  await AnviUsage.insertMany([rowOf(generateFor(10), {}, null)]);
  const noRate = await summarizeUsage(ALL, { pricing: NO_RATE });
  assert.equal(noRate.cost.usd, 0.1);
  assert.equal(noRate.cost.inr, null, "never converted without ANVI_USD_INR_RATE");
  assert.equal(noRate.cost.inrMissing, true);
  assert.equal(noRate.cost.complete, false);
});

test("a stored estimate keeps its pricing revision; the report does not reprice it", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const before = RATED;
  const later = anviPricing({ ...PRICES, ANVI_PRICE_GENERATE_INPUT: "3", ANVI_USD_INR_RATE: "100" });
  assert.notEqual(before.revision, later.revision);
  await AnviUsage.insertMany([rowOf(generateFor(10), { attemptId: id() }, before), rowOf(generateFor(10), { attemptId: id() }, null)]);
  const stored = await AnviUsage.findOne({ pricingRevision: { $exists: true } }).lean();
  assert.equal(stored.pricingRevision, before.revision);
  const report = await summarizeUsage(ALL, { pricing: later });
  // 0.1 USD stored at the old price plus 0.3 USD for the unpriced row at today's price.
  assert.equal(report.cost.usd, 0.4);
  assert.equal(report.cost.inr, 40);
  assert.deepEqual(report.cost.revisions, [{ revision: before.revision, rows: 1 }]);
  assert.equal(report.cost.pricingRevision, later.revision);
});

test("per completed attempt: average, p50 and p90 in INR, budget modes and duration buckets", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const costs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const ids = costs.map(() => id());
  const unfinished = id();
  await AnviUsage.insertMany([
    ...costs.map((inr, index) => rowOf(generateFor(inr), { attemptId: ids[index], runtimeMode: index < 4 ? "hybrid" : undefined, durationMinutes: index < 4 ? 15 : 60 })),
    rowOf({ kind: "metric", name: "budgetMode", count: 1, mode: "economical" }, { attemptId: ids[8] }),
    rowOf({ kind: "metric", name: "budgetMode", count: 1, mode: "cached_only" }, { attemptId: ids[9] }),
    rowOf({ kind: "evaluate", model: "eval", tokens: { input: 100 } }, { attemptId: ids[9], mode: "essential" }),
    rowOf(generateFor(500), { attemptId: unfinished, durationMinutes: 60 }),
  ]);
  const info = new Map([...ids.map((attemptId) => [String(attemptId), { status: "ready" }]), [String(unfinished), { status: "abandoned" }]]);
  const report = await summarizeUsage(ALL, { pricing: RATED, attemptInfo: async () => info });
  assert.equal(report.attempts.count, 11);
  assert.equal(report.attempts.completed, 10);
  assert.equal(report.attempts.hybrid, 4);
  assert.equal(report.attempts.live, 7, "an attempt without a runtime mode is Live");
  assert.equal(report.attempts.economical, 2, "economical or stricter");
  assert.equal(report.attempts.cachedOnly, 1);
  assert.equal(report.attempts.peakModes.essential, 1);
  const inr = report.attempts.perCompleted.inr;
  assert.equal(inr.p50, 50);
  assert.equal(inr.p90, 90);
  assert.ok(Math.abs(inr.avg - 55) < 0.01, `avg ${inr.avg}`);
  assert.equal(report.attempts.perCompleted.complete, true);
  assert.deepEqual(report.byDuration.map((row) => [row.durationMinutes, row.attempts, row.perCompleted.completed]), [[15, 4, 4], [60, 7, 6]]);
  assert.equal(report.byDuration[0].estimatedInr, 100);
  // p90 above INR 60 warns; the average (55) is above 45 too.
  assert.deepEqual(report.warnings.map((warning) => warning.code).sort(), ["avgAboveInr45", "p90AboveInr60"]);
});

test("warnings fire only above their thresholds", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const ids = [id(), id()];
  const hits = (hit, miss) => [rowOf({ kind: "metric", name: "ttsCacheHit", count: hit }, { attemptId: ids[0] }), rowOf({ kind: "metric", name: "ttsCacheMiss", count: miss }, { attemptId: ids[0] })].filter(Boolean);
  const ready = async () => new Map(ids.map((attemptId) => [String(attemptId), { status: "ready" }]));
  // INR 40 and 50: the average is exactly 45 and p90 is 50, so neither warns. 60% cache hits is not low.
  await AnviUsage.insertMany([rowOf(generateFor(40), { attemptId: ids[0] }), rowOf(generateFor(50), { attemptId: ids[1] }), ...hits(12, 8)]);
  let report = await summarizeUsage(ALL, { pricing: RATED, attemptInfo: ready });
  assert.deepEqual(report.warnings, []);

  await AnviUsage.insertMany([rowOf(generateFor(0.01), { attemptId: ids[1] }), ...hits(0, 1)]);
  report = await summarizeUsage(ALL, { pricing: RATED, attemptInfo: ready });
  assert.deepEqual(report.warnings.map((warning) => warning.code), ["avgAboveInr45", "lowCacheHit"]);
  assert.equal(report.warnings[1].threshold, 0.6);

  ids.push(id());
  await AnviUsage.insertMany([rowOf(generateFor(61), { attemptId: ids[2] })]);
  const expired = anviPricing({ ...PRICES, ANVI_USD_INR_RATE: "100", ANVI_PRICING_VALID_UNTIL: "2026-10-01" });
  report = await summarizeUsage(ALL, { pricing: expired, attemptInfo: ready, now: () => new Date("2026-10-23T00:00:00Z") });
  assert.deepEqual(report.warnings.map((warning) => warning.code), ["avgAboveInr45", "p90AboveInr60", "lowCacheHit", "pricingExpired"]);
  // Too few cache lookups never warn.
  await AnviUsage.deleteMany({ kind: "metric" });
  await AnviUsage.insertMany([rowOf({ kind: "metric", name: "ttsCacheMiss", count: 19 }, { attemptId: ids[0] })]);
  report = await summarizeUsage(ALL, { pricing: RATED, attemptInfo: ready });
  assert.equal(report.warnings.some((warning) => warning.code === "lowCacheHit"), false);
});

test("admin usage report: the new cost figures stay scoped to the admin's own interviews", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const interview = (ownerId, title) => AIInterview.create({ ownerId, creationKey: crypto.randomUUID(), title, data: { title } });
  const mine = await interview(adminA, "Backend round");
  const theirs = await interview(adminB, "Other round");
  const myAttempt = await AnviAttempt.create({ studentId: id(), interviewId: mine._id, snapshotRevision: 1, status: "ready", hardDeadline: AT, runtimeMode: "hybrid", durationMinutes: 30 });
  const theirAttempt = await AnviAttempt.create({ studentId: id(), interviewId: theirs._id, snapshotRevision: 1, status: "ready", hardDeadline: AT });
  await AnviUsage.insertMany([
    rowOf(generateFor(20), { attemptId: myAttempt._id, interviewId: mine._id }),
    rowOf({ kind: "metric", name: "ttsCacheHit", count: 5 }, { attemptId: myAttempt._id, interviewId: mine._id }),
    rowOf(generateFor(900), { attemptId: theirAttempt._id, interviewId: theirs._id }),
    rowOf({ kind: "metric", name: "ttsCacheHit", count: 50 }, { attemptId: theirAttempt._id, interviewId: theirs._id }),
  ]);
  const get = async (headers = {}) => (await fetch(`${base}?from=2026-10-20&to=2026-10-22`, { headers })).json();
  const body = await get();
  assert.equal(body.totals.calls, 1);
  assert.equal(body.cost.inr, 20);
  assert.equal(body.cost.complete, true);
  assert.equal(body.cache.tts.hits, 5);
  assert.equal(body.attempts.count, 1);
  assert.equal(body.attempts.hybrid, 1, "runtime mode comes from the attempt");
  assert.deepEqual(body.byDuration.map((row) => row.durationMinutes), [30]);
  assert.equal(body.byInterview[0].estimatedInr, 20);
  const other = await get({ "X-Test-Admin": String(adminB) });
  assert.equal(other.cost.inr, 900);
  assert.equal(other.cache.tts.hits, 50);
  assert.deepEqual(other.warnings.map((warning) => warning.code), ["avgAboveInr45", "p90AboveInr60"]);
});
