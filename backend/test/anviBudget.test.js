import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ADD_SCRIPT, BUDGET_FIELDS, BUDGET_MODES, RESERVE_LIVE_SCRIPT, budgetKey, budgetMirrorUpdate, createBudget, modeForSpend,
} from "../src/modules/anviInterview/anviInterview.budget.js";
import { anviConfig, budgetThresholds } from "../src/modules/anviInterview/anviInterview.config.js";
import { anviPricing } from "../src/modules/anviInterview/anviInterview.pricing.js";

const CONFIG = anviConfig({});
const KEY = budgetKey("t1", "a1");
const OPTIONAL = ["live", "transcribe_accurate", "decision", "tts", "dynamic_follow_up", "tts_static", "generate"];

// A fake Valkey that interprets the two budget scripts (same ARGV layout and rules as the Lua), HGETALL
// and DEL. Every call yields first, so calls from several controllers interleave like real round trips.
function fakeValkey() {
  const hashes = new Map();
  const state = { down: false, timeoutNext: 0, calls: 0 };
  const rankFor = (spent, t) => (spent >= t[3] ? 4 : spent >= t[2] ? 3 : spent >= t[1] ? 2 : spent >= t[0] ? 1 : 0);
  const seed = (hash, argv) => {
    if (hash.seeded) return;
    hash.seeded = "1";
    BUDGET_FIELDS.forEach((field, i) => { hash[field] = argv[i]; });
    hash.mode = argv[6];
  };
  return {
    hashes,
    state,
    async sendCommand(args) {
      await Promise.resolve();
      state.calls += 1;
      if (state.down) throw new Error("Cache temporarily unavailable");
      const [command, ...rest] = args;
      if (command === "HGETALL") return Object.entries(hashes.get(rest[0]) || {}).flat();
      if (command === "DEL") return hashes.delete(rest[0]) ? 1 : 0;
      assert.equal(command, "EVAL");
      const [script, numKeys, key, ...argv] = rest;
      assert.equal(numKeys, "1");
      const hash = hashes.get(key) || {};
      hashes.set(key, hash);
      seed(hash, argv);
      let reply;
      if (script === ADD_SCRIPT) {
        assert.match(argv[12], /^\d+$/, "HINCRBY needs an integer");
        const totals = BUDGET_FIELDS.map((field, i) => {
          hash[field] = String(Number(hash[field]) + Number(argv[7 + i]));
          return hash[field];
        });
        const rank = Math.max(rankFor(Number(hash.inr), argv.slice(13, 17).map(Number)), BUDGET_MODES.indexOf(hash.mode));
        hash.mode = BUDGET_MODES[rank];
        hash.revision = argv[17];
        reply = [...totals, hash.mode];
      } else if (script === RESERVE_LIVE_SCRIPT) {
        const rank = Math.max(rankFor(Number(hash.inr), argv.slice(9, 13).map(Number)), BUDGET_MODES.indexOf(hash.mode));
        hash.mode = BUDGET_MODES[rank];
        const live = Number(hash.liveSeconds);
        if (rank > 1) reply = [0, "mode", hash.liveSeconds, hash.mode];
        else if (live + Number(argv[7]) > Number(argv[8])) reply = [0, "cap", hash.liveSeconds, hash.mode];
        else {
          hash.liveSeconds = String(live + Number(argv[7]));
          reply = [1, "ok", hash.liveSeconds, hash.mode];
        }
      } else throw new Error("unknown script");
      if (state.timeoutNext > 0) {
        state.timeoutNext -= 1;
        throw Object.assign(new Error("Cache command timed out"), { code: "DEPENDENCY_TIMEOUT" });
      }
      return reply;
    },
  };
}

// The live doc's mirror: applies the $max / $set update the way Mongo does.
function fakeMirror() {
  const doc = {};
  const mirror = {
    doc,
    writes: 0,
    read: async () => structuredClone(doc),
    write: async (update) => {
      mirror.writes += 1;
      const at = (path) => {
        const parts = path.split(".");
        let node = doc;
        for (const part of parts.slice(0, -1)) node = node[part] ??= {};
        return [node, parts.at(-1)];
      };
      for (const [path, value] of Object.entries(update.$max || {})) {
        const [node, field] = at(path);
        if (node[field] === undefined || value > node[field]) node[field] = value;
      }
      for (const [path, value] of Object.entries(update.$set || {})) {
        const [node, field] = at(path);
        node[field] = value;
      }
    },
  };
  return mirror;
}

