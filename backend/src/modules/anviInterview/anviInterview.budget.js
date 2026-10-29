import { EventEmitter } from "node:events";
import { getValkeyClient } from "../../utils/valkey.js";
import { anviConfig, budgetThresholds, liveCapSeconds as liveCapFor } from "./anviInterview.config.js";
import { anviPricing } from "./anviInterview.pricing.js";

// Real-time cost budget for one ANVI attempt. Every billed call is priced conservatively (unknown prices
// at the ceiling) and added atomically to one Valkey hash shared by every instance, so the spend survives
// reconnects and takeovers; a lease-filtered Mongo mirror ($max) reseeds the hash after an eviction. The
// spend decides a mode that only ever gets stricter, and `allow(kind)` gates the optional calls:
//   normal      everything
//   economical  accurate transcription only for unusable transcripts, dynamic follow-up TTS only when no
//               template fits, decision output capped at 60 tokens, Live within the cap
//   cached_only no Live, no dynamic TTS, no decision; static/template TTS on a cache miss still allowed
//   essential   Flash-Lite transcription and evaluation only
//   hard        evaluation only (spend >= hard - evaluation reserve)
// While Valkey is unavailable the mode is at least economical and Live is denied. Live-mode attempts are
// only observed unless budgetEnforceLive is set. Nothing here logs amounts per student, text or audio.
export const BUDGET_MODES = Object.freeze(["normal", "economical", "cached_only", "essential", "hard"]);
const RANK = Object.freeze(Object.fromEntries(BUDGET_MODES.map((mode, rank) => [mode, rank])));
const ECONOMICAL = RANK.economical;
// Totals kept per attempt: conservative usd/inr (unknown prices at the ceiling; these drive the mode), Live
// seconds, the plain estimate (estUsd/estInr, reported) and the number of calls with an unknown price.
export const BUDGET_FIELDS = Object.freeze(["usd", "inr", "liveSeconds", "estUsd", "estInr", "unknown"]);
const FIELDS = BUDGET_FIELDS;
const MIRROR_INTERVAL_MS = 5000;
const DECISION_ECONOMICAL_TOKENS = 60;

/** The Valkey hash for one attempt (the braces are placeholders, not cluster hash tags). */
export const budgetKey = (tenantKey, attemptId) => `peerprep:anvi:budget:v1:${tenantKey}:${attemptId}`;

/** The mode a spend (INR) reaches under `thresholds` (from config.budgetThresholds). */
export function modeForSpend(inr, thresholds) {
  const spent = Number(inr) || 0;
  if (spent >= thresholds.evaluationOnlyAt) return "hard";
  if (spent >= thresholds.essential) return "essential";
  if (spent >= thresholds.cachedOnly) return "cached_only";
  if (spent >= thresholds.economical) return "economical";
  return "normal";
}

// Lua shared by both scripts. ARGV[1..6] seed the totals (FIELDS order) and ARGV[7] the mode when the
// key is missing (first use, or evicted); `rankFor` maps a spend to a mode rank from 4 threshold args.
const LUA_PRELUDE = `local key = KEYS[1]
local names = {'normal', 'economical', 'cached_only', 'essential', 'hard'}
local ranks = {normal = 0, economical = 1, cached_only = 2, essential = 3, hard = 4}
local fields = {'usd', 'inr', 'liveSeconds', 'estUsd', 'estInr', 'unknown'}
if redis.call('HEXISTS', key, 'seeded') == 0 then
  redis.call('HSET', key, 'seeded', '1')
  for i = 1, 6 do redis.call('HSET', key, fields[i], ARGV[i]) end
  redis.call('HSET', key, 'mode', ARGV[7])
end
local function rankFor(spent, at)
  if spent >= tonumber(ARGV[at + 3]) then return 4 end
  if spent >= tonumber(ARGV[at + 2]) then return 3 end
  if spent >= tonumber(ARGV[at + 1]) then return 2 end
  if spent >= tonumber(ARGV[at]) then return 1 end
  return 0
end
`;

