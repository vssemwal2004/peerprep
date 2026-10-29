import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HANDBACK_PHRASE, MAX_WARMUP_SECONDS, escalationSystemText, openEscalation, saidHandback,
} from "../src/modules/anviInterview/anviInterview.liveEscalation.js";
import { ADD_SCRIPT, BUDGET_FIELDS, BUDGET_MODES, RESERVE_LIVE_SCRIPT, createBudget } from "../src/modules/anviInterview/anviInterview.budget.js";
import { createLiveCapacity } from "../src/modules/anviInterview/anviInterview.capacity.js";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";

const CONFIG = anviConfig({ ANVI_HYBRID_LIVE_ESCALATION: "true" });
const ITEM = { qid: "q1", n: 1, text: "Question 1: How does a hash map handle collisions?" };
const quietLog = { warn: () => {} };
const settle = () => new Promise((resolve) => setImmediate(resolve));

// Fake Valkey for the budget scripts (same ARGV layout and rules as the Lua), shared between instances.
function fakeValkey() {
  const hashes = new Map();
  const state = { down: false };
  const rankFor = (spent, t) => (spent >= t[3] ? 4 : spent >= t[2] ? 3 : spent >= t[1] ? 2 : spent >= t[0] ? 1 : 0);
  return {
    hashes,
    state,
    async sendCommand(args) {
      await Promise.resolve();
      if (state.down) throw new Error("Cache temporarily unavailable");
      const [command, ...rest] = args;
      if (command === "HGETALL") return Object.entries(hashes.get(rest[0]) || {}).flat();
      const [script, , key, ...argv] = rest;
      const hash = hashes.get(key) || {};
      hashes.set(key, hash);
      if (!hash.seeded) {
        hash.seeded = "1";
        BUDGET_FIELDS.forEach((field, i) => { hash[field] = argv[i]; });
        hash.mode = argv[6];
      }
      if (script === ADD_SCRIPT) {
        const totals = BUDGET_FIELDS.map((field, i) => (hash[field] = String(Number(hash[field]) + Number(argv[7 + i]))));
        hash.mode = BUDGET_MODES[Math.max(rankFor(Number(hash.inr), argv.slice(13, 17).map(Number)), BUDGET_MODES.indexOf(hash.mode))];
        return [...totals, hash.mode];
      }
      assert.equal(script, RESERVE_LIVE_SCRIPT);
      const rank = Math.max(rankFor(Number(hash.inr), argv.slice(9, 13).map(Number)), BUDGET_MODES.indexOf(hash.mode));
      hash.mode = BUDGET_MODES[rank];
      const live = Number(hash.liveSeconds);
      if (rank > 1) return [0, "mode", hash.liveSeconds, hash.mode];
      if (live + Number(argv[7]) > Number(argv[8])) return [0, "cap", hash.liveSeconds, hash.mode];
      hash.liveSeconds = String(live + Number(argv[7]));
      return [1, "ok", hash.liveSeconds, hash.mode];
    },
  };
}

const stubPricing = () => ({
  revision: "test:000000000000",
  usdInrRate: 88,
  conservativeUsd: (usage) => usage.inr / 88,
  conservativeInr: (usage) => usage.inr,
  estimate: (usage) => ({ usd: usage.inr / 88, inr: usage.inr, complete: true }),
});

// Fake clock and timers; advance() runs due timers in order and lets their async work settle.
function fakeTime(start = 1_000_000) {
  let now = start;
  let seq = 0;
  const pending = [];
  const clock = { now: () => now };
  const timers = {
    setTimeout(fn, ms) {
      const timer = { fn, at: now + Math.max(0, Number(ms) || 0), seq: seq++ };
      pending.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      const index = pending.indexOf(timer);
      if (index >= 0) pending.splice(index, 1);
    },
  };
  async function advance(ms) {
    const target = now + ms;
    for (;;) {
      pending.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = pending[0];
      if (!next || next.at > target) break;
      pending.shift();
      now = next.at;
      next.fn();
      await settle();
    }
    now = target;
    await settle();
  }
  return { clock, timers, advance, elapsed: () => now - start };
}

