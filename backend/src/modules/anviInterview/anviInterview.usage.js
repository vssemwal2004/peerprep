import mongoose from "mongoose";
import { currentTenant, runForPlatform, runForTenant, tenantModel } from "../../platform/tenantContext.js";
import { durationBucket } from "./anviInterview.config.js";
import { anviPricing } from "./anviInterview.pricing.js";

// ANVI usage ledger: one row per billed Gemini response (Live, transcription, generation, evaluation,
// decision, TTS), one "session" row per Live session held by a conductor and non-billable "metric" rows
// (cache hits, replays, escalations, budget modes). Rows live in the university's own database and
// expire after USAGE_RETENTION_DAYS. Writes are buffered and batched; a failed write is logged and dropped
// so metering can never break an interview or an evaluation.
const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

export const USAGE_RETENTION_DAYS = 180;
export const LEDGER_KINDS = Object.freeze(["live", "transcribe", "transcribe_accurate", "generate", "decision", "evaluate", "tts", "session", "metric"]);
// Kinds that are Gemini calls (priced); "session" and "metric" rows are never calls and never cost.
export const BILLED_KINDS = Object.freeze(["live", "transcribe", "transcribe_accurate", "generate", "decision", "evaluate", "tts"]);
// Names a "metric" row may carry; `count` is how many times it happened.
export const METRIC_NAMES = Object.freeze([
  "ttsCacheHit", "ttsCacheMiss", "transcriptCacheHit", "transcriptCacheMiss", "repeatedQuestionReplay",
  "liveEscalation", "accurateTranscriptionEscalation", "avoidedTtsCall", "avoidedLiveTurn", "budgetMode",
]);
// Budget modes in order of strictness (the budget controller only ever moves forward).
export const BUDGET_MODES = Object.freeze(["normal", "economical", "cached_only", "essential", "hard"]);
const RUNTIME_MODES = Object.freeze(["live", "hybrid"]);
const MAX_METRIC_COUNT = 10_000;
const FLUSH_MS = 5_000;
const FLUSH_ROWS = 200;
// Rows kept in memory while the database is unreachable; newer rows are dropped beyond this.
const MAX_BUFFERED_ROWS = 5_000;
const MODEL_ID = /^[a-zA-Z0-9._-]{1,100}$/;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

const usageSchema = new Schema({
  attemptId: { type: ObjectId, default: null },
  studentId: { type: ObjectId, default: null },
  interviewId: { type: ObjectId, default: null },
  // The university the row belongs to ("platform" outside any university); the row is also stored in
  // that university's database.
  tenantKey: { type: String, default: "platform" },
  kind: { type: String, enum: LEDGER_KINDS, required: true },
  model: { type: String, default: "" },
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  cachedTokens: { type: Number, default: 0 },
  thoughtsTokens: { type: Number, default: 0 },
  // {AUDIO: n, TEXT: n, ...} when Gemini reports per-modality details.
  inputByModality: { type: Schema.Types.Mixed, default: undefined },
  outputByModality: { type: Schema.Types.Mixed, default: undefined },
  // Seconds of answer audio sent for transcription.
  audioSeconds: { type: Number, default: 0 },
  // kind "session": seconds one conductor held a Live session (join to release).
  sessionSeconds: { type: Number, default: 0 },
  // kind "metric": which metric (METRIC_NAMES) and how many times it happened.
  name: { type: String, default: undefined },
  count: { type: Number, default: undefined },
  // Billed kinds, priced when the row was written: USD/INR (null = a price or the rate was unknown, never
  // 0) and the pricing revision they came from. Rows without these (older rows) are priced by the report.
  estimatedUsd: { type: Number, default: undefined },
  estimatedInr: { type: Number, default: undefined },
  pricingRevision: { type: String, default: undefined },
  // The attempt's runtime ("live" | "hybrid"), planned duration, budget mode at the time and Live seconds.
  runtimeMode: { type: String, default: undefined },
  durationMinutes: { type: Number, default: undefined },
  mode: { type: String, default: undefined },
  liveSeconds: { type: Number, default: undefined },
  at: { type: Date, default: Date.now },
}, { versionKey: false });

// The admin report reads one owner's interviews over a date range.
usageSchema.index({ interviewId: 1, at: 1 }, { name: "anvi_usage_interview_at" });
// Per-attempt cost (the budget mirror check and the per-attempt percentiles).
usageSchema.index({ attemptId: 1, at: 1 }, { name: "anvi_usage_attempt_at" });
usageSchema.index({ at: 1 }, { name: "anvi_usage_ttl", expireAfterSeconds: USAGE_RETENTION_DAYS * 24 * 60 * 60 });

