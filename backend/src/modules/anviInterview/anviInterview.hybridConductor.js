import { EventEmitter } from "node:events";
import * as defaultPrompts from "./anviInterview.prompts.js";
import { anviConfig } from "./anviInterview.config.js";
import { currentTenantKey, defaultAudioAssets } from "./anviInterview.audioAssets.js";
import { createDecisionEngine, isTimeLow } from "./anviInterview.decision.js";
import { LIMITS, clipHaveIds, inputModeOf, newTurnId } from "./anviInterview.hybridProtocol.js";
import {
  answerRecord, buildItems as buildHybridItems, closingOutcome as hybridClosingOutcome,
  deadlineOutcome as hybridDeadlineOutcome, markAsked, markSilent, noteFollowUp, questionsRemain as hybridQuestionsRemain,
} from "./anviInterview.hybridRuntime.js";
import { detectIntent, isContinueReply, isDeclineReply, isEndRequest, isInjectionAttempt } from "./anviInterview.intents.js";
import { openEscalation as defaultOpenEscalation } from "./anviInterview.liveEscalation.js";
import { genericResumeQuestions } from "./anviInterview.plan.js";
import { audioHashOf, createSegmentAssembler } from "./anviInterview.segments.js";
import { emptySummary, updateSummary } from "./anviInterview.summary.js";
import { ACK_TEMPLATE_IDS, numberClipId, pickAck, templateText } from "./anviInterview.templates.js";
import { createTranscripts } from "./anviInterview.transcripts.js";

// Drives one hybrid (turn-based) ANVI interview: questions are played from cached TTS clips, the student's
// answer arrives as committed segments, each segment is transcribed once (cached by its audio hash), and a
// small decision step picks what comes next. The cursor is server-led and never moves because of model
// output. Gemini Live is used only for a bounded escalation block (off by default). The public contract is
// the Live conductor's (start, end, dispose, hold, ...), plus the segment and prompt methods the hybrid
// socket handlers call. Nothing here logs a transcript, question text, audio or an asset id.
const DEADLINE_GRACE_MS = 20_000;
const TRANSCRIBE_WAIT_MS = 20_000;
const FINALIZE_RETRY_MS = [5_000, 15_000, 45_000];
const DEFAULT_NUDGE_SECONDS = 45;
const MAX_NUDGES = 2;
const HEARTBEAT_MS = 15_000;
// A clip that never reports played still moves on this long after its expected end.
const PLAYED_GRACE_MS = 3_000;
const CLIP_GAP_MS = 150;
// Bounded waits for audio: the prompt is shown as text when a clip is not ready in time.
const ASSET_WAIT_MS = 3_000;
const DYNAMIC_TTS_WAIT_MS = 3_000;
const MIN_VOICED_SECONDS = 0.5;
const ACK_MIN_SECONDS = 3;
const EMPTY_STREAK_PTT = 2;
const CLARIFY_ESCALATE = 2;
const MAX_SEGMENT_RECORDS = 200;
// Only the newest segment records keep their transcript (a rejoin finishes the current turn from them).
const TRANSCRIPT_RECORDS = 20;
const MAX_CLIENT_CLIPS = 256;
const SAFE_QID = /^[A-Za-z0-9_-]+$/;
const NATURAL_PHRASING = /^ask one question about:\s*/i;
const QUESTION_LABEL = /^(?:question|q)\s*\d{1,3}\s*[:.)-]\s*/i;
const LISTEN_KINDS = new Set(["question", "follow_up", "clarify", "nudge"]);
// Shared lines pushed to the client early so acks and transitions play without a wait.
const PRELOAD_TEMPLATES = [...ACK_TEMPLATE_IDS, "transition.follow_up", "move_on.next", "move_on.skip", "nudge.think_time", "nudge.take_time"];
// Intents acted on without recording the utterance as part of the answer. `continue` and
// `decline_continue` are the "yes" and "no" right after ANVI's wellbeing line.
const COMMAND_INTENTS = new Set(["repeat", "clarify_request", "think_time", "off_topic", "wellbeing", "continue", "decline_continue"]);
const ENGLISH = "English";
const STATIC_KINDS = new Set(["specific", "warmup"]);
// A resume slot without a resume asks these generic lines: the same for everyone, so their audio is shared.
const GENERIC_RESUME_LINES = Object.freeze(genericResumeQuestions().map((text) => String(text).replace(/\s+/g, " ").trim()));

const words = (text) => String(text || "").trim().split(/\s+/).filter(Boolean).length;
const finite = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/** The line ANVI speaks for a plan item (its spoken English text, without any "Question n:" label). */
export function spokenTextOf(item) {
  const spoken = item?.spoken?.[ENGLISH];
  const raw = String(spoken || item?.text || "").replace(/\s+/g, " ").trim().replace(QUESTION_LABEL, "");
  if (!NATURAL_PHRASING.test(raw)) return raw;
  const topic = raw.replace(NATURAL_PHRASING, "").replace(/[.?!]+$/, "").trim();
  return topic ? `Can you tell me about ${topic}?` : "";
}

/**
 * The audio asset spec (without language and voice) of a plan line. Lines identical for every student use the
 * revision scope with the publish-time pass's line id (anviInterview.speakable.js), so both build the same
 * hash: a specific or warm-up question by its qid, an authored follow-up as `${qid}:f${i}`, a generic resume
 * fallback as `resume-fallback-${n}`. Everything else is attempt scope and never shared. null without text.
 */
export function lineAssetSpec(item, { attempt = null, attemptId = "" } = {}, followUp = null) {
  const text = followUp ? String(followUp.text || "").trim() : spokenTextOf(item);
  if (!item || !text) return null;
  const revision = Number(attempt?.snapshotRevision);
  const shared = attempt?.interviewId && Number.isInteger(revision);
  const generic = item.kind === "resume" ? GENERIC_RESUME_LINES.indexOf(text) : -1;
  let questionId = null;
  if (followUp) questionId = `${item.qid}:f${followUp.index}`;
  else if (STATIC_KINDS.has(item.kind)) questionId = item.qid;
  else if (generic >= 0) questionId = `resume-fallback-${generic + 1}`;
  if (shared && questionId) return { scope: "revision", interviewId: attempt.interviewId, revision, questionId, text };
  return { scope: "attempt", attemptId: String(attemptId || attempt?._id || ""), questionId: followUp ? questionId : item.qid, text };
}

/**
 * `createHybridConductor(deps)`: the Live conductor's contract for a hybrid attempt.
 * deps: { attempt, live, gemini (metered client), config, persist ({saveLive, saveLateAnswer, markFinalizing,
 * finalize}), clock, log, timers, studentFirstName, prompts, budget, audioAssets ({ensure, load}),
 * transcripts ({transcribe, forgetAttempt}), decision ({decide}), openEscalation, capacityLease, metric(name, n),
 * tenantKey, bucket (segment chunk token bucket), random, onUsage (this attempt's usage recorder, ledger then
 * budget; passed to audioAssets.ensure so question TTS is metered; defaults to gemini.onUsage when present) }.
 * Extra methods: acceptChunk, commitSegment, cancelSegment, promptPlayed, noteReplay, setInputMode, done, clipHave.
 * Extra events: prompt, clip, replay, turn, mode.
 */