// Pricing stub: a usage {inr, unknown} costs exactly `inr` (USD = inr / 88).
const stubPricing = (rate = 88) => ({
  revision: "test:000000000000",
  usdInrRate: rate,
  conservativeUsd: (usage) => usage.inr / 88,
  conservativeInr: (usage) => (rate === null ? null : usage.inr),
  estimate: (usage) => ({ usd: usage.unknown ? null : usage.inr / 88, inr: usage.unknown || rate === null ? null : usage.inr, complete: !usage.unknown && rate !== null }),
});
const spend = (inr, extra = {}) => ({ kind: "decision", inr, ...extra });
const quietLog = { warn: () => {} };
const fakeTimers = () => {
  const pending = [];
  return { pending, setTimeout: (fn) => { const timer = { fn }; pending.push(timer); return timer; }, clearTimeout: (timer) => { const i = pending.indexOf(timer); if (i >= 0) pending.splice(i, 1); } };
};

function budgetFor(valkey, overrides = {}) {
  return createBudget({
    tenantKey: "t1", attemptId: "a1", durationMinutes: 60, config: CONFIG, pricing: stubPricing(), valkey,
    runtimeMode: "hybrid", log: quietLog, timers: fakeTimers(), ...overrides,
  });
}

test("modeForSpend and the 60-minute thresholds are 30/40/45/55", () => {
  const thresholds = budgetThresholds(60, CONFIG);
  assert.deepEqual([thresholds.economical, thresholds.cachedOnly, thresholds.essential, thresholds.evaluationOnlyAt], [30, 40, 45, 55]);
  assert.deepEqual([0, 29.99, 30, 40, 45, 55, 60].map((inr) => modeForSpend(inr, thresholds)),
    ["normal", "normal", "economical", "cached_only", "essential", "hard", "hard"]);
});

test("concurrent adds from two controllers sum exactly", async () => {
  const valkey = fakeValkey();
  const a = budgetFor(valkey);
  const b = budgetFor(valkey);
  await Promise.all([a.ready, b.ready]);
  await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? a : b).record(spend(0.5))));
  const hash = valkey.hashes.get(KEY);
  assert.equal(Number(hash.inr), 20);
  assert.equal(Number(hash.unknown), 0);
  assert.equal(hash.revision, "test:000000000000");
  await a.record(spend(0.5));
  assert.equal(a.snapshot().inr, 20.5);
});

test("modes change at 30/40/45/55 for 60 minutes and at the scaled values for 10 minutes", async () => {
  for (const [minutes, steps] of [
    [60, [[29.5, "normal"], [0.5, "economical"], [9.5, "economical"], [0.5, "cached_only"], [5, "essential"], [9.5, "essential"], [0.5, "hard"]]],
    // 10 minutes: factor 15/60 gives 7.5 / 10 / 11.25 / 13.75.
    [10, [[7, "normal"], [0.5, "economical"], [2.5, "cached_only"], [1.25, "essential"], [2.25, "essential"], [0.25, "hard"]]],
  ]) {
    const budget = budgetFor(fakeValkey(), { durationMinutes: minutes });
    const seen = [];
    budget.on("mode", (event) => seen.push(event.mode));
    await budget.ready;
    for (const [inr, mode] of steps) assert.equal(await budget.record(spend(inr)), mode, `${minutes} min after +${inr}`);
    assert.deepEqual(seen, ["economical", "cached_only", "essential", "hard"]);
    assert.equal(budget.summary().peakMode, "hard");
  }
});

test("the mode never relaxes, locally or in the script", async () => {
  const valkey = fakeValkey();
  const budget = budgetFor(valkey);
  await budget.ready;
  await budget.record(spend(41));
  assert.equal(budget.mode(), "cached_only");
  // Another writer reseeded the key lower: the controller keeps its mode.
  valkey.hashes.set(KEY, { seeded: "1", usd: "0", inr: "1", liveSeconds: "0", estUsd: "0", estInr: "1", unknown: "0", mode: "normal" });
  await budget.record(spend(0.5));
  assert.equal(budget.mode(), "cached_only");
  assert.equal(budget.allow("decision"), false);
  // A stored strict mode survives a low spend in the script too.
  valkey.hashes.get(KEY).mode = "essential";
  const fresh = budgetFor(valkey);
  await fresh.ready;
  await fresh.record(spend(0.5));
  assert.equal(valkey.hashes.get(KEY).mode, "essential");
  assert.equal(fresh.mode(), "essential");
});