export const AnviUsage = tenantModel(mongoose.model("AnviUsage", usageSchema));

const positive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};
const whole = (value) => Math.round(positive(value));
const hundredths = (value) => Math.round(positive(value) * 100) / 100;
const objectIdOf = (value) => (value && OBJECT_ID.test(String(value)) ? new mongoose.Types.ObjectId(String(value)) : null);
const modalities = (value) => {
  if (!value || typeof value !== "object") return undefined;
  const out = {};
  for (const [key, count] of Object.entries(value)) if (/^[A-Z_]{1,24}$/.test(key) && whole(count)) out[key] = whole(count);
  return Object.keys(out).length ? out : undefined;
};

const nullableMoney = (value) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Math.round(Number(value) * 1e10) / 1e10);
const modeOf = (value) => (BUDGET_MODES.includes(value) ? value : undefined);

// Optional attempt fields, present only when the caller knows them (older callers store none of them).
function attemptFields(usage, context) {
  const mode = modeOf(usage.mode) || modeOf(typeof context.mode === "function" ? context.mode() : context.mode);
  const runtimeMode = RUNTIME_MODES.includes(usage.runtimeMode) ? usage.runtimeMode : RUNTIME_MODES.includes(context.runtimeMode) ? context.runtimeMode : undefined;
  const duration = Number(usage.durationMinutes ?? context.durationMinutes);
  const liveSeconds = hundredths(usage.liveSeconds);
  return {
    ...(runtimeMode ? { runtimeMode } : {}),
    ...(Number.isInteger(duration) && duration > 0 && duration <= 240 ? { durationMinutes: duration } : {}),
    ...(mode ? { mode } : {}),
    ...(liveSeconds ? { liveSeconds } : {}),
  };
}

/**
 * The stored row for one onUsage payload, or null when it is not a ledger kind (or an unknown metric).
 * With `pricing` (anviInterview.pricing.js) a billed row also stores its estimate and pricing revision.
 */
export function usageRow(usage, context = {}, at = new Date()) {
  const { attemptId, studentId, interviewId, tenantKey = "platform", pricing = null } = context;
  if (!LEDGER_KINDS.includes(usage?.kind)) return null;
  const ids = {
    attemptId: objectIdOf(attemptId),
    studentId: objectIdOf(studentId),
    interviewId: objectIdOf(interviewId),
    tenantKey: String(tenantKey || "platform").slice(0, 100),
  };
  if (usage.kind === "metric") {
    if (!METRIC_NAMES.includes(usage.name)) return null;
    const count = Math.min(MAX_METRIC_COUNT, whole(usage.count ?? 1));
    if (!count) return null;
    return {
      ...ids, kind: "metric", model: "", name: usage.name, count,
      inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0, thoughtsTokens: 0, audioSeconds: 0, sessionSeconds: 0,
      ...attemptFields(usage, context), at,
    };
  }
  const tokens = usage.tokens || {};
  const inputTokens = whole(tokens.input);
  const outputTokens = whole(tokens.output);
  const inputByModality = modalities(tokens.inputByModality);
  const outputByModality = modalities(tokens.outputByModality);
  const row = {
    ...ids,
    kind: usage.kind,
    model: MODEL_ID.test(String(usage.model || "")) ? String(usage.model) : "",
    inputTokens,
    outputTokens,
    totalTokens: whole(tokens.total) || inputTokens + outputTokens,
    cachedTokens: whole(tokens.cached),
    thoughtsTokens: whole(tokens.thoughts),
    ...(inputByModality ? { inputByModality } : {}),
    ...(outputByModality ? { outputByModality } : {}),
    audioSeconds: hundredths(usage.audioSeconds),
    sessionSeconds: hundredths(usage.sessionSeconds),
    ...attemptFields(usage, context),
    at,
  };
  if (pricing && BILLED_KINDS.includes(row.kind)) {
    try {
      const estimate = pricing.estimate(row);
      row.estimatedUsd = nullableMoney(estimate.usd);
      row.estimatedInr = nullableMoney(estimate.inr);
      row.pricingRevision = String(estimate.revision || pricing.revision || "").slice(0, 80);
    } catch {
      // An estimate is optional: the report prices rows that have none.
    }
  }
  return row;
}

// Index creation is skipped on university connections (autoIndex is off), so the ledger creates its
// own indexes once per connection before its first write there.
const PLATFORM = {};

