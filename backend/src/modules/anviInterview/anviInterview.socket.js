import { randomUUID } from "node:crypto";
import User from "../../models/User.js";
import { getTenant as defaultGetTenant } from "../../platform/tenantConnections.js";
import { runForPlatform, runForTenant } from "../../platform/tenantContext.js";
import { servicePeriodStatus } from "../../platform/servicePeriod.js";
import { observeVerifiedInterview } from "../../services/interviewEngagementService.js";
import { studentHasFeature } from "../../services/studentFeatureAccess.js";
import { anviConfig } from "./anviInterview.config.js";
import { createLiveCapacity } from "./anviInterview.capacity.js";
import { createConductor as defaultCreateConductor } from "./anviInterview.conductor.js";
import { createBudget as defaultCreateBudget } from "./anviInterview.budget.js";
import { createGeminiClient } from "./anviInterview.gemini.js";
import { createHybridConductor as defaultCreateHybridConductor } from "./anviInterview.hybridConductor.js";
import { CLIENT_EVENTS, SERVER_EVENTS, VAD_DEFAULTS, createByteBucket } from "./anviInterview.hybridProtocol.js";
import { AnviAttempt, AnviLiveSession, AnviResumeContext, runtimeModeOf } from "./anviInterview.models.js";
import { EVALUATED_ENDINGS, evaluateAttemptSoon, evaluationQueueFields, withScoringFields } from "./anviInterview.evaluation.js";
import {
  PROCTOR_EVENTS_PER_MINUTE, QUICK_REJOIN_MS, closePause, isClientProctorEvent, normalizeProctoring, openPause, pausesForCamera,
  pausesOutsideFullscreen, proctorBucketOf, proctorStateOf, proctoringSummary, recordProctorEvent, storedProctorState,
} from "./anviInterview.proctoring.js";
import { defaultUsageLedger } from "./anviInterview.usage.js";

// Socket.IO transport for ANVI voice interviews. Each student socket owns at most one conductor, and
// each attempt is held by one socket at a time (the lease); a newer tab takes it over. The lease token
// in the live doc is authoritative: a holder whose writes stop matching it detaches itself.
const MAX_FRAME_BYTES = 16 * 1024;
// Token buckets close to real time (16 kHz PCM16 is 32 000 B/s) with about 2 s of burst for jitter.
const BYTES_PER_SECOND = 36_000;
const BYTE_BURST = 72_000;
const FRAMES_PER_SECOND = 25;
const FRAME_BURST = 50;
// Automatic upstream reconnects per conductor, with backoff; a session that stayed up this long resets the count.
const MAX_RECONNECTS = 6;
const RECONNECT_DELAYS_MS = [0, 1_000, 2_000, 4_000, 8_000, 15_000];
const STABLE_SESSION_MS = 2 * 60_000;
// A finalisation mark older than this is treated as stuck (the process died); joins are allowed again.
const FINALIZING_STALE_MS = 60_000;
const SAFE_QID = /^[A-Za-z0-9_-]+$/;
// The optional per-page-load id a client sends with anvi:join, so its own reconnect is not taken for a refresh.
const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;
// Loaded on first use: the scheduling service builds on the ANVI service, which imports this module.
let schedulingModule;
const loadScheduling = () => (schedulingModule ||= import("./anviInterview.scheduling.service.js"));
const defaultOnAttemptFinalized = async (attempt) => (await loadScheduling()).onAttemptFinalized(attempt);
const defaultPracticeBlocked = async (interviewId) => (await loadScheduling()).practiceBlocked(interviewId);
// Hybrid attempts: the calls a budget-aware client meters, and which of them the budget gates before the call.
// The modules themselves gate first (with more context); this is the last line before money is spent.
const METERED_CALLS = ["openLive", "transcribePcm", "transcribeAudio", "generateJson", "synthesizeSpeech"];
function budgetGateOf(name, options = {}) {
  if (name === "openLive") return { kind: "live" };
  if (name === "generateJson" && options.usageKind === "decision") return { kind: "decision" };
  if (name === "transcribeAudio" && options.kind === "transcribe_accurate") return { kind: "transcribe_accurate", extra: { unusable: true } };
  if (name === "synthesizeSpeech" || name === "streamSpeech") return { kind: "tts_static" };
  return null;
}
// Hybrid control events (everything but segment chunks, which have their own byte bucket) per socket.
const CONTROL_EVENTS_PER_SECOND = 20;
const CONTROL_EVENT_BURST = 60;
// Segment chunk events by count (a rejected chunk spends no bytes, so this caps a flood of invalid ones);
// a real client sends about 1 to 10 a second.
const CHUNK_EVENTS_PER_SECOND = 40;
const CHUNK_EVENT_BURST = 120;
const RETRYABLE = new Set(["JOIN_FAILED", "LIVE_UNAVAILABLE", "BUSY", "TAKEN_OVER", "RATE_LIMITED", "ATTEMPT_ENDING", "CAPACITY_FULL"]);
const CAPACITY_MESSAGE = "ANVI is busy with other interviews right now. Please try again in a few minutes.";

class JoinError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

const toBuffer = (frame) => {
  if (Buffer.isBuffer(frame)) return frame;
  if (frame instanceof ArrayBuffer) return Buffer.from(frame);
  if (ArrayBuffer.isView(frame)) return Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);
  return null;
};
const byteLength = (frame) => (frame instanceof ArrayBuffer || ArrayBuffer.isView(frame) ? frame.byteLength : -1);

// Every registered handler set in this process, so a REST end can stop the conductor holding an attempt.
const registries = new Set();

/** Detaches whichever socket in this process holds `attemptId` after something else ended it. */
export function stopAnviAttempt(attemptId, outcome = {}) {
  for (const stop of registries) stop(String(attemptId), outcome);
}

