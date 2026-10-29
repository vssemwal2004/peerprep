import assert from "node:assert/strict";
import { test } from "node:test";
import { currentTenant } from "../src/platform/tenantContext.js";
import { ACQUIRE_SCRIPT, HEARTBEAT_SCRIPT, RELEASE_SCRIPT, createLiveCapacity } from "../src/modules/anviInterview/anviInterview.capacity.js";
import { registerAnviSocketHandlers } from "../src/modules/anviInterview/anviInterview.socket.js";
import { createUsageLedger } from "../src/modules/anviInterview/anviInterview.usage.js";

// Socket admission control and usage metering, with in-memory models and a fake conductor, so these
// tests depend on neither MongoDB nor the conductor's internals.
const settle = async (rounds = 6) => { for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
let seq = 0;
const objectId = () => (++seq).toString(16).padStart(24, "a");

class FakeSocket {
  constructor({ userId, universityId = "platform", userRole = "student" }) {
    Object.assign(this, { userId: String(userId), universityId, userRole, connected: true });
    this.handlers = new Map();
    this.sent = [];
  }
  on(event, fn) { this.handlers.set(event, fn); }
  emit(event, payload) { this.sent.push({ event, payload }); }
  call(event, payload) { return new Promise((resolve) => this.handlers.get(event)(payload, resolve)); }
  fire(event, payload) { this.handlers.get(event)?.(payload); }
  got(event) { return this.sent.filter((entry) => entry.event === event).map((entry) => entry.payload); }
  drop() { this.connected = false; this.fire("disconnect"); }
}

function fakeIo() {
  const listeners = [];
  return {
    on(event, fn) { if (event === "connection") listeners.push(fn); },
    connect(socket) { for (const fn of listeners) fn(socket); return socket; },
  };
}

// Just enough of the Mongoose query surface the socket layer uses.
function memoryModels() {
  const users = new Map();
  const attempts = new Map();
  const lives = new Map();
  const query = (read) => { const chain = { select: () => chain, lean: async () => read() }; return chain; };
  const models = {
    User: { findById: (id) => query(() => users.get(String(id)) || null) },
    AnviAttempt: {
      findOne: (filter) => query(() => {
        const attempt = attempts.get(String(filter._id));
        return attempt && String(attempt.studentId) === String(filter.studentId) ? attempt : null;
      }),
      findById: (id) => query(() => attempts.get(String(id)) || null),
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    },
    AnviLiveSession: {
      findOne: (filter) => query(() => lives.get(String(filter.attemptId)) || null),
      findOneAndUpdate: (filter, update) => query(() => {
        const live = lives.get(String(filter.attemptId));
        if (!live) return null;
        Object.assign(live, update.$set);
        return { ...live };
      }),
      exists: async (filter) => lives.has(String(filter.attemptId)),
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
      deleteOne: async () => ({ deletedCount: 1 }),
    },
    AnviResumeContext: {
      deleted: [],
      async deleteOne(filter) { this.deleted.push(filter); return { deletedCount: 1 }; },
    },
  };
  const addStudent = () => {
    const id = objectId();
    users.set(id, { _id: id, name: "Asha Verma", role: "student", isActive: true, accessScope: "full" });
    return id;
  };
  const addAttempt = (studentId, { leaseToken = null, phase = "intro" } = {}) => {
    const id = objectId();
    attempts.set(id, { _id: id, studentId, interviewId: objectId(), status: "in_progress", hardDeadline: new Date(Date.UTC(2030, 0, 1)), assignmentId: null });
    lives.set(id, { attemptId: id, leaseToken, phase, finalizingAt: null, plan: [] });
    return id;
  };
  return { models, addStudent, addAttempt, attempts };
}

function fakeConductors() {
  const made = [];
  const create = (options) => {
    const listeners = new Map();
    const conductor = {
      options,
      disposed: false,
      on(event, fn) { listeners.set(event, fn); },
      emit(event, payload) { listeners.get(event)?.(payload); },
      async start() {
        if (create.failNext) { create.failNext = false; throw Object.assign(new Error("Live down"), { code: "LIVE_UNAVAILABLE" }); }
        return { phase: options.live.phase };
      },
      isFinalizing: () => false,
      end: async () => ({ status: "abandoned", endReason: "ended_by_student" }),
      dispose() { conductor.disposed = true; },
      flushed: async () => {},
      pushAudio() {},
      adoptAnswer() {},
    };
    made.push(conductor);
    return conductor;
  };
  create.made = made;
  return create;
}

function setup({ maxLiveSessions = 2, maxLiveSessionsPerTenant = 2, capacity, tenants = {}, gemini = {} } = {}) {
  const store = memoryModels();
  const createConductor = fakeConductors();
  const rows = [];
  const usageModel = { insertMany: async (batch) => { rows.push(...batch.map((row) => ({ ...row, writtenIn: currentTenant()?.universityId || "platform" }))); } };
  const usage = createUsageLedger({ model: usageModel, log: { warn() {} } });
  const warnings = [];
  const io = fakeIo();
  const config = { liveVoice: "Aoede", silenceMs: 2000, liveModel: "live-model", maxLiveSessions, maxLiveSessionsPerTenant, capacityRetrySeconds: 90 };
  let now = Date.UTC(2026, 9, 22, 10, 0, 0);
  const handlers = registerAnviSocketHandlers(io, {
    gemini: { configured: true, async openLive() { return {}; }, async transcribePcm() { return ""; }, async generateJson() { return {}; }, ...gemini },
    clock: { now: () => now },
    config,
    models: store.models,
    createConductor,
    getTenant: async (id) => tenants[id] || null,
    scheduling: { practiceBlocked: async () => false, onAttemptFinalized: async () => {} },
    observeInterview: async () => {},
    evaluateSoon: () => null,
    usage,
    ...(capacity ? { capacity: capacity(config) } : {}),
    log: { warn: (...args) => warnings.push(args.join(" ")) },
  });
  const student = (universityId = "platform") => {
    const id = store.addStudent();
    return { id, socket: io.connect(new FakeSocket({ userId: id, universityId })) };
  };
  return { ...store, io, handlers, createConductor, usage, rows, warnings, student, advance: (ms) => { now += ms; } };
}

test("a new join over the global cap is refused with CAPACITY_FULL; nothing opens", async () => {
  const ctx = setup({ maxLiveSessions: 2, maxLiveSessionsPerTenant: 5 });
  for (let i = 0; i < 2; i += 1) {
    const { id, socket } = ctx.student();
    assert.equal((await socket.call("anvi:join", { attemptId: ctx.addAttempt(id) })).ok, true);
  }
  assert.equal(ctx.handlers.capacity.count(), 2);
  const { id, socket } = ctx.student();
  const refused = await socket.call("anvi:join", { attemptId: ctx.addAttempt(id) });
  assert.deepEqual(refused, {
    ok: false, code: "CAPACITY_FULL", retryable: true, retryAfterSeconds: 90,
    message: "ANVI is busy with other interviews right now. Please try again in a few minutes.",
  });
  assert.equal(ctx.createConductor.made.length, 2, "no conductor (and no Live session) for a refused join");
  assert.equal(ctx.handlers.capacity.count(), 2);
  assert.match(ctx.warnings.join("\n"), /global live-session cap/);
});

test("ending an attempt over the socket removes the resume text it was planned from", async () => {
  const ctx = setup();
  const { id, socket } = ctx.student();
  const attemptId = ctx.addAttempt(id);
  assert.equal((await socket.call("anvi:join", { attemptId })).ok, true);
  const result = await ctx.createConductor.made[0].options.persist.finalize({ status: "abandoned", endReason: "ended_by_student", items: [] });
  assert.equal(result.applied, true);
  const attempt = ctx.attempts.get(attemptId);
  assert.deepEqual(ctx.models.AnviResumeContext.deleted, [{ studentId: attempt.studentId, interviewId: attempt.interviewId, assignmentId: null }]);
});

test("the per-university cap is separate from the global cap", async () => {
  const north = { universityId: "north", connection: {}, permissions: { interviews: true } };
  const south = { universityId: "south", connection: {}, permissions: { interviews: true } };
  const ctx = setup({ maxLiveSessions: 10, maxLiveSessionsPerTenant: 1, tenants: { north, south } });
  const first = ctx.student("north");
  assert.equal((await first.socket.call("anvi:join", { attemptId: ctx.addAttempt(first.id) })).ok, true);
  const second = ctx.student("north");
  assert.equal((await second.socket.call("anvi:join", { attemptId: ctx.addAttempt(second.id) })).code, "CAPACITY_FULL");
  const other = ctx.student("south");
  assert.equal((await other.socket.call("anvi:join", { attemptId: ctx.addAttempt(other.id) })).ok, true);
  assert.equal(ctx.handlers.capacity.count("north"), 1);
  assert.equal(ctx.handlers.capacity.count("south"), 1);
  assert.match(ctx.warnings.join("\n"), /university live-session cap/);
});

test("at the cap, a resume, a takeover and a switch between the student's interviews are admitted", async () => {
  const ctx = setup({ maxLiveSessions: 1, maxLiveSessionsPerTenant: 1 });
  const holder = ctx.student();
  const attemptId = ctx.addAttempt(holder.id);
  assert.equal((await holder.socket.call("anvi:join", { attemptId })).ok, true);

  // Another tab of the same attempt takes it over; the count stays at one.
  const tab = ctx.io.connect(new FakeSocket({ userId: holder.id }));
  assert.equal((await tab.call("anvi:join", { attemptId })).ok, true);
  assert.equal(holder.socket.got("anvi:taken_over").length, 1);
  assert.equal(ctx.handlers.capacity.count(), 1);

  // Switching to another of their own interviews pauses the first one and keeps the count at one.
  const second = ctx.addAttempt(holder.id);
  assert.equal((await tab.call("anvi:join", { attemptId: second })).ok, true);
  assert.equal(ctx.handlers.capacity.count(), 1);

  // A dropped interview that already ran (its lease was claimed before) resumes even while full.
  const dropped = ctx.student();
  const running = ctx.addAttempt(dropped.id, { leaseToken: "earlier-holder", phase: "asking" });
  assert.equal((await dropped.socket.call("anvi:join", { attemptId: running })).ok, true);
  assert.equal(ctx.handlers.capacity.count(), 2, "resumes are counted even above the cap");
  // A brand-new interview is still refused.
  const fresh = ctx.student();
  assert.equal((await fresh.socket.call("anvi:join", { attemptId: ctx.addAttempt(fresh.id) })).code, "CAPACITY_FULL");
});

test("slots are released on disconnect, leave, end and failed start, without leaks", async () => {
  const ctx = setup({ maxLiveSessions: 1, maxLiveSessionsPerTenant: 1 });
  const join = async (student, attemptId = ctx.addAttempt(student.id)) => ({ attemptId, reply: await student.socket.call("anvi:join", { attemptId }) });

  const a = ctx.student();
  assert.equal((await join(a)).reply.ok, true);
  a.socket.drop();
  await settle();
  assert.equal(ctx.handlers.capacity.count(), 0, "disconnect");

  const b = ctx.student();
  const { attemptId } = await join(b);
  b.socket.fire("anvi:leave", { attemptId });
  await settle();
  assert.equal(ctx.handlers.capacity.count(), 0, "leave");

  const c = ctx.student();
  assert.equal((await join(c)).reply.ok, true);
  ctx.createConductor.made.at(-1).emit("ended", { status: "completed", endReason: "completed" });
  await settle();
  assert.equal(ctx.handlers.capacity.count(), 0, "ended");
  assert.deepEqual(c.socket.got("anvi:ended").at(-1), { status: "completed", endReason: "completed" });

  ctx.createConductor.failNext = true;
  const d = ctx.student();
  assert.equal((await join(d)).reply.code, "LIVE_UNAVAILABLE");
  assert.equal(ctx.handlers.capacity.count(), 0, "failed start");

  // Many join/leave cycles never leak a slot.
  const f = ctx.student();
  for (let i = 0; i < 5; i += 1) {
    ctx.advance(61_000);
    const cycle = await join(f);
    assert.equal(cycle.reply.ok, true, `cycle ${i}`);
    f.socket.fire("anvi:leave", { attemptId: cycle.attemptId });
    await settle();
  }
  assert.equal(ctx.handlers.capacity.count(), 0);
  const g = ctx.student();
  assert.equal((await join(g)).reply.ok, true, "the freed slot is usable");
});

test("a socket that goes away after admission gives its slot back", async () => {
  let afterAcquire = null;
  const ctx = setup({
    capacity: () => {
      const inner = createLiveCapacity({ maxLiveSessions: 1, maxLiveSessionsPerTenant: 1, client: null });
      return { ...inner, acquire: async (args) => { const result = await inner.acquire(args); afterAcquire?.(); return result; } };
    },
  });
  const { id, socket } = ctx.student();
  afterAcquire = () => { socket.connected = false; };
  const pending = socket.call("anvi:join", { attemptId: ctx.addAttempt(id) });
  await Promise.race([pending, settle(20)]);
  assert.equal(ctx.handlers.capacity.count(), 0);
  assert.equal(ctx.createConductor.made.length, 0);
  afterAcquire = null;
  const next = ctx.student();
  assert.equal((await next.socket.call("anvi:join", { attemptId: ctx.addAttempt(next.id) })).ok, true);
});

test("Gemini usage and Live session time are metered to the attempt, inside its university", async () => {
  const north = { universityId: "north", connection: {}, permissions: { interviews: true } };
  const ctx = setup({
    tenants: { north },
    gemini: {
      async transcribePcm({ onUsage }) {
        onUsage?.({ kind: "transcribe", model: "stt-model", tokens: { input: 120, output: 30, total: 150, inputByModality: { AUDIO: 100, TEXT: 20 } }, audioSeconds: 4 });
        return "text";
      },
    },
  });
  const { id, socket } = ctx.student("north");
  const attemptId = ctx.addAttempt(id);
  assert.equal((await socket.call("anvi:join", { attemptId })).ok, true);
  const conductor = ctx.createConductor.made.at(-1);
  // The conductor's client is metered; the call itself runs outside any tenant context (Gemini callbacks).
  assert.equal(await conductor.options.gemini.transcribePcm({ pcm: Buffer.alloc(4) }), "text");
  assert.equal(conductor.options.gemini.configured, true);
  ctx.advance(95_000);
  socket.drop();
  await settle();
  await ctx.usage.flush();

  const interviewId = ctx.attempts.get(attemptId).interviewId;
  const transcribe = ctx.rows.find((row) => row.kind === "transcribe");
  assert.equal(transcribe.writtenIn, "north", "written inside the university's tenant context");
  assert.equal(transcribe.tenantKey, "north");
  assert.equal(String(transcribe.attemptId), attemptId);
  assert.equal(String(transcribe.studentId), id);
  assert.equal(String(transcribe.interviewId), interviewId);
  assert.deepEqual([transcribe.inputTokens, transcribe.outputTokens, transcribe.totalTokens, transcribe.audioSeconds], [120, 30, 150, 4]);
  assert.deepEqual(transcribe.inputByModality, { AUDIO: 100, TEXT: 20 });
  const session = ctx.rows.find((row) => row.kind === "session");
  assert.equal(session.sessionSeconds, 95);
  assert.equal(session.model, "live-model");
  assert.equal(session.writtenIn, "north");
  assert.equal(ctx.rows.filter((row) => row.kind === "session").length, 1, "one session row per held Live session");
});

test("a failing usage write never breaks a join or a release", async () => {
  const ctx = setup();
  const broken = createUsageLedger({ model: { insertMany: async () => { throw new Error("db down"); } }, log: { warn() {} } });
  const io = fakeIo();
  const store = ctx;
  registerAnviSocketHandlers(io, {
    gemini: { async openLive() { return {}; } },
    config: { maxLiveSessions: 1 },
    models: store.models,
    createConductor: fakeConductors(),
    getTenant: async () => null,
    scheduling: { practiceBlocked: async () => false },
    usage: broken,
    log: { warn() {} },
  });
  const id = store.addStudent();
  const socket = io.connect(new FakeSocket({ userId: id }));
  assert.equal((await socket.call("anvi:join", { attemptId: store.addAttempt(id) })).ok, true);
  socket.drop();
  await settle();
  await broken.flush();
  assert.equal(broken.stats().buffered, 0);
});

// --- Shared (Valkey) counting -------------------------------------------------------------------

// Emulates the three Lua scripts over plain maps, so the JS side of the protocol is exercised.
function fakeValkey() {
  const sets = new Map();
  const owners = new Map();
  const calls = [];
  const zset = (key) => { if (!sets.has(key)) sets.set(key, new Map()); return sets.get(key); };
  const client = {
    failing: false,
    async sendCommand(args) {
      calls.push(args);
      if (client.failing) throw new Error("Cache command timed out");
      const [, script, count, ...rest] = args;
      const keys = rest.slice(0, Number(count));
      const argv = rest.slice(Number(count));
      const [all, tenant] = [zset(keys[0]), zset(keys[1])];
      if (script === ACQUIRE_SCRIPT) {
        const [now, expires, member, token, globalCap, tenantCap, force] = argv;
        for (const set of [all, tenant]) for (const [name, at] of set) if (at <= Number(now)) { set.delete(name); owners.delete(name); }
        const held = all.has(member);
        if (!held && force !== "1") {
          if (all.size >= Number(globalCap)) return [0, "global"];
          if (tenant.size >= Number(tenantCap)) return [0, "tenant"];
        }
        all.set(member, Number(expires));
        tenant.set(member, Number(expires));
        owners.set(member, token);
        return [1, held ? "held" : "new"];
      }
      if (script === HEARTBEAT_SCRIPT) {
        const [expires, member, token] = argv;
        if (owners.has(member) && owners.get(member) !== token) return 0;
        all.set(member, Number(expires));
        tenant.set(member, Number(expires));
        owners.set(member, token);
        return 1;
      }
      if (script === RELEASE_SCRIPT) {
        const [member, token] = argv;
        if (owners.get(member) !== token) return 0;
        owners.delete(member);
        all.delete(member);
        tenant.delete(member);
        return 1;
      }
      throw new Error("unknown script");
    },
  };
  return { client, sets, owners, calls };
}

test("with Valkey, the caps hold across instances and a takeover keeps the slot", async () => {
  const valkey = fakeValkey();
  let now = 1_000_000;
  const intervals = { setInterval: () => ({ unref() {} }), clearInterval() {} };
  const instance = () => createLiveCapacity({ maxLiveSessions: 2, maxLiveSessionsPerTenant: 2, client: valkey.client, clock: { now: () => now }, intervals, log: { warn() {} } });
  const [a, b] = [instance(), instance()];

  const first = await a.acquire({ attemptId: "x1", tenantKey: "north" });
  const second = await b.acquire({ attemptId: "x2", tenantKey: "north" });
  assert.equal(first.ok && second.ok, true);
  assert.deepEqual(await a.acquire({ attemptId: "x3", tenantKey: "north" }), { ok: false, scope: "global" });
  assert.equal(a.count(), 1, "a refused slot is not kept locally");

  // Instance B takes over attempt x1 (its member already exists), then A's late release is ignored.
  const takeover = await b.acquire({ attemptId: "x1", tenantKey: "north" });
  assert.equal(takeover.ok, true);
  a.release(first.slot);
  await settle();
  assert.equal(valkey.owners.get("north|x1"), takeover.slot.token);
  assert.equal(valkey.sets.get("anvi:live:v1:{slots}:all").size, 2);

  b.release(takeover.slot);
  b.release(takeover.slot);
  await settle();
  assert.equal(valkey.sets.get("anvi:live:v1:{slots}:all").size, 1);
  assert.equal((await a.acquire({ attemptId: "x4", tenantKey: "south" })).ok, true);

  // Leases of a crashed instance expire without a heartbeat.
  now += 120_000;
  assert.equal((await a.acquire({ attemptId: "x5", tenantKey: "south" })).ok, true);
  assert.equal(valkey.sets.get("anvi:live:v1:{slots}:all").has("north|x2"), false);
  assert.ok(valkey.calls.every((args) => args[0] === "EVAL" && args[2] === "3"));
  assert.ok(valkey.calls.flat().every((part) => !/^anvi:live/.test(part) || part.includes("{slots}")), "keys share one hash tag");
});

test("a Valkey outage falls back to this process's count and heartbeats re-register slots", async () => {
  const valkey = fakeValkey();
  const beats = [];
  const intervals = { setInterval: (fn) => { beats.push(fn); return { unref() {} }; }, clearInterval() {} };
  const warnings = [];
  const capacity = createLiveCapacity({ maxLiveSessions: 1, maxLiveSessionsPerTenant: 1, client: valkey.client, intervals, log: { warn: (message) => warnings.push(message) } });
  valkey.client.failing = true;
  const held = await capacity.acquire({ attemptId: "y1", tenantKey: "north" });
  assert.equal(held.ok, true, "an outage never refuses on its own");
  assert.deepEqual(await capacity.acquire({ attemptId: "y2", tenantKey: "north" }), { ok: false, scope: "global" }, "the local cap still applies");
  assert.equal(warnings.length, 1);
  valkey.client.failing = false;
  assert.equal(beats.length, 1);
  beats[0]();
  await settle();
  assert.equal(valkey.owners.get("north|y1"), held.slot.token);
  capacity.release(held.slot);
  await settle();
  assert.equal(valkey.owners.size, 0);
  assert.equal(capacity.count(), 0);
});
