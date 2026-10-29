import assert from "node:assert/strict";
import { test } from "node:test";
import { registerAnviSocketHandlers } from "../src/modules/anviInterview/anviInterview.socket.js";
import {
  LIMIT_ENDED_MESSAGE, PROCTOR_OTHER_EVENT_CAP, aiEventDetails, normalizeProctoring, proctorStateOf, proctoringSummary, recordProctorEvent, studentProctoringView,
} from "../src/modules/anviInterview/anviInterview.proctoring.js";
import { createUsageLedger } from "../src/modules/anviInterview/anviInterview.usage.js";

// The socket layer's proctoring (anvi:proctor, rejoins, pauses, the violation limit), with in-memory models and
// a fake conductor, so these tests need neither MongoDB nor Gemini.
const settle = async (rounds = 8) => { for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
let seq = 0;
const objectId = () => (++seq).toString(16).padStart(24, "b");

class FakeSocket {
  constructor({ userId }) {
    Object.assign(this, { userId: String(userId), universityId: "platform", userRole: "student", connected: true });
    this.handlers = new Map();
    this.sent = [];
  }
  on(event, fn) { this.handlers.set(event, fn); }
  emit(event, payload) { this.sent.push({ event, payload }); }
  call(event, payload) { return new Promise((resolve) => this.handlers.get(event)(payload, resolve)); }
  fire(event, payload) { this.handlers.get(event)?.(payload); }
  got(event) { return this.sent.filter((entry) => entry.event === event).map((entry) => entry.payload); }
  drop(reason = "transport close") { this.connected = false; this.fire("disconnect", reason); }
}

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
      updateOne: async (filter, update) => {
        const attempt = attempts.get(String(filter._id));
        if (!attempt || attempt.status !== filter.status) return { matchedCount: 0, modifiedCount: 0 };
        Object.assign(attempt, update.$set);
        return { matchedCount: 1, modifiedCount: 1 };
      },
    },
    AnviLiveSession: {
      findOne: (filter) => query(() => {
        const live = lives.get(String(filter.attemptId));
        return live && (!filter.leaseToken || live.leaseToken === filter.leaseToken) ? structuredClone(live) : null;
      }),
      findOneAndUpdate: (filter, update) => query(() => {
        const live = lives.get(String(filter.attemptId));
        if (!live) return null;
        Object.assign(live, update.$set);
        return structuredClone(live);
      }),
      exists: async (filter) => lives.has(String(filter.attemptId)),
      updateOne: async (filter, update) => {
        const live = lives.get(String(filter.attemptId));
        if (!live || (filter.leaseToken && live.leaseToken !== filter.leaseToken)) return { matchedCount: 0, modifiedCount: 0 };
        Object.assign(live, structuredClone(update.$set));
        return { matchedCount: 1, modifiedCount: 1 };
      },
      deleteOne: async (filter) => { lives.delete(String(filter.attemptId)); return { deletedCount: 1 }; },
    },
    AnviResumeContext: { async deleteOne() { return { deletedCount: 1 }; } },
  };
  const addStudent = () => {
    const id = objectId();
    users.set(id, { _id: id, name: "Asha Verma", role: "student", isActive: true, accessScope: "full" });
    return id;
  };
  const addAttempt = (studentId, proctoring) => {
    const id = objectId();
    attempts.set(id, { _id: id, studentId, interviewId: objectId(), status: "in_progress", hardDeadline: new Date(Date.UTC(2030, 0, 1)), assignmentId: null });
    lives.set(id, { attemptId: id, leaseToken: null, phase: "asking", finalizingAt: null, plan: [], rules: proctoring ? { proctoring } : {} });
    return id;
  };
  return { models, addStudent, addAttempt, attempts, lives };
}