function fakeSession() {
  const listeners = new Map();
  const session = {
    audio: [],
    texts: [],
    closed: false,
    on(event, fn) { listeners.set(event, [...(listeners.get(event) || []), fn]); return session; },
    off() { return session; },
    emit(event, ...args) { for (const fn of listeners.get(event) || []) fn(...args); },
    sendAudio(pcm) { session.audio.push(pcm); return true; },
    sendText(text, options = {}) { session.texts.push({ text, ...options }); return true; },
    close() {
      if (session.closed) return;
      session.closed = true;
      session.emit("closed", { code: 1000, byClient: true });
    },
  };
  return session;
}

function fakeGemini({ fail = false } = {}) {
  const gemini = {
    calls: [],
    sessions: [],
    async openLive(options) {
      gemini.calls.push(options);
      if (fail) throw new Error("Live failed");
      const session = fakeSession();
      gemini.sessions.push(session);
      return session;
    },
  };
  return gemini;
}

function leaseFor(capacity) {
  return {
    acquire: (options) => capacity.acquire({ attemptId: "a1", tenantKey: "t1", ...options }),
    release: (slot) => capacity.release(slot),
  };
}

function setup({ valkey = fakeValkey(), liveCapSeconds = 60, gemini = fakeGemini(), capacity = createLiveCapacity({ client: null, log: quietLog }), config = CONFIG } = {}) {
  const time = fakeTime();
  const budget = createBudget({
    tenantKey: "t1", attemptId: "a1", durationMinutes: 60, liveCapSeconds, config: CONFIG, pricing: stubPricing(), valkey,
    runtimeMode: "hybrid", log: quietLog, clock: time.clock,
  });
  const seconds = [];
  const open = (overrides = {}) => openEscalation({
    gemini, budget, capacityLease: leaseFor(capacity), item: ITEM, reason: "conversational_section", config,
    clock: time.clock, timers: time.timers, onSeconds: (value) => seconds.push(value), ...overrides,
  });
  return { time, budget, gemini, capacity, valkey, open, seconds };
}

const voiced = (ms = 100) => {
  const pcm = Buffer.alloc((16000 * ms / 1000) * 2);
  for (let i = 0; i < pcm.length / 2; i += 1) pcm.writeInt16LE(i % 2 ? 4000 : -4000, i * 2);
  return pcm;
};
const silent = (ms = 100) => Buffer.alloc((16000 * ms / 1000) * 2);

test("the system prompt is marker-free, one question, no scores, English, with the fixed handback", () => {
  const text = escalationSystemText({ item: ITEM });
  assert.match(text, /How does a hash map handle collisions\?/);
  assert.doesNotMatch(text, /Question 1:/);
  assert.match(text, /never move on/i);
  assert.match(text, /Never give scores/);
  assert.match(text, /Speak English/);
  assert.ok(text.includes(HANDBACK_PHRASE));
  assert.equal(saidHandback("Okay. Thank you, let's continue with the interview."), true);
  assert.equal(saidHandback("lets continue with the interview"), true);
  assert.equal(saidHandback("Let's move on to the next question."), false);
});

test("refused when escalation is off: no capacity, no tick, no openLive", async () => {
  const { open, gemini, budget, capacity } = setup({ config: anviConfig({}) });
  assert.equal(await open(), null);
  assert.equal(gemini.calls.length, 0);
  assert.equal(budget.liveSeconds(), 0);
  assert.equal(capacity.count(), 0);
});

test("the cap ends the block at the next turn boundary", async () => {
  const { open, time, gemini, budget, capacity, seconds } = setup({ liveCapSeconds: 60 });
  const block = await open();
  assert.ok(block);
  assert.equal(block.capSeconds, 60);
  assert.equal(capacity.count(), 1);
  const session = gemini.sessions[0];
  assert.equal(gemini.calls[0].languageCode, "en-IN");
  assert.equal(gemini.calls[0].voice, "Aoede");
  assert.equal(session.texts[0].turnComplete, true, "kickoff asks ANVI to speak");

  await time.advance(30_000);
  assert.ok(session.texts.some((t) => t.turnComplete === false && t.text.includes(HANDBACK_PHRASE)), "wrap-up at cap - 30 s");
  await time.advance(32_000);
  assert.equal(block.open, true, "cap reached, waiting for a turn boundary");
  assert.equal(budget.liveSeconds(), 60);
  session.emit("turnComplete");
  const result = await block.done;
  assert.equal(result.endedBy, "cap");
  assert.equal(result.seconds, 62);
  assert.equal(result.reservedSeconds, 60);
  assert.equal(session.closed, true);
  assert.equal(capacity.count(), 0);
  assert.deepEqual(seconds.map((s) => s.reservedSeconds), [10, 20, 30, 40, 50, 60]);
});

