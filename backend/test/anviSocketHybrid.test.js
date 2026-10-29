import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";
import { createLiveCapacity } from "../src/modules/anviInterview/anviInterview.capacity.js";
import { registerAnviSocketHandlers, stopAnviAttempt } from "../src/modules/anviInterview/anviInterview.socket.js";
import { createUsageLedger } from "../src/modules/anviInterview/anviInterview.usage.js";

// WP15: the socket layer for hybrid (turn-based) attempts, with in-memory models. Fake conductors cover the
// wiring; the real hybrid conductor (with fake assets, transcripts and decisions) covers segment handling.
const settle = async (rounds = 8) => { for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
let seq = 0;
const objectId = () => (++seq).toString(16).padStart(24, "b");

class FakeSocket {
  constructor({ userId, universityId = "platform" }) {
    Object.assign(this, { userId: String(userId), universityId, userRole: "student", connected: true });
    this.handlers = new Map();
    this.sent = [];
  }
  on(event, fn) { this.handlers.set(event, fn); }
  emit(event, payload) { this.sent.push({ event, payload }); }
  call(event, payload) { return new Promise((resolve) => this.handlers.get(event)(payload, resolve)); }
  got(event) { return this.sent.filter((entry) => entry.event === event).map((entry) => entry.payload); }
}

function fakeIo() {
  const listeners = [];
  return { on(event, fn) { if (event === "connection") listeners.push(fn); }, connect(socket) { for (const fn of listeners) fn(socket); return socket; } };
}

// The live doc honours the lease token, so a replaced holder's writes match nothing (takeover).
function memoryStore() {
  const users = new Map();
  const attempts = new Map();
  const lives = new Map();
  const query = (read) => { const chain = { select: () => chain, lean: async () => read() }; return chain; };
  const leaseMatches = (filter) => {
    const live = lives.get(String(filter.attemptId));
    return live && (filter.leaseToken === undefined || filter.leaseToken === live.leaseToken) ? live : null;
  };
  const models = {
    User: { findById: (id) => query(() => users.get(String(id)) || null) },
    AnviAttempt: {
      findOne: (filter) => query(() => {
        const attempt = attempts.get(String(filter._id));
        return attempt && String(attempt.studentId) === String(filter.studentId) ? attempt : null;
      }),
      findById: (id) => query(() => attempts.get(String(id)) || null),
      updates: [],
      async updateOne(filter, update) {
        this.updates.push({ filter, update });
        const attempt = attempts.get(String(filter._id));
        if (!attempt || attempt.status !== "in_progress") return { matchedCount: 0, modifiedCount: 0 };
        Object.assign(attempt, update.$set);
        return { matchedCount: 1, modifiedCount: 1 };
      },
    },
    AnviLiveSession: {
      findOne: (filter) => query(() => leaseMatches(filter)),
      findOneAndUpdate: (filter, update) => query(() => {
        const live = lives.get(String(filter.attemptId));
        if (!live) return null;
        Object.assign(live, update.$set);
        return { ...live };
      }),
      exists: async (filter) => lives.has(String(filter.attemptId)),
      async updateOne(filter) { return leaseMatches(filter) ? { matchedCount: 1, modifiedCount: 1 } : { matchedCount: 0, modifiedCount: 0 }; },
      async deleteOne(filter) { lives.delete(String(filter.attemptId)); return { deletedCount: 1 }; },
    },
    AnviResumeContext: { async deleteOne() { return { deletedCount: 1 }; } },
  };
  const addStudent = () => {
    const id = objectId();
    users.set(id, { _id: id, name: "Asha Verma", role: "student", isActive: true, accessScope: "full" });
    return id;
  };
  const addAttempt = (studentId, { runtimeMode = "hybrid", plan = [] } = {}) => {
    const id = objectId();
    attempts.set(id, {
      _id: id, studentId, interviewId: objectId(), status: "in_progress", hardDeadline: new Date(Date.UTC(2030, 0, 1)), assignmentId: null,
      snapshotRevision: 1, ...(runtimeMode === "hybrid" ? { runtimeMode, durationMinutes: 30, liveCapSeconds: 180 } : {}),
    });
    lives.set(id, { attemptId: id, leaseToken: null, phase: "intro", finalizingAt: null, plan, rules: {}, answers: {} });
    return id;
  };
  return { models, addStudent, addAttempt, attempts, lives };
}

function fakeConductors(kind) {
  const made = [];
  const create = (options) => {
    const listeners = new Map();
    let liveSeconds = 0;
    const conductor = {
      kind, options, disposed: false, onHold: false,
      on(event, fn) { listeners.set(event, fn); },
      emit(event, payload) { listeners.get(event)?.(payload); },
      async start() { return { phase: options.live.phase, ...(kind === "hybrid" ? { runtimeMode: "hybrid", inputMode: "vad", turnState: "preparing" } : {}) }; },
      isFinalizing: () => false,
      isOnHold: () => conductor.onHold,
      end: async () => ({ status: "abandoned", endReason: "ended_by_student" }),
      dispose() { conductor.disposed = true; },
      flushed: async () => {},
      pushAudio() {},
      adoptAnswer() {},
      stats: () => ({ liveSeconds }),
      useLive(seconds) { liveSeconds += seconds; },
      ackAssetIds: () => ["ackasset1"],
      acceptChunk: () => ({ ok: true }),
      commitSegment: async () => ({ ok: true }),
      clipHave: () => ({ ok: true }),
    };
    made.push(conductor);
    return conductor;
  };
  create.made = made;
  return create;
}

const fakeBudget = (mode = "normal") => {
  const state = { current: mode, recorded: [], flushed: 0, disposed: false };
  const allowIn = { normal: () => true, cached_only: (kind) => !["live", "decision", "tts", "transcribe_accurate"].includes(kind) };
  return Object.assign(state, {
    ready: Promise.resolve(),
    allow: (kind) => (allowIn[state.current] || allowIn.normal)(kind),
    record: async (payload) => { state.recorded.push(payload); return state.current; },
    recordReserved: async () => state.current,
    reserveLive: async () => true,
    liveRemaining: () => 180,
    liveSeconds: () => 0,
    mode: () => state.current,
    limits: () => ({ decisionMaxOutputTokens: 120 }),
    summary: () => ({ estimatedUsd: 0.1, estimatedInr: 9, liveSeconds: 0, mode: state.current, peakMode: state.current, pricingRevision: "test:1", complete: true, at: new Date(0) }),
    flush: async () => { state.flushed += 1; },
    dispose() { state.disposed = true; },
    on() {}, off() {},
  });
};

function setup({ store = memoryStore(), config: overrides = {}, gemini = {}, budgetMode = "normal", realHybrid = false, hybridDeps = {}, capacity } = {}) {
  const createConductor = fakeConductors("live");
  const createHybridConductor = realHybrid ? undefined : fakeConductors("hybrid");
  const rows = [];
  const usage = createUsageLedger({ model: { insertMany: async (batch) => { rows.push(...batch); } }, log: { warn() {} } });
  const budgets = [];
  const io = fakeIo();
  const config = { ...anviConfig({}), liveModel: "live-model", maxLiveSessions: 2, maxLiveSessionsPerTenant: 2, ...overrides };
  const calls = { openLive: 0, generateJson: [], transcribeAudio: 0 };
  const now = Date.UTC(2026, 9, 22, 10, 0, 0);
  const handlers = registerAnviSocketHandlers(io, {
    gemini: {
      configured: true,
      async openLive() { calls.openLive += 1; return {}; },
      async transcribePcm() { return ""; },
      async transcribeAudio() { calls.transcribeAudio += 1; return { text: "" }; },
      async generateJson(options) { calls.generateJson.push(options.usageKind); return {}; },
      ...gemini,
    },
    clock: { now: () => now },
    timers: { setTimeout: () => ({ unref() {} }), clearTimeout() {} },
    config,
    models: store.models,
    createConductor,
    ...(createHybridConductor ? { createHybridConductor } : {}),
    createBudget: (options) => { const budget = Object.assign(fakeBudget(budgetMode), { options }); budgets.push(budget); return budget; },
    hybridDeps,
    getTenant: async () => null,
    scheduling: { practiceBlocked: async () => false, onAttemptFinalized: async () => {} },
    observeInterview: async () => {},
    evaluateSoon: () => null,
    usage,
    capacity: capacity || createLiveCapacity({ maxLiveSessions: 2, maxLiveSessionsPerTenant: 2, client: null }),
    log: { warn() {} },
  });
  const student = () => {
    const id = store.addStudent();
    return { id, socket: io.connect(new FakeSocket({ userId: id })) };
  };
  return { ...store, store, io, handlers, createConductor, createHybridConductor, usage, rows, budgets, calls, student, config };
}

test("flag off: a Live attempt gets createConductor and the unchanged ack (AC15)", async () => {
  const ctx = setup();
  const { id, socket } = ctx.student();
  const attemptId = ctx.addAttempt(id, { runtimeMode: "live" });
  const joined = await socket.call("anvi:join", { attemptId });
  assert.deepEqual(joined, { ok: true, state: { phase: "intro" } });
  assert.equal(ctx.createConductor.made.length, 1);
  assert.equal(ctx.createHybridConductor.made.length, 0);
  assert.equal(ctx.budgets.length, 0, "a Live attempt has no budget unless ANVI_BUDGET_ENFORCE_LIVE");
  assert.equal(ctx.handlers.capacity.count(), 1, "a Live join holds a capacity slot as before");
  assert.equal("onUsage" in ctx.createConductor.made[0].options.gemini, false, "the Live metered client is unchanged");
});

test("hybrid: the join takes no capacity slot; an escalation acquires one and releases it", async () => {
  const ctx = setup({ config: { hybridEnabled: true } });
  const { id, socket } = ctx.student();
  const attemptId = ctx.addAttempt(id);
  const joined = await socket.call("anvi:join", { attemptId });
  assert.equal(joined.ok, true);
  assert.equal(joined.runtimeMode, "hybrid");
  assert.equal(joined.hybrid.vad.onsetFrames, 2);
  assert.equal(joined.hybrid.vad.preRollMs, 300);
  assert.equal(joined.hybrid.vad.minSpeechMs, 400);
  assert.equal(joined.hybrid.vad.maxSegmentSeconds, 90);
  assert.equal(joined.hybrid.inputMode, "vad");
  assert.deepEqual(joined.hybrid.ackAssetIds, ["ackasset1"]);
  assert.equal(ctx.createConductor.made.length, 0);
  assert.equal(ctx.handlers.capacity.count(), 0, "no slot for a hybrid join");
  const conductor = ctx.createHybridConductor.made[0];
  assert.equal(conductor.options.budget, ctx.budgets[0]);
  assert.equal(ctx.budgets[0].options.runtimeMode, "hybrid");
  assert.equal(ctx.budgets[0].options.durationMinutes, 30);
  assert.equal(ctx.budgets[0].options.liveCapSeconds, 180);
  const lease = conductor.options.capacityLease;
  const result = await lease.acquire({ resume: false });
  assert.equal(result.ok, true);
  assert.equal(ctx.handlers.capacity.count(), 1, "an open escalation holds a slot");
  lease.release(result.slot);
  assert.equal(ctx.handlers.capacity.count(), 0);
  // A slot still open when the holder goes is released with it.
  await lease.acquire({ resume: false });
  assert.equal(ctx.handlers.capacity.count(), 1);
  socket.handlers.get("disconnect")("transport close");
  await settle();
  assert.equal(ctx.handlers.capacity.count(), 0);
  assert.equal(ctx.budgets[0].flushed, 1, "the budget mirror is written once more on release");
  assert.equal(ctx.budgets[0].disposed, true);
});

test("hybrid: a full Live capacity never refuses the join itself", async () => {
  const ctx = setup({ config: { hybridEnabled: true } });
  for (let i = 0; i < 2; i += 1) {
    const live = ctx.student();
    assert.equal((await live.socket.call("anvi:join", { attemptId: ctx.addAttempt(live.id, { runtimeMode: "live" }) })).ok, true);
  }
  assert.equal(ctx.handlers.capacity.count(), 2);
  const { id, socket } = ctx.student();
  assert.equal((await socket.call("anvi:join", { attemptId: ctx.addAttempt(id) })).ok, true);
  const refused = await ctx.createHybridConductor.made[0].options.capacityLease.acquire({ resume: false });
  assert.equal(refused.ok, false, "the escalation is refused instead (the student stays turn-based)");
});

test("hybrid: the budget gate refuses openLive and decisions in cached_only; calls are charged ledger then budget", async () => {
  const ctx = setup({ config: { hybridEnabled: true }, budgetMode: "cached_only" });
  const { id, socket } = ctx.student();
  await socket.call("anvi:join", { attemptId: ctx.addAttempt(id) });
  const { gemini } = ctx.createHybridConductor.made[0].options;
  await assert.rejects(gemini.openLive({}), { code: "BUDGET_DENIED" });
  assert.equal(ctx.calls.openLive, 0, "no Live session is opened");
  await assert.rejects(gemini.generateJson({ usageKind: "decision" }), { code: "BUDGET_DENIED" });
  await assert.rejects(gemini.transcribeAudio({ kind: "transcribe_accurate" }), { code: "BUDGET_DENIED" });
  await gemini.transcribeAudio({ kind: "transcribe" });
  await gemini.generateJson({ usageKind: "generate" });
  assert.equal(ctx.calls.transcribeAudio, 1);
  assert.deepEqual(ctx.calls.generateJson, ["generate"]);
  ctx.budgets[0].current = "normal";
  await gemini.openLive({});
  assert.equal(ctx.calls.openLive, 1);
  gemini.onUsage({ kind: "decision", model: "m", tokens: { input: 10, output: 5 } });
  await settle();
  assert.equal(ctx.budgets[0].recorded.length, 1, "the budget is charged");
  await ctx.usage.flush();
  assert.ok(ctx.rows.some((row) => row.kind === "decision"), "the ledger row is written");
});

test("hybrid: the session row carries the real Live seconds, so attempt counts still work", async () => {
  const ctx = setup({ config: { hybridEnabled: true } });
  const { id, socket } = ctx.student();
  await socket.call("anvi:join", { attemptId: ctx.addAttempt(id) });
  ctx.createHybridConductor.made[0].useLive(42);
  socket.handlers.get("disconnect")("transport close");
  await settle();
  await ctx.usage.flush();
  const sessions = ctx.rows.filter((row) => row.kind === "session");
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sessionSeconds, 42);
  assert.equal(sessions[0].runtimeMode, "hybrid");
});