// A conductor that reports its question, holds and ends through the real persist.finalize.
function fakeConductors() {
  const made = [];
  const create = (options) => {
    const listeners = new Map();
    const conductor = {
      options, questionNumber: 2, onHold: false, holds: 0, releases: 0, endReasons: [], finalizing: false,
      on(event, fn) { listeners.set(event, fn); },
      emit(event, payload) { listeners.get(event)?.(payload); },
      async start() { return { phase: options.live.phase }; },
      state: () => ({ phase: "asking", questionNumber: conductor.questionNumber }),
      hold() { if (conductor.onHold) return false; conductor.onHold = true; conductor.holds += 1; return true; },
      releaseHold() { if (!conductor.onHold) return false; conductor.onHold = false; conductor.releases += 1; return true; },
      isOnHold: () => conductor.onHold,
      isFinalizing: () => Boolean(conductor.finalizing),
      end(endReason = "ended_by_student") {
        if (conductor.finalizing) return conductor.finalizing;
        conductor.endReasons.push(endReason);
        conductor.finalizing = (async () => {
          const result = await options.persist.finalize({ status: "abandoned", endReason, items: [] });
          const outcome = { status: result.status || "abandoned", endReason: result.endReason ?? endReason };
          conductor.emit("ended", outcome);
          return outcome;
        })();
        return conductor.finalizing;
      },
      dispose() {},
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

function setup() {
  const store = memoryModels();
  const createConductor = fakeConductors();
  let now = Date.UTC(2026, 9, 22, 10, 0, 0);
  // One server process; another instance (or the same server after a restart) shares only the models.
  const instance = () => {
    const io = { listeners: [], on(event, fn) { if (event === "connection") this.listeners.push(fn); }, connect(socket) { for (const fn of this.listeners) fn(socket); return socket; } };
    registerAnviSocketHandlers(io, {
      gemini: { async openLive() { return {}; } },
      clock: { now: () => now },
      config: { maxLiveSessions: 50, maxLiveSessionsPerTenant: 50, maxJoinsPerMinute: 100 },
      models: store.models,
      createConductor,
      getTenant: async () => null,
      scheduling: { practiceBlocked: async () => false, onAttemptFinalized: async () => {} },
      observeInterview: async () => {},
      evaluateSoon: () => null,
      usage: createUsageLedger({ model: { insertMany: async () => {} }, log: { warn() {} } }),
      log: { warn() {} },
    });
    return io;
  };
  const io = instance();
  const join = async (studentId, attemptId, extra = {}, server = io) => {
    const socket = server.connect(new FakeSocket({ userId: studentId }));
    const reply = await socket.call("anvi:join", { attemptId, ...extra });
    await settle();
    return { socket, reply, conductor: createConductor.made.at(-1) };
  };
  const start = async (proctoring, extra) => {
    const studentId = store.addStudent();
    const attemptId = store.addAttempt(studentId, proctoring);
    return { studentId, attemptId, ...(await join(studentId, attemptId, extra)) };
  };
  const proctor = (socket, attemptId, type, extra = {}) => socket.call("anvi:proctor", { attemptId, type, ...extra });
  return { ...store, createConductor, join, start, proctor, instance, advance: (ms) => { now += ms; } };
}

const ON = { enabled: true, fullscreen: "required", tabSwitch: "warn", refresh: "record", warnings: 3, maxViolations: 0 };

test("ignored when proctoring is off; only the lease holder's valid events are accepted", async () => {
  const ctx = setup();
  const off = await ctx.start(null);
  assert.equal(off.reply.ok, true);
  assert.equal(off.reply.proctoring, undefined, "nothing proctoring-related for an unproctored attempt");
  assert.deepEqual(await ctx.proctor(off.socket, off.attemptId, "fullscreen_exit"), { ok: true, ignored: true, violations: 0, maxViolations: 0 });
  assert.equal(ctx.lives.get(off.attemptId).proctoring, undefined, "nothing written");

  const on = await ctx.start(ON);
  assert.equal(on.reply.proctoring.enabled, true);
  assert.equal((await ctx.proctor(on.socket, on.attemptId, "screenshot")).code, "INVALID_EVENT");
  assert.equal((await ctx.proctor(on.socket, off.attemptId, "tab_hidden")).code, "NOT_JOINED", "another attempt");
  // Another tab takes the attempt over: the old one is no longer the lease holder.
  const tab = await ctx.join(on.studentId, on.attemptId);
  assert.equal((await ctx.proctor(on.socket, on.attemptId, "tab_hidden")).code, "NOT_JOINED");
  assert.equal((await ctx.proctor(tab.socket, on.attemptId, "tab_hidden")).ok, true);
});

test("rate limit: 30 events a minute per attempt, with blocked actions and camera events in their own buckets", async () => {
  const ctx = setup();
  const { socket, attemptId } = await ctx.start({ ...ON, ai: { enabled: true } });
  for (let i = 0; i < 30; i += 1) assert.equal((await ctx.proctor(socket, attemptId, "shortcut")).ok, true, `event ${i}`);
  const limited = await ctx.proctor(socket, attemptId, "shortcut");
  assert.equal(limited.code, "RATE_LIMITED");
  assert.equal((await ctx.proctor(socket, attemptId, "fullscreen_exit")).ok, true, "screen events are not crowded out");
  assert.equal((await ctx.proctor(socket, attemptId, "ai_no_face")).ok, true, "nor camera events");
  ctx.advance(61_000);
  assert.equal((await ctx.proctor(socket, attemptId, "shortcut")).ok, true, "the window moves on");
});

test("counting: blur and hidden within 1 s are one violation; events carry the question; warnings count down", async () => {
  const ctx = setup();
  const { socket, attemptId, conductor } = await ctx.start({ ...ON, warnings: 2 });
  const first = await ctx.proctor(socket, attemptId, "window_blur");
  assert.equal(first.violations, 1);
  assert.match(first.warning, /^Warning 1 of 2: Switching tabs/);
  ctx.advance(400);
  const paired = await ctx.proctor(socket, attemptId, "tab_hidden");
  assert.equal(paired.violations, 1, "the pair counts once");
  assert.equal(paired.warning, undefined);
  ctx.advance(2_000);
  await ctx.proctor(socket, attemptId, "tab_visible");
  conductor.questionNumber = 3;
  assert.equal((await ctx.proctor(socket, attemptId, "fullscreen_exit")).warning.startsWith("Warning 2 of 2"), true);
  ctx.advance(2_000);
  const third = await ctx.proctor(socket, attemptId, "window_blur");
  assert.equal(third.violations, 3, "violations keep counting after the warnings");
  assert.equal(third.warning, undefined, "no warning after the last one");
  const warnings = socket.got("anvi:proctor-warning");
  assert.equal(warnings.length, 2);
  assert.deepEqual({ ...warnings[0], message: undefined }, { type: "window_blur", violations: 1, maxViolations: 0, message: undefined, warning: 1, warnings: 2 });
  const stored = ctx.lives.get(attemptId).proctoring;
  assert.deepEqual(stored.events.map((event) => [event.type, event.questionN]), [
    ["window_blur", 2], ["tab_hidden", 2], ["tab_visible", 2], ["fullscreen_exit", 3], ["window_blur", 3],
  ]);
  assert.equal(stored.counts.window_blur, 2);
  assert.equal(stored.counts.tab_hidden, 1);
  assert.equal(stored.violations, 3);
});

test("a tab switch under \"record\" is silent; blocked actions are logged but never violations", async () => {
  const ctx = setup();
  const { socket, attemptId } = await ctx.start({ ...ON, tabSwitch: "record", blockRightClick: true, blockCopyPaste: true, blockShortcuts: false });
  assert.equal((await ctx.proctor(socket, attemptId, "tab_hidden")).warning, undefined);
  for (const type of ["right_click", "copy_paste", "copy_paste"]) assert.equal((await ctx.proctor(socket, attemptId, type)).violations, 1);
  assert.equal((await ctx.proctor(socket, attemptId, "shortcut")).ignored, true, "shortcut blocking is off");
  const stored = ctx.lives.get(attemptId).proctoring;
  assert.deepEqual([stored.counts.right_click, stored.counts.copy_paste, stored.counts.shortcut, stored.violations], [1, 2, 0, 1]);
  assert.equal(socket.got("anvi:proctor-warning").length, 0);
});

test("the limit with onLimit \"end\" ends the attempt the normal way with proctoring_limit and keeps the log", async () => {
  const ctx = setup();
  const { socket, attemptId, conductor } = await ctx.start({ ...ON, maxViolations: 2, onLimit: "end", pauseOutsideFullscreen: false });
  const first = await ctx.proctor(socket, attemptId, "fullscreen_exit");
  assert.match(first.warning, /Violations: 1 of 2; the interview ends at 2/);
  ctx.advance(2_000);
  const second = await ctx.proctor(socket, attemptId, "tab_hidden");
  assert.equal(second.ended, true);
  assert.equal(second.warning, LIMIT_ENDED_MESSAGE);
  await settle();
  assert.deepEqual(conductor.endReasons, ["proctoring_limit"]);
  const attempt = ctx.attempts.get(attemptId);
  assert.equal(attempt.status, "abandoned");
  assert.equal(attempt.endReason, "proctoring_limit");
  assert.equal(attempt.partial, true, "scored as a partial attempt, never penalised");
  assert.equal(attempt.proctoring.endedForViolations, true);
  assert.equal(attempt.proctoring.violations, 2);
  assert.deepEqual(attempt.proctoring.events.map((event) => event.type), ["fullscreen_exit", "tab_hidden"]);
  assert.equal(attempt.proctoring.settings.maxViolations, 2);
  assert.deepEqual(socket.got("anvi:ended").at(-1), { status: "abandoned", endReason: "proctoring_limit" });
  // Nothing more is recorded once the attempt ended for violations.
  assert.equal((await ctx.proctor(socket, attemptId, "tab_hidden")).code, "NOT_JOINED");
});

test("the limit with onLimit \"flag\" only flags the attempt", async () => {
  const ctx = setup();
  const { socket, attemptId, conductor } = await ctx.start({ ...ON, maxViolations: 1, onLimit: "flag", warnings: 0 });
  const reached = await ctx.proctor(socket, attemptId, "tab_hidden");
  assert.equal(reached.limitReached, true);
  assert.equal(reached.ended, undefined);
  ctx.advance(2_000);
  assert.equal((await ctx.proctor(socket, attemptId, "window_blur")).violations, 2, "counting continues");
  await settle();
  assert.deepEqual(conductor.endReasons, []);
  assert.equal(ctx.attempts.get(attemptId).status, "in_progress");
  assert.equal(ctx.lives.get(attemptId).proctoring.limitReached, true);
  await conductor.options.persist.finalize({ status: "completed", endReason: "completed", items: [] });
  const stored = ctx.attempts.get(attemptId).proctoring;
  assert.deepEqual([stored.limitReached, stored.endedForViolations, stored.violations], [true, false, 2]);
});

test("rejoin: recorded for a refresh or another tab, not for the same page reconnecting within 5 s", async () => {
  const ctx = setup();
  const { socket, attemptId, studentId } = await ctx.start(ON, { clientId: "page-one-1234" });
  assert.equal(ctx.lives.get(attemptId).proctoring.joins, 1);
  assert.equal(ctx.lives.get(attemptId).proctoring.counts.rejoin, 0, "the first join is not a rejoin");
  // The same page reconnects on a new socket 2 s after its old one dropped.
  socket.drop();
  await settle();
  ctx.advance(2_000);
  const back = await ctx.join(studentId, attemptId, { clientId: "page-one-1234" });
  assert.equal(ctx.lives.get(attemptId).proctoring.counts.rejoin, 0);
  // A refresh: a new page load (new client id).
  back.socket.drop();
  await settle();
  const refreshed = await ctx.join(studentId, attemptId, { clientId: "page-two-5678" });
  assert.equal(ctx.lives.get(attemptId).proctoring.counts.rejoin, 1);
  assert.equal(ctx.lives.get(attemptId).proctoring.violations, 1);
  assert.match(refreshed.socket.got("anvi:proctor-warning")[0].message, /rejoining this interview is recorded/);
  // The same page, but long after it left the room: a leave-and-rejoin.
  refreshed.socket.fire("anvi:leave", { attemptId });
  await settle();
  ctx.advance(6_000);
  await ctx.join(studentId, attemptId, { clientId: "page-two-5678" });
  assert.equal(ctx.lives.get(attemptId).proctoring.counts.rejoin, 2);

  // refresh "off": rejoins are not recorded.
  const quiet = await ctx.start({ ...ON, refresh: "off" });
  quiet.socket.drop();
  await settle();
  const again = await ctx.join(quiet.studentId, quiet.attemptId);
  assert.equal(again.reply.ok, true, JSON.stringify(again.reply));
  assert.equal(ctx.lives.get(quiet.attemptId).proctoring.counts.rejoin, 0);
  assert.equal(ctx.lives.get(quiet.attemptId).proctoring.joins, 2);
});

test("pause: out of fullscreen or a hidden tab holds the interview until both are back", async () => {
  const ctx = setup();
  const { socket, attemptId, conductor, reply } = await ctx.start({ ...ON, pauseOutsideFullscreen: true, tabSwitch: "off" });
  // A new holder starts held until the room reports fullscreen_enter (as it does on every join in fullscreen).
  assert.equal(reply.paused, true);
  assert.equal(conductor.onHold, true);
  assert.deepEqual(socket.got("anvi:paused"), [{ reason: "fullscreen_exit" }]);
  await ctx.proctor(socket, attemptId, "fullscreen_enter");
  assert.equal(conductor.onHold, false);
  assert.deepEqual(ctx.lives.get(attemptId).proctoring.pauses, [], "a hold the room ends at once is not a pause");
  const exit = await ctx.proctor(socket, attemptId, "fullscreen_exit");
  assert.equal(exit.paused, true);
  assert.deepEqual(socket.got("anvi:paused").at(-1), { reason: "fullscreen_exit" });
  // The tab is hidden too; tab events are not logged (tabSwitch off) but still keep the pause.
  assert.equal((await ctx.proctor(socket, attemptId, "tab_hidden")).ignored, true);
  await ctx.proctor(socket, attemptId, "fullscreen_enter");
  assert.equal(conductor.onHold, true, "still hidden");
  assert.equal(socket.got("anvi:resumed").length, 1);
  await ctx.proctor(socket, attemptId, "tab_visible");
  assert.equal(conductor.onHold, false);
  assert.deepEqual(socket.got("anvi:resumed"), [{}, {}]);
  assert.deepEqual([conductor.holds, conductor.releases], [2, 2]);
  // Only the fullscreen exit was a violation; the pause itself is kept as { from, to, reason }.
  assert.equal(ctx.lives.get(attemptId).proctoring.violations, 1);
  const [pause] = ctx.lives.get(attemptId).proctoring.pauses;
  assert.equal(pause.reason, "fullscreen_exit");
  assert.ok(pause.from instanceof Date && pause.to instanceof Date);
  // A pause still open when the attempt ends closes at the end.
  ctx.advance(1_000);
  await ctx.proctor(socket, attemptId, "fullscreen_exit");
  ctx.advance(3_000);
  await conductor.options.persist.finalize({ status: "completed", endReason: "completed", items: [] });
  const pauses = ctx.attempts.get(attemptId).proctoring.pauses;
  assert.equal(pauses.length, 2);
  assert.equal(pauses[1].to.getTime() - pauses[1].from.getTime(), 3_000);

  const free = await ctx.start({ ...ON, pauseOutsideFullscreen: false });
  await ctx.proctor(free.socket, free.attemptId, "fullscreen_exit");
  assert.equal(free.conductor.holds, 0, "no pause without pauseOutsideFullscreen");
  assert.equal(free.socket.got("anvi:paused").length, 0);
});

test("camera AI events: sanitized severity and confidence, counted as violations; a blocked camera pauses", async () => {
  const ctx = setup();
  const ai = { enabled: true, detectMobile: true, detectLookingAway: false };
  const { socket, attemptId, conductor } = await ctx.start({ ...ON, pauseOutsideFullscreen: true, ai });
  await ctx.proctor(socket, attemptId, "fullscreen_enter");
  const phone = await ctx.proctor(socket, attemptId, "ai_mobile_detected", { severity: "HIGH", confidence: "0.8764" });
  assert.equal(phone.violations, 1);
  assert.match(phone.warning, /^Warning 1 of 3: Keep your face clearly in view/);
  await ctx.proctor(socket, attemptId, "ai_multiple_persons", { severity: "<script>", confidence: 7 });
  assert.equal((await ctx.proctor(socket, attemptId, "ai_looking_away")).ignored, true, "that check is off");
  let stored = ctx.lives.get(attemptId).proctoring;
  assert.deepEqual(stored.events.map(({ type, severity, confidence }) => ({ type, severity, confidence })), [
    { type: "fullscreen_enter", severity: undefined, confidence: undefined },
    { type: "ai_mobile_detected", severity: "high", confidence: 0.876 },
    { type: "ai_multiple_persons", severity: undefined, confidence: undefined },
  ]);
  assert.equal(stored.violations, 2);
  assert.equal(stored.ai.mobileDetected, 1);
  assert.equal(stored.ai.multiplePersons, 1);

  // A blocked camera holds the interview instead of counting; the restored camera resumes it.
  const blocked = await ctx.proctor(socket, attemptId, "ai_camera_blocked");
  assert.equal(blocked.violations, 2);
  assert.equal(blocked.paused, true);
  assert.deepEqual(socket.got("anvi:paused").at(-1), { reason: "camera_blocked" });
  await ctx.proctor(socket, attemptId, "ai_camera_restored");
  assert.equal(conductor.onHold, false);
  assert.equal(socket.got("anvi:resumed").length, 2, "after the join hold and after the camera");

  await conductor.options.persist.finalize({ status: "completed", endReason: "completed", items: [] });
  const summary = ctx.attempts.get(attemptId).proctoring;
  assert.deepEqual(summary.aiEvents.map((event) => event.type), ["ai_mobile_detected", "ai_multiple_persons", "ai_camera_blocked"]);
  assert.equal(summary.events.at(-1).type, "ai_camera_restored", "the full log keeps the restore");
  assert.equal(summary.ai.cameraBlocked, 1);
  assert.equal(summary.ai.riskLevel, "high");

  // Without the pause, a blocked camera is a violation.
  const plain = await ctx.start({ ...ON, pauseOutsideFullscreen: false, ai });
  assert.equal((await ctx.proctor(plain.socket, plain.attemptId, "ai_camera_blocked")).violations, 1);
  // Camera events are ignored unless camera checks are on.
  const noCamera = await ctx.start(ON);
  assert.equal((await ctx.proctor(noCamera.socket, noCamera.attemptId, "ai_mobile_detected")).ignored, true);
});

test("camera AI with fullscreen off: a blocked camera is a violation and never holds (the room shows no pause then)", async () => {
  const ctx = setup();
  const { socket, attemptId, conductor, reply } = await ctx.start({ ...ON, fullscreen: "off", pauseOutsideFullscreen: true, ai: { enabled: true } });
  assert.equal(reply.paused, undefined, "not held at join either");
  const blocked = await ctx.proctor(socket, attemptId, "ai_camera_blocked");
  assert.equal(blocked.violations, 1);
  assert.equal(blocked.paused, undefined);
  assert.match(blocked.warning, /camera is blocked/);
  await ctx.proctor(socket, attemptId, "ai_camera_restored");
  assert.equal(conductor.holds, 0);
  assert.equal(socket.got("anvi:paused").length, 0);
});

test("a new holder starts held under the pause rule: a pause survives a reconnect until the room is back in fullscreen", async () => {
  const ctx = setup();
  const rules = { ...ON, pauseOutsideFullscreen: true, tabSwitch: "off" };
  const { socket, attemptId, studentId } = await ctx.start(rules, { clientId: "page-one-1234" });
  await ctx.proctor(socket, attemptId, "fullscreen_enter");
  ctx.advance(1_000);
  await ctx.proctor(socket, attemptId, "fullscreen_exit");
  // The socket drops while the student is outside; the room re-joins but sends no fullscreen_enter.
  socket.drop();
  await settle();
  ctx.advance(2_000);
  const back = await ctx.join(studentId, attemptId, { clientId: "page-one-1234" });
  assert.equal(back.reply.paused, true);
  assert.equal(back.conductor.onHold, true, "still paused: nudges and the reply watchdog stay off");
  assert.deepEqual(back.socket.got("anvi:paused"), [{ reason: "fullscreen_exit" }]);
  let { pauses } = ctx.lives.get(attemptId).proctoring;
  assert.equal(pauses.length, 1, "the pause goes on across the reconnect");
  assert.equal(pauses[0].to, null);
  ctx.advance(10_000);
  await ctx.proctor(back.socket, attemptId, "fullscreen_enter");
  assert.equal(back.conductor.onHold, false);
  ({ pauses } = ctx.lives.get(attemptId).proctoring);
  assert.equal(pauses.length, 1);
  assert.equal(pauses[0].to.getTime() - pauses[0].from.getTime(), 12_000);

  // Without the pause rule nothing is held at join.
  const free = await ctx.start({ ...ON, pauseOutsideFullscreen: false });
  assert.equal(free.conductor.onHold, false);
  assert.equal(free.socket.got("anvi:paused").length, 0);
});

test("a rejoin that reaches the limit ends the attempt without leaving the join hold as a pause", async () => {
  const ctx = setup();
  const rules = { ...ON, pauseOutsideFullscreen: true, maxViolations: 2, onLimit: "end" };
  const { socket, attemptId, studentId } = await ctx.start(rules, { clientId: "page-one-1234" });
  await ctx.proctor(socket, attemptId, "fullscreen_enter");
  ctx.advance(1_000);
  await ctx.proctor(socket, attemptId, "fullscreen_exit");
  ctx.advance(10_000);
  await ctx.proctor(socket, attemptId, "fullscreen_enter");
  socket.drop();
  await settle();
  ctx.advance(1_000);
  // A new page load: held at join, then the rejoin is violation 2 of 2 and ends the attempt at once.
  const refreshed = await ctx.join(studentId, attemptId, { clientId: "page-two-5678" });
  assert.equal(refreshed.reply.paused, true);
  ctx.advance(500);
  await settle();
  assert.deepEqual(refreshed.conductor.endReasons, ["proctoring_limit"]);
  const stored = ctx.attempts.get(attemptId).proctoring;
  assert.equal(stored.counts.rejoin, 1);
  assert.deepEqual(stored.pauses.map((pause) => [pause.reason, pause.to.getTime() - pause.from.getTime()]), [["fullscreen_exit", 10_000]],
    "only the real pause; the hold at join never ran");
});

test("resync: the room re-announcing its state after a join sets the pause only, never counts, warns or logs", async () => {
  const ctx = setup();
  const rules = { ...ON, pauseOutsideFullscreen: true, ai: { enabled: true } };
  const { socket, attemptId, conductor, reply } = await ctx.start(rules);
  assert.equal(reply.paused, true);
  // The join hold is marked in the live doc (so a REST end right away can leave it out).
  assert.deepEqual(ctx.lives.get(attemptId).proctoring.pauses.map((pause) => [pause.reason, pause.to, pause.joinHold]), [["fullscreen_exit", null, true]]);
  // A reload in fullscreen with the camera still blocked: the room re-announces both.
  ctx.advance(300);
  const camera = await ctx.proctor(socket, attemptId, "ai_camera_blocked", { resync: true });
  assert.deepEqual(camera, { ok: true, resync: true, violations: 0, maxViolations: 0, paused: true });
  const enter = await ctx.proctor(socket, attemptId, "fullscreen_enter", { resync: true });
  assert.equal(enter.paused, true, "still held: the camera is blocked");
  assert.equal(conductor.onHold, true);
  assert.deepEqual(socket.got("anvi:paused").at(-1), { reason: "camera_blocked" }, "the join hold takes the real reason");
  ctx.advance(10_000);
  await ctx.proctor(socket, attemptId, "ai_camera_restored");
  assert.equal(conductor.onHold, false);
  // Out-of-fullscreen and hidden-tab resyncs hold again, still without counting.
  const exit = await ctx.proctor(socket, attemptId, "fullscreen_exit", { resync: true });
  assert.deepEqual([exit.ok, exit.resync, exit.violations, exit.paused], [true, true, 0, true]);
  await ctx.proctor(socket, attemptId, "tab_hidden", { resync: true });
  const stored = ctx.lives.get(attemptId).proctoring;
  assert.equal(stored.violations, 0);
  assert.deepEqual([stored.counts.fullscreen_exit, stored.counts.tab_hidden, stored.counts.ai_camera_blocked], [0, 0, 0]);
  assert.equal(stored.ai.cameraBlocked, 0, "nor the camera summary");
  assert.deepEqual(stored.events.map((event) => event.type), ["ai_camera_restored"], "only the live restore is logged");
  assert.equal(socket.got("anvi:proctor-warning").length, 0);
  assert.deepEqual(stored.pauses.map((pause) => [pause.reason, pause.joinHold, Boolean(pause.to)]), [
    ["camera_blocked", undefined, true], ["fullscreen_exit", undefined, false],
  ], "a join hold that lasted is a real pause; the marker goes when it closes");
  // A live (not resync) event still counts as usual.
  await ctx.proctor(socket, attemptId, "fullscreen_enter", { resync: true });
  await ctx.proctor(socket, attemptId, "tab_visible", { resync: true });
  assert.equal(conductor.onHold, false);
  assert.equal((await ctx.proctor(socket, attemptId, "tab_hidden")).violations, 1);

  // Without the camera pause rule, a resync of a blocked camera changes nothing and is not a violation either.
  const plain = await ctx.start({ ...ON, pauseOutsideFullscreen: false, ai: { enabled: true } });
  const blocked = await ctx.proctor(plain.socket, plain.attemptId, "ai_camera_blocked", { resync: true });
  assert.deepEqual(blocked, { ok: true, resync: true, violations: 0, maxViolations: 0 });
  assert.equal(plain.conductor.holds, 0);
});

test("join hold: a socket end within 5 s drops it; the marker is cleared once the room reports back", async () => {
  const ctx = setup();
  const rules = { ...ON, pauseOutsideFullscreen: true };
  const quick = await ctx.start(rules);
  ctx.advance(2_000);
  await quick.socket.call("anvi:end", {});
  await settle();
  assert.deepEqual(ctx.attempts.get(quick.attemptId).proctoring.pauses, [], "never reported back, ended at once: not a pause");
  const slow = await ctx.start(rules);
  ctx.advance(8_000);
  await slow.conductor.options.persist.finalize({ status: "completed", endReason: "completed", items: [] });
  const [pause] = ctx.attempts.get(slow.attemptId).proctoring.pauses;
  assert.deepEqual(Object.keys(pause).sort(), ["from", "reason", "to"], "8 s held: a pause, without the marker");
  assert.equal(pause.to.getTime() - pause.from.getTime(), 8_000);
});

test("rate limit: returns have their own bucket, and a rate-limited event still ends (or starts) a hold", async () => {
  const ctx = setup();
  const { socket, attemptId, conductor } = await ctx.start({ ...ON, pauseOutsideFullscreen: true, tabSwitch: "record" });
  await ctx.proctor(socket, attemptId, "fullscreen_enter");
  assert.equal(conductor.onHold, false);
  for (let i = 0; i < 30; i += 1) assert.equal((await ctx.proctor(socket, attemptId, "window_blur")).ok, true, `blur ${i}`);
  // The screen bucket is full: the exit is not logged or counted, but it still pauses.
  const exit = await ctx.proctor(socket, attemptId, "fullscreen_exit");
  assert.equal(exit.code, "RATE_LIMITED");
  assert.equal(exit.paused, true);
  assert.equal(conductor.onHold, true);
  assert.equal(ctx.lives.get(attemptId).proctoring.counts.fullscreen_exit, 0);
  // Returns are not crowded out by the blurs and exits.
  assert.equal((await ctx.proctor(socket, attemptId, "fullscreen_enter")).ok, true);
  assert.equal(conductor.onHold, false);
  for (let i = 0; i < 28; i += 1) assert.equal((await ctx.proctor(socket, attemptId, "window_focus")).ok, true, `focus ${i}`);
  // Both buckets are full: the student leaves and comes back, and the hold still starts and ends.
  assert.equal((await ctx.proctor(socket, attemptId, "fullscreen_exit")).code, "RATE_LIMITED");
  assert.equal(conductor.onHold, true);
  const enter = await ctx.proctor(socket, attemptId, "fullscreen_enter");
  assert.equal(enter.code, "RATE_LIMITED");
  assert.equal(enter.paused, undefined);
  assert.equal(conductor.onHold, false, "a rate-limited fullscreen_enter never leaves the interview held");
  assert.equal(socket.got("anvi:resumed").length, 3);
});

test("rejoin detection survives a restart or another instance: the live doc remembers the holding page", async () => {
  const ctx = setup();
  const rules = { ...ON, pauseOutsideFullscreen: false, maxViolations: 1, onLimit: "end" };
  const { attemptId, studentId } = await ctx.start(rules, { clientId: "page-one-1234" });
  // The process dies (nothing is released) and the page reconnects to a fresh process.
  const restarted = ctx.instance();
  await ctx.join(studentId, attemptId, { clientId: "page-one-1234" }, restarted);
  assert.equal(ctx.lives.get(attemptId).proctoring.counts.rejoin, 0, "the same page, not a refresh");
  assert.equal(ctx.attempts.get(attemptId).status, "in_progress");

  // A graceful shutdown disconnects the socket from the server side: the page may take a while to come back.
  const second = ctx.instance();
  const onSecond = await ctx.join(studentId, attemptId, { clientId: "page-one-1234" }, second);
  onSecond.socket.drop("server namespace disconnect");
  await settle();
  ctx.advance(30_000);
  const third = ctx.instance();
  const onThird = await ctx.join(studentId, attemptId, { clientId: "page-one-1234" }, third);
  assert.equal(ctx.lives.get(attemptId).proctoring.counts.rejoin, 0);

  // A page that left on its own long ago is a leave-and-rejoin on any instance.
  onThird.socket.drop();
  await settle();
  ctx.advance(6_000);
  await ctx.join(studentId, attemptId, { clientId: "page-one-1234" }, ctx.instance());
  await settle();
  const attempt = ctx.attempts.get(attemptId);
  assert.equal(attempt.proctoring.counts.rejoin, 1);
  assert.equal(attempt.endReason, "proctoring_limit", "and at maxViolations 1 that ends it");
});

test("the event log keeps violations ahead of blocked actions and returns", () => {
  const settings = normalizeProctoring({ ...ON, blockRightClick: true });
  const state = proctorStateOf(null);
  const at = Date.UTC(2026, 9, 22);
  let i = 0;
  const add = (type, n) => { for (let k = 0; k < n; k += 1) recordProctorEvent(settings, state, { type, at: new Date(at + (i += 1) * 2000), questionN: 1 }); };
  add("right_click", 60);
  assert.equal(state.events.length, PROCTOR_OTHER_EVENT_CAP, "blocked actions and returns have a smaller share");
  assert.equal(state.counts.right_click, 60, "counted past the cap");
  add("fullscreen_exit", 150);
  assert.equal(state.events.length, 200);
  add("fullscreen_exit", 10);
  assert.equal(state.events.length, 200);
  assert.equal(state.events.filter((event) => event.type === "fullscreen_exit").length, 160, "a later violation replaces the oldest other event");
  assert.equal(state.events.at(-1).type, "fullscreen_exit");
  add("right_click", 1);
  assert.equal(state.events.filter((event) => event.type === "right_click").length, 40, "a full log takes no more other events");
});

test("summaries: settings normalise leniently at runtime; the student sees counts only", () => {
  assert.equal(normalizeProctoring({ enabled: "yes" }).enabled, false);
  assert.equal(normalizeProctoring({ enabled: false, ai: { enabled: true } }).ai.enabled, false, "camera checks need the master switch");
  assert.equal(normalizeProctoring({ maxViolations: 99, warnings: -2 }).maxViolations, 20);
  assert.equal(normalizeProctoring({ ai: { detectionIntervalMs: 1 } }).ai.detectionIntervalMs, 500);
  assert.deepEqual(aiEventDetails({ severity: "Critical", confidence: 0.5 }), { severity: "critical", confidence: 0.5 });
  assert.deepEqual(aiEventDetails({ severity: 3, confidence: [1] }), {});
  assert.equal(proctoringSummary({ enabled: false }, {}), null);
  const settings = normalizeProctoring({ ...ON, maxViolations: 0 });
  const state = proctorStateOf(null);
  const at = new Date(Date.UTC(2026, 9, 22));
  for (let i = 0; i < 205; i += 1) recordProctorEvent(settings, state, { type: "fullscreen_exit", at: new Date(at.getTime() + i * 2000), questionN: 1 });
  assert.equal(state.events.length, 200, "the log is capped");
  assert.equal(state.violations, 205, "counting continues past the cap");
  const summary = proctoringSummary(settings, state);
  assert.deepEqual(Object.keys(studentProctoringView(summary)).sort(), ["counts", "enabled", "endedForViolations", "violations"]);
  assert.deepEqual(studentProctoringView(undefined), { enabled: false, counts: studentProctoringView(undefined).counts, violations: 0, endedForViolations: false });
});