test("an evicted key is reseeded from the mirror by a new controller (AC4)", async () => {
  const valkey = fakeValkey();
  const mirror = fakeMirror();
  const first = budgetFor(valkey, { mirror });
  await first.ready;
  await first.record(spend(12));
  assert.equal(await first.reserveLive(10), true);
  await first.flush();
  assert.equal(mirror.doc.liveSecondsUsed, 10);
  assert.equal(mirror.doc.budget.inr, 12);
  first.dispose();
  valkey.hashes.delete(KEY);
  // A rejoin on another instance: Valkey is empty, the mirror has the totals.
  const second = budgetFor(valkey, { mirror });
  await second.ready;
  assert.equal(second.snapshot().inr, 12);
  assert.equal(second.liveSeconds(), 10);
  await second.record(spend(3));
  assert.equal(Number(valkey.hashes.get(KEY).inr), 15);
  assert.equal(Number(valkey.hashes.get(KEY).liveSeconds), 10);
  // The mirror's spend mode is restored too.
  mirror.doc.budget.modeRank = BUDGET_MODES.indexOf("cached_only");
  valkey.hashes.delete(KEY);
  const third = budgetFor(valkey, { mirror });
  await third.ready;
  assert.equal(third.mode(), "cached_only");
});

test("Valkey throwing gives economical, denies Live and re-sends the unapplied spend later", async () => {
  const valkey = fakeValkey();
  valkey.state.down = true;
  const budget = budgetFor(valkey);
  const seen = [];
  budget.on("mode", (event) => seen.push(event.mode));
  await budget.ready;
  assert.equal(budget.mode(), "economical");
  assert.equal(budget.healthy(), false);
  assert.equal(budget.allow("live"), false);
  assert.equal(await budget.reserveLive(10), false);
  assert.equal(budget.allow("decision"), true);
  assert.equal(budget.limits().decisionMaxOutputTokens, 60);
  assert.equal(budget.allow("transcribe_accurate"), false);
  assert.equal(budget.allow("transcribe_accurate", { unusable: true }), true);
  assert.equal(budget.allow("tts"), true);
  assert.equal(budget.allow("dynamic_follow_up", { templateFits: true }), false);
  await budget.record(spend(5));
  assert.equal(valkey.hashes.has(KEY), false);
  assert.equal(budget.snapshot().inr, 5);
  valkey.state.down = false;
  await budget.record(spend(1));
  assert.equal(Number(valkey.hashes.get(KEY).inr), 6);
  assert.equal(budget.mode(), "normal");
  assert.equal(budget.allow("live"), true);
  assert.deepEqual(seen, ["economical", "normal"]);
  // No Valkey configured at all: the same conservative mode.
  const none = budgetFor(null);
  await none.ready;
  assert.equal(none.mode(), "economical");
  assert.equal(await none.reserveLive(10), false);
});

test("a timed-out add is counted once and never re-sent", async () => {
  const valkey = fakeValkey();
  const budget = budgetFor(valkey);
  await budget.ready;
  valkey.state.timeoutNext = 1;
  await budget.record(spend(5));
  assert.equal(budget.snapshot().inr, 5);
  await budget.record(spend(1));
  assert.equal(Number(valkey.hashes.get(KEY).inr), 6);
  assert.equal(budget.snapshot().inr, 6);
  // A timed-out reserve is refused but counted locally.
  valkey.state.timeoutNext = 1;
  assert.equal(await budget.reserveLive(10), false);
  assert.equal(budget.liveSeconds(), 10);
});

test("two instances reserving 10 s ticks against a 60 s cap get exactly 6 grants (AC8)", async () => {
  const valkey = fakeValkey();
  const a = budgetFor(valkey, { liveCapSeconds: 60 });
  const b = budgetFor(valkey, { liveCapSeconds: 60 });
  await Promise.all([a.ready, b.ready]);
  const grants = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).reserveLive(10)));
  assert.equal(grants.filter(Boolean).length, 6);
  assert.equal(Number(valkey.hashes.get(KEY).liveSeconds), 60);
  assert.equal(await a.reserveLive(10), false);
  assert.equal(a.allow("live"), false);
  // The default cap comes from the duration table: 10 minutes -> 60 s.
  assert.equal(budgetFor(fakeValkey(), { durationMinutes: 10 }).liveCapSeconds, 60);
  // Live is refused once the spend reaches cached_only.
  const strict = budgetFor(fakeValkey());
  await strict.ready;
  await strict.record(spend(40));
  assert.equal(strict.allow("live"), false);
  assert.equal(await strict.reserveLive(10), false);
});