test("hybrid events need a hybrid attempt held by this socket and always answer", async () => {
  const ctx = setup({ config: { hybridEnabled: true } });
  const { id, socket } = ctx.student();
  assert.deepEqual(await socket.call("anvi:seg-commit", {}), { ok: false, code: "NOT_JOINED" });
  await socket.call("anvi:join", { attemptId: ctx.addAttempt(id, { runtimeMode: "live" }) });
  assert.deepEqual(await socket.call("anvi:seg-chunk", {}), { ok: false, code: "NOT_HYBRID" });
  assert.deepEqual(await socket.call("anvi:clip-have", { assetIds: [] }), { ok: false, code: "NOT_HYBRID" });
});

test("finalize writes the cost in the same conditional update as the outcome", async () => {
  const ctx = setup({ config: { hybridEnabled: true } });
  const { id, socket } = ctx.student();
  const attemptId = ctx.addAttempt(id);
  await socket.call("anvi:join", { attemptId });
  const { persist } = ctx.createHybridConductor.made[0].options;
  const cost = ctx.budgets[0].summary();
  const result = await persist.finalize({ status: "completed", endReason: "completed", items: [], cost });
  assert.equal(result.applied, true);
  const write = ctx.models.AnviAttempt.updates.at(-1);
  assert.deepEqual(write.filter, { _id: attemptId, status: "in_progress" });
  assert.deepEqual(write.update.$set.cost, cost);
  assert.equal(write.update.$set.status, "completed");
});

