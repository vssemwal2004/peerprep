import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import AIInterview from "../src/models/AIInterview.js";
import User from "../src/models/User.js";
import { InterviewEngagementReceipt } from "../src/models/AdaptiveEngagement.js";
import { normalizeDefinition } from "../src/services/aiInterviewDefinition.js";
import { AnviAudioAsset } from "../src/modules/anviInterview/anviInterview.audio.models.js";
import { createAudioAssets } from "../src/modules/anviInterview/anviInterview.audioAssets.js";
import { ADD_SCRIPT, RESERVE_LIVE_SCRIPT, budgetKey, createBudget } from "../src/modules/anviInterview/anviInterview.budget.js";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";
import { createAnviEvaluator, scoreItem, summarizeScores } from "../src/modules/anviInterview/anviInterview.evaluation.js";
import { createHybridConductor } from "../src/modules/anviInterview/anviInterview.hybridConductor.js";
import { AnviAttempt, AnviLiveSession } from "../src/modules/anviInterview/anviInterview.models.js";
import { anviPricing } from "../src/modules/anviInterview/anviInterview.pricing.js";
import { createAnviService } from "../src/modules/anviInterview/anviInterview.service.js";
import { registerAnviSocketHandlers } from "../src/modules/anviInterview/anviInterview.socket.js";
import { createTranscripts } from "../src/modules/anviInterview/anviInterview.transcripts.js";
import { AnviUsage, createUsageLedger, summarizeUsage } from "../src/modules/anviInterview/anviInterview.usage.js";
import { gate60, pricesFor, simulateDuration } from "../scripts/anvi-cost-sim.js";

// WP20: the hybrid acceptance suite. The real service (start, plan), socket handler, hybrid conductor, audio
// asset store, transcript cache, budget and usage ledger run against an in-memory MongoDB. Only the edges are
// fake: a scripted Gemini that counts calls per kind, a Valkey that interprets the budget scripts, SET NX and
// compare-and-delete, and an R2 object store. Nudge, deadline and played timers fire only when a test fires
// them, so every step is driven by the client (prompt-played, segments) exactly as the room drives it.