test("hard mode allows only evaluation, and the reserve is still recorded", async () => {
  const valkey = fakeValkey();
  const budget = budgetFor(valkey);
  await budget.ready;
  await budget.record(spend(55));
  assert.equal(budget.mode(), "hard");
  assert.equal(budget.allow("evaluate"), true);
  for (const kind of [...OPTIONAL, "transcribe", "something_new"]) assert.equal(budget.allow(kind), false, kind);
  assert.equal(await budget.recordReserved({ kind: "evaluate", inr: 3 }), "hard");
  assert.equal(Number(valkey.hashes.get(KEY).inr), 58);
  // Essential keeps Flash-Lite transcription and evaluation only.
  const essential = budgetFor(fakeValkey());
  await essential.ready;
  await essential.record(spend(45));
  assert.equal(essential.allow("transcribe"), true);
  assert.equal(essential.allow("evaluate"), true);
  for (const kind of OPTIONAL) assert.equal(essential.allow(kind), false, kind);
  // cached_only keeps static/template TTS on a miss, nothing dynamic.
  const cached = budgetFor(fakeValkey());
  await cached.ready;
  await cached.record(spend(40));
  assert.deepEqual(OPTIONAL.map((kind) => cached.allow(kind)), [false, false, false, false, false, true, true]);
});

test("AC13: a scripted 60-minute stream authorises no optional call after the scaled INR 45", async () => {
  for (const minutes of [60, 10]) {
    const valkey = fakeValkey();
    const budget = budgetFor(valkey, { durationMinutes: minutes });
    await budget.ready;
    const limit = budgetThresholds(minutes, CONFIG).essential;
    const cost = { live: 2.5, transcribe_accurate: 0.6, decision: 0.3, tts: 0.4, dynamic_follow_up: 0, tts_static: 0.4, generate: 0.5 };
    const late = [];
    let authorised = 0;
    // 60 one-minute turns, each trying every optional call plus a Flash-Lite transcription.
    for (let turn = 0; turn < 60; turn += 1) {
      for (const kind of OPTIONAL) {
        const before = budget.snapshot().inr;
        if (!budget.allow(kind, { unusable: turn % 3 === 0 })) continue;
        authorised += 1;
        if (before >= limit) late.push({ turn, kind, before });
        if (kind === "live") {
          if (await budget.reserveLive(10)) await budget.record(spend(cost.live));
        } else await budget.record(spend(cost[kind]));
      }
      if (budget.allow("transcribe")) await budget.record({ kind: "transcribe", inr: 0.2 });
    }
    assert.ok(authorised > 0);
    assert.deepEqual(late, []);
    assert.ok(budget.snapshot().inr >= limit, `${minutes} min stream reached the limit`);
    assert.equal(budget.allow("evaluate"), true);
    assert.ok(budget.liveSeconds() <= budget.liveCapSeconds);
  }
});

test("Live-mode attempts are observe-only unless budgetEnforceLive is set", async () => {
  const valkey = fakeValkey();
  const budget = budgetFor(valkey, { runtimeMode: "live" });
  await budget.ready;
  await budget.record(spend(100));
  await budget.record({ kind: "session", inr: 0, sessionSeconds: 42 });
  assert.equal(budget.enforced, false);
  assert.equal(budget.mode(), "hard");
  for (const kind of [...OPTIONAL, "transcribe", "evaluate"]) assert.equal(budget.allow(kind), true, kind);
  assert.equal(budget.limits().decisionMaxOutputTokens, CONFIG.decisionMaxOutputTokens);
  assert.equal(budget.summary().liveSeconds, 42);
  // Observe-only even with Valkey down.
  const down = fakeValkey();
  down.state.down = true;
  const observing = budgetFor(down, { runtimeMode: "live" });
  await observing.ready;
  assert.equal(observing.mode(), "normal");
  assert.equal(observing.allow("live"), true);
  const enforced = budgetFor(fakeValkey(), { runtimeMode: "live", config: anviConfig({ ANVI_BUDGET_ENFORCE_LIVE: "true" }) });
  await enforced.ready;
  await enforced.record(spend(41));
  assert.equal(enforced.allow("decision"), false);
});