// --- The real hybrid conductor behind the socket ----------------------------------------------------

const voiced = (bytes) => {
  const pcm = Buffer.alloc(bytes);
  for (let i = 0; i < bytes / 2; i += 1) pcm.writeInt16LE(Math.round(Math.sin(i / 8) * 9000), i * 2);
  return pcm;
};
const plan = ["Explain REST.", "Explain caching.", "Explain queues."].map((text, index) => ({
  qid: `q${index + 1}`, n: index + 1, sectionId: "s1", sectionName: "Technical", kind: "specific", text, keyPoints: ["Stateless"], followUpBudget: 0,
}));

function realHybrid(store, extra = {}) {
  const transcribed = [];
  const hybridDeps = {
    audioAssets: { ensure: async () => null, load: async () => null },
    transcripts: { transcribe: async (request) => { transcribed.push(request.audioHash); return { text: "REST is stateless over HTTP." }; }, forgetAttempt() {} },
    decision: { decide: async () => ({ action: "next" }) },
  };
  const ctx = setup({ store, config: { hybridEnabled: true }, realHybrid: true, hybridDeps, ...extra });
  return { ...ctx, transcribed };
}

async function listeningTurn(socket) {
  for (let i = 0; i < 20; i += 1) {
    await settle();
    const turn = socket.got("anvi:turn").filter((entry) => entry.state === "listening").at(-1);
    if (turn?.turnId) return turn.turnId;
  }
  throw new Error("never listening");
}