export function registerAnviSocketHandlers(io, deps = {}) {
  const config = deps.config || anviConfig();
  const clock = deps.clock || Date;
  const timers = deps.timers || { setTimeout, clearTimeout };
  const getTenant = deps.getTenant || defaultGetTenant;
  const models = { AnviAttempt, AnviLiveSession, AnviResumeContext, User, ...(deps.models || {}) };
  const observe = deps.observeInterview || observeVerifiedInterview;
  const createConductor = deps.createConductor || defaultCreateConductor;
  // Hybrid (turn-based) attempts: their conductor and the per-attempt budget; injectable for tests.
  const createHybridConductor = deps.createHybridConductor || defaultCreateHybridConductor;
  const createBudget = deps.createBudget || defaultCreateBudget;
  const evaluateSoon = deps.evaluateSoon || evaluateAttemptSoon;
  const onAttemptFinalized = deps.scheduling?.onAttemptFinalized || defaultOnAttemptFinalized;
  const practiceBlocked = deps.scheduling?.practiceBlocked || defaultPracticeBlocked;
  const log = deps.log || console;
  const maxJoinsPerMinute = Number(config.maxJoinsPerMinute) || 8;
  let gemini = deps.gemini || null;
  const geminiClient = () => (gemini ||= createGeminiClient({ config }));
  const usage = deps.usage || defaultUsageLedger();
  const capacity = deps.capacity || createLiveCapacity({
    maxLiveSessions: config.maxLiveSessions,
    maxLiveSessionsPerTenant: config.maxLiveSessionsPerTenant,
    clock,
    log,
  });
  const retryAfterSeconds = Number(config.capacityRetrySeconds) || 120;
  // One attempt's view of the shared client: every Gemini call it makes is metered to that attempt.
  // With a budget (hybrid attempts, or Live ones under ANVI_BUDGET_ENFORCE_LIVE) each call is also charged
  // to it (ledger first, then budget), and the paid kinds it gates are refused before the call is made.
  const meteredClient = (context, budget = null) => {
    const client = geminiClient();
    const ledgerUsage = usage.recorder(context);
    if (!budget) {
      const metered = { ...client };
      for (const name of ["openLive", "transcribePcm", "generateJson"]) {
        if (typeof client[name] === "function") metered[name] = (options = {}) => client[name]({ ...options, onUsage: ledgerUsage });
      }
      return metered;
    }
    const onUsage = Object.assign((payload) => {
      ledgerUsage(payload);
      Promise.resolve().then(() => budget.record(payload)).catch(() => {});
    }, { metric: (...args) => ledgerUsage.metric?.(...args) });
    const metered = { ...client, onUsage };
    const check = (name, options) => {
      const gate = budgetGateOf(name, options);
      let allowed = true;
      try { allowed = !gate || budget.allow(gate.kind, gate.extra) !== false; } catch { allowed = false; }
      if (!allowed) throw Object.assign(new Error("The attempt's budget does not allow this call."), { code: "BUDGET_DENIED" });
    };
    for (const name of METERED_CALLS) {
      if (typeof client[name] !== "function") continue;
      metered[name] = async (options = {}) => {
        check(name, options);
        return client[name]({ ...options, onUsage });
      };
    }
    if (typeof client.streamSpeech === "function") {
      metered.streamSpeech = async function* streamSpeech(options = {}) {
        check("streamSpeech", options);
        yield* client.streamSpeech({ ...options, onUsage });
      };
    }
    return metered;
  };
  // attemptId -> the entry that currently holds the lease (kept while it is still finalising).
  const holders = new Map();
  // attemptId -> tail of the join chain, so joins for one attempt never interleave.
  const joinChains = new Map();
  // userId -> recent join times (only joins that open a Live session count).
  const joinLog = new Map();
  // attemptId -> { socket, clientId, endedAt } of the hold last released here (for rejoin detection).
  const lastHolds = new Map();
  // "attemptId:bucket" -> recent client proctoring event times.
  const proctorLog = new Map();

  const allowProctorEvent = (attemptId, type) => {
    const now = clock.now();
    if (proctorLog.size > 256) {
      for (const [key, times] of proctorLog) if (!times.length || now - times.at(-1) >= 60_000) proctorLog.delete(key);
    }
    const key = `${attemptId}:${proctorBucketOf(type)}`;
    const recent = (proctorLog.get(key) || []).filter((at) => now - at < 60_000);
    if (recent.length >= PROCTOR_EVENTS_PER_MINUTE) { proctorLog.set(key, recent); return false; }
    recent.push(now);
    proctorLog.set(key, recent);
    return true;
  };

  function rememberHold(entry) {
    const now = clock.now();
    for (const [id, hold] of lastHolds) if (now - hold.endedAt > QUICK_REJOIN_MS) lastHolds.delete(id);
    lastHolds.set(entry.attemptId, { socket: entry.socket, clientId: entry.clientId, endedAt: now });
  }

  const withAttemptLock = (attemptId, work) => {
    const run = (joinChains.get(attemptId) || Promise.resolve()).then(work);
    const tail = run.catch(() => {});
    joinChains.set(attemptId, tail);
    tail.then(() => { if (joinChains.get(attemptId) === tail) joinChains.delete(attemptId); });
    return run;
  };

  const allowJoin = (userId) => {
    const now = clock.now();
    const recent = (joinLog.get(userId) || []).filter((at) => now - at < 60_000);
    if (recent.length >= maxJoinsPerMinute) { joinLog.set(userId, recent); return false; }
    recent.push(now);
    joinLog.set(userId, recent);
    return true;
  };

  // Disposes an entry's conductor (its live doc stays for resume) and waits for its last progress writes,
  // so a new lease is never rotated underneath them. A finalising entry stays in `holders` until it settles.
  // `keepHolder`: the server itself is closing the socket (shutting down), so the page's reconnect, to any
  // instance and however late, is not taken for a rejoin.
  async function release(entry, { keepHolder = false } = {}) {
    if (!entry || entry.released) return;
    entry.released = true;
    rememberHold(entry);
    const releasedAt = new Date(clock.now());
    try {
      const settling = entry.conductor.isFinalizing() ? entry.conductor.end() : null;
      entry.conductor.dispose();
      entry.detach();
      const forget = () => { if (holders.get(entry.attemptId) === entry) holders.delete(entry.attemptId); };
      if (settling) Promise.resolve(settling).catch(() => {}).finally(forget);
      else forget();
    } finally {
      // The Live session is gone (or going): its capacity slot and session time are settled even if
      // disposing threw. A hybrid holder has no slot of its own, only those of open escalation blocks.
      capacity.release(entry.slot);
      for (const slot of entry.liveSlots || []) capacity.release(slot);
      entry.liveSlots?.clear();
      meterSession(entry);
    }
    // Proctoring writes still carry this holder's lease, so they land before a new holder reads the log.
    await Promise.all([
      entry.conductor.flushed(), entry.proctor.chain, keepHolder ? null : saveReleased(entry, releasedAt), settleBudget(entry),
    ]);
  }

  // The budget mirror is written once more under this holder's lease (the next holder seeds from it).
  async function settleBudget(entry) {
    if (!entry.budget) return;
    try { await entry.budget.flush(); } catch { /* the mirror is best effort; Valkey has the totals */ }
    try { entry.budget.dispose(); } catch { /* idempotent */ }
  }

  // When this page let go of the lease (rejoin detection in any instance); a later holder's lease ignores it.
  async function saveReleased(entry, releasedAt) {
    if (!entry.proctor.settings.enabled) return;
    try {
      await entry.inTenant(() => models.AnviLiveSession.updateOne(
        { attemptId: entry.attemptRef, leaseToken: entry.leaseToken },
        { $set: { holder: { clientId: entry.clientId || "", releasedAt } } },
      ));
    } catch (error) {
      log.warn?.("[ANVI] Proctoring hold release not saved:", error?.message || error);
    }
  }

  function meterSession(entry) {
    if (!entry.liveStartedAt) return;
    // A hybrid holder's session row carries the Live seconds its escalation blocks really used (often 0), so
    // admin attempt counts (one session row per held attempt) still work.
    const seconds = entry.hybrid
      ? Math.max(0, liveSecondsOf(entry) - entry.liveSecondsAtStart)
      : Math.max(0, clock.now() - entry.liveStartedAt) / 1000;
    entry.liveStartedAt = 0;
    usage.record({ kind: "session", model: config.liveModel || "", sessionSeconds: seconds }, entry.usageContext);
    void usage.flush();
  }

  const liveSecondsOf = (entry) => {
    try { return Number(entry.conductor.stats?.()?.liveSeconds) || 0; } catch { return 0; }
  };

  // Refuses a new Live session when a cap is reached; a resume or a switch between the student's own
  // interviews is always admitted, so nobody is cut off mid-interview.
  async function admit({ attemptId, tenant, resume }) {
    const result = await capacity.acquire({ attemptId, tenantKey: tenant?.universityId ? String(tenant.universityId) : "platform", resume });
    if (result.ok) return result.slot;
    log.warn?.(`[ANVI] Join refused: ${result.scope === "tenant" ? "university" : "global"} live-session cap reached.`);
    throw new JoinError("CAPACITY_FULL", CAPACITY_MESSAGE, { retryAfterSeconds });
  }

  registries.add((attemptId, outcome) => {
    const entry = holders.get(attemptId);
    if (!entry || entry.released || entry.conductor.isFinalizing()) return;
    if (entry.socket.connected) entry.socket.emit("anvi:ended", outcome);
    void release(entry);
  });

  io.on("connection", (socket) => {
    // server.js may have just disconnected this socket for exceeding the per-user cap.
    if (!socket.connected) return;
    let held = null;
    let joining = false;
    const budget = { at: clock.now(), bytes: BYTE_BURST, frames: FRAME_BURST };
    // Hybrid: ANVI's own buckets for this socket (segment chunk bytes; every other hybrid event).
    const nowMs = () => clock.now();
    const segmentBucket = createByteBucket({ bytesPerSecond: config.segmentBytesPerSecond, burstBytes: config.segmentBurstBytes, now: nowMs });
    const controlBucket = createByteBucket({ bytesPerSecond: CONTROL_EVENTS_PER_SECOND, burstBytes: CONTROL_EVENT_BURST, now: nowMs });
    const chunkEventBucket = createByteBucket({ bytesPerSecond: CHUNK_EVENTS_PER_SECOND, burstBytes: CHUNK_EVENT_BURST, now: nowMs });

    // Socket callbacks (and Gemini callbacks) run outside the request context, so every DB call
    // re-enters the student's university explicitly.
    const inTenant = async (work) => {
      const tenant = socket.universityId !== "platform" ? await getTenant(socket.universityId) : null;
      return tenant ? runForTenant(tenant, () => work(tenant)) : runForPlatform(() => work(null));
    };

    // University service period, module permission and the account itself; checked at join, on every
    // automatic reconnect and before a completion receipt is written.
    async function access(tenant) {
      if (tenant) {
        if (servicePeriodStatus(tenant, new Date(clock.now())) !== "active") throw new JoinError("SERVICE_INACTIVE", "Your university service period is not active.");
        if (tenant.permissions?.interviews !== true) throw new JoinError("MODULE_DISABLED", "AI interviews are not enabled for your university.");
      }
      const user = await models.User.findById(socket.userId).select("_id name role isActive accessScope featureAccess college").lean();
      if (!user || user.role !== "student" || user.isActive === false) throw new JoinError("FORBIDDEN", "Only students can join AI interviews.");
      if (user.accessScope === "assessment_only") throw new JoinError("FORBIDDEN", "This account can access assessments only.");
      if (!studentHasFeature(user, "ai_interviews")) throw new JoinError("MODULE_DISABLED", "AI interviews are not enabled for your account.");
      return user;
    }

    // Checks only; the lease is claimed after any previous holder has been released. The interview
    // definition is deliberately not re-checked: an attempt carries its own plan, so one started before
    // an admin withdrew the interview may still be finished within its deadline.
    function authorize(attemptId) {
      return inTenant(async (tenant) => {
        const user = await access(tenant);
        const attempt = await models.AnviAttempt.findOne({ _id: attemptId, studentId: user._id }).lean();
        if (!attempt) throw new JoinError("NOT_FOUND", "Interview attempt not found.");
        if (attempt.status !== "in_progress") throw new JoinError("ATTEMPT_ENDED", "This interview has already ended.");
        if (clock.now() >= new Date(attempt.hardDeadline).getTime()) throw new JoinError("ATTEMPT_EXPIRED", "This interview's time limit has passed.");
        // A practice attempt cannot continue once a schedule blocks practice of its interview (anti-leak).
        if (!attempt.assignmentId && await practiceBlocked(attempt.interviewId)) {
          throw new JoinError("PRACTICE_BLOCKED", "This interview is scheduled by your institution, so practice is unavailable until the schedule ends.");
        }
        // Refused before any current holder is released; claimLease re-checks atomically.
        const live = await models.AnviLiveSession.findOne({ attemptId: attempt._id }).select("finalizingAt leaseToken holder").lean();
        if (!live) throw new JoinError("LIVE_MISSING", "This interview can no longer be resumed.");
        if (finalizingRecently(live)) throw new JoinError("ATTEMPT_ENDING", "This interview is being saved. Please wait a moment.");
        // A lease was claimed before: the interview already ran, so this join is a resume.
        return { user, attempt, tenant, started: Boolean(live.leaseToken), holder: live.holder || null };
      });
    }
    const finalizingRecently = (live) => Boolean(live?.finalizingAt) && clock.now() - new Date(live.finalizingAt).getTime() < FINALIZING_STALE_MS;

    function claimLease(attempt, clientId) {
      return inTenant(async () => {
        const now = new Date(clock.now());
        const leaseToken = randomUUID();
        const live = await models.AnviLiveSession.findOneAndUpdate(
          { attemptId: attempt._id, $or: [{ finalizingAt: null }, { finalizingAt: { $lt: new Date(now.getTime() - FINALIZING_STALE_MS) } }] },
          { $set: { leaseToken, lastActivityAt: now, finalizingAt: null, holder: { clientId: clientId || "", releasedAt: null } } },
          { new: true },
        ).lean();
        if (live) return { live, leaseToken };
        if (await models.AnviLiveSession.exists({ attemptId: attempt._id })) throw new JoinError("ATTEMPT_ENDING", "This interview is being saved. Please wait a moment.");
        throw new JoinError("LIVE_MISSING", "This interview can no longer be resumed.");
      });
    }

    function persistFor({ attempt, user, leaseToken }) {
      const attemptId = String(attempt._id);
      const owned = { attemptId: attempt._id, leaseToken };
      return {
        // The lease token rejects writes from a conductor whose attempt was taken over by another tab;
        // the conductor treats a write that matched nothing as a lost lease.
        saveLive: (patch) => inTenant(() => models.AnviLiveSession.updateOne(owned, { $set: { ...patch, lastActivityAt: new Date(clock.now()) } })),
        // A transcript that finished after this holder was released: the new holder in this process takes
        // it, otherwise it is written only if that answer still holds the text this holder last saved.
        saveLateAnswer: async (qid, record, expectedText) => {
          const holder = holders.get(attemptId);
          if (holder && holder.leaseToken !== leaseToken) { holder.conductor.adoptAnswer(qid, record, expectedText); return; }
          if (!SAFE_QID.test(qid)) return;
          await inTenant(() => models.AnviLiveSession.updateOne(
            { attemptId: attempt._id, [`answers.${qid}.text`]: expectedText },
            { $set: { [`answers.${qid}`]: record } },
          ));
        },
        markFinalizing: () => inTenant(() => models.AnviLiveSession.updateOne(owned, { $set: { finalizingAt: new Date(clock.now()) } })),
        // The budget mirror ($max update from budget.budgetMirrorUpdate), under the lease like every write.
        saveBudget: (update) => inTenant(() => models.AnviLiveSession.updateOne(owned, update)),
        readBudget: () => inTenant(() => models.AnviLiveSession.findOne({ attemptId: attempt._id }).select("budget liveSecondsUsed").lean()),
        // `cost` (hybrid: budget.summary()) is written in the same conditional update as the outcome.
        finalize: ({ status, endReason, items, warmup, cost }) => inTenant(async (tenant) => {
          const stored = () => models.AnviAttempt.findById(attempt._id).select("status endReason").lean();
          const live = await models.AnviLiveSession.findOne(owned).select("plan rules.proctoring proctoring").lean();
          if (!live) {
            const current = await stored();
            if (current?.status === "in_progress") return { lost: true };
            return { applied: false, status: current?.status || status, endReason: current?.endReason ?? endReason };
          }
          const endedAt = new Date(clock.now());
          // This holder's proctoring log is the newest (its last write may still be in flight).
          const holder = holders.get(attemptId);
          const own = holder?.leaseToken === leaseToken ? holder : null;
          // A hold at join still open because the attempt ended before the room reported back (a rejoin that
          // reached the limit, say) is left out by the summary: the student never left fullscreen.
          const proctoring = proctoringSummary(live.rules?.proctoring, own ? own.proctor.state : live.proctoring, endedAt);
          // The same write queues the evaluation, so a crash right after it still gets the attempt scored.
          const result = await models.AnviAttempt.updateOne(
            { _id: attempt._id, status: "in_progress" },
            { $set: {
              status, endReason, endedAt, items: withScoringFields(items, live.plan), totalQuestions: items.length,
              ...(warmup ? { warmup } : {}), ...(proctoring ? { proctoring } : {}), ...(cost ? { cost } : {}), ...evaluationQueueFields(status, endedAt),
            } },
          );
          if (!result.modifiedCount) {
            // A retry after a write that landed but whose cleanup failed still finishes the job below.
            const current = await stored();
            if (current?.status !== status) return { applied: false, status: current?.status || status, endReason: current?.endReason ?? endReason };
          }
          await models.AnviLiveSession.deleteOne({ attemptId: attempt._id });
          // The resume text was only needed to plan the questions; the TTL removes it if this delete fails.
          try {
            await models.AnviResumeContext?.deleteOne({ studentId: attempt.studentId, interviewId: attempt.interviewId, assignmentId: attempt.assignmentId || null });
          } catch (error) {
            log.warn?.("[ANVI] Resume text not removed after the attempt ended:", error?.message || error);
          }
          // Fire-and-forget in this tenant context; the maintenance backstop retries anything missed.
          if (result.modifiedCount && EVALUATED_ENDINGS.has(status)) {
            try { evaluateSoon(attempt._id); } catch (error) { log.warn?.("[ANVI] Evaluation not started:", error?.message || error); }
          }
          // A scheduled attempt settles its target outcome and booking.
          if (result.modifiedCount && attempt.assignmentId) {
            try {
              await onAttemptFinalized({ ...attempt, status, endReason, endedAt, partial: Boolean(evaluationQueueFields(status, endedAt).partial) });
            } catch (error) {
              log.warn?.("[ANVI] Schedule not updated after the attempt ended:", error?.message || error);
            }
          }
          if (status === "completed") {
            try {
              await access(tenant);
              const student = { _id: user._id, college: user.college, accessScope: user.accessScope };
              await observe({ user: student, path: "/x/complete", method: "POST" }, { id: attemptId, status: "completed" });
            } catch (error) {
              log.warn?.("[ANVI] Interview completion receipt not written:", error?.message || error);
            }
          }
          return { applied: true, status, endReason };
        }),
      };
    }

    function wire(entry) {
      const { conductor } = entry;
      const mine = () => held === entry;
      conductor.on("audio", (pcm) => { if (mine()) socket.emit("anvi:audio", pcm); });
      conductor.on("caption", (caption) => { if (mine()) socket.emit("anvi:caption", caption); });
      conductor.on("state", ({ questionNumber: _questionNumber, totalQuestions: _totalQuestions, ...state }) => { if (mine()) socket.emit("anvi:state", state); });
      conductor.on("interrupted", () => { if (mine()) socket.emit("anvi:interrupted"); });
      // Hybrid only: prompts, question clips, replays, turn states and Live-block mode changes.
      if (entry.hybrid) {
        for (const [event, name] of [["prompt", SERVER_EVENTS.PROMPT], ["clip", SERVER_EVENTS.CLIP], ["replay", SERVER_EVENTS.REPLAY], ["turn", SERVER_EVENTS.TURN], ["mode", SERVER_EVENTS.MODE]]) {
          conductor.on(event, (payload) => { if (mine()) socket.emit(name, payload); });
        }
      }
      conductor.on("ended", (outcome) => {
        if (mine()) socket.emit("anvi:ended", outcome);
        queueMicrotask(() => { void release(entry); });
      });
      // The live doc no longer carries this holder's lease: another tab or instance took over, or the
      // attempt was ended elsewhere (REST end, sweeper). Detach and tell the client which.
      conductor.on("lost", () => {
        const wasMine = mine();
        void release(entry);
        if (!wasMine) return;
        inTenant(() => models.AnviAttempt.findById(entry.attemptId).select("status endReason").lean())
          .then((stored) => {
            if (!socket.connected) return;
            if (stored && stored.status !== "in_progress") socket.emit("anvi:ended", { status: stored.status, endReason: stored.endReason });
            else socket.emit("anvi:taken_over", { attemptId: entry.attemptId });
          })
          .catch(() => { if (socket.connected) socket.emit("anvi:taken_over", { attemptId: entry.attemptId }); });
      });
      conductor.on("error", (problem) => {
        if (!mine()) return;
        const disconnected = problem?.code === "LIVE_DISCONNECTED";
        if (disconnected && entry.connectedAt && clock.now() - entry.connectedAt > STABLE_SESSION_MS) entry.reconnects = 0;
        // `reconnecting` tells the client to wait for the next anvi:state instead of rejoining itself.
        const reconnecting = disconnected && entry.reconnects < MAX_RECONNECTS;
        socket.emit("anvi:error", disconnected ? { ...problem, reconnecting } : problem);
        if (!reconnecting) return;
        const delay = RECONNECT_DELAYS_MS[entry.reconnects] ?? RECONNECT_DELAYS_MS.at(-1);
        entry.reconnects += 1;
        const reconnect = () => {
          if (!mine()) return;
          inTenant((tenant) => access(tenant))
            .then(() => conductor.start({ resumed: true }))
            .then(() => { entry.connectedAt = clock.now(); })
            .catch((error) => {
              if (!mine()) return;
              if (error instanceof JoinError) {
                socket.emit("anvi:error", { code: error.code, message: error.message, retryable: false });
                void release(entry);
                return;
              }
              socket.emit("anvi:error", { code: error?.code || "LIVE_UNAVAILABLE", message: "ANVI could not reconnect. Rejoin to continue.", retryable: true });
            });
        };
        if (delay > 0) timers.setTimeout(reconnect, delay);
        else reconnect();
      });
    }

    async function join(attemptId, clientId) {
      const granted = await authorize(attemptId);
      if (!socket.connected) return null;
      const previous = holders.get(attemptId);
      if (previous?.conductor.isFinalizing()) throw new JoinError("ATTEMPT_ENDING", "This interview is being saved. Please wait a moment.");
      // The same page (this socket, or the same client id) taking back its own hold, still held or released
      // moments ago: a reconnect, not a refresh, so proctoring does not record it as a rejoin.
      const samePage = (hold) => Boolean(hold) && (hold.socket === socket || (Boolean(clientId) && hold.clientId === clientId));
      const lastHold = lastHolds.get(attemptId);
      // The live doc's holder covers a holder in another instance, or in a process that restarted: the same
      // page still holding (or that never got to release: the process went away), or released moments ago.
      const stored = granted.holder;
      const releasedAt = stored?.releasedAt ? new Date(stored.releasedAt).getTime() : 0;
      const storedSamePage = Boolean(clientId) && stored?.clientId === clientId
        && (!stored.releasedAt || clock.now() - releasedAt <= QUICK_REJOIN_MS);
      const reconnect = (Boolean(previous) && !previous.released && samePage(previous))
        || (samePage(lastHold) && clock.now() - lastHold.endedAt <= QUICK_REJOIN_MS)
        || storedSamePage;
      if (!allowJoin(String(socket.userId))) throw new JoinError("RATE_LIMITED", "Too many attempts to join. Wait a minute and try again.");
      // Admission: only a brand-new Live session can be refused. Switching from another of the student's
      // interviews held here frees that slot below, so it is admitted too.
      const switching = [...holders.values()].some((other) => other.userId === String(socket.userId) && !other.released && !other.conductor.isFinalizing());
      // A hybrid attempt holds no Live session, so it takes no capacity slot; only an open escalation does.
      const hybrid = runtimeModeOf(granted.attempt) === "hybrid";
      const slot = hybrid ? null : await admit({ attemptId, tenant: granted.tenant, resume: Boolean(previous) || granted.started || switching });
      let entry = null;
      try {
        // Take the lease: the previous holder (another tab, or this socket's earlier join) is detached first.
        if (previous && previous.socket !== socket && previous.socket.connected) previous.socket.emit("anvi:taken_over", { attemptId });
        await release(previous);
        await release(held);
        // One live ANVI session per student in this process: another interview of theirs is paused (resumable).
        const others = [...holders.values()].filter((other) => other.userId === String(socket.userId) && other.attemptId !== attemptId && !other.conductor.isFinalizing());
        for (const other of others) {
          if (other.socket.connected) other.socket.emit("anvi:taken_over", { attemptId: other.attemptId });
          await release(other);
        }
        if (!socket.connected) return null;
        const { live, leaseToken } = await claimLease(granted.attempt, clientId);
        const usageContext = {
          tenant: granted.tenant, attemptId: granted.attempt._id, studentId: granted.user._id, interviewId: granted.attempt.interviewId,
          ...(hybrid ? { runtimeMode: "hybrid", ...(granted.attempt.durationMinutes ? { durationMinutes: granted.attempt.durationMinutes } : {}) } : {}),
        };
        const persist = persistFor({ ...granted, leaseToken });
        const studentFirstName = String(granted.user.name || "").trim().split(/\s+/)[0] || "";
        const tenantKey = granted.tenant?.universityId ? String(granted.tenant.universityId) : "platform";
        // Hybrid attempts always run under their budget; a Live attempt only under ANVI_BUDGET_ENFORCE_LIVE
        // (otherwise it is observed through its ledger rows only, exactly as before).
        const spend = hybrid || config.budgetEnforceLive ? createBudget({
          tenantKey, attemptId: granted.attempt._id, runtimeMode: hybrid ? "hybrid" : "live",
          durationMinutes: granted.attempt.durationMinutes ?? live.rules?.durationMinutes ?? null,
          liveCapSeconds: granted.attempt.liveCapSeconds ?? live.rules?.liveCapSeconds ?? null,
          hardDeadline: granted.attempt.hardDeadline, config, clock, log,
          ...(deps.timers ? { timers: deps.timers } : {}),
          mirror: { read: persist.readBudget, write: (update) => persist.saveBudget(update) },
        }) : null;
        if (spend) usageContext.mode = () => spend.mode();
        const metricRecorder = hybrid ? usage.recorder(usageContext) : null;
        const liveSlots = new Set();
        let conductor;
        try {
          conductor = hybrid ? createHybridConductor({
            attempt: granted.attempt, live, gemini: meteredClient(usageContext, spend), config, persist, clock, log, studentFirstName,
            budget: spend, tenantKey, bucket: segmentBucket,
            metric: (name, n = 1) => { try { metricRecorder.metric?.(name, n); } catch { /* metrics never fail */ } },
            // A capacity slot only while a Live escalation block is open; every slot is released with the holder too.
            capacityLease: {
              acquire: async ({ resume = false } = {}) => {
                const result = await capacity.acquire({ attemptId, tenantKey, resume });
                if (result?.ok && result.slot) liveSlots.add(result.slot);
                return result;
              },
              release: (owned) => { liveSlots.delete(owned); capacity.release(owned); },
            },
            ...(deps.timers ? { timers: deps.timers } : {}),
            // Tests (and the acceptance suite): audioAssets, transcripts, decision, openEscalation.
            ...(deps.hybridDeps || {}),
          }) : createConductor({
            attempt: granted.attempt,
            live,
            gemini: meteredClient(usageContext, spend),
            config,
            persist,
            clock,
            log,
            studentFirstName,
            ...(deps.timers ? { timers: deps.timers } : {}),
          });
        } catch (error) {
          spend?.dispose();
          throw error;
        }
        entry = {
          attemptId, userId: String(socket.userId), socket, conductor, leaseToken, resumed: live.phase !== "intro",
          hybrid, budget: spend, liveSlots, liveSecondsAtStart: 0,
          slot, usageContext, liveStartedAt: 0, reconnects: 0, connectedAt: 0, released: false,
          attemptRef: granted.attempt._id, clientId, reconnect, heldSince: new Date(clock.now()), inTenant,
          // The proctoring rules stored with the plan at the start (off for older attempts) and the log so far.
          // `screen`: what the room last reported (out of fullscreen, tab hidden), for the proctoring pause.
          proctor: {
            settings: normalizeProctoring(live.rules?.proctoring), state: proctorStateOf(live.proctoring), chain: Promise.resolve(),
            screen: { outOfFullscreen: false, hidden: false, cameraBlocked: false },
          },
        };
      } finally {
        // A join that never produced a holder gives its slot back.
        if (!entry) capacity.release(slot);
      }
      entry.detach = () => { if (held === entry) held = null; };
      holders.set(attemptId, entry);
      held = entry;
      wire(entry);
      // A new holder knows nothing of the room yet (a reload, a reconnect, a restarted server): under the pause
      // rule it starts held, as if outside fullscreen, until the room reports fullscreen_enter (which it does on
      // every join while in fullscreen). ANVI then gets her opening only once the student is there.
      if (pausesOutsideFullscreen(entry.proctor.settings) && typeof entry.conductor.hold === "function") {
        entry.proctor.screen.outOfFullscreen = true;
        entry.conductor.hold();
      }
      try {
        const state = await entry.conductor.start({ resumed: entry.resumed });
        entry.connectedAt = clock.now();
        // Session time runs from a started Live session to its release (hybrid: the Live seconds used meanwhile).
        if (!entry.released) {
          entry.liveStartedAt = entry.connectedAt;
          if (entry.hybrid) entry.liveSecondsAtStart = liveSecondsOf(entry);
        }
        return { entry, state };
      } catch (error) {
        const replaced = held !== entry;
        await release(entry);
        throw replaced ? new JoinError("TAKEN_OVER", "This interview was opened somewhere else.") : error;
      }
    }

    // --- Proctoring (only for attempts whose stored rules enable it) ------------------------------------
    // One holder's events apply in order; each write carries its lease, so a replaced holder writes nothing.
    const proctorTask = (entry, work) => {
      const run = entry.proctor.chain.then(work);
      entry.proctor.chain = run.catch(() => {});
      return run;
    };

    async function saveProctor(entry) {
      try {
        await inTenant(() => models.AnviLiveSession.updateOne(
          { attemptId: entry.attemptRef, leaseToken: entry.leaseToken },
          { $set: { proctoring: storedProctorState(entry.proctor.state) } },
        ));
      } catch (error) {
        log.warn?.("[ANVI] Proctoring event not saved:", error?.message || error);
      }
    }

    const questionOf = (entry) => {
      try { return Number(entry.conductor.state?.()?.questionNumber) || 0; } catch { return 0; }
    };

    // Ends the attempt the usual way (what was answered is kept and scored); ANVI does not close it herself.
    function endForViolations(entry) {
      if (entry.released || entry.conductor.isFinalizing()) return;
      Promise.resolve()
        .then(() => entry.conductor.end("proctoring_limit"))
        .catch((error) => log.warn?.("[ANVI] Could not end the interview at the proctoring limit:", error?.message || error));
    }

    async function applyProctorEvent(entry, type, details = {}) {
      const { settings, state } = entry.proctor;
      const result = recordProctorEvent(settings, state, { type, at: new Date(clock.now()), questionN: questionOf(entry), details });
      if (!result.recorded) return result;
      await saveProctor(entry);
      if (result.warning && held === entry && socket.connected) {
        socket.emit("anvi:proctor-warning", {
          type, violations: state.violations, maxViolations: settings.maxViolations, message: result.warning,
          ...(result.warningNumber ? { warning: result.warningNumber, warnings: settings.warnings } : {}),
          ...(result.limitReached ? { limitReached: true } : {}),
        });
      }
      if (result.end) endForViolations(entry);
      return result;
    }

    const holdReason = ({ outOfFullscreen, hidden, cameraBlocked }) => (
      outOfFullscreen ? "fullscreen_exit" : hidden ? "tab_hidden" : cameraBlocked ? "camera_blocked" : ""
    );

    // Holds the interview while the room is out of fullscreen or its tab is hidden (fullscreen required with
    // pauseOutsideFullscreen), or while the camera is blocked (camera checks under the same rule), and
    // resumes it once everything is back. Applies even when the event itself is not logged (or rate-limited).
    function trackScreen(entry, type) {
      const { settings, screen } = entry.proctor;
      const screenPause = pausesOutsideFullscreen(settings);
      if (screenPause && type === "fullscreen_exit") screen.outOfFullscreen = true;
      else if (screenPause && type === "fullscreen_enter") screen.outOfFullscreen = false;
      else if (screenPause && type === "tab_hidden") screen.hidden = true;
      else if (screenPause && type === "tab_visible") screen.hidden = false;
      else if (pausesForCamera(settings) && type === "ai_camera_blocked") screen.cameraBlocked = true;
      else if (pausesForCamera(settings) && type === "ai_camera_restored") screen.cameraBlocked = false;
      else return;
      const { conductor } = entry;
      if (entry.released || conductor.isFinalizing() || typeof conductor.hold !== "function") return;
      const reason = holdReason(screen);
      const mine = held === entry && socket.connected;
      const at = new Date(clock.now());
      const { state } = entry.proctor;
      if (reason && !conductor.isOnHold() && conductor.hold()) {
        openPause(state, { at, reason });
        if (mine) socket.emit("anvi:paused", { reason });
        return true;
      }
      if (!reason && conductor.isOnHold() && conductor.releaseHold()) {
        // The hold at join, ended as soon as the room reported back (it was in fullscreen), is dropped: not a pause.
        closePause(state, at);
        if (mine) socket.emit("anvi:resumed", {});
        return true;
      }
      // The hold at join assumed "out of fullscreen"; the room's report gives the real reason (camera still blocked).
      const open = state.pauses.at(-1);
      if (reason && conductor.isOnHold() && open?.joinHold && !open.to && open.reason !== reason) {
        open.reason = reason;
        if (mine) socket.emit("anvi:paused", { reason });
        return true;
      }
      return false;
    }

    // Counts this join; a join after the first one is a rejoin unless it is the same page reconnecting.
    function noteJoin(entry) {
      if (!entry.proctor.settings.enabled) return;
      void proctorTask(entry, async () => {
        const { state } = entry.proctor;
        // A limit reached before (whose end did not get through) still ends the attempt.
        if (state.endedForViolations) return endForViolations(entry);
        if (!entry.conductor.isOnHold?.()) {
          // A pause the previous holder left open ended with it (the new room starts unpaused).
          closePause(state, entry.heldSince);
        } else if (!state.pauses.at(-1) || state.pauses.at(-1).to) {
          // Held at join (see join): a pause from now, unless the previous holder's pause simply goes on. It is
          // marked as a join hold in the live doc, so an end within 5 s (socket or REST) does not report it.
          openPause(state, { at: entry.heldSince, reason: holdReason(entry.proctor.screen) || "fullscreen_exit", joinHold: true });
        }
        state.joins += 1;
        // A rejoin that is recorded is saved with the join count; otherwise the count is saved on its own.
        if (state.joins > 1 && !entry.reconnect && (await applyProctorEvent(entry, "rejoin")).recorded) return undefined;
        return saveProctor(entry);
      }).catch((error) => log.warn?.("[ANVI] Join not recorded for proctoring:", error?.message || error));
    }

    // `anvi:proctor` { attemptId, type, at?, severity?, confidence? }: a browser event from the room (camera
    // events carry severity and confidence; `resync: true` marks a state re-announcement after a join). `at` is not
    // trusted; events are timed by the server. Ack: { ok, violations, maxViolations, warning?, ignored?, limitReached?, ended?, paused?, resync? }.
    socket.on("anvi:proctor", async (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const entry = held;
      if (!entry || entry.released || entry.attemptId !== String(payload?.attemptId || "")) {
        return reply({ ok: false, code: "NOT_JOINED", message: "No interview is active on this connection." });
      }
      const { settings, state } = entry.proctor;
      if (!settings.enabled) return reply({ ok: true, ignored: true, violations: 0, maxViolations: 0 });
      const counts = () => ({ violations: state.violations, maxViolations: settings.maxViolations });
      const type = String(payload?.type || "");
      if (!isClientProctorEvent(type)) return reply({ ok: false, code: "INVALID_EVENT", message: "Unknown proctoring event.", ...counts() });
      if (!allowProctorEvent(entry.attemptId, type)) {
        // Not logged or counted, but where the room stands still applies: a rate-limited fullscreen_enter (or
        // tab_visible, ai_camera_restored) never leaves the interview held. The pause log is saved with the next write.
        await proctorTask(entry, () => { if (!entry.released && !entry.conductor.isFinalizing()) trackScreen(entry, type); }).catch(() => {});
        return reply({
          ok: false, code: "RATE_LIMITED", message: "Too many proctoring events.", ...counts(),
          ...(entry.conductor.isOnHold?.() ? { paused: true } : {}),
        });
      }
      // `resync: true`: the room re-announcing where it stands after a join (fullscreen_enter or fullscreen_exit,
      // tab_hidden, ai_camera_blocked). It sets the pause state only: never logged, counted or warned about.
      if (payload?.resync === true) {
        try {
          await proctorTask(entry, async () => {
            if (entry.released || entry.conductor.isFinalizing()) return;
            if (trackScreen(entry, type)) await saveProctor(entry);
          });
          return reply({ ok: true, resync: true, ...counts(), ...(entry.conductor.isOnHold?.() ? { paused: true } : {}) });
        } catch (error) {
          log.warn?.("[ANVI] Proctoring resync failed:", error?.message || error);
          return reply({ ok: false, code: "PROCTOR_FAILED", message: "The event could not be applied.", ...counts() });
        }
      }
      try {
        const result = await proctorTask(entry, async () => {
          if (entry.released || entry.conductor.isFinalizing()) return { recorded: false };
          const recorded = await applyProctorEvent(entry, type, { severity: payload?.severity, confidence: payload?.confidence });
          // An attempt ending for violations is not paused first. A pause or resume is kept in the log.
          if (!recorded.end && trackScreen(entry, type)) await saveProctor(entry);
          return recorded;
        });
        return reply({
          ok: true, ...counts(),
          ...(result.recorded ? {} : { ignored: true }),
          ...(result.warning ? { warning: result.warning } : {}),
          ...(result.limitReached ? { limitReached: true } : {}),
          ...(result.end ? { ended: true } : {}),
          ...(entry.conductor.isOnHold?.() ? { paused: true } : {}),
        });
      } catch (error) {
        log.warn?.("[ANVI] Proctoring event failed:", error?.message || error);
        return reply({ ok: false, code: "PROCTOR_FAILED", message: "The event could not be recorded.", ...counts() });
      }
    });

    socket.on("anvi:join", async (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const fail = (code, message, extra = {}) => reply({ ok: false, code, message, retryable: RETRYABLE.has(code), ...extra });
      const attemptId = String(payload?.attemptId || "");
      const clientId = CLIENT_ID.test(String(payload?.clientId || "")) ? String(payload.clientId) : "";
      if (socket.userRole !== "student") return fail("FORBIDDEN", "Only students can join AI interviews.");
      if (!/^[a-f0-9]{24}$/i.test(attemptId)) return fail("INVALID_ATTEMPT", "Invalid interview attempt.");
      if (joining) return fail("BUSY", "Already joining an interview.");
      joining = true;
      try {
        const joined = await withAttemptLock(attemptId, () => join(attemptId, clientId));
        if (!joined) return undefined;
        if (held !== joined.entry) return fail("TAKEN_OVER", "This interview was opened somewhere else.");
        const { settings, state, screen } = joined.entry.proctor;
        const paused = joined.entry.conductor.isOnHold?.() === true;
        reply({
          ok: true,
          state: Object.fromEntries(Object.entries(joined.state || {}).filter(([key]) => key !== "questionNumber" && key !== "totalQuestions")),
          ...(settings.enabled ? { proctoring: { ...settings, violations: state.violations } } : {}),
          ...(paused ? { paused: true } : {}),
          ...runtimeAck(joined.entry, joined.state),
        });
        // Held until the room reports where it stands (see join).
        if (paused && socket.connected) socket.emit("anvi:paused", { reason: holdReason(screen) || "fullscreen_exit" });
        // After the ack, so a rejoin warning (or the end for violations) follows the joined room.
        noteJoin(joined.entry);
        return undefined;
      } catch (error) {
        if (error instanceof JoinError) return fail(error.code, error.message, error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {});
        if (error?.code === "LIVE_UNAVAILABLE") return fail(error.code, error.message);
        log.warn?.("[ANVI] Join failed:", error?.message || error);
        return fail("JOIN_FAILED", "Could not join the interview. Please try again.");
      } finally {
        joining = false;
      }
    });

    // What the join ack adds about the runtime. A Live attempt's ack is unchanged while the hybrid flag is off
    // (AC15); with it on, it says runtimeMode "live" so a hybrid room hands back to the Live call.
    function runtimeAck(entry, state = {}) {
      if (!entry.hybrid) return config.hybridEnabled ? { runtimeMode: "live" } : {};
      let ackAssetIds = [];
      try { ackAssetIds = entry.conductor.ackAssetIds?.() || []; } catch { ackAssetIds = []; }
      return {
        runtimeMode: "hybrid",
        hybrid: {
          vad: {
            onsetRms: VAD_DEFAULTS.onsetMinRms,
            onsetFrames: VAD_DEFAULTS.onsetFrames,
            preRollMs: Number.isFinite(config.preRollMs) ? config.preRollMs : VAD_DEFAULTS.preRollMs,
            hangoverMs: Number(config.hangoverMs) || Number(config.silenceMs) || 2000,
            speculativeEndMs: Number.isFinite(config.speculativeEndMs) ? config.speculativeEndMs : null,
            minSpeechMs: Number(config.minSpeechMs) || VAD_DEFAULTS.minSpeechMs,
            maxSegmentSeconds: Number(config.maxSegmentSeconds) || VAD_DEFAULTS.maxSegmentSeconds,
          },
          inputMode: state?.inputMode === "ptt" ? "ptt" : "vad",
          ackAssetIds,
        },
      };
    }

    // --- Hybrid (turn-based) events --------------------------------------------------------------------
    // Each needs a hybrid attempt held by this socket, spends this socket's own bucket and always answers
    // with an ack ({ ok, code? }) instead of dropping silently. Hold and finalising are refused (the conductor
    // answers STALE_TURN or ON_HOLD for segment work, in the protocol's order).
    const hybridEntry = () => (held && !held.released && held.hybrid ? held : null);
    function onHybrid(event, handle, { chunk = false } = {}) {
      socket.on(event, async (payload, ack) => {
        const reply = typeof ack === "function" ? ack : () => {};
        const entry = hybridEntry();
        if (!entry) return reply({ ok: false, code: held ? "NOT_HYBRID" : "NOT_JOINED" });
        if (!(chunk ? chunkEventBucket : controlBucket).take(1)) return reply({ ok: false, code: "RATE_LIMITED" });
        if (entry.conductor.isFinalizing()) return reply({ ok: false, code: "STALE_TURN" });
        try {
          return reply((await handle(entry.conductor, payload && typeof payload === "object" ? payload : {})) || { ok: true });
        } catch (error) {
          log.warn?.(`[ANVI] Hybrid ${event} failed (${error?.code || error?.name || "Error"}).`);
          return reply({ ok: false, code: "FAILED" });
        }
      });
    }
    onHybrid(CLIENT_EVENTS.SEG_CHUNK, (conductor, payload) => {
      const pcm = toBuffer(payload.pcm);
      return conductor.acceptChunk({ ...payload, pcm: pcm || payload.pcm }, { bucket: segmentBucket });
    }, { chunk: true });
    onHybrid(CLIENT_EVENTS.SEG_COMMIT, (conductor, payload) => conductor.commitSegment(payload));
    onHybrid(CLIENT_EVENTS.SEG_CANCEL, (conductor, payload) => conductor.cancelSegment(payload));
    onHybrid(CLIENT_EVENTS.PROMPT_PLAYED, (conductor, payload) => conductor.promptPlayed(payload));
    onHybrid(CLIENT_EVENTS.REPLAYED, (conductor, payload) => conductor.noteReplay(payload));
    onHybrid(CLIENT_EVENTS.INPUT_MODE, (conductor, payload) => ({ ok: true, mode: conductor.setInputMode(payload) }));
    onHybrid(CLIENT_EVENTS.DONE, (conductor, payload) => conductor.done(payload));
    onHybrid(CLIENT_EVENTS.CLIP_HAVE, (conductor, payload) => conductor.clipHave(payload));

    socket.on("anvi:audio", (frame) => {
      if (!held) return;
      const size = byteLength(frame);
      if (size <= 0 || size > MAX_FRAME_BYTES || size % 2) return;
      const now = clock.now();
      const elapsed = Math.max(0, now - budget.at) / 1000;
      budget.at = now;
      budget.bytes = Math.min(BYTE_BURST, budget.bytes + elapsed * BYTES_PER_SECOND);
      budget.frames = Math.min(FRAME_BURST, budget.frames + elapsed * FRAMES_PER_SECOND);
      if (budget.frames < 1 || budget.bytes < size) return;
      budget.frames -= 1;
      budget.bytes -= size;
      const pcm = toBuffer(frame);
      if (pcm) held.conductor.pushAudio(pcm);
    });

    socket.on("anvi:end", async (_payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const entry = held;
      if (!entry) return reply({ ok: false, code: "NOT_JOINED", message: "No interview is active on this connection." });
      try {
        const outcome = await entry.conductor.end("ended_by_student");
        if (outcome?.lost) return reply({ ok: false, code: "TAKEN_OVER", message: "This interview was opened somewhere else." });
        return reply({ ok: true, status: outcome.status, endReason: outcome.endReason });
      } catch (error) {
        log.warn?.("[ANVI] End failed:", error?.message || error);
        return reply({ ok: false, code: "END_FAILED", message: "Could not end the interview. Please try again." });
      }
    });

    // The student left the room inside the app (the shared socket stays open). The conductor and its
    // Live session stop; the live doc stays so the interview can be resumed within its window.
    socket.on("anvi:leave", (payload) => {
      if (held && held.attemptId === String(payload?.attemptId || "")) void release(held);
    });

    // The live doc stays so the student can resume; the stale sweeper finalises abandoned attempts.
    // A disconnect by the server itself (shutting down: io.disconnectSockets) keeps the page as the holder.
    socket.on("disconnect", (reason) => {
      void release(held, { keepHolder: reason === "server namespace disconnect" || reason === "server shutting down" });
    });
  });

  return { holders, capacity };
}