test("summary reports null for unknown prices, never 0, with the pricing revision (AC12)", async () => {
  const unknown = budgetFor(fakeValkey());
  await unknown.ready;
  await unknown.record(spend(2));
  await unknown.record(spend(1, { unknown: true }));
  const partial = unknown.summary();
  assert.equal(partial.estimatedUsd, null);
  assert.equal(partial.estimatedInr, null);
  assert.equal(partial.complete, false);
  assert.equal(partial.pricingRevision, "test:000000000000");
  // The conservative spend still counts the unknown call.
  assert.equal(unknown.snapshot().inr, 3);

  const env = {
    ANVI_PRICE_DECISION_INPUT: "0.3", ANVI_PRICE_DECISION_OUTPUT: "2.5", ANVI_PRICE_TTS_TEXT_INPUT: "0.5",
    ANVI_USD_INR_RATE: "88", ANVI_PRICING_REVISION: "2026-10-19",
  };
  const pricing = anviPricing(env, CONFIG);
  const real = budgetFor(fakeValkey(), { pricing });
  await real.ready;
  await real.record({ kind: "decision", tokens: { input: 1000, output: 100 } });
  const complete = real.summary();
  assert.equal(complete.complete, true);
  assert.ok(Math.abs(complete.estimatedUsd - (1000 * 0.3 + 100 * 2.5) / 1e6) < 1e-9);
  assert.ok(Math.abs(complete.estimatedInr - complete.estimatedUsd * 88) < 1e-6);
  assert.equal(complete.pricingRevision, pricing.revision);
  // TTS audio output has no price here: the report is incomplete, the budget charges the ceiling.
  await real.record({ kind: "tts", tokens: { input: 20, output: 250, inputByModality: { TEXT: 20 }, outputByModality: { AUDIO: 250 } } });
  assert.equal(real.summary().estimatedUsd, null);
  assert.equal(real.summary().complete, false);
  assert.ok(real.snapshot().usd > complete.estimatedUsd);

  // Without an INR rate the enforced budget is conservative and the INR estimate is null.
  const noRate = budgetFor(fakeValkey(), { pricing: stubPricing(null) });
  await noRate.ready;
  await noRate.record(spend(1));
  assert.equal(noRate.mode(), "economical");
  assert.equal(noRate.allow("live"), false);
  assert.equal(noRate.summary().estimatedInr, null);
  assert.equal(noRate.summary().complete, false);
});

test("mirror writes are throttled to one per 5 s, forced on a mode change and at flush", async () => {
  let now = 1_000_000;
  const clock = { now: () => now };
  const timers = fakeTimers();
  const mirror = fakeMirror();
  const budget = budgetFor(fakeValkey(), { mirror, clock, timers });
  await budget.ready;
  const afterReady = mirror.writes;
  await budget.record(spend(1));
  now += 1000;
  await budget.record(spend(1));
  now += 1000;
  await budget.record(spend(1));
  assert.equal(mirror.writes - afterReady, 0);
  assert.equal(timers.pending.length, 1);
  timers.pending.shift().fn();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mirror.doc.budget.inr, 3);
  const beforeChange = mirror.writes;
  await budget.record(spend(37));
  assert.ok(mirror.writes > beforeChange, "a mode change writes at once");
  assert.equal(mirror.doc.budget.modeRank, BUDGET_MODES.indexOf("cached_only"));
  now += 100;
  await budget.record(spend(1));
  const beforeFlush = mirror.writes;
  await budget.flush();
  assert.equal(mirror.writes, beforeFlush + 1);
  assert.equal(mirror.doc.budget.inr, 41);
  budget.dispose();
  assert.equal(timers.pending.length, 0);
});

test("budgetMirrorUpdate only raises values and carries the revision", () => {
  const update = budgetMirrorUpdate({ usd: 0.1, inr: 8.8, liveSeconds: 20, estUsd: 0.1, estInr: 8.8, unknown: 0, spendRank: 1, revision: "r:1", mode: "economical" });
  assert.deepEqual(Object.keys(update), ["$max", "$set"]);
  assert.equal(update.$max.liveSecondsUsed, 20);
  assert.equal(update.$max["budget.inr"], 8.8);
  assert.equal(update.$max["budget.modeRank"], 1);
  assert.deepEqual(update.$set, { "budget.revision": "r:1" });
  assert.equal(budgetKey("t1", "a1"), "peerprep:anvi:budget:v1:t1:a1");
});