export function createHybridConductor({
  attempt, live, gemini, config = anviConfig(), persist, clock = Date, log = console,
  studentFirstName = "", timers = { setTimeout, clearTimeout }, prompts = defaultPrompts,
  budget = null, audioAssets = null, transcripts = null, decision = null, openEscalation = defaultOpenEscalation,
  capacityLease = null, metric = null, tenantKey = null, bucket = null, random = Math.random, onUsage = null,
} = {}) {
  const events = new EventEmitter();
  const plan = Array.isArray(live?.plan) ? live.plan : [];
  const rules = live?.rules || {};
  const persona = live?.persona || {};
  const attemptId = String(attempt?._id || live?.attemptId || "");
  const tenant = tenantKey || (() => { try { return currentTenantKey(); } catch { return "platform"; } })();
  const assets = audioAssets || (() => { try { return defaultAudioAssets(); } catch { return null; } })();
  const transcriber = transcripts || createTranscripts({ gemini, config, log, metric: (name, n) => count(name, n) });
  const decider = decision || createDecisionEngine({ gemini, config, log, timers });
  const languagePolicy = prompts.languagePolicyOf ? prompts.languagePolicyOf(rules.languagePolicy) : { strict: true, onOtherLanguage: "remind_and_flag" };
  const flagOtherLanguage = languagePolicy.strict && languagePolicy.onOtherLanguage === "remind_and_flag";
  const conduct = prompts.conductRules ? prompts.conductRules(rules.conduct) : { endByVoice: false, finishAllQuestions: true };
  const deadlineAt = attempt?.hardDeadline ? new Date(attempt.hardDeadline).getTime() : clock.now() + 45 * 60_000;
  const turns = rules.turns || live?.turns || {};
  const setting = (value, min, max, fallback) => {
    const number = Number(value);
    return value === null || value === undefined || value === "" || !Number.isFinite(number) ? fallback : Math.min(max, Math.max(min, number));
  };
  const nudgeMs = setting(turns.nudgeSeconds, 15, 120, Number(config?.nudgeSeconds) || DEFAULT_NUDGE_SECONDS) * 1000;
  const maxNudges = Math.round(setting(turns.maxNudges, 0, 3, MAX_NUDGES));
  const silenceMs = Math.round(setting(turns.silenceSeconds, 1.5, 4, (Number(config?.silenceMs) || 2000) / 1000) * 1000);
  const voiceCommands = turns.voiceCommands !== false;
  const voice = /^[A-Za-z]{2,30}$/.test(String(persona.voice || "")) ? persona.voice : config?.ttsVoice || config?.liveVoice;
  const languageCode = /^en-IN$/.test(String(persona.voiceLanguageCode || "")) ? persona.voiceLanguageCode : config?.ttsLanguageCode || "en-IN";
  const conversationalSections = new Set((rules.hybrid?.conversationalSectionIds || live?.hybridSettings?.conversationalSectionIds || []).map(String));
  const recordOptions = (item) => ({ item, voiceCommands, language: ENGLISH, flagOtherLanguage });

  // Durable progress (the Live fields, so service.itemsFromLive and the sweeper read a hybrid doc the same way).
  const stored = live?.hybrid && typeof live.hybrid === "object" ? live.hybrid : {};
  let phase = ["intro", "asking", "closing"].includes(live?.phase) ? live.phase : "intro";
  let cursor = Math.min(Math.max(0, Number(live?.cursor) || 0), Math.max(0, plan.length - 1));
  let followUpsUsed = finite(live?.followUpsUsed);
  let candidateTurnsOnQuestion = finite(live?.candidateTurnsOnQuestion);
  let nudgesOnQuestion = finite(live?.nudgesOnQuestion);
  const answers = { ...(live?.answers || {}) };
  let summary = stored.summary && typeof stored.summary === "object" ? stored.summary : emptySummary();
  const followUpsByQ = { ...(stored.followUpsByQ || {}) };
  const clarifiesByQ = { ...(stored.clarifiesByQ || {}) };
  const repeatsByQ = { ...(stored.repeatsByQ || {}) };
  const lastDecision = { ...(stored.lastDecision || {}) };
  let emptyStreak = finite(stored.emptyStreak);
  let inputMode = stored.inputMode === "ptt" ? "ptt" : "vad";
  let segmentRecords = Array.isArray(stored.segments) ? stored.segments.slice(-MAX_SEGMENT_RECORDS).map((entry) => ({ ...entry })) : [];
  let liveSecondsUsed = finite(live?.liveSecondsUsed);
  const assembler = createSegmentAssembler({ committed: segmentRecords.map((entry) => entry.segmentId), config });

  // Runtime state.
  let started = false;
  let disposed = false;
  let finalizing = null;
  let finalizeRetries = 0;
  let deadlineHit = false;
  let onHold = false;
  let openingPending = false;
  let lostEmitted = false;
  let turn = null;
  let turnState = typeof stored.turnState === "string" ? stored.turnState : "preparing";
  let promptSeq = 0;
  let decisionGen = 0;
  let escalation = null;
  let lastAck = null;
  // The turn of ANVI's wellbeing line: a "yes, continue" on it replays the same question.
  let wellbeingTurnId = null;
  const pending = new Set();
  const inflight = new Set();
  const sentClips = new Set();
  const clientClips = new Set();
  const clipDurations = new Map();
  const templateAssets = new Map();
  const timer = { deadline: null, grace: null, retry: null, nudge: null, played: null, heartbeat: null };

  const emit = (event, payload) => {
    if (event === "error" && !events.listenerCount("error")) return;
    events.emit(event, payload);
  };
  const warn = (message, error) => log?.warn?.(`[ANVI] ${message}`, error?.code || error?.name || "");
  function count(name, n = 1) {
    try { metric?.(name, n); } catch { /* metrics never fail the interview */ }
  }
  const current = () => plan[cursor] || null;
  const clearTimer = (name) => { if (timer[name]) timers.clearTimeout(timer[name]); timer[name] = null; };
  const schedule = (name, ms, fn) => {
    clearTimer(name);
    timer[name] = timers.setTimeout(() => { timer[name] = null; fn(); }, Math.max(0, ms));
  };
  const skipAllowed = (item) => voiceCommands && item?.skippable !== false;
  const liveView = () => ({ plan, answers, phase: phase === "done" ? "asking" : phase, cursor });

  // --- Persistence --------------------------------------------------------------------------

  function leaseLost() {
    if (lostEmitted || disposed) return;
    lostEmitted = true;
    emit("lost");
  }

  function track(task) {
    inflight.add(task);
    task.finally(() => inflight.delete(task));
    return task;
  }

  // Fire-and-forget save (the Live conductor's discipline): a write that matches no live doc means the lease is gone.
  function save(patch) {
    if (disposed && !finalizing) return;
    try {
      track(Promise.resolve(persist.saveLive(patch)).then((result) => {
        if (result && result.matchedCount === 0 && !finalizing) leaseLost();
      }, (error) => warn("Could not save live progress", error)));
    } catch (error) {
      warn("Could not save live progress", error);
    }
  }

  // Awaited save before a paid call: false when the lease is gone (nothing may be spent then).
  async function saveNow(patch) {
    if (disposed || lostEmitted) return false;
    let result;
    try {
      result = await track(Promise.resolve(persist.saveLive(patch)));
    } catch (error) {
      warn("Could not save live progress", error);
      return !disposed;
    }
    if (result && result.matchedCount === 0) {
      if (!finalizing) leaseLost();
      return false;
    }
    return !disposed && !lostEmitted;
  }

  const progressPatch = () => ({ phase, cursor, followUpsUsed, candidateTurnsOnQuestion, nudgesOnQuestion });
  const turnRecord = () => (turn ? {
    turnId: turn.turnId, qid: turn.qid, kind: turn.kind, text: turn.text, assetIds: turn.assetIds,
    replayAssetId: turn.replayAssetId, status: turnState, issuedAt: turn.issuedAt,
    questionText: turn.questionText || turn.text, questionKind: turn.questionKind || turn.kind,
  } : null);
  const turnPatch = () => ({ ...progressPatch(), "hybrid.turn": turnRecord(), "hybrid.turnState": turnState });
  const countersPatch = () => ({
    "hybrid.followUpsByQ": followUpsByQ, "hybrid.clarifiesByQ": clarifiesByQ, "hybrid.repeatsByQ": repeatsByQ,
    "hybrid.lastDecision": lastDecision, "hybrid.emptyStreak": emptyStreak,
  });
  const segmentsPatch = () => {
    const keepFrom = segmentRecords.length - TRANSCRIPT_RECORDS;
    return {
      "hybrid.segments": segmentRecords.map((entry, index) => {
        if (index >= keepFrom || !entry.transcript) return entry;
        const { transcript: _transcript, ...rest } = entry;
        return rest;
      }),
    };
  };

  function saveAnswer(item) {
    save(SAFE_QID.test(item.qid) ? { [`answers.${item.qid}`]: answers[item.qid] } : { answers: { ...answers } });
  }

  // A transcript that finished after this conductor was disposed: handed to the new holder or written if
  // nobody changed that answer meanwhile (the Live late-answer path).
  function lateAnswer(item, record, expectedText) {
    answers[item.qid] = record;
    if (typeof persist.saveLateAnswer !== "function") return;
    Promise.resolve()
      .then(() => persist.saveLateAnswer(item.qid, record, expectedText))
      .catch((error) => warn("Could not save a late transcript", error));
  }

  // --- State --------------------------------------------------------------------------------

  function questionTextNow() {
    if (phase !== "asking") return "";
    const shown = turn?.questionText || turn?.text;
    return turn && turn.qid === current()?.qid && shown && LISTEN_KINDS.has(turn.kind) ? shown : spokenTextOf(current());
  }

  function state() {
    const item = phase === "intro" || phase === "done" ? null : current();
    return {
      phase,
      questionNumber: item ? item.n ?? cursor + 1 : 0,
      totalQuestions: plan.length,
      questionText: questionTextNow(),
      followUp: phase === "asking" && (turn?.questionKind || turn?.kind) === "follow_up",
      deadlineAt: new Date(deadlineAt).toISOString(),
      speaking: turnState === "playing",
      runtimeMode: "hybrid",
      turnState,
      inputMode,
    };
  }
  const emitState = () => emit("state", state());

  function setTurnState(next, extra = {}) {
    turnState = next;
    emit("turn", { turnId: turn?.turnId || null, state: next, kind: turn?.kind || null, ...extra });
  }

  // --- Audio assets -------------------------------------------------------------------------

  function withWait(promise, ms) {
    if (!ms) return promise;
    return new Promise((resolve) => {
      let settled = false;
      const handle = timers.setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, ms);
      promise.then((value) => {
        if (settled) return;
        settled = true;
        timers.clearTimeout(handle);
        resolve(value);
      });
    });
  }

  // The asset store synthesizes with its own Gemini client, so TTS spend is metered (ledger, then budget)
  // only through this attempt's onUsage.
  const ttsUsage = typeof onUsage === "function" ? onUsage : typeof gemini?.onUsage === "function" ? gemini.onUsage : null;

  function ensureAsset(spec, waitMs = ASSET_WAIT_MS) {
    if (!assets?.ensure) return Promise.resolve(null);
    const work = Promise.resolve()
      .then(() => assets.ensure({ language: ENGLISH, voice, budget, metric: count, ...(ttsUsage ? { onUsage: ttsUsage } : {}), ...spec }))
      .then((result) => (result?.assetId ? result : null), () => null);
    return withWait(work, waitMs);
  }

  function templateAsset(id, waitMs = ASSET_WAIT_MS) {
    const text = templateText(id, ENGLISH);
    if (!id || !text) return Promise.resolve(null);
    if (!templateAssets.has(id)) {
      const work = ensureAsset({ scope: "template", templateId: id, text }, 0);
      const entry = { promise: work, value: null };
      work.then((value) => { entry.value = value; if (!value) templateAssets.delete(id); });
      templateAssets.set(id, entry);
    }
    return withWait(templateAssets.get(id).promise, waitMs);
  }
  const readyTemplate = (id) => templateAssets.get(id)?.value?.assetId || null;

  // Static lines (same for everyone) use the revision scope, per-student lines the attempt scope.
  function itemAsset(item, waitMs = ASSET_WAIT_MS) {
    if (!item) return Promise.resolve(null);
    if (item.audioAssetId) return Promise.resolve({ assetId: String(item.audioAssetId), durationMs: 0 });
    const spec = lineAssetSpec(item, { attempt, attemptId });
    return spec ? ensureAsset(spec, waitMs) : Promise.resolve(null);
  }

  function numberAsset(item, waitMs) {
    if (config?.numberClips === false) return Promise.resolve(null);
    const id = numberClipId(item?.n ?? cursor + 1);
    return id ? templateAsset(id, waitMs) : Promise.resolve(null);
  }

  // Sends every clip the client does not hold yet over `clip` parts; returns the ids it can play.
  async function pushClips(ids) {
    const playable = [];
    for (const id of ids) {
      if (!id) continue;
      if (sentClips.has(id) || clientClips.has(id)) { playable.push(id); continue; }
      let clip = null;
      try { clip = assets?.load ? await assets.load(id, attempt) : null; } catch { clip = null; }
      const pcm = clip?.pcm;
      if (!pcm?.length || disposed) continue;
      const parts = Math.max(1, Math.ceil(pcm.length / LIMITS.clipPartMaxBytes));
      if (parts > LIMITS.maxClipParts) continue;
      for (let part = 0; part < parts; part += 1) {
        const slice = pcm.subarray(part * LIMITS.clipPartMaxBytes, Math.min(pcm.length, (part + 1) * LIMITS.clipPartMaxBytes));
        emit("clip", { assetId: id, sampleRate: LIMITS.clipSampleRate, format: LIMITS.clipFormat, part, final: part === parts - 1, pcm: Buffer.from(slice) });
      }
      sentClips.add(id);
      clipDurations.set(id, finite(clip.durationMs) || Math.round((pcm.length / (LIMITS.clipSampleRate * 2)) * 1000));
      playable.push(id);
    }
    return playable;
  }

  const playMs = (ids) => ids.reduce((sum, id) => sum + (clipDurations.get(id) || 0), 0) + Math.max(0, ids.length - 1) * CLIP_GAP_MS;

  // --- Prompts ------------------------------------------------------------------------------

  /**
   * Issues one prompt: saves the new turn under the lease, resolves and pushes its clips, then emits
   * `prompt`. A null asset (R2 or TTS down) leaves the prompt as text and goes straight on.
   */
  async function issuePrompt({ kind, item = null, text, assetsOf = [], replayIndex = -1, preload = null, turnId = null, inherit = false }) {
    const mine = ++promptSeq;
    clearTimer("nudge");
    clearTimer("played");
    clearTimer("heartbeat");
    decisionGen += 1;
    const qid = item?.qid || null;
    // A nudge keeps the line it nudges about: "repeat" then replays that question, not the nudge clip, and
    // the room keeps showing the question text.
    const prior = inherit && turn && qid && turn.qid === qid ? turn : null;
    turn = {
      turnId: turnId || newTurnId(), kind, qid, text, assetIds: [], replayAssetId: null, issuedAt: new Date(clock.now()),
      parts: [], baseRecord: qid ? { ...(answers[qid] || {}) } : null, awaitingFinal: false, reissue: null,
      questionText: prior ? prior.questionText || prior.text : text, questionKind: prior ? prior.questionKind || prior.kind : kind,
    };
    const issued = turn;
    issued.reissue = () => issuePrompt({ kind, item, text, assetsOf, replayIndex, preload, turnId: issued.turnId, inherit });
    assembler.setTurn(issued.turnId);
    setTurnState("preparing");
    if (!(await saveNow(turnPatch())) || mine !== promptSeq || finalizing) return;
    if (onHold) return;
    const resolved = await Promise.all(assetsOf.map((get) => Promise.resolve().then(get).catch(() => null)));
    if (mine !== promptSeq || disposed || finalizing) return;
    const wanted = resolved.map((asset) => asset?.assetId || null);
    for (const asset of resolved) if (asset?.assetId && asset.durationMs) clipDurations.set(asset.assetId, asset.durationMs);
    const playable = await pushClips(wanted);
    if (mine !== promptSeq || disposed || finalizing) return;
    issued.assetIds = wanted.filter((id) => id && playable.includes(id));
    const replayId = replayIndex >= 0 ? wanted[replayIndex] : null;
    issued.replayAssetId = replayId && playable.includes(replayId) ? replayId : prior?.replayAssetId || null;
    const questionNumber = phase === "asking" && item ? item.n ?? cursor + 1 : 0;
    emit("caption", { role: "anvi", text, final: true });
    emit("prompt", {
      turnId: issued.turnId, kind, questionNumber, totalQuestions: plan.length, text, assetIds: issued.assetIds, preload: [],
    });
    if (issued.assetIds.length) {
      setTurnState("playing");
      save(turnPatch());
      emitState();
      schedule("played", playMs(issued.assetIds) + PLAYED_GRACE_MS, () => onPlayed(issued));
    } else {
      save(turnPatch());
      onPlayed(issued);
    }
    if (preload) void preloadClips(preload, mine);
  }

  async function preloadClips(getters, mine) {
    const ids = (await Promise.all(getters.map((get) => Promise.resolve().then(get).catch(() => null)))).map((asset) => asset?.assetId).filter(Boolean);
    if (mine !== promptSeq || disposed || finalizing) return;
    await pushClips(ids);
  }

  // The current prompt finished playing (or timed out): what its kind leads to.
  function onPlayed(issued) {
    if (issued !== turn || disposed || finalizing || onHold) return;
    clearTimer("played");
    if (turnState !== "playing" && turnState !== "preparing") return;
    if (issued.kind === "intro") { void advanceTo(0); return; }
    if (issued.kind === "move_on") { void moveOn(); return; }
    if (issued.kind === "closing") { void finalize(closingOutcome()).catch(() => {}); return; }
    if (issued.kind === "question" && conversationalSections.has(String(current()?.sectionId || "")) && !issued.escalationTried) {
      issued.escalationTried = true;
      void escalate("conversational_section").then((opened) => { if (!opened && issued === turn) listen(); });
      return;
    }
    listen();
  }

  function listen() {
    if (!turn || disposed || finalizing) return;
    setTurnState("listening");
    save({ "hybrid.turnState": turnState, "hybrid.turn": turnRecord() });
    emitState();
    armNudge();
    armHeartbeat();
  }

  function armNudge() {
    if (onHold || finalizing || phase !== "asking" || turnState !== "listening") return;
    schedule("nudge", nudgeMs, onSilence);
  }

  function armHeartbeat() {
    if (turnState !== "listening" || finalizing || disposed) return;
    schedule("heartbeat", HEARTBEAT_MS, () => {
      if (turnState !== "listening" || finalizing || disposed) return;
      save({ "hybrid.heartbeatAt": new Date(clock.now()) });
      armHeartbeat();
    });
  }

  function onSilence() {
    if (disposed || finalizing || onHold || phase !== "asking" || turnState !== "listening") return;
    if (turn?.parts.length || assembler.stats().open) return;
    const item = current();
    if (nudgesOnQuestion < maxNudges) {
      nudgesOnQuestion += 1;
      const id = "nudge.think_time";
      void issuePrompt({ kind: "nudge", item, text: templateText(id), assetsOf: [() => templateAsset(id)], inherit: true });
      return;
    }
    answers[item.qid] = markSilent(answers[item.qid]);
    saveAnswer(item);
    moveOnWith("move_on.next");
  }

  function questionPrompt(item, index) {
    const next = plan[index + 1];
    return issuePrompt({
      kind: "question",
      item,
      text: spokenTextOf(item),
      assetsOf: [() => numberAsset(item), () => itemAsset(item)],
      replayIndex: 1,
      preload: next ? [() => numberAsset(next, 0), () => itemAsset(next, 0)] : null,
    });
  }

  function averageAnswerMs() {
    const timed = plan.map((item) => finite(answers[item.qid]?.seconds)).filter((seconds) => seconds > 0);
    if (timed.length) return (timed.reduce((sum, seconds) => sum + seconds, 0) / timed.length) * 1000;
    return finite(current()?.responseSeconds || 120) * 1000;
  }

  function timeLowAfter(index) {
    return isTimeLow({
      remainingMs: deadlineAt - clock.now(),
      remainingHighPriority: plan.slice(index + 1).filter((item) => item.priority === "high").length,
      avgAnswerMs: averageAnswerMs(),
    });
  }

  async function advanceTo(index) {
    if (disposed || finalizing) return;
    let target = index;
    // Time low: low-priority questions are left unasked (not_attempted, reason "time").
    while (target < plan.length && plan[target]?.priority === "low" && timeLowAfter(target)) {
      const skipped = plan[target];
      answers[skipped.qid] = { ...(answers[skipped.qid] || {}), notAttemptedReason: "time" };
      saveAnswer(skipped);
      target += 1;
    }
    if (target >= plan.length) { beginClosing(); return; }
    phase = "asking";
    cursor = target;
    candidateTurnsOnQuestion = 0;
    nudgesOnQuestion = 0;
    emptyStreak = 0;
    const item = current();
    answers[item.qid] = markAsked(answers[item.qid], spokenTextOf(item));
    saveAnswer(item);
    save(countersPatch());
    await questionPrompt(item, target);
  }

  function moveOn() {
    if (cursor + 1 >= plan.length || phase !== "asking") return beginClosing();
    return advanceTo(cursor + 1);
  }

  function moveOnWith(templateId) {
    if (cursor + 1 >= plan.length) { beginClosing(); return; }
    void issuePrompt({ kind: "move_on", item: current(), text: templateText(templateId), assetsOf: [() => templateAsset(templateId)] });
  }

  function beginClosing(reason = deadlineHit ? "time" : "default") {
    if (finalizing || disposed) return;
    phase = "closing";
    const id = reason === "time" ? "closing.time" : "closing.default";
    void issuePrompt({ kind: "closing", text: templateText(id), assetsOf: [() => templateAsset(id)] });
  }

  function introPrompt() {
    const id = "intro.default";
    const name = String(studentFirstName || "").trim();
    const text = name ? templateText(id).replace(/^Hello,/, `Hello ${name},`) : templateText(id);
    return issuePrompt({ kind: "intro", text, assetsOf: [() => templateAsset(id)], preload: plan[0] ? [() => numberAsset(plan[0], 0), () => itemAsset(plan[0], 0)] : null });
  }

  // `counted` false: the question is played again without counting a repeat (after the wellbeing line).
  function replayCurrent({ counted = true } = {}) {
    if (!turn) return;
    const qid = turn.qid;
    if (counted) {
      if (qid) repeatsByQ[qid] = finite(repeatsByQ[qid]) + 1;
      save(countersPatch());
      count("repeatedQuestionReplay");
    }
    clearTimer("nudge");
    if (turn.replayAssetId) {
      setTurnState("playing");
      emit("replay", { turnId: turn.turnId, assetId: turn.replayAssetId });
      const replaying = turn;
      replaying.replaying = true;
      schedule("played", playMs([turn.replayAssetId]) + PLAYED_GRACE_MS, () => onReplayed(replaying));
      return;
    }
    // Text only: the same prompt again, no audio and no model call.
    emit("prompt", { turnId: turn.turnId, kind: turn.questionKind || turn.kind, questionNumber: phase === "asking" ? current()?.n ?? cursor + 1 : 0, totalQuestions: plan.length, text: turn.questionText || turn.text, assetIds: [], preload: [] });
    listen();
  }

  function onReplayed(replaying) {
    if (replaying !== turn || !replaying.replaying || disposed || finalizing || onHold) return;
    replaying.replaying = false;
    clearTimer("played");
    listen();
  }

  // --- Segments -----------------------------------------------------------------------------

  /** `anvi:seg-chunk`: `{ ok, code?, duplicate? }`. Speech onset stops the nudge; a new segment while the
   * last answer is being processed cancels its pending decision (the student kept talking). */
  function acceptChunk(payload, options = {}) {
    if (disposed || finalizing || !turn) return { ok: false, code: "STALE_TURN" };
    const result = assembler.chunk(payload, { onHold, bucket: options.bucket || bucket });
    if (!result.ok || result.duplicate) return result;
    clearTimer("nudge");
    if (turnState === "processing" && payload.turnId === turn.turnId && !turn.parts.some((part) => part.segmentId === payload.segmentId)) {
      decisionGen += 1;
      turn.awaitingFinal = true;
      setTurnState("listening");
    }
    return result;
  }

  function cancelSegment(payload = {}) {
    if (payload && typeof payload.segmentId === "string") assembler.cancel(payload.segmentId);
    if (turnState === "listening" && !turn?.parts.length) armNudge();
    return { ok: true };
  }

  /**
   * `anvi:seg-commit`: the receipt is written to live.hybrid.segments under the lease before the ack.
   * Resolves to `{ ok, duplicate?, code?, ackAssetId? }`.
   */
  async function commitSegment(payload) {
    if (disposed || finalizing || !turn) return { ok: false, code: "STALE_TURN" };
    const result = assembler.commit(payload, { onHold });
    if (!result.ok) return { ok: false, code: result.code };
    if (result.duplicate) return { ok: true, duplicate: true };
    const owner = turn;
    const item = plan.find((entry) => entry.qid === owner.qid) || null;
    const record = {
      segmentId: result.segmentId, turnId: result.turnId, qid: owner.qid, audioHash: result.audioHash, part: result.part,
      final: result.final, seconds: result.seconds, voicedSeconds: result.voicedSeconds, processed: false,
    };
    segmentRecords = [...segmentRecords, record].slice(-MAX_SEGMENT_RECORDS);
    if (!(await saveNow(segmentsPatch()))) {
      assembler.release(result.segmentId);
      return { ok: false, code: "LEASE_LOST" };
    }
    const part = { segmentId: result.segmentId, part: result.part, seconds: result.seconds, voicedSeconds: result.voicedSeconds, done: false, text: "", transcript: null };
    owner.parts.push(part);
    owner.parts.sort((a, b) => a.part - b.part);
    if (result.final) {
      owner.awaitingFinal = false;
      if (owner === turn && !escalation) setTurnState("processing");
    } else owner.awaitingFinal = true;
    clearTimer("nudge");
    let ackAssetId = null;
    if (result.final && config?.ackClips !== false && result.seconds >= ACK_MIN_SECONDS) {
      const id = pickAck(lastAck, random);
      ackAssetId = readyTemplate(id);
      if (ackAssetId && (sentClips.has(ackAssetId) || clientClips.has(ackAssetId))) lastAck = id;
      else ackAssetId = null;
    }
    if (result.voicedSeconds < MIN_VOICED_SECONDS || !item) {
      // Too little voice to hold an answer: no model call.
      assembler.release(result.segmentId);
      part.done = true;
      markProcessed(record, null);
      afterPart(owner);
    } else {
      transcribePart(owner, item, part, record, result.pcm);
    }
    return { ok: true, ...(ackAssetId ? { ackAssetId } : {}) };
  }

  function markProcessed(record, transcript) {
    record.processed = true;
    if (transcript) record.transcript = transcript;
    save(segmentsPatch());
  }

  function transcribePart(owner, item, part, record, pcm) {
    let audio = pcm;
    const task = Promise.resolve()
      .then(() => transcriber.transcribe({
        tenantKey: tenant, attemptId, studentId: attempt?.studentId ? String(attempt.studentId) : "", qid: item.qid,
        audioHash: record.audioHash, pcm: audio, voicedSeconds: part.voicedSeconds, language: ENGLISH,
        accurate: !finalizing, budget,
      }))
      .catch(() => ({ text: "", lowConfidence: true, error: "TRANSCRIBE_FAILED" }))
      .then((transcript) => {
        part.text = String(transcript?.text || "").trim();
        part.transcript = transcript && !transcript.error ? transcript : null;
        part.done = true;
        markProcessed(record, transcript && !transcript.error ? {
          text: part.text, model: transcript.model || null, attempts: finite(transcript.attempts), escalated: Boolean(transcript.escalated),
          lowConfidence: Boolean(transcript.lowConfidence), audioSeconds: finite(transcript.audioSeconds), tokens: transcript.tokens || null,
        } : null);
        afterPart(owner);
      })
      .finally(() => { audio = null; assembler.release(record.segmentId); pending.delete(task); });
    pending.add(task);
  }

  // The turn's text and transcript bookkeeping so far (parts in order).
  function turnTextOf(owner) {
    return owner.parts.filter((part) => part.done && part.text).map((part) => part.text).join(" ");
  }

  function transcriptMetaOf(owner) {
    const done = owner.parts.filter((part) => part.done && part.transcript);
    if (!done.length) return null;
    const sum = (pick) => done.reduce((total, part) => total + finite(pick(part.transcript)), 0);
    return {
      model: done.map((part) => part.transcript.model).filter(Boolean).at(-1) || "",
      attempts: Math.max(1, sum((t) => t.attempts)),
      escalated: done.some((part) => part.transcript.escalated),
      audioSeconds: sum((t) => t.audioSeconds),
      tokens: { input: sum((t) => t.tokens?.input), output: sum((t) => t.tokens?.output) },
      lowConfidence: done.some((part) => part.transcript.lowConfidence),
    };
  }

  // Writes the turn into the answer, rebuilt from the answer as it was when the prompt was issued, so a
  // re-run (more parts arrived) replaces rather than duplicates. Command utterances are not answer text.
  function recordTurn(owner, intent) {
    const item = plan.find((entry) => entry.qid === owner.qid);
    if (!item || !owner.baseRecord) return;
    const text = turnTextOf(owner);
    const command = intent?.clear && COMMAND_INTENTS.has(intent.intent);
    const seconds = owner.parts.reduce((total, part) => total + finite(part.seconds), 0);
    const expectedText = String(answers[item.qid]?.text || "");
    const record = answerRecord(owner.baseRecord, {
      kind: owner.kind === "question" || owner.kind === "nudge" ? "answer" : owner.kind,
      text: command ? "" : text,
      seconds: command ? 0 : seconds,
      transcript: transcriptMetaOf(owner),
    }, recordOptions(item));
    // A question the student only asked to hear again stays unanswered (no "transcribe" source on no text).
    if (command && !String(owner.baseRecord.text || "").trim()) Object.assign(record, { source: owner.baseRecord.source || "none" });
    owner.recorded = true;
    if (disposed && !finalizing) { lateAnswer(item, record, expectedText); return; }
    answers[item.qid] = record;
    saveAnswer(item);
  }

  function afterPart(owner) {
    if (owner.parts.some((part) => !part.done) || owner.awaitingFinal) return;
    // Not the current turn any more (moved on, closing, deadline): the words still count for the question.
    if (owner !== turn || disposed || finalizing) { recordTurn(owner, detectIntent(turnTextOf(owner), ENGLISH)); return; }
    if (onHold) { owner.decisionPending = true; recordTurn(owner, detectIntent(turnTextOf(owner), ENGLISH)); return; }
    void handleAnswer(owner);
  }

  // --- Decisions ----------------------------------------------------------------------------

  async function handleAnswer(owner) {
    if (owner !== turn || disposed || finalizing) return;
    const gen = ++decisionGen;
    owner.decisionPending = false;
    const item = current();
    const text = turnTextOf(owner);
    // The reply right after the wellbeing line: "yes" replays the question, "no" points to the End button.
    const afterWellbeing = Boolean(text) && owner.turnId === wellbeingTurnId;
    const reply = afterWellbeing && isContinueReply(text) ? "continue" : afterWellbeing && isDeclineReply(text) ? "decline_continue" : null;
    const intent = reply ? { intent: reply, clear: true } : detectIntent(text, ENGLISH);
    recordTurn(owner, intent);
    // Report-only flags (never scored): the request itself is not answer text.
    if (intent.clear && intent.intent === "off_topic") flagAnswer(item, ["off_topic_request", ...(isInjectionAttempt(text) ? ["prompt_injection"] : [])]);
    if (intent.clear && intent.intent === "wellbeing") flagAnswer(item, ["wellbeing_concern"]);
    if (text) emit("caption", { role: "candidate", text, final: true });
    if (!text) {
      const meaningful = owner.parts.some((part) => part.voicedSeconds >= MIN_VOICED_SECONDS);
      emptyStreak = meaningful ? emptyStreak + 1 : emptyStreak;
      save(countersPatch());
      if (emptyStreak >= EMPTY_STREAK_PTT && meaningful) {
        if (await escalate("unusable_transcripts")) return;
        if (owner !== turn) return;
        emit("turn", { turnId: owner.turnId, state: "listening", kind: owner.kind, suggestPtt: true });
      }
      owner.parts = [];
      owner.baseRecord = { ...(answers[item.qid] || {}) };
      listen();
      return;
    }
    emptyStreak = 0;
    count("avoidedLiveTurn");
    if (!(intent.clear && COMMAND_INTENTS.has(intent.intent))) candidateTurnsOnQuestion += 1;

    if (intent.clear && intent.intent === "repeat") { resetParts(owner, item); replayCurrent(); return; }
    if (intent.clear && intent.intent === "think_time") {
      resetParts(owner, item);
      void issuePrompt({ kind: "nudge", item, text: templateText("nudge.take_time"), assetsOf: [() => templateAsset("nudge.take_time")], inherit: true });
      return;
    }
    if (intent.clear && intent.intent === "continue") { wellbeingTurnId = null; resetParts(owner, item); replayCurrent({ counted: false }); return; }
    if (intent.clear && intent.intent === "decline_continue") {
      wellbeingTurnId = null;
      if (conduct.endByVoice && isEndRequest(text)) { beginClosing("default"); return; }
      // Never the next question: the End button line, then ANVI waits on the same question.
      resetParts(owner, item);
      void sameQuestionLine(item, "wellbeing.end_hint");
      return;
    }
    if (intent.clear && intent.intent === "off_topic") { resetParts(owner, item); void sameQuestionLine(item, "decline.off_topic"); return; }
    if (intent.clear && intent.intent === "wellbeing") {
      // ANVI never ends the interview herself: only an explicit request where voice ending is on.
      if (conduct.endByVoice && isEndRequest(text)) { beginClosing("default"); return; }
      resetParts(owner, item);
      void sameQuestionLine(item, "wellbeing.reschedule");
      wellbeingTurnId = turn?.turnId || null;
      return;
    }
    if (intent.clear && intent.intent === "clarify_request") { await clarify(owner, item); return; }
    if (intent.intent === "skip" && intent.clear && skipAllowed(item)) { moveOnWith("move_on.skip"); return; }
    if (intent.intent === "end_request" && intent.clear && conduct.endByVoice) { beginClosing("default"); return; }

    const accepted = !intent.clear || intent.intent === "dont_know" || intent.intent === "none";
    const qid = item.qid;
    const result = await decider.decide({
      item, transcript: text, followUpsAsked: answers[qid]?.followUpsAsked || [], lastAction: lastDecision[qid] || null,
      repeats: finite(repeatsByQ[qid]), intent, questionsRemain: cursor + 1 < plan.length, endByVoice: conduct.endByVoice,
      budget, summary, timeLow: timeLowAfter(cursor),
      beforeCall: () => saveNow({ "hybrid.turnState": turnState, "hybrid.decisionAt": new Date(clock.now()) }),
      isCurrent: () => gen === decisionGen && owner === turn,
    });
    if (gen !== decisionGen || owner !== turn || disposed || finalizing || result?.stale) return;
    if (result?.preRouted === "lease") return;
    lastDecision[qid] = result.action;
    if (accepted && ["next", "cached_follow_up", "dynamic_follow_up"].includes(result.action)) {
      summary = updateSummary(summary, { accepted: true, kind: "answer", item, text, seconds: owner.parts.reduce((t, p) => t + finite(p.seconds), 0), missingKeyPoints: result.missingKeyPoints });
      save({ "hybrid.summary": summary });
    }
    save(countersPatch());
    await applyDecision(result, owner, item);
  }

  function resetParts(owner, item) {
    owner.parts = [];
    owner.baseRecord = { ...(answers[item.qid] || {}) };
  }

  // A cached line spoken on the current question; a repeat after it replays the question, not the line.
  function sameQuestionLine(item, templateId) {
    return issuePrompt({ kind: "nudge", item, text: templateText(templateId), assetsOf: [() => templateAsset(templateId)], inherit: true });
  }

  function flagAnswer(item, flags) {
    if (!item || !answers[item.qid]) return;
    const before = Array.isArray(answers[item.qid].flags) ? answers[item.qid].flags : [];
    answers[item.qid] = { ...answers[item.qid], flags: [...new Set([...before, ...flags])] };
    saveAnswer(item);
  }

  async function clarify(owner, item) {
    const qid = item.qid;
    clarifiesByQ[qid] = finite(clarifiesByQ[qid]) + 1;
    lastDecision[qid] = "clarify";
    save(countersPatch());
    resetParts(owner, item);
    if (clarifiesByQ[qid] >= CLARIFY_ESCALATE) {
      if (await escalate("low_confidence_clarify")) return;
      if (owner === turn) replayCurrent();
      return;
    }
    const id = "clarify.own_words";
    await issuePrompt({ kind: "clarify", item, text: templateText(id), assetsOf: [() => templateAsset(id)], replayIndex: 0 });
  }

  // An authored follow-up of the item the student has not been asked yet (its audio is shared).
  function authoredFollowUp(item) {
    const authored = Array.isArray(item.authoredFollowUps) ? item.authoredFollowUps : [];
    const asked = new Set((answers[item.qid]?.followUpsAsked || []).map((entry) => String(entry).trim()));
    const index = authored.findIndex((entry) => entry && !asked.has(String(entry).trim()));
    return index >= 0 ? { index, text: String(authored[index]).trim() } : null;
  }

  function noteFollowUpAsked(item, text) {
    answers[item.qid] = noteFollowUp(answers[item.qid], text);
    followUpsUsed += 1;
    followUpsByQ[item.qid] = finite(followUpsByQ[item.qid]) + 1;
    saveAnswer(item);
    save(countersPatch());
  }

  async function applyDecision(result, owner, item) {
    const action = result?.action || "next";
    if (action === "repeat") { resetParts(owner, item); replayCurrent(); return; }
    if (action === "end") { beginClosing("default"); return; }
    if (action === "clarify") {
      clarifiesByQ[item.qid] = finite(clarifiesByQ[item.qid]) + 1;
      save(countersPatch());
      if (result.templateId) {
        await issuePrompt({ kind: "clarify", item, text: templateText(result.templateId), assetsOf: [() => templateAsset(result.templateId)], replayIndex: 0 });
        return;
      }
      await dynamicPrompt("clarify", item, result.question, `${item.qid}:c${clarifiesByQ[item.qid]}`);
      return;
    }
    if (action === "cached_follow_up" || action === "dynamic_follow_up") {
      const authored = authoredFollowUp(item);
      if (authored) {
        noteFollowUpAsked(item, authored.text);
        await issuePrompt({
          kind: "follow_up", item, text: authored.text, replayIndex: 0,
          assetsOf: [() => ensureAsset(lineAssetSpec(item, { attempt, attemptId }, authored))],
        });
        return;
      }
      if (action === "cached_follow_up" && result.templateId) {
        const text = templateText(result.templateId);
        noteFollowUpAsked(item, text);
        await issuePrompt({ kind: "follow_up", item, text, assetsOf: [() => templateAsset(result.templateId)], replayIndex: 0 });
        return;
      }
      if (action === "dynamic_follow_up" && result.question) {
        noteFollowUpAsked(item, result.question);
        await dynamicPrompt("follow_up", item, result.question, `${item.qid}:d${followUpsByQ[item.qid]}`);
        return;
      }
    }
    void moveOn();
  }

  // A per-student line voiced on the fly behind the cached transition clip; text only when the budget
  // denies it or TTS fails. The lease is checked before the paid call.
  async function dynamicPrompt(kind, item, text, questionId) {
    const transition = kind === "follow_up" ? "transition.follow_up" : null;
    const leaseOk = await saveNow({ "hybrid.turnState": turnState, "hybrid.ttsAt": new Date(clock.now()) });
    if (!leaseOk) return;
    let allowed = true;
    try { allowed = !budget?.allow || budget.allow("tts") !== false; } catch { allowed = false; }
    const getters = [
      ...(transition ? [() => templateAsset(transition)] : []),
      allowed ? () => ensureAsset({ scope: "attempt", attemptId, questionId, text }, DYNAMIC_TTS_WAIT_MS) : () => null,
    ];
    await issuePrompt({ kind, item, text, assetsOf: getters, replayIndex: getters.length - 1 });
  }

  // --- Live escalation (off unless config.hybridLiveEscalation) -----------------------------

  async function escalate(reason) {
    if (!config?.hybridLiveEscalation || escalation || typeof openEscalation !== "function" || !budget || disposed || finalizing || onHold) return false;
    const owner = turn;
    const item = current();
    if (!owner || !item) return false;
    if (!(await saveNow({ "hybrid.turnState": turnState, "hybrid.escalationAt": new Date(clock.now()) }))) return false;
    let block = null;
    try {
      block = await openEscalation({
        gemini, budget, capacityLease, item, reason, language: ENGLISH, voice, languageCode, silenceMs, config, clock, timers,
        onAudio: (pcm) => { if (escalation === block) emit("audio", pcm); },
        onCaption: (caption) => { if (escalation === block) emit("caption", { ...caption, final: false }); },
        onSeconds: ({ liveSeconds }) => {
          liveSecondsUsed = Math.max(liveSecondsUsed, finite(liveSeconds));
          save({ liveSecondsUsed });
        },
        onInterrupted: () => emit("interrupted"),
      });
    } catch (error) {
      warn("Live escalation could not open", error);
      block = null;
    }
    if (!block) return false;
    if (owner !== turn || disposed || finalizing || onHold) {
      block.stop("stopped", { immediate: true });
      return true;
    }
    escalation = block;
    clearTimer("nudge");
    count("liveEscalation");
    setTurnState("live");
    save({ "hybrid.turnState": turnState });
    emit("mode", { mode: "live" });
    void block.done.then((outcome) => onEscalationDone(block, owner, item, outcome));
    return true;
  }

  function onEscalationDone(block, owner, item, outcome) {
    if (escalation === block) escalation = null;
    liveSecondsUsed = Math.max(liveSecondsUsed, finite(budget?.liveSeconds?.()));
    save({ liveSecondsUsed });
    if (!disposed) emit("mode", { mode: "turn" });
    const heard = outcome?.heardPcm;
    if (heard?.length && !disposed) {
      // The buffered student audio is transcribed once through the normal two-level path.
      const part = { segmentId: `live-${owner.parts.length}`, part: owner.parts.length, seconds: heard.length / 32000, voicedSeconds: heard.length / 32000, done: false, text: "", transcript: null };
      owner.parts.push(part);
      const record = { segmentId: part.segmentId, turnId: owner.turnId, qid: item.qid, audioHash: audioHashOf(heard), part: part.part, final: true, seconds: part.seconds, processed: false };
      owner.awaitingFinal = false;
      owner.escalated = true;
      transcribeLive(owner, item, part, record, heard);
      return;
    }
    if (owner === turn && !disposed && !finalizing && !onHold) void moveOn();
  }

  function transcribeLive(owner, item, part, record, pcm) {
    const task = Promise.resolve()
      .then(() => transcriber.transcribe({
        tenantKey: tenant, attemptId, studentId: attempt?.studentId ? String(attempt.studentId) : "", qid: item.qid,
        audioHash: record.audioHash, pcm, voicedSeconds: part.voicedSeconds, language: ENGLISH, accurate: !finalizing, budget,
      }))
      .catch(() => ({ text: "", error: "TRANSCRIBE_FAILED" }))
      .then((transcript) => {
        part.text = String(transcript?.text || "").trim();
        part.transcript = transcript && !transcript.error ? transcript : null;
        part.done = true;
        recordTurn(owner, detectIntent(turnTextOf(owner), ENGLISH));
        if (owner === turn && !disposed && !finalizing && !onHold) void moveOn();
      })
      .finally(() => pending.delete(task));
    pending.add(task);
  }

  // --- Deadline and finalisation ------------------------------------------------------------

  function onDeadline() {
    if (disposed || finalizing) return;
    deadlineHit = true;
    decisionGen += 1;
    escalation?.stop("stopped", { immediate: true });
    if (phase !== "closing") beginClosing("time");
    schedule("grace", DEADLINE_GRACE_MS, () => { void finalize(deadlineOutcome()).catch(() => {}); });
  }

  const deadlineOutcome = () => hybridDeadlineOutcome(liveView(), { voiceCommands });
  const closingOutcome = () => hybridClosingOutcome(liveView(), { deadlineHit, voiceCommands });
  const questionsRemain = () => hybridQuestionsRemain(liveView(), { voiceCommands });

  function waitForTranscripts() {
    if (!pending.size) return Promise.resolve();
    return new Promise((resolve) => {
      const cap = timers.setTimeout(resolve, TRANSCRIBE_WAIT_MS);
      Promise.allSettled([...pending]).then(() => { timers.clearTimeout(cap); resolve(); });
    });
  }

  function scheduleFinalizeRetry(outcome) {
    const delay = FINALIZE_RETRY_MS[finalizeRetries];
    if (delay === undefined || disposed) return;
    finalizeRetries += 1;
    schedule("retry", delay, () => { void finalize(outcome).catch(() => {}); });
  }

  function finalize({ status, endReason }) {
    if (finalizing) return finalizing;
    finalizing = (async () => {
      for (const name of ["nudge", "retry", "played", "heartbeat"]) clearTimer(name);
      decisionGen += 1;
      escalation?.stop("stopped", { immediate: true });
      const view = liveView();
      phase = "done";
      try { await persist.markFinalizing?.(); } catch (error) { warn("Could not mark the interview as finishing", error); }
      await waitForTranscripts();
      const items = buildHybridItems({ ...view, answers });
      let cost = null;
      try {
        await budget?.flush?.();
        cost = budget?.summary ? budget.summary() : null;
      } catch (error) { warn("Could not read the attempt cost", error); }
      let result;
      try {
        result = await persist.finalize({ status, endReason, items, warmup: "", ...(cost ? { cost } : {}) });
      } catch (error) {
        warn("Could not save the finished interview", error);
        finalizing = null;
        phase = view.phase === "intro" ? "intro" : "closing";
        scheduleFinalizeRetry({ status, endReason });
        emit("error", { code: "FINALIZE_FAILED", message: "Your answers could not be saved yet. Please try ending again.", retryable: true });
        throw error;
      }
      for (const name of Object.keys(timer)) clearTimer(name);
      assembler.dispose();
      // Best effort: the attempt record is authoritative, the cached transcripts expire anyway.
      // The segment records include the ones other instances wrote before a reconnect or takeover.
      const forgetOptions = { segments: segmentRecords, tenantKey: tenant, studentId: attempt?.studentId ? String(attempt.studentId) : "", language: ENGLISH };
      Promise.resolve().then(() => transcriber.forgetAttempt?.(attemptId, forgetOptions)).catch(() => {});
      if (result?.lost) {
        leaseLost();
        return { status, endReason, lost: true };
      }
      const outcome = result && result.applied === false
        ? { status: result.status || status, endReason: result.endReason ?? endReason }
        : { status, endReason };
      emit("ended", outcome);
      return outcome;
    })();
    return finalizing;
  }

  // --- Recovery -----------------------------------------------------------------------------

  // Rejoin: the stored turn is re-prompted with the same turnId and assets (the client outbox resends its
  // uncommitted segments of it); committed but unprocessed segments finish from the transcript cache.
  async function resumeStoredTurn() {
    const saved = stored.turn && typeof stored.turn === "object" ? stored.turn : null;
    const item = current();
    if (!saved || !item || saved.qid !== item.qid || !LISTEN_KINDS.has(saved.kind)) return false;
    const mine = ++promptSeq;
    turn = {
      turnId: saved.turnId, kind: saved.kind, qid: saved.qid, text: String(saved.text || spokenTextOf(item)),
      assetIds: Array.isArray(saved.assetIds) ? saved.assetIds.filter(Boolean) : [], replayAssetId: saved.replayAssetId || null,
      issuedAt: saved.issuedAt ? new Date(saved.issuedAt) : new Date(clock.now()), parts: [], baseRecord: { ...(answers[item.qid] || {}) }, awaitingFinal: false,
      questionText: typeof saved.questionText === "string" && saved.questionText ? saved.questionText : String(saved.text || spokenTextOf(item)),
      questionKind: typeof saved.questionKind === "string" ? saved.questionKind : saved.kind,
    };
    const restored = turn;
    restored.reissue = () => reprompt(restored);
    assembler.setTurn(restored.turnId);
    const open = segmentRecords.filter((entry) => entry.turnId === restored.turnId && !entry.processed);
    if (open.length && open.some((entry) => entry.final)) {
      setTurnState("processing");
      for (const entry of open.sort((a, b) => a.part - b.part)) {
        const part = { segmentId: entry.segmentId, part: entry.part, seconds: finite(entry.seconds), voicedSeconds: finite(entry.voicedSeconds), done: false, text: "", transcript: null };
        restored.parts.push(part);
        const task = Promise.resolve()
          .then(() => transcriber.transcribe({
            tenantKey: tenant, attemptId, studentId: attempt?.studentId ? String(attempt.studentId) : "", qid: item.qid,
            audioHash: entry.audioHash, pcm: null, voicedSeconds: part.voicedSeconds, language: ENGLISH, record: entry.transcript || null, budget,
          }))
          .catch(() => null)
          .then((transcript) => {
            part.text = transcript && !transcript.error ? String(transcript.text || "").trim() : "";
            part.transcript = transcript && !transcript.error ? transcript : null;
            part.done = true;
            entry.processed = true;
            save(segmentsPatch());
            if (mine !== promptSeq) return;
            if (restored.parts.every((p) => p.done) && !restored.parts.some((p) => p.text)) { restored.parts = []; void reprompt(restored); return; }
            afterPart(restored);
          })
          .finally(() => pending.delete(task));
        pending.add(task);
      }
      return true;
    }
    await reprompt(restored);
    return true;
  }

  async function reprompt(restored) {
    if (restored !== turn || disposed || finalizing || onHold) return;
    const mine = promptSeq;
    clearTimer("nudge");
    clearTimer("played");
    // After a hold or a rejoin a nudge turn asks its question again, not the nudge line.
    if (restored.kind === "nudge" && restored.questionText) {
      restored.kind = restored.questionKind && restored.questionKind !== "nudge" ? restored.questionKind : "question";
      restored.text = restored.questionText;
      restored.assetIds = restored.replayAssetId ? [restored.replayAssetId] : [];
    }
    const playable = await pushClips(restored.assetIds);
    if (mine !== promptSeq || restored !== turn || disposed || finalizing) return;
    restored.assetIds = restored.assetIds.filter((id) => playable.includes(id));
    if (restored.replayAssetId && !playable.includes(restored.replayAssetId)) restored.replayAssetId = null;
    emit("prompt", {
      turnId: restored.turnId, kind: restored.kind, questionNumber: current()?.n ?? cursor + 1, totalQuestions: plan.length,
      text: restored.text, assetIds: restored.assetIds, preload: [],
    });
    if (restored.assetIds.length) {
      setTurnState("playing");
      save(turnPatch());
      emitState();
      schedule("played", playMs(restored.assetIds) + PLAYED_GRACE_MS, () => onPlayed(restored));
    } else {
      listen();
    }
  }

  async function opening(resumed) {
    // Shared lines the client will need soon (acks, transitions), resolved in the background.
    for (const id of PRELOAD_TEMPLATES) void templateAsset(id, 0);
    if (!plan.length) { beginClosing("default"); return; }
    if (!resumed || phase === "intro") { phase = "intro"; await introPrompt(); return; }
    if (phase === "closing") { beginClosing(deadlineHit ? "time" : "default"); return; }
    if (await resumeStoredTurn()) return;
    await advanceTo(cursor);
  }

  async function pushPreloads() {
    const ids = PRELOAD_TEMPLATES.map(readyTemplate).filter(Boolean);
    if (ids.length) await pushClips(ids);
  }

  // --- Public API ---------------------------------------------------------------------------

  async function start({ resumed = false } = {}) {
    if (disposed) throw Object.assign(new Error("This interview session has ended."), { code: "SESSION_DISPOSED" });
    if (finalizing) throw Object.assign(new Error("This interview is finishing."), { code: "SESSION_FINALIZING" });
    if (!timer.deadline && !deadlineHit) schedule("deadline", deadlineAt - clock.now(), onDeadline);
    if (started) return state();
    started = true;
    try { await budget?.ready; } catch { /* the budget seeds itself conservatively */ }
    if (onHold) openingPending = { resumed };
    else {
      await opening(resumed);
      void Promise.all(PRELOAD_TEMPLATES.map((id) => templateAsset(id, 0))).then(pushPreloads).catch(() => {});
    }
    const snapshot = state();
    emit("state", snapshot);
    return snapshot;
  }

  // Student audio reaches ANVI only inside a Live escalation block.
  function pushAudio(pcm) {
    if (disposed || finalizing || onHold || !escalation || !Buffer.isBuffer(pcm) || !pcm.length) return;
    escalation.pushAudio(pcm);
  }

  // Proctoring hold: playback is flushed, the turnId rotates (late commits get STALE_TURN), open segments
  // and the pending decision are dropped, nudges stop. The deadline keeps running.
  function hold() {
    if (onHold || disposed || finalizing) return false;
    onHold = true;
    for (const name of ["nudge", "played", "heartbeat"]) clearTimer(name);
    decisionGen += 1;
    promptSeq += 1;
    escalation?.stop("stopped", { immediate: true });
    emit("interrupted");
    if (turn) {
      turn.turnId = newTurnId();
      turn.replaying = false;
      if (turn.parts.some((part) => !part.done) || turnState === "processing") turn.decisionPending = true;
      turn.awaitingFinal = false;
    }
    assembler.hold();
    assembler.setTurn(turn?.turnId || null);
    if (turn) save(turnPatch());
    return true;
  }

  // The hold is over: the current clips are replayed from the cache (no API call), or a finished answer whose
  // decision the hold cancelled is decided now.
  function releaseHold() {
    if (!onHold) return false;
    onHold = false;
    if (disposed || finalizing) return true;
    if (openingPending) {
      const { resumed } = openingPending;
      openingPending = false;
      void opening(resumed).then(pushPreloads).catch(() => {});
      return true;
    }
    if (!turn) return true;
    if (turn.decisionPending && turn.parts.length) {
      // Still transcribing: the last transcript runs the decision (afterPart) now the hold is over.
      if (turn.parts.every((part) => part.done)) void handleAnswer(turn);
      return true;
    }
    turn.parts = turn.parts.filter((part) => part.done && part.text);
    // A prompt the hold caught before its clips were resolved, or one that is not a question, is issued again.
    if (turnState === "preparing" || turn.kind === "intro" || turn.kind === "move_on" || turn.kind === "closing") void turn.reissue?.();
    else void reprompt(turn);
    return true;
  }

  function end(endReason = "ended_by_student") {
    if (finalizing) return finalizing;
    if (disposed) return Promise.reject(Object.assign(new Error("This interview session has ended."), { code: "SESSION_DISPOSED" }));
    return finalize({ status: questionsRemain() ? "abandoned" : "completed", endReason: endReason === "proctoring_limit" ? endReason : "ended_by_student" });
  }

  // Detaches this conductor (refresh, takeover, leaving the room). Pending transcripts still finish and
  // reach the attempt through persist.saveLateAnswer.
  function dispose() {
    if (disposed) return;
    disposed = true;
    promptSeq += 1;
    decisionGen += 1;
    for (const name of Object.keys(timer)) clearTimer(name);
    escalation?.stop("stopped", { immediate: true });
    events.removeAllListeners();
    // Committed audio is released by its transcription task; open segments go now.
    assembler.hold();
  }

  function adoptAnswer(qid, record, expectedText) {
    const item = plan.find((entry) => entry.qid === qid);
    if (!item || disposed || !record?.text) return false;
    if (String(answers[qid]?.text || "") !== String(expectedText || "")) return false;
    answers[qid] = { ...(answers[qid] || {}), ...record };
    if (turn?.qid === qid && !turn.recorded) turn.baseRecord = { ...answers[qid] };
    saveAnswer(item);
    return true;
  }

  const flushed = () => Promise.allSettled([...inflight]).then(() => undefined);

  function stats() {
    const segments = assembler.stats();
    return {
      bufferedBytes: segments.heldBytes, pendingTranscriptions: pending.size, cursor, phase, silenceDroppedBytes: 0,
      languageCorrections: 0, liveSeconds: Math.max(liveSecondsUsed, finite(budget?.liveSeconds?.())), turnState,
    };
  }

  function promptPlayed(payload = {}) {
    if (!turn || payload?.turnId !== turn.turnId) return { ok: false, code: "STALE_TURN" };
    if (turn.replaying) onReplayed(turn);
    else if (turnState === "playing") onPlayed(turn);
    return { ok: true };
  }

  function noteReplay(payload = {}) {
    if (!turn || payload?.turnId !== turn.turnId) return { ok: false, code: "STALE_TURN" };
    if (turn.replaying) onReplayed(turn);
    return { ok: true };
  }

  // Takes the mode or the `anvi:input-mode` payload `{ mode }`.
  function setInputMode(value) {
    const mode = typeof value === "string" ? value : inputModeOf(value);
    if (mode !== "vad" && mode !== "ptt") return inputMode;
    inputMode = mode;
    save({ "hybrid.inputMode": inputMode });
    emitState();
    return inputMode;
  }

  // "Done answering" with nothing said: treated like the silence timeout (nudge, then move on).
  function done(payload = {}) {
    if (!turn || (payload?.turnId && payload.turnId !== turn.turnId)) return { ok: false, code: "STALE_TURN" };
    if (turnState === "listening" && !turn.parts.length && !assembler.stats().open) onSilence();
    return { ok: true };
  }

  // Takes the ids or the `anvi:clip-have` payload `{ assetIds }`.
  function clipHave(value = []) {
    const ids = Array.isArray(value) ? value : clipHaveIds(value);
    for (const id of ids) {
      if (clientClips.size >= MAX_CLIENT_CLIPS) break;
      if (typeof id === "string") clientClips.add(id);
    }
    return { ok: true };
  }

  // The ack clips ready so far, for the join ack's `hybrid.ackAssetIds` (the client plays one after a commit).
  const ackAssetIds = () => ACK_TEMPLATE_IDS.map(readyTemplate).filter(Boolean);

  return {
    start, pushAudio, end, dispose, stats, state, adoptAnswer, flushed, hold, releaseHold,
    acceptChunk, commitSegment, cancelSegment, promptPlayed, noteReplay, setInputMode, done, clipHave, ackAssetIds,
    runtimeMode: "hybrid",
    isFinalizing: () => Boolean(finalizing),
    isOnHold: () => onHold,
    isPaused: () => false,
    on: (event, fn) => { events.on(event, fn); return () => events.off(event, fn); },
    off: (event, fn) => events.off(event, fn),
  };
}