// Verified 2026-10-19 prices (USD per 1M tokens) and an illustrative rate.
const PRICES = Object.freeze({
  ANVI_PRICE_LIVE_TEXT_INPUT: "0.75", ANVI_PRICE_LIVE_AUDIO_INPUT: "3", ANVI_PRICE_LIVE_AUDIO_INPUT_MINUTE: "0.005",
  ANVI_PRICE_LIVE_TEXT_OUTPUT: "4.5", ANVI_PRICE_LIVE_AUDIO_OUTPUT: "12", ANVI_PRICE_LIVE_AUDIO_OUTPUT_MINUTE: "0.018",
  ANVI_PRICE_TRANSCRIBE_INPUT: "0.3", ANVI_PRICE_TRANSCRIBE_OUTPUT: "2.5", ANVI_PRICE_TRANSCRIBE_ACCURATE_AUDIO_MINUTE: "0.005",
  ANVI_PRICE_GENERATE_INPUT: "0.3", ANVI_PRICE_GENERATE_OUTPUT: "2.5", ANVI_PRICE_DECISION_INPUT: "0.3", ANVI_PRICE_DECISION_OUTPUT: "2.5",
  ANVI_PRICE_EVALUATE_INPUT: "0.75", ANVI_PRICE_EVALUATE_OUTPUT: "3.75", ANVI_PRICE_TTS_TEXT_INPUT: "0.5", ANVI_PRICE_TTS_AUDIO_OUTPUT: "9",
  ANVI_USD_INR_RATE: "88", ANVI_PRICING_REVISION: "2026-10-19", ANVI_PRICING_VALID_UNTIL: "2026-12-31",
});
const HYBRID_ENV = Object.freeze({
  ...PRICES, GEMINI_API_KEY: "test-key", ANVI_HYBRID_ENABLED: "true", ANVI_HYBRID_ROLLOUT_PERCENT: "100", ANVI_HYBRID_MODES: "practice",
  ANVI_MAX_SESSION_MINUTES: "60", ANVI_TTS_MIN_WPM: "110",
});
const SAMPLE_RATE_IN = 16000;
const settle = async (rounds = 6) => { for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
const words = (text) => String(text).trim().split(/\s+/).filter(Boolean).length;

let mongo;
let skipped = false;

before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1", launchTimeout: 60_000 } }); }
  catch (error) { if (error?.code === "EPERM") { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: "anvi_hybrid_acceptance" });
  await Promise.all([AIInterview.init(), AnviAttempt.init(), AnviLiveSession.init(), AnviAudioAsset.init(), AnviUsage.init(), InterviewEngagementReceipt.init()]);
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

const skipIf = (t) => { if (skipped) { t.skip("mongodb-memory-server unavailable"); return true; } return false; };

// --- Edges -------------------------------------------------------------------------------------------

// One Valkey shared by every "instance": strings (transcripts, TTS locks), hashes (the budget, with the two
// scripts interpreted like the Lua) and DEL. `down` makes every command throw.
function fakeValkey() {
  const strings = new Map();
  const hashes = new Map();
  const state = { down: false, commands: [] };
  const rankFor = (spent, t) => (spent >= t[3] ? 4 : spent >= t[2] ? 3 : spent >= t[1] ? 2 : spent >= t[0] ? 1 : 0);
  const MODES = ["normal", "economical", "cached_only", "essential", "hard"];
  const FIELDS = ["usd", "inr", "liveSeconds", "estUsd", "estInr", "unknown"];
  return {
    strings, hashes, state,
    async sendCommand(args) {
      await Promise.resolve();
      state.commands.push(args[0]);
      if (state.down) throw new Error("Cache temporarily unavailable");
      const [command, ...rest] = args;
      if (command === "GET") return strings.get(rest[0]) ?? null;
      if (command === "SET") {
        const [key, value, ...flags] = rest;
        if (flags.includes("NX") && strings.has(key)) return null;
        strings.set(key, value);
        return "OK";
      }
      if (command === "DEL" || command === "UNLINK") {
        let removed = 0;
        for (const key of rest) removed += Number(strings.delete(key)) + Number(hashes.delete(key));
        return removed;
      }
      if (command === "HGETALL") return Object.entries(hashes.get(rest[0]) || {}).flat();
      if (command === "PEXPIRE" || command === "EXPIRE") return 1;
      if (command !== "EVAL") throw new Error(`unexpected ${command}`);
      const [script, , key, ...argv] = rest;
      if (script !== ADD_SCRIPT && script !== RESERVE_LIVE_SCRIPT) {
        // The TTS lock's compare-and-delete.
        if (strings.get(key) === argv[0]) { strings.delete(key); return 1; }
        return 0;
      }
      const hash = hashes.get(key) || {};
      hashes.set(key, hash);
      if (!hash.seeded) {
        hash.seeded = "1";
        FIELDS.forEach((field, i) => { hash[field] = argv[i]; });
        hash.mode = argv[6];
      }
      if (script === ADD_SCRIPT) {
        const totals = FIELDS.map((field, i) => { hash[field] = String(Number(hash[field]) + Number(argv[7 + i])); return hash[field]; });
        hash.mode = MODES[Math.max(rankFor(Number(hash.inr), argv.slice(13, 17).map(Number)), MODES.indexOf(hash.mode))];
        hash.revision = argv[17];
        return [...totals, hash.mode];
      }
      hash.mode = MODES[Math.max(rankFor(Number(hash.inr), argv.slice(9, 13).map(Number)), MODES.indexOf(hash.mode))];
      const live = Number(hash.liveSeconds);
      if (MODES.indexOf(hash.mode) > 1) return [0, "mode", hash.liveSeconds, hash.mode];
      if (live + Number(argv[7]) > Number(argv[8])) return [0, "cap", hash.liveSeconds, hash.mode];
      hash.liveSeconds = String(live + Number(argv[7]));
      return [1, "ok", hash.liveSeconds, hash.mode];
    },
  };
}

function fakeStorage() {
  const objects = new Map();
  const state = { failing: false, puts: 0, gets: 0 };
  const guard = () => { if (state.failing) throw Object.assign(new Error("R2 down"), { code: "ANVI_AUDIO_UNAVAILABLE" }); };
  return {
    ready: true, objects, state,
    async put(key, buffer) { guard(); state.puts += 1; objects.set(key, Buffer.from(buffer)); return { size: buffer.length }; },
    async get(key) { guard(); state.gets += 1; return objects.get(key) || null; },
    async head(key) { guard(); return objects.has(key) ? { size: objects.get(key).length } : null; },
    async copy(source, target) { guard(); if (!objects.has(source)) throw Object.assign(new Error("missing"), { code: "ANVI_AUDIO_COPY_FAILED" }); objects.set(target, objects.get(source)); return true; },
    async remove(key) { objects.delete(key); return true; },
  };
}

// 24 kHz TTS audio speaking `count` words at `pace` wpm, with 300 ms of silence either side.
function tone(count, pace = 150) {
  const voiced = Math.max(2400, Math.round((count / pace) * 60 * 24000));
  const pad = 7200;
  const pcm = Buffer.alloc((voiced + 2 * pad) * 2);
  for (let i = 0; i < voiced; i += 1) pcm.writeInt16LE(i % 2 ? 4000 : -4000, (pad + i) * 2);
  return pcm;
}

class FakeLive extends EventEmitter {
  constructor(options) { super(); Object.assign(this, { options, texts: [], closed: false }); }
  sendAudio() { return true; }
  sendText(text) { this.texts.push(text); return true; }
  close() { if (this.closed) return; this.closed = true; this.emit("closed", { code: 1000, reason: "", byClient: true }); }
}

/**
 * Scripted Gemini. Student speech is registered with `say(text)`, which returns unique 16 kHz PCM; the
 * transcription of that PCM (by its hash) is the registered text. Every call reports usage the way the real
 * client does (onUsage), so the ledger and the budget are charged. `counts` is per kind.
 */
function scriptedGemini({ decide = defaultDecide } = {}) {
  const counts = { transcribe: 0, transcribe_accurate: 0, decision: 0, tts: 0, evaluate: 0, generate: 0, live: 0 };
  const speech = new Map();
  const decisions = [];
  const sessions = [];
  let seed = 0;
  return {
    counts, decisions, sessions,
    configured: true,
    say(text, seconds = 3.2) {
      seed += 1;
      const samples = Math.round(seconds * SAMPLE_RATE_IN);
      const pcm = Buffer.alloc(samples * 2);
      const period = 5 + (seed % 7);
      for (let i = 0; i < samples; i += 1) pcm.writeInt16LE(Math.round(Math.sin(i / period) * 8000) + (i === 0 ? seed : 0), i * 2);
      speech.set(sha(pcm), text);
      return pcm;
    },
    async transcribeAudio({ pcm, kind = "transcribe", model, onUsage }) {
      counts[kind] = (counts[kind] || 0) + 1;
      const audioSeconds = pcm.length / (SAMPLE_RATE_IN * 2);
      const text = speech.get(sha(pcm)) ?? "";
      const audio = Math.round(audioSeconds * 25);
      const tokens = { input: audio + 150, output: words(text) * 2 + 5, inputByModality: { AUDIO: audio, TEXT: 150 } };
      onUsage?.({ kind, model: model || "gemini-3.5-flash-lite", tokens, audioSeconds });
      return { text, model: model || "gemini-3.5-flash-lite", attempts: 1, audioSeconds, tokens: { input: tokens.input, output: tokens.output } };
    },
    async transcribePcm() { return ""; },
    async generateJson(options = {}) {
      const text = options.parts?.[0]?.text || "";
      if (options.usageKind === "decision") {
        counts.decision += 1;
        const transcript = (text.match(/<candidate_transcript>([\s\S]*?)<\/candidate_transcript>/) || [])[1] || "";
        const value = decide(transcript);
        decisions.push(value.action);
        options.onUsage?.({ kind: "decision", model: "gemini-3.5-flash-lite", tokens: { input: Math.ceil(text.length / 4), output: 40, inputByModality: { TEXT: Math.ceil(text.length / 4) } } });
        return options.withMeta ? { value, model: "gemini-3.5-flash-lite" } : value;
      }
      const items = text.match(/<items>([\s\S]*)<\/items>/);
      if (items) {
        counts.evaluate += 1;
        options.onUsage?.({ kind: "evaluate", model: "gemini-3.6-flash", tokens: { input: 3000, output: 600, inputByModality: { TEXT: 3000 } } });
        const value = { items: JSON.parse(items[1]).map((item) => ({
          qid: item.qid, keyPoints: (item.keyPoints || []).map((point) => ({ index: point.index, verdict: "matched" })), relevanceLevel: 3,
          rubric: [{ id: "r1", level: 3 }], feedback: "You gave a clear answer.", strengths: ["Clear"], improvements: ["Add an example"],
        })) };
        return options.withMeta ? { value, model: "gemini-3.6-flash" } : value;
      }
      counts.generate += 1;
      options.onUsage?.({ kind: "generate", model: "gemini-3.5-flash-lite", tokens: { input: 800, output: 200, inputByModality: { TEXT: 800 } } });
      return { questions: [{ text: "How would you index a large SQL table?", keyPoints: ["B-tree", "selectivity"] }] };
    },
    async synthesizeSpeech({ text, model, onUsage }) {
      counts.tts += 1;
      const pcm = tone(words(text));
      const audioSeconds = pcm.length / 48000;
      onUsage?.({ kind: "tts", model, audioSeconds, tokens: { input: words(text) * 2, output: Math.round(audioSeconds * 25), inputByModality: { TEXT: words(text) * 2 }, outputByModality: { AUDIO: Math.round(audioSeconds * 25) } } });
      return { pcm, sampleRate: 24000, model };
    },
    async openLive(options) { counts.live += 1; const live = new FakeLive(options); sessions.push(live); return live; },
  };
}

const FOLLOW_UP = "Can you give one concrete example of that?";
// The decision model asks one follow-up on an answer that mentions sessions, otherwise moves on.
function defaultDecide(transcript) {
  if (/sessions?/i.test(transcript)) return { action: "dynamic_follow_up", question: FOLLOW_UP, reasonCode: "missing_key_point", missingKeyPoints: [], confidence: 0.8 };
  return { action: "next", reasonCode: "complete", missingKeyPoints: [], confidence: 0.9 };
}

function fakeTimers() {
  const pending = new Set();
  return {
    pending,
    setTimeout(fn, ms) { const timer = { fn, ms: Number(ms) || 0, unref() { return timer; }, ref() { return timer; } }; pending.add(timer); return timer; },
    clearTimeout(timer) { pending.delete(timer); },
    // Fires (once) every pending timer whose delay matches.
    fire(match) { for (const timer of [...pending]) if (match(timer.ms)) { pending.delete(timer); timer.fn(); } },
  };
}

// Never a transcript, a question, a key or audio in the logs.
function spyLog() {
  const lines = [];
  const take = (...args) => lines.push(args.map((arg) => (arg instanceof Error ? arg.message : typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  return { lines, warn: take, info: take, error: take, log: take };
}

class FakeSocket {
  constructor(userId, { autoplay = true } = {}) {
    Object.assign(this, { userId: String(userId), universityId: "platform", userRole: "student", connected: true, handlers: new Map(), sent: [], autoplay });
  }
  on(event, fn) { this.handlers.set(event, fn); }
  emit(event, payload) {
    this.sent.push({ event, payload });
    if (!this.autoplay || !this.connected) return;
    // The room: a prompt with clips is played and acked; a replay of a decoded clip is acked too.
    if (event === "anvi:prompt" && payload?.assetIds?.length) setImmediate(() => this.call("anvi:prompt-played", { turnId: payload.turnId, ok: true }));
    if (event === "anvi:replay") setImmediate(() => this.call("anvi:replayed", { turnId: payload.turnId }));
  }
  call(event, payload) { return new Promise((resolve) => this.handlers.get(event)(payload, resolve)); }
  got(event) { return this.sent.filter((entry) => entry.event === event).map((entry) => entry.payload); }
  mark() { return this.sent.length; }
  since(mark, event) { return this.sent.slice(mark).filter((entry) => entry.event === event).map((entry) => entry.payload); }
  disconnect() { this.connected = false; this.handlers.get("disconnect")?.("transport close"); }
}

function fakeIo() {
  const listeners = [];
  return { on(event, fn) { if (event === "connection") listeners.push(fn); }, connect(socket) { for (const fn of listeners) fn(socket); return socket; } };
}

async function until(check, label, tries = 400) {
  for (let i = 0; i < tries; i += 1) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

// --- The stack ----------------------------------------------------------------------------------------

const definitionOf = ({ minutes = 10, proctoring = false } = {}) => normalizeDefinition({
  title: "Backend practice", role: "Backend engineer", experience: "fresher", difficulty: "medium",
  rules: { language: "English", responseSeconds: 90 },
  interviewer: { profileId: "p1", displayName: "ANVI", tone: "Friendly" },
  anvi: {
    durationMinutes: minutes,
    proctoring: proctoring ? { enabled: true, fullscreen: "required", pauseOutsideFullscreen: true, maxViolations: 0 } : { enabled: false },
  },
  sections: [{
    id: "s1", name: "Technical", weight: 100, groups: [{ id: "g1", name: "Core", weight: 100, source: "manual", questions: [
      { id: "q1", kind: "specific", prompt: "Explain what makes a REST API stateless.", expectedAnswer: "Each request carries its own state. No server sessions.", maxFollowUps: 1 },
      { id: "q2", kind: "specific", prompt: "How would you decide what to cache in a web application?", expectedAnswer: "Hot reads. Expiry with a TTL." },
      { id: "q3", kind: "specific", prompt: "Explain how a database index speeds up reads.", expectedAnswer: "A B-tree lookup. Fewer pages scanned." },
      { id: "q4", kind: "specific", prompt: "What is the difference between a process and a thread?", expectedAnswer: "Separate memory. Shared memory." },
    ] }],
  }],
  rubric: [{ id: "r1", name: "Clarity", weight: 100 }],
});

/**
 * Boots one "process": service, socket handlers and their shared edges. `shared` passes edges (valkey,
 * storage, gemini) from another boot to model a second instance.
 */
async function boot({ env = HYBRID_ENV, decide, shared = null, clean = true } = {}) {
  if (clean) await AnviAudioAsset.deleteMany({});
  const config = anviConfig(env);
  const pricing = anviPricing(env, config);
  const valkey = shared?.valkey || fakeValkey();
  const storage = shared?.storage || fakeStorage();
  const gemini = shared?.gemini || scriptedGemini({ decide });
  const log = spyLog();
  const timers = fakeTimers();
  const audioAssets = createAudioAssets({ gemini, storage, valkey, config, log });
  const usage = createUsageLedger({ pricing, log, timers: { setTimeout: () => 0, clearTimeout() {} } });
  const budgets = [];
  const makeBudget = (options) => { const budget = createBudget({ ...options, valkey, pricing }); budgets.push(budget); return budget; };
  const triggered = [];
  const evaluateSoon = (attemptId) => { triggered.push(String(attemptId)); return null; };
  const service = createAnviService({ gemini, config, evaluateSoon, usage, pricing, audioStorage: storage, audioAssets, createBudget: makeBudget, log });
  const io = fakeIo();
  const conductors = [];
  const handlers = registerAnviSocketHandlers(io, {
    gemini, config, timers, log, evaluateSoon, usage, createBudget: makeBudget, getTenant: async () => null,
    scheduling: { practiceBlocked: async () => false, onAttemptFinalized: async () => {} },
    // The real hybrid conductor, with this process's asset store and a transcript cache on the shared Valkey.
    createHybridConductor: (options) => {
      const conductor = createHybridConductor({ ...options, audioAssets, transcripts: createTranscripts({ gemini: options.gemini, valkey, config: options.config, log }) });
      conductors.push(conductor);
      return conductor;
    },
  });
  return { env, config, pricing, valkey, storage, gemini, log, timers, audioAssets, usage, budgets, triggered, service, io, handlers, conductors };
}

async function addStudent() {
  const id = new mongoose.Types.ObjectId();
  await User.collection.insertOne({ _id: id, name: "Asha Verma", role: "student", isActive: true, accessScope: "full", college: "GEU" });
  return { _id: id, role: "student", accessScope: "full", college: "GEU" };
}

async function publish(definition = definitionOf()) {
  return AIInterview.create({
    ownerId: new mongoose.Types.ObjectId(), creationKey: `acceptance-${randomUUID()}`, title: definition.title, role: definition.role, data: definition,
    publishedSnapshot: { data: definition, revision: 1, at: new Date() }, publishedAt: new Date(), publishedRevision: 1,
  });
}

/** Starts an attempt and joins it from a new socket. */
async function startAndJoin(stack, interview, { student, autoplay = true, clientId } = {}) {
  const who = student || await addStudent();
  const started = await stack.service.startAttempt(who, String(interview._id), {});
  const socket = stack.io.connect(new FakeSocket(who._id, { autoplay }));
  const joined = await socket.call("anvi:join", { attemptId: started.id, ...(clientId ? { clientId } : {}) });
  assert.equal(joined.ok, true, joined.message);
  return { student: who, attemptId: started.id, socket, joined };
}

const listeningTurns = (socket, mark = 0) => socket.since(mark, "anvi:turn").filter((turn) => turn.state === "listening" && turn.turnId);

/** Waits for the next listening turn after `mark` (a question, follow-up or clarify). */
async function nextListening(socket, mark) {
  return until(() => listeningTurns(socket, mark).at(-1), "a listening turn");
}

/** Streams `pcm` as one segment of `turnId` (32 000-byte chunks), then commits it. */
async function sendSegment(socket, turnId, pcm, { segmentId = randomUUID(), part = 0, final = true } = {}) {
  for (let offset = 0, index = 0; offset < pcm.length; offset += 32_000, index += 1) {
    const chunk = await socket.call("anvi:seg-chunk", { turnId, segmentId, part, index, pcm: pcm.subarray(offset, offset + 32_000) });
    assert.equal(chunk.ok, true, `chunk ${index}: ${chunk.code}`);
  }
  return socket.call("anvi:seg-commit", { turnId, segmentId, part, final, totalBytes: pcm.length, durationMs: Math.round((pcm.length / 32_000) * 1000) });
}

/** Answers the current listening turn and waits until ANVI has issued the next prompt. */
async function answer(stack, socket, text, { seconds = 3.2 } = {}) {
  const mark = socket.mark();
  const turnId = listeningTurns(socket).at(-1)?.turnId || (await nextListening(socket, 0)).turnId;
  const commit = await sendSegment(socket, turnId, stack.gemini.say(text, seconds));
  assert.equal(commit.ok, true, commit.code);
  await until(() => socket.since(mark, "anvi:prompt").length || socket.since(mark, "anvi:ended").length, "the next prompt");
  return { mark, turnId, commit };
}

// A counter once it stops changing (background work has settled).
async function stableCount(read) {
  let last = read();
  for (let still = 0; still < 10;) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const now = read();
    still = now === last ? still + 1 : 0;
    last = now;
  }
  return last;
}

const ended = (socket) => until(() => socket.got("anvi:ended").at(-1), "the end");
// A simulated billed call costing `inr` at the test prices (evaluation input, USD 0.75/M at 88 INR/USD).
const spendTo = (inr) => {
  const tokens = Math.max(1, Math.ceil(inr / (0.75e-6 * 88)));
  return { kind: "evaluate", tokens: { input: tokens, output: 0, inputByModality: { TEXT: tokens } } };
};
const flushLedger = async (stack) => { await settle(); await stack.usage.flush(); };

// --- Acceptance criteria ------------------------------------------------------------------------------

test("AC1: the same question for two students causes one TTS generation (static and template audio is shared)", async (t) => {
  if (skipIf(t)) return;
  const stack = await boot();
  const interview = await publish();
  const first = await startAndJoin(stack, interview);
  const firstQuestion = await nextListening(first.socket, 0);
  const prompt = first.socket.got("anvi:prompt").find((entry) => entry.kind === "question");
  assert.equal(prompt.questionNumber, 1);
  assert.equal(prompt.assetIds.length, 2, "number clip + question clip");
  assert.ok(firstQuestion.turnId);
  // The first student's background preloads (templates, the next question) finish first.
  const ttsAfterFirst = await stableCount(() => stack.gemini.counts.tts);
  assert.ok(ttsAfterFirst > 0);

  const second = await startAndJoin(stack, interview);
  await nextListening(second.socket, 0);
  await stableCount(() => stack.gemini.counts.tts);
  const secondPrompt = second.socket.got("anvi:prompt").find((entry) => entry.kind === "question");
  assert.deepEqual(secondPrompt.assetIds, prompt.assetIds, "the same assets for the same line");
  assert.equal(stack.gemini.counts.tts, ttsAfterFirst, "no TTS call for the second student");
  // Both students received the bytes, over their own sockets.
  for (const socket of [first.socket, second.socket]) {
    const clips = new Set(socket.got("anvi:clip").map((clip) => clip.assetId));
    for (const id of prompt.assetIds) assert.ok(clips.has(id));
  }
  const rows = await AnviAudioAsset.find({ interviewId: interview._id }).lean();
  assert.ok(rows.length >= 1 && rows.every((row) => row.scope === "revision" && row.status === "ready"));
  assert.equal(JSON.stringify(rows).includes("stateless"), false, "asset rows hold no text");
});

test("AC2: concurrent misses on two instances make one TTS call per line", async (t) => {
  if (skipIf(t)) return;
  const one = await boot();
  const two = await boot({ shared: one, clean: false });
  const interview = await publish();
  const [a, b] = await Promise.all([startAndJoin(one, interview), startAndJoin(two, interview)]);
  await Promise.all([nextListening(a.socket, 0), nextListening(b.socket, 0)]);
  await settle(20);
  const ready = await AnviAudioAsset.countDocuments({ status: "ready" });
  assert.equal(one.gemini.counts.tts, ready, "one synthesize per distinct asset across both instances");
  assert.equal([...one.valkey.strings.keys()].filter((key) => key.includes(":tts-lock:")).length, 0, "every lock is released");
});

test("AC3: \"repeat the question\" replays the decoded clip with no TTS, Live or decision call", async (t) => {
  if (skipIf(t)) return;
  const stack = await boot();
  const { socket } = await startAndJoin(stack, await publish());
  const turn = await nextListening(socket, 0);
  const question = socket.got("anvi:prompt").filter((entry) => entry.kind === "question").at(-1);
  await stableCount(() => stack.gemini.counts.tts);
  const before = { ...stack.gemini.counts };
  const mark = socket.mark();
  const commit = await sendSegment(socket, turn.turnId, stack.gemini.say("Could you repeat the question?", 1.5));
  assert.equal(commit.ok, true);
  const replay = await until(() => socket.since(mark, "anvi:replay").at(-1), "the replay");
  assert.equal(replay.assetId, question.assetIds[1], "the question clip itself, not the number clip");
  assert.equal(stack.gemini.counts.tts, before.tts);
  assert.equal(stack.gemini.counts.live, 0);
  assert.equal(stack.gemini.counts.decision, before.decision);
  assert.equal(socket.since(mark, "anvi:clip").filter((clip) => clip.assetId === replay.assetId).length, 0, "the clip's bytes are not sent again");
  // Back to listening on the same question; the command is not the answer.
  await until(() => listeningTurns(socket, mark).length, "listening again");
  await flushLedger(stack);
  const replays = await AnviUsage.countDocuments({ kind: "metric", name: "repeatedQuestionReplay", attemptId: { $ne: null } });
  assert.ok(replays >= 1);
});

test("AC4: a reconnect on another instance keeps the Live seconds and the spend (Valkey, then the mirror)", async (t) => {
  if (skipIf(t)) return;
  const one = await boot();
  const two = await boot({ shared: one, clean: false });
  const interview = await publish();
  const { student, attemptId, socket } = await startAndJoin(one, interview, { clientId: "client-aaaa-1111" });
  await nextListening(socket, 0);
  const budget = one.handlers.holders.get(attemptId).budget;
  assert.equal(await budget.reserveLive(10), true);
  await budget.recordReserved({ kind: "evaluate", tokens: { input: 100_000, output: 0, inputByModality: { TEXT: 100_000 } } });
  await budget.flush();
  const spent = budget.snapshot();
  assert.ok(spent.inr > 6);

  socket.disconnect();
  await settle(20);
  const again = two.io.connect(new FakeSocket(student._id));
  assert.equal((await again.call("anvi:join", { attemptId, clientId: "client-aaaa-1111" })).ok, true);
  const rejoined = two.handlers.holders.get(attemptId).budget;
  await rejoined.ready;
  assert.ok(rejoined.snapshot().inr >= spent.inr, "the spend is seeded from Valkey");
  assert.equal(rejoined.liveSeconds(), 10);
  await nextListening(again, 0);

  // An evicted Valkey hash reseeds from the live-doc mirror ($max).
  again.disconnect();
  await settle(20);
  one.valkey.hashes.delete(budgetKey("platform", attemptId));
  const third = one.io.connect(new FakeSocket(student._id));
  assert.equal((await third.call("anvi:join", { attemptId, clientId: "client-aaaa-1111" })).ok, true);
  const reseeded = one.handlers.holders.get(attemptId).budget;
  await reseeded.ready;
  assert.ok(reseeded.snapshot().inr >= spent.inr - 1e-6, "the mirror keeps the spend");
  assert.equal(reseeded.liveSeconds(), 10);
});

test("AC5: an identical re-upload is not transcribed twice (duplicate segment and identical audio)", async (t) => {
  if (skipIf(t)) return;
  const stack = await boot();
  const { socket } = await startAndJoin(stack, await publish());
  const turn = await nextListening(socket, 0);
  const pcm = stack.gemini.say("A REST call carries all its own state in every request it makes.");
  const first = { segmentId: randomUUID(), part: 0, final: false };
  assert.equal((await sendSegment(socket, turn.turnId, pcm, first)).ok, true);
  await until(() => stack.gemini.counts.transcribe === 1, "the first transcription");
  // The client outbox resends the same segment after a blip: acked as a duplicate.
  const resent = await socket.call("anvi:seg-commit", { turnId: turn.turnId, ...first, totalBytes: pcm.length, durationMs: 3200 });
  assert.deepEqual(resent, { ok: true, duplicate: true });
  // The same audio again under a new segment id: the transcript cache answers.
  const mark = socket.mark();
  assert.equal((await sendSegment(socket, turn.turnId, Buffer.from(pcm), { part: 1, final: true })).ok, true);
  await until(() => socket.since(mark, "anvi:prompt").length, "the next prompt");
  assert.equal(stack.gemini.counts.transcribe, 1, "one transcription for identical audio");
  assert.equal(stack.gemini.counts.transcribe_accurate, 0);
  const keys = [...stack.valkey.strings.keys()].filter((key) => key.startsWith("peerprep:anvi:transcript:v1:"));
  assert.equal(keys.length, 1);
});

test("AC6: no cross-student leakage of attempt audio, transcripts or caption text", async (t) => {
  if (skipIf(t)) return;
  const stack = await boot();
  const interview = await publish();
  const a = await startAndJoin(stack, interview);
  await nextListening(a.socket, 0);
  await answer(stack, a.socket, "Stateless means the server keeps no sessions between requests at all.");
  const followUp = await until(() => a.socket.got("anvi:prompt").find((entry) => entry.kind === "follow_up" && entry.assetIds.length === 2), "the voiced follow-up");
  const personal = followUp.assetIds[1];
  const row = await AnviAudioAsset.findById(personal).lean();
  assert.equal(row.scope, "attempt");
  assert.equal(String(row.attemptId), a.attemptId);

  const b = await startAndJoin(stack, interview);
  const attemptB = await AnviAttempt.findById(b.attemptId).lean();
  assert.equal(await stack.audioAssets.load(personal, attemptB), null, "another attempt cannot load it");
  assert.equal(await stack.service.attemptAudio(b.student, a.attemptId, personal), null, "the proxy route refuses another student");
  assert.ok(await stack.service.attemptAudio(a.student, a.attemptId, personal), "the owner can");
  // Transcript keys are scoped by attempt (and student, model, language through scopeHash).
  const keys = [...stack.valkey.strings.keys()].filter((key) => key.startsWith("peerprep:anvi:transcript:v1:"));
  assert.ok(keys.length >= 1 && keys.every((key) => key.includes(`:${a.attemptId}:`)));
  assert.equal(b.socket.got("anvi:caption").some((caption) => /sessions/.test(caption.text)), false);
});

test("AC7: R2 failing mid-interview never ends it: prompts fall back to text and the attempt completes", async (t) => {
  if (skipIf(t)) return;
  const stack = await boot();
  stack.storage.state.failing = true;
  const { socket, attemptId } = await startAndJoin(stack, await publish());
  for (const text of ["Each request carries its own state with it every time.", "Cache hot reads and expire them with a time to live.", "An index is a sorted tree so reads touch fewer pages.", "Processes have separate memory while threads share memory."]) {
    await nextListening(socket, socket.mark() > 0 ? 0 : 0);
    await answer(stack, socket, text);
    // Follow-ups (if any) are answered the same way.
    while (socket.got("anvi:prompt").at(-1)?.kind === "follow_up") await answer(stack, socket, "For example a token in the header instead of a session.");
  }
  assert.deepEqual(await ended(socket), { status: "completed", endReason: "completed" });
  assert.ok(socket.got("anvi:prompt").every((prompt) => prompt.assetIds.length === 0), "text only while R2 is down");
  const stored = await AnviAttempt.findById(attemptId).lean();
  assert.equal(stored.status, "completed");
  assert.deepEqual(stored.items.map((item) => item.status), ["answered", "answered", "answered", "answered"]);
});

test("AC8: the budget reaching cached_only stops Live, decisions and dynamic TTS, and the interview completes", async (t) => {
  if (skipIf(t)) return;
  const stack = await boot({ env: { ...HYBRID_ENV, ANVI_HYBRID_LIVE_ESCALATION: "true" } });
  const { socket, attemptId } = await startAndJoin(stack, await publish());
  await nextListening(socket, 0);
  const budget = stack.handlers.holders.get(attemptId).budget;
  // Simulated spend: 10 minutes -> thresholds x0.25 (economical 7.5, cached_only 10, essential 11.25).
  await budget.ready;
  await budget.recordReserved(spendTo(10.5 - budget.snapshot().inr));
  assert.equal(budget.mode(), "cached_only");
  const before = { ...stack.gemini.counts };
  await answer(stack, socket, "Stateless means the server keeps no sessions between requests at all.");
  for (const text of ["Cache hot reads and expire them with a time to live.", "An index is a sorted tree so reads touch fewer pages.", "Processes have separate memory while threads share memory."]) await answer(stack, socket, text);
  assert.deepEqual(await ended(socket), { status: "completed", endReason: "completed" });
  assert.equal(stack.gemini.counts.decision, before.decision, "no decision call in cached_only");
  assert.equal(stack.gemini.counts.live, 0, "no Live");
  assert.equal(socket.got("anvi:prompt").some((prompt) => prompt.kind === "follow_up"), false, "no dynamic follow-up");
  assert.equal(stack.gemini.counts.transcribe, before.transcribe + 4, "Flash-Lite transcription still runs");
  const stored = await AnviAttempt.findById(attemptId).lean();
  assert.equal(stored.cost.peakMode, "cached_only");
});

test("AC9: scoring is deterministic: identical judgements give identical marks", async (t) => {
  if (skipIf(t)) return;
  const stack = await boot();
  const { socket, attemptId, student } = await startAndJoin(stack, await publish());
  await fullRun(stack, socket);
  await ended(socket);
  const evaluator = createAnviEvaluator({ gemini: stack.gemini, config: stack.config, usage: stack.usage, notify: async () => true, log: stack.log });
  assert.ok(evaluator.soon(attemptId));
  await evaluator.idle();
  const report = await stack.service.getAttemptForStudent(student, attemptId);
  assert.equal(report.status, "ready");
  const stored = await AnviAttempt.findById(attemptId).lean();
  const judgement = { keyPoints: [{ index: 0, verdict: "matched" }], relevanceLevel: 3, rubric: [{ id: "r1", level: 3 }] };
  const once = stored.items.map((item) => scoreItem(item, judgement, stored.rubricSnapshot));
  const twice = stored.items.map((item) => scoreItem(item, judgement, stored.rubricSnapshot));
  assert.deepEqual(once, twice);
  assert.deepEqual(summarizeScores(once, { rubric: stored.rubricSnapshot }), summarizeScores(twice, { rubric: stored.rubricSnapshot }));
  assert.equal(stored.eval.modelId, "gemini-3.6-flash", "the model that answered is recorded");
});

// Answers every question (and follow-up) of the default definition.
async function fullRun(stack, socket) {
  await nextListening(socket, 0);
  await answer(stack, socket, "Stateless means the server keeps no sessions between requests at all.");
  assert.equal(socket.got("anvi:prompt").at(-1).kind, "follow_up");
  await answer(stack, socket, "For example a signed token in the header on every single request.");
  await answer(stack, socket, "Cache hot reads and expire them with a time to live.");
  await answer(stack, socket, "An index is a sorted tree so reads touch fewer pages.");
  await answer(stack, socket, "Processes have separate memory while threads share memory.");
}

test("AC10: existing features work on a hybrid attempt: REST end, the sweeper path and the student view", async (t) => {
  if (skipIf(t)) return;
  const stack = await boot();
  const { socket, attemptId, student } = await startAndJoin(stack, await publish());
  await nextListening(socket, 0);
  await answer(stack, socket, "Each request carries its own state with it every time.");
  const view = await stack.service.endAttemptRest(student, attemptId);
  assert.equal(view.status, "abandoned");
  await until(() => socket.got("anvi:ended").length, "the socket is told");
  const stored = await AnviAttempt.findById(attemptId).lean();
  assert.equal(stored.runtimeMode, "hybrid");
  assert.equal(stored.items[0].status, "answered");
  assert.match(stored.items[0].answerText, /own state/);
  assert.equal(await AnviLiveSession.countDocuments({ attemptId }), 0);
  assert.deepEqual(stack.triggered, [attemptId], "evaluation is queued as for Live");
  // The release's ledger flush is fire-and-forget; its rows land before the next test starts.
  await flushLedger(stack);
});

test("AC11: usage reports separate billed calls from cache hits and replays", async (t) => {
  if (skipIf(t)) return;
  const stack = await boot();
  const interview = await publish();
  const first = await startAndJoin(stack, interview);
  await fullRun(stack, first.socket);
  await ended(first.socket);
  const second = await startAndJoin(stack, interview);
  await nextListening(second.socket, 0);
  // The second student's background preloads finish before the ledger is read.
  await stableCount(() => stack.gemini.counts.tts);
  await flushLedger(stack);
  // Scoped to this test's interview, as the admin report is: an earlier test's ledger may still be writing
  // its own rows (a release flush is fire-and-forget), and those must not count here.
  const summary = await summarizeUsage({ interviewId: interview._id }, { pricing: stack.pricing });
  const calls = Object.fromEntries(summary.byKind.map((row) => [row.kind, row.calls]));
  assert.equal(calls.metric, undefined, "metric rows are never calls");
  assert.equal(calls.transcribe, stack.gemini.counts.transcribe);
  assert.equal(calls.tts, stack.gemini.counts.tts);
  assert.ok(summary.cache.tts.hits > 0, "the second student's audio came from the cache");
  assert.ok(summary.cache.avoidedLiveTurns >= 5);
  assert.equal(summary.cost.complete, true);
  assert.ok(summary.cost.inr > 0);
});

test("AC12: a missing price runs the attempt Live and reports Incomplete, never 0", async (t) => {
  if (skipIf(t)) return;
  const env = { ...HYBRID_ENV };
  delete env.ANVI_PRICE_DECISION_OUTPUT;
  const stack = await boot({ env });
  const student = await addStudent();
  const started = await stack.service.startAttempt(student, String((await publish())._id), {});
  const attempt = await AnviAttempt.findById(started.id).lean();
  assert.notEqual(attempt.runtimeMode, "hybrid");
  assert.ok(stack.log.lines.some((line) => line.includes("ANVI_PRICE_DECISION_OUTPUT")), "the warning names the variable");
  const incomplete = stack.pricing.estimate({ kind: "decision", tokens: { input: 1000, output: 100 } });
  assert.equal(incomplete.usd, null);
  assert.equal(incomplete.complete, false);
});

test("AC13: a 60-minute hybrid attempt enforces the scaled INR 45 (no optional call after it), and the simulator agrees", async (t) => {
  if (skipIf(t)) return;
  const stack = await boot();
  const { socket, attemptId } = await startAndJoin(stack, await publish(definitionOf({ minutes: 60 })));
  const attempt = await AnviAttempt.findById(attemptId).lean();
  assert.equal(attempt.durationMinutes, 60);
  assert.equal(attempt.liveCapSeconds, 300);
  await nextListening(socket, 0);
  const budget = stack.handlers.holders.get(attemptId).budget;
  // Simulated spend to INR 45 (the essential tier for 60 minutes).
  const tokens = Math.ceil(45 / (0.75e-6 * 88)) + 10;
  await budget.recordReserved({ kind: "evaluate", tokens: { input: tokens, output: 0, inputByModality: { TEXT: tokens } } });
  assert.equal(budget.mode(), "essential");
  for (const kind of ["live", "decision", "tts", "transcribe_accurate", "dynamic_follow_up", "tts_static", "generate"]) assert.equal(budget.allow(kind), false, kind);
  assert.equal(budget.allow("transcribe"), true);
  assert.equal(budget.allow("evaluate"), true);
  // A preload that passed its budget check before the spend may still finish.
  await stableCount(() => stack.gemini.counts.tts);
  const before = { ...stack.gemini.counts };
  await answer(stack, socket, "Stateless means the server keeps no sessions between requests at all.");
  await answer(stack, socket, "Cache hot reads and expire them with a time to live.");
  assert.equal(stack.gemini.counts.decision, before.decision);
  assert.equal(stack.gemini.counts.tts, before.tts);
  assert.equal(stack.gemini.counts.transcribe, before.transcribe + 2);
  // At hard - reserve only evaluation is left.
  await budget.recordReserved({ kind: "evaluate", tokens: { input: tokens / 4, output: 0, inputByModality: { TEXT: tokens / 4 } } });
  assert.equal(budget.mode(), "hard");
  assert.equal(budget.allow("transcribe"), false);
  assert.equal(budget.allow("evaluate"), true);
  // The offline simulation at the verified prices stays inside the gate (average <= 45, p90 <= 60).
  const env = pricesFor("2026", {}, { rate: 88 });
  const simulated = simulateDuration(60, { pricing: anviPricing(env, anviConfig(env)), runs: 500, live: true, config: anviConfig(env) });
  assert.equal(gate60(simulated), true);
  assert.ok(simulated.avgInr < simulated.liveBaseline.inr, "cheaper than full Live");
});

test("AC15: with the flag off a new attempt runs the Live path with the unchanged ack", async (t) => {
  if (skipIf(t)) return;
  const env = { ...HYBRID_ENV, ANVI_HYBRID_ENABLED: "false" };
  const stack = await boot({ env });
  const { attemptId, joined } = await startAndJoin(stack, await publish());
  assert.deepEqual(Object.keys(joined).sort(), ["ok", "state"]);
  assert.equal(joined.state.phase, "intro");
  assert.equal(stack.gemini.counts.live, 1, "a Live session is opened");
  assert.equal(stack.conductors.length, 0, "no hybrid conductor");
  assert.equal(stack.gemini.counts.tts, 0);
  const attempt = await AnviAttempt.findById(attemptId).lean();
  assert.notEqual(attempt.runtimeMode, "hybrid");
  assert.equal(attempt.durationMinutes ?? null, null);
});

// --- End to end: the full hybrid run (the scenarios the real-Gemini e2e repeats) --------------------------

test("e2e: cached playback, repeat, transcript dedupe, follow-up, proctoring hold, finalize and evaluation", async (t) => {
  if (skipIf(t)) return;
  const stack = await boot();
  const interview = await publish(definitionOf({ proctoring: true }));
  const { socket, attemptId, student, joined } = await startAndJoin(stack, interview);
  assert.equal(joined.runtimeMode, "hybrid");
  assert.equal(joined.paused, true, "held until the room reports fullscreen");
  await settle(10);
  assert.equal(socket.got("anvi:prompt").length, 0, "nothing plays while held");
  assert.equal((await socket.call("anvi:proctor", { attemptId, type: "fullscreen_enter", resync: true })).ok, true);
  const intro = await until(() => socket.got("anvi:prompt").find((prompt) => prompt.kind === "intro"), "the intro");
  assert.ok(intro.assetIds.length === 1);

  // Q1: answer, dynamic follow-up behind the cached transition clip, then its answer.
  const q1 = await nextListening(socket, 0);
  await answer(stack, socket, "Stateless means the server keeps no sessions between requests at all.");
  const followUp = socket.got("anvi:prompt").at(-1);
  assert.equal(followUp.kind, "follow_up");
  assert.equal(followUp.text, FOLLOW_UP);
  assert.equal(followUp.assetIds.length, 2, "transition clip + attempt-scoped TTS");
  const toQ2 = await answer(stack, socket, "For example a signed token in the header on every single request.");

  // Q2: proctoring hold while listening: the turn rotates, a late commit is refused, no paid call.
  const q2 = await nextListening(socket, toQ2.mark);
  assert.notEqual(q2.turnId, q1.turnId);
  // The next question's preload (static audio, shared by every student) settles first.
  await stableCount(() => stack.gemini.counts.tts);
  const paid = { ...stack.gemini.counts };
  const exit = await socket.call("anvi:proctor", { attemptId, type: "fullscreen_exit" });
  assert.equal(exit.paused, true);
  assert.ok(socket.got("anvi:paused").length >= 1);
  assert.ok(socket.got("anvi:interrupted").length >= 1);
  const late = await sendSegmentRaw(socket, q2.turnId, stack.gemini.say("Cache the hot reads please."));
  assert.equal(late.ok, false);
  assert.ok(["STALE_TURN", "ON_HOLD"].includes(late.code));
  assert.deepEqual(stack.gemini.counts, paid, "nothing is spent on hold");
  const markResume = socket.mark();
  assert.equal((await socket.call("anvi:proctor", { attemptId, type: "fullscreen_enter" })).ok, true);
  const replayed = await until(() => socket.since(markResume, "anvi:prompt").at(-1), "the question again");
  assert.equal(replayed.kind, "question");
  assert.equal(replayed.questionNumber, 2);
  assert.equal(stack.gemini.counts.tts, paid.tts, "release replays from the cache");

  // Q2: repeat (no TTS, Live or decision), then the answer.
  const listening = await nextListening(socket, markResume);
  const repeatMark = socket.mark();
  await sendSegment(socket, listening.turnId, stack.gemini.say("Could you repeat the question?", 1.5));
  const replay = await until(() => socket.since(repeatMark, "anvi:replay").at(-1), "the replay");
  assert.equal(replay.assetId, replayed.assetIds.at(-1));
  assert.equal(stack.gemini.counts.decision, paid.decision);
  await nextListening(socket, repeatMark);
  await answer(stack, socket, "Cache hot reads and expire them with a time to live.");
  await answer(stack, socket, "An index is a sorted tree so reads touch fewer pages.");
  await answer(stack, socket, "Processes have separate memory while threads share memory.");
  assert.deepEqual(await ended(socket), { status: "completed", endReason: "completed" });

  // Finalize: items, cost and the transcript keys forgotten.
  const stored = await AnviAttempt.findById(attemptId).lean();
  assert.equal(stored.status, "completed");
  assert.deepEqual(stored.items.map((item) => item.status), ["answered", "answered", "answered", "answered"]);
  assert.match(stored.items[0].answerText, /no sessions.*signed token/);
  assert.deepEqual(stored.items[0].followUpsAsked, [FOLLOW_UP]);
  assert.equal(stored.cost.complete, true);
  assert.ok(stored.cost.estimatedInr > 0);
  assert.equal(stored.cost.pricingRevision, stack.pricing.revision);
  await settle(20);
  assert.equal([...stack.valkey.strings.keys()].filter((key) => key.startsWith("peerprep:anvi:transcript:")).length, 0);
  // A decision only where a follow-up is still possible: q1's first answer. Its follow-up answer and q2-q4
  // (follow-up budget 0) are pre-routed to "next" without a call (DECISIONS #4).
  assert.equal(stack.gemini.counts.decision, 1);
  assert.equal(stack.gemini.counts.live, 0);

  // Evaluation after finalize.
  const evaluator = createAnviEvaluator({ gemini: stack.gemini, config: stack.config, usage: stack.usage, notify: async () => true, log: stack.log });
  assert.ok(evaluator.soon(attemptId));
  await evaluator.idle();
  const report = await stack.service.getAttemptForStudent(student, attemptId);
  assert.equal(report.status, "ready");
  assert.ok(report.overall.score > 0);
  assert.equal(stack.gemini.counts.evaluate, 1, "four answers fit one batch");

  // The logs never carry a transcript or a question.
  const logged = stack.log.lines.join("\n");
  for (const secret of ["sessions", "signed token", "stateless", FOLLOW_UP, "test-key"]) assert.equal(logged.includes(secret), false, secret);
});

// A segment commit without asserting the chunks (used while on hold, when chunks are refused too).
async function sendSegmentRaw(socket, turnId, pcm) {
  const segmentId = randomUUID();
  await socket.call("anvi:seg-chunk", { turnId, segmentId, part: 0, index: 0, pcm: pcm.subarray(0, 32_000) });
  return socket.call("anvi:seg-commit", { turnId, segmentId, part: 0, final: true, totalBytes: Math.min(pcm.length, 32_000), durationMs: 1000 });
}