test("segment chunks are validated for size and rate; a duplicate commit is acked as one; a commit on hold is refused", async () => {
  const ctx = realHybrid(memoryStore());
  const { id, socket } = ctx.student();
  const attemptId = ctx.addAttempt(id, { plan });
  const joined = await socket.call("anvi:join", { attemptId });
  assert.equal(joined.ok, true);
  assert.equal(joined.runtimeMode, "hybrid");
  const turnId = await listeningTurn(socket);

  const segmentId = randomUUID();
  assert.equal((await socket.call("anvi:seg-chunk", { turnId, segmentId, part: 0, index: 0, pcm: Buffer.alloc(40 * 1024) })).code, "OVERSIZE");
  assert.equal((await socket.call("anvi:seg-chunk", { turnId, segmentId, part: 0, index: 0, pcm: Buffer.alloc(31) })).code, "ODD_LENGTH");
  assert.equal((await socket.call("anvi:seg-chunk", { turnId: "x", segmentId, part: 0, index: 0, pcm: voiced(320) })).code, "BAD_ID");

  const pcm = voiced(32_000);
  assert.equal((await socket.call("anvi:seg-chunk", { turnId, segmentId, part: 0, index: 0, pcm })).ok, true);
  const commit = { turnId, segmentId, part: 0, final: true, totalBytes: pcm.length, durationMs: 1000 };
  const first = await socket.call("anvi:seg-commit", commit);
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, undefined);
  assert.deepEqual(await socket.call("anvi:seg-commit", commit), { ok: true, duplicate: true });
  await settle();
  assert.equal(ctx.transcribed.length, 1, "the segment is transcribed once");

  // The byte bucket (1 MB burst at a fixed clock): the 33rd full chunk of one segment is refused.
  const turnNow = await listeningTurn(socket);
  const big = randomUUID();
  const codes = [];
  for (let index = 0; index < 33; index += 1) codes.push((await socket.call("anvi:seg-chunk", { turnId: turnNow, segmentId: big, part: 0, index, pcm: voiced(32 * 1024) })).code ?? "ok");
  // 32 000 bytes were already spent above, so the 32nd chunk is the first one refused.
  const refusedAt = codes.findIndex((code) => code !== "ok" && code !== null);
  assert.equal(codes[refusedAt], "RATE_LIMITED");
  assert.equal(refusedAt, 31);

  ctx.handlers.holders.get(attemptId).conductor.hold();
  const refused = await socket.call("anvi:seg-commit", { turnId: turnNow, segmentId: randomUUID(), part: 0, final: true, totalBytes: 320, durationMs: 10 });
  assert.equal(refused.ok, false);
  assert.ok(["STALE_TURN", "ON_HOLD"].includes(refused.code));
});