test("the hard stop fires at cap + 15 s without a turn boundary", async () => {
  const { open, time, gemini, capacity } = setup({ liveCapSeconds: 60 });
  const block = await open();
  await time.advance(74_900);
  assert.equal(block.open, true);
  await time.advance(100);
  const result = await block.done;
  assert.equal(result.endedBy, "hard_stop");
  assert.equal(gemini.sessions[0].closed, true);
  assert.equal(capacity.count(), 0);
});

test("Live seconds are cumulative across 2 escalations and a new instance (AC4)", async () => {
  const valkey = fakeValkey();
  const first = setup({ valkey, liveCapSeconds: 120 });
  const one = await first.open();
  await first.time.advance(15_000);
  first.gemini.sessions[0].emit("outputText", HANDBACK_PHRASE);
  first.gemini.sessions[0].emit("turnComplete");
  assert.equal((await one.done).endedBy, "handback");
  assert.equal(first.budget.liveSeconds(), 20);

  const two = await first.open();
  await first.time.advance(25_000);
  first.gemini.sessions[1].emit("outputText", HANDBACK_PHRASE);
  first.gemini.sessions[1].emit("turnComplete");
  await two.done;
  assert.equal(first.budget.liveSeconds(), 50);

  // A reconnect on another instance: a new budget controller reads the same shared totals.
  const second = setup({ valkey, liveCapSeconds: 120 });
  await second.budget.ready;
  assert.equal(second.budget.liveSeconds(), 50);
  const three = await second.open();
  assert.equal(three.capSeconds, 70);
  await second.time.advance(90_000);
  const result = await three.done;
  assert.ok(["cap", "hard_stop"].includes(result.endedBy));
  assert.equal(Number(valkey.hashes.values().next().value.liveSeconds), 120);
  // The cap is used up: no further block opens, and Live is never called.
  assert.equal(await second.open(), null);
  assert.equal(await first.open(), null);
  assert.equal(second.gemini.calls.length, 1);
  assert.equal(first.gemini.calls.length, 2);
});

test("a refused reserve, Valkey down or a strict budget mode means no openLive (AC8)", async () => {
  const refusing = setup();
  refusing.budget.reserveLive = async () => false;
  assert.equal(await refusing.open(), null);
  assert.equal(refusing.gemini.calls.length, 0);
  assert.equal(refusing.capacity.count(), 0, "the slot is given back");

  const valkey = fakeValkey();
  valkey.state.down = true;
  const down = setup({ valkey });
  assert.equal(await down.open(), null);
  assert.equal(down.gemini.calls.length, 0);
  assert.equal(down.capacity.count(), 0);

  const noValkey = setup({ valkey: null });
  assert.equal(await noValkey.open(), null);
  assert.equal(noValkey.gemini.calls.length, 0);

  const cached = setup();
  await cached.budget.record({ kind: "decision", inr: 41 });
  assert.equal(cached.budget.mode(), "cached_only");
  assert.equal(await cached.open(), null);
  assert.equal(cached.gemini.calls.length, 0);

  const short = setup({ liveCapSeconds: 20 });
  assert.equal(await short.open(), null, "20 s or less left");
  assert.equal(short.gemini.calls.length, 0);
});

test("the slot is released when Live throws, and a full capacity charges nothing", async () => {
  const failing = setup({ gemini: fakeGemini({ fail: true }) });
  assert.equal(await failing.open(), null);
  assert.equal(failing.gemini.calls.length, 1);
  assert.equal(failing.capacity.count(), 0);

  const capacity = createLiveCapacity({ client: null, maxLiveSessions: 1, log: quietLog });
  await capacity.acquire({ attemptId: "other", tenantKey: "t1" });
  const full = setup({ capacity });
  assert.equal(await full.open(), null);
  assert.equal(full.gemini.calls.length, 0);
  assert.equal(full.budget.liveSeconds(), 0, "no tick charged without a slot");
  assert.equal(capacity.count(), 1);
});