// ARGV: 1-7 seed; 8-13 deltas (FIELDS order); 14-17 thresholds (economical, cachedOnly, essential,
// evaluationOnlyAt); 18 pricing revision; 19 PEXPIRE ms. Returns the totals (FIELDS order) and the mode,
// which never relaxes.
export const ADD_SCRIPT = `${LUA_PRELUDE}local totals = {}
for i = 1, 5 do totals[i] = redis.call('HINCRBYFLOAT', key, fields[i], ARGV[7 + i]) end
totals[6] = tostring(redis.call('HINCRBY', key, 'unknown', ARGV[13]))
local rank = rankFor(tonumber(totals[2]), 14)
local current = ranks[redis.call('HGET', key, 'mode') or 'normal'] or 0
if current > rank then rank = current end
redis.call('HSET', key, 'mode', names[rank + 1])
redis.call('HSET', key, 'revision', ARGV[18])
redis.call('PEXPIRE', key, ARGV[19])
totals[7] = names[rank + 1]
return totals`;

// ARGV: 1-7 seed; 8 tick seconds; 9 cap seconds; 10-13 thresholds; 14 PEXPIRE ms. Adds the tick only
// while the mode allows Live (normal/economical) and liveSeconds + tick <= cap. Returns
// {1|0, 'ok'|'mode'|'cap', liveSeconds, mode}.
export const RESERVE_LIVE_SCRIPT = `${LUA_PRELUDE}local current = ranks[redis.call('HGET', key, 'mode') or 'normal'] or 0
local rank = rankFor(tonumber(redis.call('HGET', key, 'inr') or '0'), 10)
if current > rank then rank = current end
if rank ~= current then redis.call('HSET', key, 'mode', names[rank + 1]) end
redis.call('PEXPIRE', key, ARGV[14])
local live = redis.call('HGET', key, 'liveSeconds') or '0'
if rank > 1 then return {0, 'mode', live, names[rank + 1]} end
if tonumber(live) + tonumber(ARGV[8]) > tonumber(ARGV[9]) then return {0, 'cap', live, names[rank + 1]} end
return {1, 'ok', redis.call('HINCRBYFLOAT', key, 'liveSeconds', ARGV[8]), names[rank + 1]}`;

const zero = () => Object.fromEntries(FIELDS.map((field) => [field, 0]));
const plus = (a, b) => Object.fromEntries(FIELDS.map((field) => [field, a[field] + b[field]]));
const maxOf = (...totals) => Object.fromEntries(FIELDS.map((field) => [field, Math.max(...totals.map((t) => t[field]))]));
const isZero = (totals) => FIELDS.every((field) => !totals[field]);
const finite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};
const arg = (value) => finite(value).toFixed(10);
// Script arguments for a totals object, in FIELDS order; `unknown` is a call count (HINCRBY needs an integer).
const fieldArgs = (totals) => FIELDS.map((field) => (field === "unknown" ? String(Math.round(finite(totals[field]))) : arg(totals[field])));
const minus = (a, b) => Object.fromEntries(FIELDS.map((field) => [field, a[field] - b[field]]));
const money = (value) => Math.round(value * 1e8) / 1e8;
const totalsOf = (values) => Object.fromEntries(FIELDS.map((field, index) => [field, finite(values?.[index])]));
const isTimeout = (error) => error?.code === "DEPENDENCY_TIMEOUT" || /timed? ?out/i.test(String(error?.message || ""));

/**
 * Mongo update for the live-doc mirror: every total and the spend mode rank only ever go up ($max), so
 * concurrent or stale writers cannot lower it. The caller applies it with its lease filter.
 */
export function budgetMirrorUpdate(snapshot) {
  const max = { liveSecondsUsed: finite(snapshot.liveSeconds), "budget.modeRank": Math.max(0, Number(snapshot.spendRank) || 0) };
  for (const field of FIELDS) max[`budget.${field}`] = finite(snapshot[field]);
  return { $max: max, $set: { "budget.revision": String(snapshot.revision || "") } };
}

// The live doc's {budget, liveSecondsUsed} as totals plus the spend mode rank.
function mirrorTotals(doc) {
  const budget = doc?.budget && typeof doc.budget === "object" ? doc.budget : {};
  const totals = Object.fromEntries(FIELDS.map((field) => [field, finite(budget[field])]));
  totals.liveSeconds = Math.max(totals.liveSeconds, finite(doc?.liveSecondsUsed));
  const rank = Number(budget.modeRank);
  return { totals, rank: Number.isInteger(rank) && rank >= 0 && rank < BUDGET_MODES.length ? rank : RANK[budget.mode] || 0 };
}