test("a flood of rejected segment chunks (which spend no bytes) is capped by the chunk event bucket", async () => {
  const ctx = realHybrid(memoryStore());
  const { id, socket } = ctx.student();
  const attemptId = ctx.addAttempt(id, { plan });
  assert.equal((await socket.call("anvi:join", { attemptId })).ok, true);
  await listeningTurn(socket);
  const codes = [];
  for (let index = 0; index < 125; index += 1) codes.push((await socket.call("anvi:seg-chunk", { turnId: "x", segmentId: randomUUID(), part: 0, index: 0, pcm: voiced(320) })).code);
  assert.equal(codes.indexOf("RATE_LIMITED"), 120, "the burst of 120 chunk events at a fixed clock, then refused");
  assert.ok(codes.slice(0, 120).every((code) => code === "BAD_ID"));
});

test("takeover across two handler registrations: the old holder is lost on its next write and spends nothing (AC4)", async () => {
  const store = memoryStore();
  const first = realHybrid(store);
  const second = realHybrid(store);
  const studentId = store.addStudent();
  const attemptId = store.addAttempt(studentId, { plan });
  const oldSocket = first.io.connect(new FakeSocket({ userId: studentId }));
  assert.equal((await oldSocket.call("anvi:join", { attemptId })).ok, true);
  const turnId = await listeningTurn(oldSocket);
  const newSocket = second.io.connect(new FakeSocket({ userId: studentId }));
  assert.equal((await newSocket.call("anvi:join", { attemptId })).ok, true);

  const segmentId = randomUUID();
  const pcm = voiced(32_000);
  assert.equal((await oldSocket.call("anvi:seg-chunk", { turnId, segmentId, part: 0, index: 0, pcm })).ok, true);
  const commit = await oldSocket.call("anvi:seg-commit", { turnId, segmentId, part: 0, final: true, totalBytes: pcm.length, durationMs: 1000 });
  assert.equal(commit.ok, false);
  assert.equal(commit.code, "LEASE_LOST");
  await settle();
  assert.equal(first.transcribed.length, 0, "no paid call after the lease was lost");
  assert.equal(oldSocket.got("anvi:taken_over").length, 1);
});

test("stopAnviAttempt (a REST end elsewhere) detaches a hybrid holder and settles its budget (AC10)", async () => {
  const ctx = setup({ config: { hybridEnabled: true } });
  const { id, socket } = ctx.student();
  const attemptId = ctx.addAttempt(id);
  await socket.call("anvi:join", { attemptId });
  stopAnviAttempt(attemptId, { status: "abandoned", endReason: "ended_by_student" });
  await settle();
  assert.deepEqual(socket.got("anvi:ended").at(-1), { status: "abandoned", endReason: "ended_by_student" });
  assert.equal(ctx.createHybridConductor.made[0].disposed, true);
  assert.equal(ctx.budgets[0].disposed, true);
  assert.equal(ctx.handlers.holders.has(attemptId), false);
});