test("goAway ends the block without refreshing", async () => {
  const { open, gemini, capacity } = setup();
  const block = await open();
  gemini.sessions[0].emit("goAway", { timeLeft: "5s" });
  const result = await block.done;
  assert.equal(result.endedBy, "go_away");
  assert.equal(gemini.calls.length, 1, "no new session");
  assert.equal(gemini.calls[0].resumeHandle, undefined);
  assert.equal(capacity.count(), 0);
});

test("question markers and move-on or closing phrases in the output are ignored", async () => {
  const { open, gemini } = setup({ liveCapSeconds: 120 });
  const captions = [];
  const block = await open({ onCaption: (caption) => captions.push(caption) });
  const session = gemini.sessions[0];
  session.emit("outputText", "Question 2: what is a heap? Let's move on to the next question. Thank you for your time, all the best.");
  session.emit("turnComplete");
  await settle();
  assert.equal(block.open, true);
  session.emit("outputText", HANDBACK_PHRASE);
  session.emit("turnComplete");
  const result = await block.done;
  assert.equal(result.endedBy, "handback");
  assert.match(result.liveText, /Question 2: what is a heap\?/);
  assert.equal(captions[0].role, "anvi");
  assert.equal(Object.hasOwn(result, "cursor"), false);
});

test("two candidate turns end the block at the turn boundary", async () => {
  const { open, gemini } = setup({ liveCapSeconds: 120 });
  const block = await open();
  const session = gemini.sessions[0];
  session.emit("inputText", "It uses chaining.");
  session.emit("turnComplete");
  await settle();
  assert.equal(block.open, true);
  session.emit("inputText", "Or open addressing.");
  session.emit("turnComplete");
  const result = await block.done;
  assert.equal(result.endedBy, "turns");
  assert.equal(result.candidateTurns, 2);
  assert.equal(result.heardText, "It uses chaining.Or open addressing.");
});

test("the budget leaving economical mode ends the block at the next turn", async () => {
  const { open, gemini, budget, time } = setup({ liveCapSeconds: 120 });
  const block = await open();
  await budget.record({ kind: "decision", inr: 41 });
  assert.equal(block.open, true);
  assert.ok(gemini.sessions[0].texts.some((t) => t.turnComplete === false), "wrap-up sent");
  await time.advance(10_000);
  assert.equal(block.reservedSeconds, 10, "no tick in cached_only");
  gemini.sessions[0].emit("turnComplete");
  assert.equal((await block.done).endedBy, "mode");
});

test("silence is forwarded only up to silenceMs + 1 s after the last voice; heard audio is returned", async () => {
  const { open, gemini, time } = setup({ liveCapSeconds: 120 });
  const block = await open({ silenceMs: 2000 });
  const session = gemini.sessions[0];
  assert.equal(block.pushAudio(silent()), false, "no silence before any voice");
  assert.equal(block.pushAudio(voiced()), true);
  for (let i = 0; i < 30; i += 1) {
    await time.advance(100);
    block.pushAudio(silent());
  }
  assert.equal(session.audio.length, 1 + 30, "3 s gate: 30 silent frames forwarded");
  await time.advance(100);
  assert.equal(block.pushAudio(silent()), false);
  assert.equal(block.pushAudio(voiced()), true, "voice always passes");
  const result = await block.stop("hold", { immediate: true });
  assert.equal(result.endedBy, "stopped");
  assert.equal(result.heardPcm.length, session.audio.reduce((sum, pcm) => sum + pcm.length, 0));
  assert.equal(block.pushAudio(voiced()), false, "closed");
});

test("a warm-up block is at most 90 s", async () => {
  const { open } = setup({ liveCapSeconds: 300 });
  const block = await open({ reason: "warmup" });
  assert.equal(block.capSeconds, MAX_WARMUP_SECONDS);
  await block.stop("done", { immediate: true });
});