/**
 * `record(usage, context)` buffers one row; `context.tenant` is the university to write into (null for
 * the platform; omitted means the caller's current tenant context). Rows are flushed every `flushMs`,
 * at FLUSH_ROWS, or by `flush()`, each university's rows inside its own tenant context.
 * `pricing` prices billed rows at write time (default: the env pricing, read on first use; null: off).
 * Context may also carry `runtimeMode`, `durationMinutes` and `mode` (a budget mode, or a function
 * returning the current one).
 */
export function createUsageLedger({ model = AnviUsage, clock = Date, timers = { setTimeout, clearTimeout }, log = console, flushMs = FLUSH_MS, maxBuffered = MAX_BUFFERED_ROWS, pricing } = {}) {
  const buckets = new Map();
  const indexed = new WeakSet();
  let buffered = 0;
  let dropped = 0;
  let timer = null;
  let flushing = Promise.resolve();
  let pricingTable = pricing;
  const pricingNow = () => {
    if (pricingTable === undefined) {
      try { pricingTable = anviPricing(); } catch { pricingTable = null; }
    }
    return pricingTable;
  };

  function schedule() {
    if (timer) return;
    timer = timers.setTimeout(() => { timer = null; void flush(); }, flushMs);
    timer?.unref?.();
  }

  function record(usage, context = {}) {
    try {
      const tenant = context.tenant !== undefined ? context.tenant : currentTenant();
      const tenantKey = tenant?.universityId ? String(tenant.universityId) : "platform";
      const row = usageRow(usage, { ...context, tenantKey, pricing: pricingNow() }, new Date(clock.now()));
      if (!row) return false;
      if (buffered >= maxBuffered) { dropped += 1; return false; }
      let bucket = buckets.get(tenantKey);
      if (!bucket) buckets.set(tenantKey, (bucket = { tenant: tenant || null, rows: [] }));
      bucket.rows.push(row);
      buffered += 1;
      if (buffered >= FLUSH_ROWS) void flush();
      else schedule();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * A per-call onUsage handler bound to one attempt; the tenant defaults to the current context.
   * `.metric(name, n = 1, extra)` records a non-billable metric row (METRIC_NAMES) for the same attempt;
   * `extra.mode` is the budget mode for "budgetMode".
   */
  function recorder(context = {}) {
    const bound = { ...context, tenant: context.tenant !== undefined ? context.tenant : currentTenant() };
    const onUsage = (usage) => { record(usage, bound); };
    onUsage.metric = (name, n = 1, extra = {}) => record({ ...extra, kind: "metric", name, count: n }, bound);
    return onUsage;
  }

  async function write({ tenant, rows }) {
    const work = async () => {
      const key = tenant?.connection || PLATFORM;
      if (!indexed.has(key) && typeof model.createIndexes === "function") {
        indexed.add(key);
        await model.createIndexes().catch((error) => log.warn?.(`[ANVI] Usage indexes not created (${error?.name || "Error"}).`));
      }
      await model.insertMany(rows, { ordered: false });
    };
    try {
      await (tenant ? runForTenant(tenant, work) : runForPlatform(work));
    } catch (error) {
      log.warn?.(`[ANVI] ${rows.length} usage row(s) not saved (${error?.name || "Error"}).`);
    }
  }

  /** Writes everything buffered so far; resolves when those writes (and earlier ones) settle. */
  function flush() {
    if (timer) { timers.clearTimeout(timer); timer = null; }
    const pending = [...buckets.values()].filter((bucket) => bucket.rows.length);
    buckets.clear();
    buffered = 0;
    if (pending.length) flushing = flushing.then(() => Promise.all(pending.map(write))).catch(() => {});
    return flushing;
  }

  return { record, recorder, flush, stats: () => ({ buffered, dropped, scheduled: Boolean(timer) }) };
}

const noopRecorder = () => Object.assign(() => {}, { metric: () => false });
const NOOP_LEDGER = Object.freeze({ record: () => false, recorder: noopRecorder, flush: async () => {}, stats: () => ({ buffered: 0, dropped: 0, scheduled: false }) });
let shared;
// Under `node --test` the default ledger is off, so tests never write usage rows by accident; tests that
// meter inject their own ledger.
export const defaultUsageLedger = () => (shared ||= process.env.NODE_TEST_CONTEXT ? NOOP_LEDGER : createUsageLedger());
/** Fire-and-forget: records one onUsage payload into the shared ledger. */
export const recordAnviUsage = (usage, context) => defaultUsageLedger().record(usage, context);
/**
 * Writes the shared ledger's buffered rows (shutdown hooks). Idempotent: safe to call more than once,
 * and it never creates the ledger when nothing was recorded.
 */
export const flushAnviUsage = () => (shared ? shared.flush() : Promise.resolve());

// --- Report ---------------------------------------------------------------------------------------

// Kinds with a legacy per-million-token price (config.prices), listed in the report's `pricing.prices`.
const LEGACY_PRICED_KINDS = ["live", "transcribe", "generate", "evaluate"];
// The per-attempt figures read at most this many attempts (newest first).
export const USAGE_ATTEMPT_LIMIT = 5_000;
// An attempt counts as completed once it reached evaluation (with `attemptInfo`; otherwise when the
// range holds an evaluation call for it).
export const COMPLETED_ATTEMPT_STATUSES = Object.freeze(["completed", "evaluating", "ready"]);
// Warning thresholds (INR per completed attempt, the TTS cache hit rate and the lookups it needs).
export const USAGE_WARNING_DEFAULTS = Object.freeze({ avgInr: 45, p90Inr: 60, cacheHitRate: 0.6, minCacheLookups: 20 });

const NOT_METRIC = { $match: { kind: { $ne: "metric" } } };
const sums = {
  calls: { $sum: 1 },
  inputTokens: { $sum: "$inputTokens" },
  outputTokens: { $sum: "$outputTokens" },
  totalTokens: { $sum: "$totalTokens" },
  audioSeconds: { $sum: "$audioSeconds" },
  sessionSeconds: { $sum: "$sessionSeconds" },
};
// Rows priced at write time keep their stored estimate (and revision); the rest (older rows, or rows
// whose price was unknown then) are summed by token and modality and priced with today's table.
const stored = { $isNumber: "$estimatedUsd" };
const unstoredSum = (value) => ({ $sum: { $cond: [stored, 0, value] } });
const costSums = {
  storedUsd: { $sum: { $cond: [stored, "$estimatedUsd", 0] } },
  storedInr: { $sum: { $cond: [{ $and: [stored, { $isNumber: "$estimatedInr" }] }, "$estimatedInr", 0] } },
  usdWithoutInr: { $sum: { $cond: [{ $and: [stored, { $not: [{ $isNumber: "$estimatedInr" }] }] }, "$estimatedUsd", 0] } },
  repricedRows: unstoredSum(1),
  rpInput: unstoredSum("$inputTokens"),
  rpOutput: unstoredSum("$outputTokens"),
  rpInAudio: unstoredSum({ $ifNull: ["$inputByModality.AUDIO", 0] }),
  rpInText: unstoredSum({ $ifNull: ["$inputByModality.TEXT", 0] }),
  rpOutAudio: unstoredSum({ $ifNull: ["$outputByModality.AUDIO", 0] }),
  rpOutText: unstoredSum({ $ifNull: ["$outputByModality.TEXT", 0] }),
  rpAudioSeconds: unstoredSum("$audioSeconds"),
};
const groupSums = { ...sums, ...costSums };
const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;
const roundOrNull = (value, places) => (value === null ? null : round(value, places));
const plus = (total, value) => (total === null || value === null ? null : total + value);

// Cost of one group at the legacy per-million-token prices; null when a price it needs is unknown (0).
function costOf(kind, row, prices) {
  if (!BILLED_KINDS.includes(kind)) return 0;
  const price = prices?.[kind] || {};
  if ((row.inputTokens > 0 && !(price.input > 0)) || (row.outputTokens > 0 && !(price.output > 0))) return null;
  return (row.inputTokens * (price.input || 0) + row.outputTokens * (price.output || 0)) / 1_000_000;
}

// USD and INR of one {kind, ...costSums} group with the modality-aware pricing; null = unknown.
function priceGroup(kind, row, pricing) {
  if (!BILLED_KINDS.includes(kind)) return { usd: 0, inr: 0, repriced: false };
  const rate = pricing?.usdInrRate ?? null;
  let usd = row.storedUsd || 0;
  let inr = row.storedInr || 0;
  // Stored without INR (no rate when written): converted at today's rate.
  if (row.usdWithoutInr > 0) inr = rate === null ? null : inr + row.usdWithoutInr * rate;
  const repriced = row.repricedRows > 0;
  if (repriced) {
    const estimate = pricing ? pricing.estimate({
      kind,
      inputTokens: row.rpInput,
      outputTokens: row.rpOutput,
      inputByModality: { AUDIO: row.rpInAudio, TEXT: row.rpInText },
      outputByModality: { AUDIO: row.rpOutAudio, TEXT: row.rpOutText },
      audioSeconds: row.rpAudioSeconds,
    }) : { usd: null, inr: null };
    usd = plus(usd, estimate.usd);
    inr = plus(inr, estimate.inr);
  }
  return { usd, inr, repriced };
}

/** Sum of priceGroup over [{kind, ...costSums}]. */
function costTotal(rows, pricing) {
  const total = { usd: 0, inr: 0, repriced: false, unpricedKinds: new Set(), inrMissing: false };
  for (const row of rows) {
    const cost = priceGroup(row.kind, row, pricing);
    if (cost.usd === null) total.unpricedKinds.add(row.kind);
    else if (cost.inr === null) total.inrMissing = true;
    total.usd = plus(total.usd, cost.usd);
    total.inr = plus(total.inr, cost.inr);
    total.repriced ||= cost.repriced;
  }
  return total;
}
const costFields = (cost) => ({ estimatedUsd: roundOrNull(cost.usd, 6), estimatedInr: roundOrNull(cost.inr, 4), ...(cost.repriced ? { repriced: true } : {}) });

const totalsOf = (rows) => rows.reduce((total, row) => {
  for (const key of Object.keys(sums)) total[key] += row[key] || 0;
  return total;
}, { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, audioSeconds: 0, sessionSeconds: 0 });

const shape = (row, cost) => ({
  calls: row.calls,
  inputTokens: row.inputTokens,
  outputTokens: row.outputTokens,
  totalTokens: row.totalTokens,
  audioSeconds: round(row.audioSeconds),
  ...(row.sessionSeconds ? { liveMinutes: round(row.sessionSeconds / 60, 1) } : {}),
  estimatedCost: cost === null ? null : round(cost, 4),
});

/** {avg, p50, p90} by nearest rank over `values` (null for none). */
export function costDistribution(values, places = 2) {
  if (!values.length) return { avg: null, p50: null, p90: null };
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
  return { avg: round(sorted.reduce((total, value) => total + value, 0) / sorted.length, places), p50: round(rank(0.5), places), p90: round(rank(0.9), places) };
}

// Per completed attempt: USD and INR distributions over the attempts whose cost is known.
function perCompleted(attempts) {
  const completed = attempts.filter((attempt) => attempt.completed);
  const usd = completed.filter((attempt) => attempt.usd !== null).map((attempt) => attempt.usd);
  const inr = completed.filter((attempt) => attempt.inr !== null).map((attempt) => attempt.inr);
  return {
    completed: completed.length,
    priced: inr.length,
    // False while any completed attempt has an unknown USD or INR cost.
    complete: usd.length === completed.length && inr.length === completed.length,
    usd: costDistribution(usd, 6),
    inr: costDistribution(inr, 2),
  };
}
const peakModeOf = (modes) => modes.reduce((peak, mode) => {
  const index = BUDGET_MODES.indexOf(mode);
  return index > BUDGET_MODES.indexOf(peak) ? mode : peak;
}, null);
const atLeast = (mode, floor) => mode !== null && BUDGET_MODES.indexOf(mode) >= BUDGET_MODES.indexOf(floor);

/**
 * Totals by kind, model and IST day for usage rows matching `match` (already scoped by the caller), with
 * the legacy cost from `prices` ({kind: {input, output}} per million tokens; 0 = unknown) as
 * `estimatedCost`, and the modality-aware USD/INR from `pricing` (anviInterview.pricing.js) as
 * `estimatedUsd`/`estimatedInr` and the `cost` block. A null cost is unknown, never 0. Metric rows are
 * never calls and never cost; they feed `cache`/`metrics`. `attemptInfo(ids)` resolves to a Map of
 * attemptId → {status, runtimeMode, durationMinutes} for the per-attempt figures.
 */
export async function summarizeUsage(match, {
  prices = {}, currency = "USD", model = AnviUsage, maxTimeMS = 8000, pricing, attemptInfo = null,
  now = () => new Date(), warnings: warningLimits = USAGE_WARNING_DEFAULTS, attemptLimit = USAGE_ATTEMPT_LIMIT,
} = {}) {
  const table = pricing === undefined ? anviPricing() : pricing;
  const [[result = {}], perAttemptRows] = await Promise.all([
    model.aggregate([
      { $match: match },
      { $facet: {
        byKindModel: [NOT_METRIC, { $group: { _id: { kind: "$kind", model: "$model" }, ...groupSums } }, { $sort: { "_id.kind": 1, "_id.model": 1 } }],
        byDay: [
          NOT_METRIC,
          { $group: { _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$at", timezone: "Asia/Kolkata" } }, kind: "$kind", model: "$model" }, ...groupSums } },
          { $sort: { "_id.day": 1, "_id.kind": 1 } },
        ],
        attempts: [{ $match: { kind: "session", attemptId: { $ne: null } } }, { $group: { _id: "$attemptId" } }, { $count: "count" }],
        byInterview: [NOT_METRIC, { $match: { interviewId: { $ne: null } } }, { $group: { _id: { interviewId: "$interviewId", kind: "$kind", model: "$model" }, ...groupSums } }],
        metrics: [{ $match: { kind: "metric" } }, { $group: { _id: "$name", count: { $sum: "$count" } } }],
        attemptCount: [{ $match: { attemptId: { $ne: null } } }, { $group: { _id: "$attemptId" } }, { $count: "count" }],
        revisions: [{ $match: { pricingRevision: { $type: "string" } } }, { $group: { _id: "$pricingRevision", rows: { $sum: 1 } } }, { $sort: { rows: -1, _id: 1 } }, { $limit: 20 }],
      } },
    ]).option({ maxTimeMS }),
    // Per attempt and kind, then per attempt: a separate pipeline so the $facet document stays small.
    model.aggregate([
      { $match: { $and: [match, { attemptId: { $ne: null } }] } },
      { $group: { _id: { attemptId: "$attemptId", kind: "$kind" }, durationMinutes: { $max: "$durationMinutes" }, runtimeModes: { $addToSet: "$runtimeMode" }, modes: { $addToSet: "$mode" }, ...costSums } },
      { $group: { _id: "$_id.attemptId", kinds: { $push: "$$ROOT" } } },
      { $sort: { _id: -1 } },
      { $limit: attemptLimit },
    ]).option({ maxTimeMS }),
  ]);

  const groups = (result.byKindModel || []).map((row) => ({ kind: row._id.kind, model: row._id.model || "", ...row }));
  const unpriced = new Set();
  const costed = (kind, row) => {
    const cost = costOf(kind, row, prices);
    if (cost === null) unpriced.add(kind);
    return cost;
  };
  const addCost = (total, cost) => (total === null || cost === null ? null : total + cost);

  const byModel = groups.filter((row) => row.kind !== "session")
    .map((row) => ({ kind: row.kind, model: row.model, ...shape(row, costed(row.kind, row)), ...costFields(costTotal([row], table)) }));
  const kinds = [...new Set(groups.map((row) => row.kind))].filter((kind) => kind !== "session");
  const byKind = kinds.map((kind) => {
    const rows = groups.filter((row) => row.kind === kind);
    const cost = rows.reduce((total, row) => addCost(total, costOf(kind, row, prices)), 0);
    return { kind, ...shape(totalsOf(rows), cost), ...costFields(costTotal(rows, table)) };
  });

  const days = new Map();
  for (const row of result.byDay || []) {
    const day = row._id.day;
    if (!days.has(day)) days.set(day, { day, rows: [] });
    days.get(day).rows.push({ kind: row._id.kind, ...row });
  }
  const byDay = [...days.values()].map(({ day, rows }) => {
    const metered = rows.filter((row) => row.kind !== "session");
    const sessions = rows.filter((row) => row.kind === "session");
    const cost = metered.reduce((total, row) => addCost(total, costOf(row.kind, row, prices)), 0);
    const totals = totalsOf(metered);
    return {
      day,
      ...shape(totals, cost),
      ...costFields(costTotal(metered, table)),
      sessions: sessions.reduce((total, row) => total + row.calls, 0),
      liveMinutes: round(sessions.reduce((total, row) => total + row.sessionSeconds, 0) / 60, 1),
      byKind: Object.fromEntries([...new Set(metered.map((row) => row.kind))].map((kind) => {
        const own = metered.filter((row) => row.kind === kind);
        return [kind, totalsOf(own).totalTokens];
      })),
    };
  });

  // Heaviest interviews first, by tokens (a cost can be unknown while a price is missing).
  const interviews = new Map();
  for (const row of result.byInterview || []) {
    const id = String(row._id.interviewId);
    if (!interviews.has(id)) interviews.set(id, []);
    interviews.get(id).push({ kind: row._id.kind, ...row });
  }
  const byInterview = [...interviews.entries()].map(([interviewId, rows]) => {
    const meteredRows = rows.filter((row) => row.kind !== "session");
    const sessions = rows.filter((row) => row.kind === "session");
    const cost = meteredRows.reduce((total, row) => addCost(total, costOf(row.kind, row, prices)), 0);
    return {
      interviewId,
      ...shape(totalsOf(meteredRows), cost),
      ...costFields(costTotal(meteredRows, table)),
      sessions: sessions.reduce((total, row) => total + row.calls, 0),
      liveMinutes: round(sessions.reduce((total, row) => total + row.sessionSeconds, 0) / 60, 1),
    };
  }).sort((a, b) => b.totalTokens - a.totalTokens || b.sessions - a.sessions);

  const sessionRows = groups.filter((row) => row.kind === "session");
  const meteredGroups = groups.filter((row) => row.kind !== "session");
  const metered = totalsOf(meteredGroups);
  const knownCost = byModel.reduce((total, row) => total + (row.estimatedCost || 0), 0);
  const liveMinutes = round(sessionRows.reduce((total, row) => total + row.sessionSeconds, 0) / 60, 1);

  // --- Modality-aware cost, minutes, metrics and per-attempt figures.
  const total = costTotal(meteredGroups, table);
  const cost = {
    currency: "USD",
    usd: roundOrNull(total.usd, 6),
    inr: roundOrNull(total.inr, 4),
    complete: total.usd !== null && total.inr !== null,
    unpricedKinds: [...total.unpricedKinds].sort(),
    // Some USD is known but its INR is not: ANVI_USD_INR_RATE is not set.
    inrMissing: total.inrMissing,
    repriced: total.repriced,
    usdInrRate: table?.usdInrRate ?? null,
    pricingRevision: table?.revision || null,
    revisions: (result.revisions || []).map((row) => ({ revision: row._id, rows: row.rows })),
    validUntil: table?.validUntil || null,
    expired: Boolean(table?.expired?.(now())),
  };

  const audioMinutesOf = (kind) => round(groups.filter((row) => row.kind === kind).reduce((sum, row) => sum + (row.audioSeconds || 0), 0) / 60, 1);
  // Student audio is what was sent for (first-pass) transcription; an accurate retry re-sends the same audio.
  const minutes = { live: liveMinutes, studentAudio: audioMinutesOf("transcribe"), tts: audioMinutesOf("tts") };

  const metrics = Object.fromEntries(METRIC_NAMES.map((name) => [name, 0]));
  for (const row of result.metrics || []) if (METRIC_NAMES.includes(row._id)) metrics[row._id] = row.count || 0;
  const hitRate = (hits, misses) => (hits + misses > 0 ? round(hits / (hits + misses), 4) : null);
  const cache = {
    tts: { hits: metrics.ttsCacheHit, misses: metrics.ttsCacheMiss, hitRate: hitRate(metrics.ttsCacheHit, metrics.ttsCacheMiss) },
    transcript: { hits: metrics.transcriptCacheHit, misses: metrics.transcriptCacheMiss, hitRate: hitRate(metrics.transcriptCacheHit, metrics.transcriptCacheMiss) },
    avoidedTtsCalls: metrics.avoidedTtsCall,
    avoidedLiveTurns: metrics.avoidedLiveTurn,
    replays: metrics.repeatedQuestionReplay,
    liveEscalations: metrics.liveEscalation,
    accurateTranscriptionEscalations: metrics.accurateTranscriptionEscalation,
  };

  const rawAttempts = (perAttemptRows || []).map((row) => {
    const own = (row.kinds || []).map((entry) => ({ ...entry, kind: entry._id.kind }));
    const attemptCost = costTotal(own, table);
    const runtimeModes = own.flatMap((entry) => entry.runtimeModes || []);
    const durations = own.map((entry) => Number(entry.durationMinutes)).filter((value) => Number.isFinite(value) && value > 0);
    return {
      attemptId: String(row._id),
      usd: attemptCost.usd,
      inr: attemptCost.inr,
      peakMode: peakModeOf(own.flatMap((entry) => entry.modes || [])),
      runtimeMode: runtimeModes.includes("hybrid") ? "hybrid" : "live",
      durationMinutes: durations.length ? Math.max(...durations) : null,
      evaluated: own.some((entry) => entry.kind === "evaluate"),
    };
  });
  let info = new Map();
  if (attemptInfo && rawAttempts.length) {
    try { info = (await attemptInfo(rawAttempts.map((attempt) => attempt.attemptId))) || new Map(); } catch { info = new Map(); }
  }
  const attemptList = rawAttempts.map((attempt) => {
    const known = info.get(attempt.attemptId);
    const duration = Number(known?.durationMinutes);
    return {
      ...attempt,
      completed: known ? COMPLETED_ATTEMPT_STATUSES.includes(known.status) : attempt.evaluated,
      // The attempt's own runtime mode when it has one; otherwise what its rows say (absent = Live).
      runtimeMode: known?.runtimeMode ? (known.runtimeMode === "hybrid" ? "hybrid" : "live") : attempt.runtimeMode,
      durationMinutes: Number.isFinite(duration) && duration > 0 ? duration : attempt.durationMinutes,
    };
  });
  const attemptCount = result.attemptCount?.[0]?.count || 0;
  const peakModes = Object.fromEntries(BUDGET_MODES.map((mode) => [mode, attemptList.filter((attempt) => attempt.peakMode === mode).length]));
  const attempts = {
    count: attemptCount,
    analysed: attemptList.length,
    truncated: attemptCount > attemptList.length,
    completed: attemptList.filter((attempt) => attempt.completed).length,
    hybrid: attemptList.filter((attempt) => attempt.runtimeMode === "hybrid").length,
    live: attemptList.filter((attempt) => attempt.runtimeMode === "live").length,
    // Attempts whose budget reached economical (or stricter), and cached-only (or stricter).
    economical: attemptList.filter((attempt) => atLeast(attempt.peakMode, "economical")).length,
    cachedOnly: attemptList.filter((attempt) => atLeast(attempt.peakMode, "cached_only")).length,
    cachedOnlyCompleted: attemptList.filter((attempt) => attempt.completed && atLeast(attempt.peakMode, "cached_only")).length,
    peakModes,
    perCompleted: perCompleted(attemptList),
  };

  const durationGroups = new Map();
  for (const attempt of attemptList) {
    const key = attempt.durationMinutes ? durationBucket(attempt.durationMinutes) : null;
    if (!durationGroups.has(key)) durationGroups.set(key, []);
    durationGroups.get(key).push(attempt);
  }
  const byDuration = [...durationGroups.entries()].map(([durationMinutes, list]) => {
    const usd = list.reduce((sum, attempt) => plus(sum, attempt.usd), 0);
    const inr = list.reduce((sum, attempt) => plus(sum, attempt.inr), 0);
    return { durationMinutes, attempts: list.length, estimatedUsd: roundOrNull(usd, 6), estimatedInr: roundOrNull(inr, 4), perCompleted: perCompleted(list) };
  }).sort((a, b) => (a.durationMinutes ?? Infinity) - (b.durationMinutes ?? Infinity));

  const limits = { ...USAGE_WARNING_DEFAULTS, ...(warningLimits || {}) };
  const warnings = [];
  if (metered.calls > 0 && !cost.complete) warnings.push({ code: "pricesIncomplete", unpricedKinds: cost.unpricedKinds, inrMissing: cost.inrMissing });
  const inrStats = attempts.perCompleted.inr;
  if (inrStats.avg !== null && inrStats.avg > limits.avgInr) warnings.push({ code: "avgAboveInr45", value: inrStats.avg, threshold: limits.avgInr });
  if (inrStats.p90 !== null && inrStats.p90 > limits.p90Inr) warnings.push({ code: "p90AboveInr60", value: inrStats.p90, threshold: limits.p90Inr });
  const lookups = cache.tts.hits + cache.tts.misses;
  if (lookups >= limits.minCacheLookups && cache.tts.hitRate < limits.cacheHitRate) warnings.push({ code: "lowCacheHit", value: cache.tts.hitRate, threshold: limits.cacheHitRate });
  if (cost.expired) warnings.push({ code: "pricingExpired", validUntil: cost.validUntil });

  return {
    totals: {
      calls: metered.calls,
      inputTokens: metered.inputTokens,
      outputTokens: metered.outputTokens,
      totalTokens: metered.totalTokens,
      audioSeconds: round(metered.audioSeconds),
      // Sum of the priced parts; `complete` is false while any used kind has no configured price.
      estimatedCost: round(knownCost, 4),
      complete: unpriced.size === 0,
    },
    sessions: {
      count: sessionRows.reduce((total, row) => total + row.calls, 0),
      attempts: result.attempts?.[0]?.count || 0,
      liveMinutes,
    },
    byKind,
    byModel,
    byDay,
    byInterview,
    pricing: {
      currency,
      unit: "per 1M tokens",
      prices: Object.fromEntries(LEGACY_PRICED_KINDS.map((kind) => [kind, { input: prices?.[kind]?.input || 0, output: prices?.[kind]?.output || 0 }])),
      unpricedKinds: [...unpriced].sort(),
    },
    cost,
    minutes,
    cache,
    metrics,
    attempts,
    byDuration,
    warnings,
  };
}