/**
 * `createBudget(...)` returns the controller at once and seeds it in the background from
 * max(Valkey HGETALL, mirror.read()); `ready` resolves when seeding is done (record and reserveLive wait
 * for it). `mirror.read()` resolves to the live doc ({budget, liveSecondsUsed}); `mirror.write(update,
 * snapshot)` applies budgetMirrorUpdate() through the lease-filtered save.
 *
 * - `record(usage)` / `recordReserved(usage)`: add one billed call (an onUsage payload); never gated.
 *   recordReserved is the evaluation and plan spend path. Both resolve to the mode.
 * - `allow(kind, {unusable, templateFits})`: kinds live, transcribe, transcribe_accurate, decision, tts
 *   (dynamic or attempt-scope TTS), dynamic_follow_up, tts_static (static/template asset on a miss),
 *   generate, evaluate. Unknown kinds are allowed in normal mode only.
 * - `reserveLive(seconds = 10)`: atomically pre-charges Live seconds within the cap; false when refused.
 * - `summary()`: the attempt's `cost` at finalize. `flush()` writes the mirror now.
 * - events (`on`/`off`): `mode` {mode, previous, peakMode}.
 */
export function createBudget({
  tenantKey = "platform",
  attemptId,
  durationMinutes = null,
  liveCapSeconds = null,
  hardDeadline = null,
  config = anviConfig(),
  pricing = anviPricing(process.env, config),
  valkey = process.env.NODE_TEST_CONTEXT ? null : getValkeyClient(),
  mirror = null,
  clock = Date,
  timers = { setTimeout, clearTimeout },
  log = console,
  runtimeMode = "live",
} = {}) {
  const key = budgetKey(String(tenantKey || "platform"), String(attemptId));
  const minutes = Number(durationMinutes) > 0 ? Number(durationMinutes) : config.maxSessionMinutes;
  const thresholds = budgetThresholds(minutes, config);
  const thresholdArgs = [thresholds.economical, thresholds.cachedOnly, thresholds.essential, thresholds.evaluationOnlyAt].map(arg);
  const cap = Number.isFinite(Number(liveCapSeconds)) && liveCapSeconds !== null ? Math.max(0, Number(liveCapSeconds)) : liveCapFor(minutes, config);
  const enforced = runtimeMode === "hybrid" || Boolean(config.budgetEnforceLive);
  const rateKnown = pricing.usdInrRate !== null && pricing.usdInrRate !== undefined;
  const revision = String(pricing.revision || "");
  const deadlineMs = hardDeadline ? new Date(hardDeadline).getTime() : NaN;
  const events = new EventEmitter();

  // Totals last returned by Valkey, read from the mirror, and this instance's own view (seed + its own
  // deltas, including any whose EVAL timed out). The effective spend is the maximum of the three.
  let remote = zero();
  let mirrored = zero();
  let base = zero();
  let own = zero();
  // Deltas a definitely-failed EVAL never applied; they go with the next one. A timed-out EVAL may have
  // been applied, so its delta is never re-sent (it stays in `own` only).
  let pending = zero();
  // Deltas sent and not yet answered.
  let inflight = zero();
  let spendRank = 0;
  let peakRank = 0;
  let emittedRank = 0;
  let healthy = Boolean(valkey);
  let warned = false;
  let lastMirrorAt = -Infinity;
  let mirrorTimer = null;
  let mirrorDirty = false;
  let disposed = false;
  let seeded = false;

  const warnOnce = (error) => {
    if (warned) return;
    warned = true;
    log.warn?.(`[ANVI] Shared budget unavailable; economical mode, no Live (${error?.name || "Error"}).`);
  };
  const markUnhealthy = (error) => {
    healthy = false;
    warnOnce(error);
  };
  const effective = () => maxOf(remote, mirrored, plus(base, own));
  const ttlMs = () => {
    const now = clock.now();
    const end = Number.isFinite(deadlineMs) ? deadlineMs : now + minutes * 60_000;
    return String(Math.round(Math.max(60_000, end - now) + config.resumeWindowMinutes * 60_000 + 3_600_000));
  };
  const call = (script, args) => valkey.sendCommand(["EVAL", script, "1", key, ...args]);
  // Seed for a missing key: what this instance knows minus every delta still on its way (this one included),
  // so an eviction never counts an in-flight delta twice.
  const seedArgs = () => [...fieldArgs(maxOf(remote, mirrored, minus(plus(base, own), inflight))), BUDGET_MODES[spendRank]];

  function currentRank() {
    // Until seeding from Valkey and the mirror is done the spend so far is unknown (a rejoin may already be
    // past a threshold), so an enforced budget is at least economical (no Live) until `ready` resolves.
    const floor = enforced && (!seeded || !healthy || !rateKnown) ? ECONOMICAL : 0;
    return Math.max(spendRank, floor);
  }

  // Recomputes the monotonic spend mode, emits a change and keeps the mirror current.
  function settle() {
    const total = effective();
    spendRank = Math.max(spendRank, RANK[modeForSpend(total.inr, thresholds)]);
    const rank = currentRank();
    peakRank = Math.max(peakRank, rank);
    const changed = rank !== emittedRank;
    if (changed) {
      const previous = BUDGET_MODES[emittedRank];
      emittedRank = rank;
      events.emit("mode", { mode: BUDGET_MODES[rank], previous, peakMode: BUDGET_MODES[peakRank] });
    }
    touchMirror(changed);
  }

  function applyRemote(values, mode) {
    remote = maxOf(remote, values);
    if (RANK[mode] !== undefined) spendRank = Math.max(spendRank, RANK[mode]);
  }

  const ready = (async () => {
    const reads = await Promise.allSettled([
      valkey ? valkey.sendCommand(["HGETALL", key]) : Promise.resolve(null),
      mirror?.read ? Promise.resolve().then(() => mirror.read()) : Promise.resolve(null),
    ]);
    const [stored, doc] = reads;
    if (stored.status === "fulfilled" && stored.value) {
      const hash = Array.isArray(stored.value)
        ? Object.fromEntries(stored.value.flatMap((item, index, list) => (index % 2 ? [] : [[item, list[index + 1]]])))
        : stored.value;
      if (hash && Object.keys(hash).length) applyRemote(totalsOf(FIELDS.map((field) => hash[field])), hash.mode);
      healthy = true;
    } else if (valkey) markUnhealthy(stored.reason);
    if (doc.status === "fulfilled" && doc.value) {
      const read = mirrorTotals(doc.value);
      mirrored = read.totals;
      spendRank = Math.max(spendRank, read.rank);
    } else if (doc.status === "rejected") log.warn?.(`[ANVI] Budget mirror read failed (${doc.reason?.name || "Error"}).`);
    base = maxOf(remote, mirrored);
    seeded = true;
    settle();
  })();

  async function send(delta) {
    if (!valkey) {
      markUnhealthy(new Error("Valkey not configured"));
      return;
    }
    const sending = plus(pending, delta);
    pending = zero();
    inflight = plus(inflight, sending);
    try {
      const reply = await call(ADD_SCRIPT, [...seedArgs(), ...fieldArgs(sending), ...thresholdArgs, revision, ttlMs()]);
      applyRemote(totalsOf(reply), reply?.[6]);
      healthy = true;
    } catch (error) {
      if (!isTimeout(error)) pending = plus(pending, sending);
      markUnhealthy(error);
    } finally {
      inflight = minus(inflight, sending);
    }
  }

  async function add(usage) {
    await ready;
    const conservativeUsd = finite(pricing.conservativeUsd(usage));
    const conservativeInr = pricing.conservativeInr(usage);
    const estimate = pricing.estimate(usage) || {};
    const delta = {
      usd: conservativeUsd,
      inr: finite(conservativeInr),
      // Live-mode attempts report Live time as session rows; hybrid Live seconds come from reserveLive.
      liveSeconds: runtimeMode !== "hybrid" && usage?.kind === "session" ? finite(usage.sessionSeconds) : 0,
      estUsd: finite(estimate.usd),
      estInr: finite(estimate.inr),
      unknown: estimate.complete === false ? 1 : 0,
    };
    if (isZero(delta)) return BUDGET_MODES[currentRank()];
    own = plus(own, delta);
    settle();
    await send(delta);
    settle();
    return BUDGET_MODES[currentRank()];
  }

  function allow(kind, { unusable = false, templateFits = false } = {}) {
    if (!enforced) return true;
    const rank = currentRank();
    switch (kind) {
      case "evaluate": return true;
      case "transcribe": return rank <= RANK.essential;
      case "transcribe_accurate": return rank === RANK.normal || (rank === ECONOMICAL && unusable === true);
      case "decision": return rank <= ECONOMICAL;
      case "tts":
      case "dynamic_follow_up": return rank === RANK.normal || (rank === ECONOMICAL && !templateFits);
      case "tts_static":
      case "generate": return rank <= RANK.cached_only;
      case "live": return rank <= ECONOMICAL && seeded && healthy && rateKnown && liveRemaining() > 0;
      default: return rank === RANK.normal;
    }
  }

  const liveRemaining = () => Math.max(0, cap - effective().liveSeconds);

  async function reserveLive(seconds = 10) {
    await ready;
    const tick = finite(seconds);
    if (!tick || disposed) return false;
    if (!enforced) {
      own = plus(own, { ...zero(), liveSeconds: tick });
      settle();
      return true;
    }
    if (!valkey || spendRank > ECONOMICAL || !rateKnown || effective().liveSeconds + tick > cap) return false;
    try {
      const reply = await call(RESERVE_LIVE_SCRIPT, [...seedArgs(), arg(tick), arg(cap), ...thresholdArgs, ttlMs()]);
      healthy = true;
      remote = maxOf(remote, { ...remote, liveSeconds: finite(reply?.[2]) });
      if (RANK[reply?.[3]] !== undefined) spendRank = Math.max(spendRank, RANK[reply[3]]);
      const granted = Number(reply?.[0]) === 1;
      if (granted) own = plus(own, { ...zero(), liveSeconds: tick });
      settle();
      return granted;
    } catch (error) {
      // A timed-out reserve may have been applied: count it here (never re-sent) and refuse.
      if (isTimeout(error)) own = plus(own, { ...zero(), liveSeconds: tick });
      markUnhealthy(error);
      settle();
      return false;
    }
  }

  function snapshot() {
    const total = effective();
    return {
      ...total,
      mode: BUDGET_MODES[currentRank()],
      spendRank,
      peakMode: BUDGET_MODES[peakRank],
      healthy,
      enforced,
      revision,
      liveCapSeconds: cap,
      liveRemaining: Math.max(0, cap - total.liveSeconds),
      thresholds,
    };
  }

  function mirrorNow() {
    if (!mirror?.write) return Promise.resolve();
    lastMirrorAt = clock.now();
    mirrorDirty = false;
    const snap = snapshot();
    return Promise.resolve()
      .then(() => mirror.write(budgetMirrorUpdate(snap), snap))
      .catch((error) => log.warn?.(`[ANVI] Budget mirror write failed (${error?.name || "Error"}).`));
  }

  // At most one mirror write per 5 s, plus one on every mode change; a trailing write keeps the last state.
  function touchMirror(force) {
    if (!mirror?.write || disposed) return;
    mirrorDirty = true;
    const elapsed = clock.now() - lastMirrorAt;
    if (force || elapsed >= MIRROR_INTERVAL_MS) {
      if (mirrorTimer) timers.clearTimeout(mirrorTimer);
      mirrorTimer = null;
      mirrorNow();
      return;
    }
    if (mirrorTimer) return;
    mirrorTimer = timers.setTimeout(() => {
      mirrorTimer = null;
      if (mirrorDirty && !disposed) mirrorNow();
    }, MIRROR_INTERVAL_MS - elapsed);
    mirrorTimer?.unref?.();
  }

  function summary() {
    const total = effective();
    const complete = total.unknown === 0 && rateKnown;
    return {
      estimatedUsd: total.unknown === 0 ? money(total.estUsd) : null,
      estimatedInr: complete ? money(total.estInr) : null,
      liveSeconds: Math.round(total.liveSeconds * 100) / 100,
      mode: BUDGET_MODES[currentRank()],
      peakMode: BUDGET_MODES[peakRank],
      pricingRevision: revision || null,
      complete,
      at: new Date(clock.now()),
    };
  }

  return {
    ready,
    record: add,
    recordReserved: add,
    allow,
    reserveLive,
    liveRemaining,
    liveSeconds: () => effective().liveSeconds,
    mode: () => BUDGET_MODES[currentRank()],
    healthy: () => healthy,
    enforced,
    thresholds,
    liveCapSeconds: cap,
    /** Per-call limits that depend on the mode. */
    limits: () => ({
      decisionMaxOutputTokens: enforced && currentRank() === ECONOMICAL
        ? Math.min(DECISION_ECONOMICAL_TOKENS, config.decisionMaxOutputTokens) : config.decisionMaxOutputTokens,
    }),
    snapshot,
    summary,
    /** Writes the mirror now (finalize). */
    flush: async () => {
      await ready;
      if (mirrorTimer) timers.clearTimeout(mirrorTimer);
      mirrorTimer = null;
      await mirrorNow();
    },
    dispose() {
      disposed = true;
      if (mirrorTimer) timers.clearTimeout(mirrorTimer);
      mirrorTimer = null;
      events.removeAllListeners();
    },
    on: (event, listener) => events.on(event, listener),
    off: (event, listener) => events.off(event, listener),
  };
}
