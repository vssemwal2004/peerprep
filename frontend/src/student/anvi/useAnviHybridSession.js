import { useCallback, useEffect, useRef, useState } from "react";
import socketService from "../../utils/socket";
import { api } from "../../utils/api";
import { createAnviAudioPlayer, PLAYBACK_RATE } from "./anviAudioPlayer";
import { createAnviSegmenter } from "./anviSegmenter";
import { createAnviSegmentOutbox } from "./anviSegmentOutbox";
import { ACK_LINES, createSpeechFallback } from "./anviSpeechFallback";
import { CLIENT_EVENTS, SERVER_EVENTS, TURN_STATES, isAssetId, isTurnId, validateClip } from "./anviHybridProtocol";
import { ANVI_CLIENT_ID, MIC_CONSTRAINTS, createAnviAudioContexts, mergeCaption, micError } from "./useAnviLiveSession";

// Hybrid (turn-based) ANVI: the server leads a cursor of prompts; the question audio is cached clips
// played locally, and only the student's own speech is cut into segments and sent, hands-free: speech
// opens the answer and a 2 s pause sends it, with nothing to press. Same room contract as
// useAnviLiveSession (status, captions, proctoring, end, retry...), plus the turn state and the controls.
// Never logs audio, clip ids, transcripts or URLs.

const FRAME_BYTES = 3200;
const SILENCE = new ArrayBuffer(FRAME_BYTES);
// Half-duplex, as in Live: frames are ignored while ANVI plays and for this long after (plus output latency).
const ECHO_TAIL_MS = 250;
const MAX_OUTPUT_LATENCY_MS = 500;
const ACK_TIMEOUT_MS = 40000;
const END_ACK_TIMEOUT_MS = 30000;
const RECOVERY_WAIT_MS = 20000;
const PROCTOR_ACK_MS = 8000;
const MAX_QUEUED_PROCTOR = 20;
// The outbox keeps a segment for 10 s without a commit reply; the socket ack waits a little longer.
const SEGMENT_ACK_MS = 12000;
// Clip parts already arriving over the socket are awaited this long before the proxy fallback.
const CLIP_WAIT_MS = 3000;
// The acknowledgement clip ("Okay.") plays only after an answer at least this long.
const ACK_CLIP_MIN_MS = 3000;
// Frames this quiet for this long while ANVI listens mean the microphone sends nothing at all.
const DEAD_MIC_RMS = 1e-4;
const DEAD_MIC_MS = 8000;
const SCREEN_EVENTS = new Set(["fullscreen_enter", "fullscreen_exit", "tab_hidden", "tab_visible", "window_blur", "window_focus", "ai_camera_blocked", "ai_camera_restored"]);
const RETRYABLE_JOIN = new Set(["JOIN_FAILED", "LIVE_UNAVAILABLE", "BUSY", "TAKEN_OVER", "JOIN_TIMEOUT", "RATE_LIMITED", "ATTEMPT_ENDING"]);
// Local phases in which the student's speech is cut into segments: after the prompt played, and while
// the server processes (speech that resumes then is another part of the same answer).
const CAPTURE_PHASES = new Set(["listening", "processing"]);
// Prompts whose text becomes the question shown on screen; the others (intro, nudge, move on, closing)
// only appear as ANVI captions.
const QUESTION_KINDS = new Set(["question", "follow_up"]);
// `anvi:turn` states the client follows; the prompt states come from `anvi:prompt` itself.
const SERVER_TURN_STATES = new Set(TURN_STATES.filter((state) => ["listening", "processing", "moving", "closing"].includes(state)));

const stopTracks = (stream) => stream?.getTracks?.().forEach((track) => { track.onended = null; track.stop(); });
const usable = (context) => context && context.state !== "closed";
const outputLatencyMs = (context) => {
  const seconds = Number(context?.outputLatency) || Number(context?.baseLatency) || 0;
  return Math.min(MAX_OUTPUT_LATENCY_MS, Math.max(0, seconds * 1000));
};
const norm = (value) => String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const assetIdsOf = (value) => (Array.isArray(value) ? value.filter(isAssetId) : []);

/**
 * Runs one hybrid ANVI interview over the shared Socket.IO connection.
 * `start({ stream, contexts })` takes the lobby's microphone and the AudioContexts created in its click.
 * `onRuntimeMode({ runtimeMode, handoff })` fires when the join ack says the attempt is not hybrid: the
 * microphone and audio contexts are handed back unclosed so the room can remount the Live call.
 */
export function useAnviHybridSession({ attemptId, onEnded, onJoinRejected, onRuntimeMode } = {}) {
  const [status, setStatus] = useState("idle");
  const [activity, setActivity] = useState("connecting");
  const [serverState, setServerState] = useState(null);
  const [captions, setCaptions] = useState([]);
  const [error, setError] = useState(null);
  const [audioPaused, setAudioPaused] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [proctorWarning, setProctorWarning] = useState(null);
  const [endReason, setEndReason] = useState(null);
  const [joinProctoring, setJoinProctoring] = useState(null);
  const [serverPaused, setServerPaused] = useState(null);
  // Hybrid state shown by the room.
  const [turnState, setTurnStateValue] = useState("preparing");
  const [promptKind, setPromptKind] = useState("");
  const [promptText, setPromptText] = useState("");
  const [recording, setRecording] = useState(false);
  const [noisyRoom, setNoisyRoom] = useState(false);
  const [micSilent, setMicSilent] = useState(false);
  const [hangoverMs, setHangoverMs] = useState(2000);
  const [socketMode, setSocketMode] = useState("turn");
  const [canReplay, setCanReplay] = useState(false);

  const aliveRef = useRef(true);
  const socketRef = useRef(null);
  const detachRef = useRef(null);
  const contextsRef = useRef(null);
  const captureRef = useRef(null);
  const pendingStreamRef = useRef(null);
  const playerRef = useRef(null);
  const segmenterRef = useRef(null);
  const outboxRef = useRef(null);
  const joinedRef = useRef(false);
  const joinedOnceRef = useRef(false);
  const joinRequestedRef = useRef(false);
  const joinInFlightRef = useRef(false);
  const joinTimedOutRef = useRef(false);
  const pendingJoinRef = useRef(false);
  const joinSeqRef = useRef(0);
  const endedRef = useRef(false);
  const endingRef = useRef(false);
  const restEndingRef = useRef(false);
  const takenOverRef = useRef(false);
  const handedBackRef = useRef(false);
  const autoRejoinUsedRef = useRef(false);
  const recoveringRef = useRef(false);
  const rejoinTimerRef = useRef(null);
  const timersRef = useRef(new Set());
  const holdUntilRef = useRef(0);
  const inputLevelRef = useRef(0);
  const deadSinceRef = useRef(0);
  const mutedLevelRef = useRef(0);
  const userMutedRef = useRef(false);
  const proctorSeqRef = useRef(0);
  const proctorQueueRef = useRef([]);
  const serverPausedRef = useRef(false);
  const localPausedRef = useRef(false);
  // Turn loop: the current prompt { turnId, kind, text, assetIds }, the local phase, and a generation
  // counter that invalidates a playback (a newer prompt, a hold) before it acknowledges anything.
  const promptRef = useRef(null);
  const turnIdRef = useRef(null);
  const phaseRef = useRef("idle");
  const playGenRef = useRef(0);
  const modeRef = useRef("turn");
  // A prompt cut off by a pause; replayed from the cache when the pause ends (unless the server held,
  // in which case its release sends the prompt again).
  const pendingReplayRef = useRef(false);
  const serverHeldDuringPauseRef = useRef(false);
  // Clip parts arriving over `anvi:clip` (assetId -> { parts, sampleRate }) and waiters for them.
  const clipPartsRef = useRef(new Map());
  const clipWaitersRef = useRef(new Map());
  const ackIdsRef = useRef([]);
  const lastAckRef = useRef("");
  // The browser voice that speaks a prompt whose cached audio is missing (never silence), its speed,
  // whether acknowledgements are on, and the last question's text (what "repeat" says without clips).
  const speechRef = useRef(null);
  const speechRateRef = useRef(1);
  const acksOnRef = useRef(true);
  const questionTextRef = useRef("");
  const answerMsRef = useRef(0);
  const callbacksRef = useRef({ onEnded, onJoinRejected, onRuntimeMode });

  useEffect(() => { callbacksRef.current = { onEnded, onJoinRejected, onRuntimeMode }; }, [onEnded, onJoinRejected, onRuntimeMode]);

  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => { timersRef.current.delete(id); fn(); }, ms);
    timersRef.current.add(id);
    return id;
  }, []);
  const cancelRejoin = useCallback(() => {
    if (rejoinTimerRef.current === null) return;
    clearTimeout(rejoinTimerRef.current);
    timersRef.current.delete(rejoinTimerRef.current);
    rejoinTimerRef.current = null;
  }, []);
  const scheduleRejoin = useCallback((fn, ms) => {
    cancelRejoin();
    rejoinTimerRef.current = later(() => { rejoinTimerRef.current = null; fn(); }, ms);
  }, [cancelRejoin, later]);

  const setPhase = useCallback((phase) => {
    phaseRef.current = phase;
    if (TURN_STATES.includes(phase)) setTurnStateValue(phase);
  }, []);
  // Held by proctoring (the server's hold or the room's own pause); gated adds the student's mute.
  const heldNow = useCallback(() => serverPausedRef.current || localPausedRef.current, []);
  const gatedNow = useCallback(() => userMutedRef.current || serverPausedRef.current || localPausedRef.current, []);
  const emit = useCallback((event, payload) => {
    const socket = socketRef.current;
    if (!socket?.connected || !joinedRef.current) return false;
    try { socket.emit(event, payload); return true; } catch { return false; }
  }, []);

  // ---- Segments ----

  const dropOpenSegment = useCallback(() => {
    segmenterRef.current?.cancel();
    setRecording(false);
  }, []);

  // Answers are hands-free only: speech opens the answer and a pause of the hangover (2 s) sends it.
  const handleSegmentEvents = useCallback((events) => {
    for (const event of events || []) {
      if (event.type === "onset") setRecording(true);
      else if (event.type === "discard") {
        setRecording(false);
        if (segmenterRef.current?.noisy()) setNoisyRoom(true);
      } else if (event.type === "segment") {
        const turnId = turnIdRef.current;
        if (!turnId) continue;
        answerMsRef.current += event.durationMs || 0;
        outboxRef.current?.send({ turnId, part: event.part, final: event.final, pcm: event.pcm, durationMs: event.durationMs });
        if (event.final) {
          setRecording(false);
          setPhase("processing");
        }
      } else if (event.type === "end") {
        // A max-length split whose continuation held no speech: the previous part closed the answer.
        setRecording(false);
        emit(CLIENT_EVENTS.DONE, { turnId: turnIdRef.current });
        setPhase("processing");
      }
    }
  }, [emit, setPhase]);

  // The cached acknowledgement ("Okay.") after a committed answer of 3 s or more: rotated, never the
  // same twice in a row, never fetched, and only while nothing newer has started.
  const playAckClip = useCallback(() => {
    const player = playerRef.current;
    if (!player || phaseRef.current !== "processing" || gatedNow() || player.isSpeaking() || speechRef.current?.speaking()) return;
    const cached = ackIdsRef.current.filter((id) => player.hasClip(id));
    const choices = cached.length > 1 ? cached.filter((id) => id !== lastAckRef.current) : cached;
    if (!choices.length) {
      // No ack clip ready (TTS down): the browser voice says it, so the answer never meets silence.
      if (!acksOnRef.current || !speechRef.current?.available) return;
      const lines = ACK_LINES.filter((line) => line !== lastAckRef.current);
      const line = lines[Math.floor(Math.random() * lines.length)];
      lastAckRef.current = line;
      void speechRef.current.speak(line, { rate: speechRateRef.current });
      return;
    }
    const id = choices[Math.floor(Math.random() * choices.length)];
    lastAckRef.current = id;
    void player.playClip(id);
  }, [gatedNow]);

  // ---- Clips ----

  const resolveClipWaiters = useCallback((assetId, ok) => {
    const waiters = clipWaitersRef.current.get(assetId);
    clipWaitersRef.current.delete(assetId);
    waiters?.forEach((resolve) => resolve(ok));
  }, []);

  // One clip ready in the player: cached, arriving over the socket (awaited briefly), else the proxy.
  const ensureClip = useCallback(async (assetId) => {
    const player = playerRef.current;
    if (!player) return false;
    if (player.hasClip(assetId)) return true;
    if (clipPartsRef.current.has(assetId)) {
      const arrived = await new Promise((resolve) => {
        const waiters = clipWaitersRef.current.get(assetId) || new Set();
        waiters.add(resolve);
        clipWaitersRef.current.set(assetId, waiters);
        later(() => { waiters.delete(resolve); resolve(false); }, CLIP_WAIT_MS);
      });
      if (arrived && playerRef.current?.hasClip(assetId)) return true;
    }
    try {
      const clip = await api.getAnviAudio(attemptId, assetId);
      const current = playerRef.current;
      if (!current || !clip?.pcm) return false;
      return Boolean(current.loadClipPcm(assetId, [clip.pcm], clip.sampleRate || PLAYBACK_RATE));
    } catch {
      return false;
    }
  }, [attemptId, later]);

  const refreshCanReplay = useCallback(() => {
    const ids = promptRef.current?.assetIds || [];
    const cached = ids.length > 0 && ids.every((id) => playerRef.current?.hasClip(id));
    setCanReplay(cached || Boolean(speechRef.current?.available && (questionTextRef.current || promptRef.current?.text)));
  }, []);

  // ---- Turn loop ----

  const startListening = useCallback(() => {
    setPhase("listening");
  }, [setPhase]);

  const ackPlayed = useCallback((turnId, ok) => {
    emit(CLIENT_EVENTS.PROMPT_PLAYED, { turnId, ok });
  }, [emit]);

  // Speaks `text` with the browser voice (cached audio missing), then `then()` unless something newer
  // (a prompt, a hold, the end) cancelled it. The microphone is held while it speaks, as for a clip.
  const speakLine = useCallback((text, gen, then) => {
    const speech = speechRef.current;
    if (!speech?.available || !String(text || "").trim()) return false;
    setPhase("playing");
    holdUntilRef.current = Infinity;
    void speech.speak(text, { rate: speechRateRef.current }).then(() => {
      holdUntilRef.current = performance.now() + ECHO_TAIL_MS;
      if (gen !== playGenRef.current || endedRef.current || !aliveRef.current) return;
      then();
    });
    return true;
  }, [setPhase]);

  // Text fallback (no audio, R2 or TTS down): the text is on screen and the browser voice says it;
  // listening starts when it finishes (at once when the browser has no voice).
  const textFallback = useCallback((turnId, gen = playGenRef.current) => {
    const done = () => { ackPlayed(promptRef.current?.turnId || turnId, false); startListening(); };
    if (heldNow() || !speakLine(promptRef.current?.text, gen, done)) done();
  }, [ackPlayed, heldNow, speakLine, startListening]);

  const playPrompt = useCallback(async () => {
    const prompt = promptRef.current;
    if (!prompt || endedRef.current) return;
    const gen = ++playGenRef.current;
    speechRef.current?.cancel();
    pendingReplayRef.current = false;
    if (heldNow()) { pendingReplayRef.current = true; return; }
    if (!prompt.assetIds.length) { textFallback(prompt.turnId, gen); return; }
    const results = await Promise.all(prompt.assetIds.map((id) => ensureClip(id)));
    if (gen !== playGenRef.current || endedRef.current || !aliveRef.current) return;
    refreshCanReplay();
    if (!results.every(Boolean)) { textFallback(promptRef.current?.turnId || prompt.turnId, gen); return; }
    if (heldNow()) { pendingReplayRef.current = true; return; }
    setPhase("playing");
    const result = await playerRef.current.playSequence(prompt.assetIds);
    if (gen !== playGenRef.current || endedRef.current || !aliveRef.current) return;
    const turnId = promptRef.current?.turnId || prompt.turnId;
    if (result === "ended") { ackPlayed(turnId, true); startListening(); return; }
    if (result === "missing") { textFallback(turnId); return; }
    // Interrupted (a pause, a hold): the prompt plays again when the interview resumes.
    pendingReplayRef.current = true;
  }, [ackPlayed, ensureClip, heldNow, refreshCanReplay, setPhase, startListening, textFallback]);

  // A new server turnId (a prompt, or a hold that rotated it): older segments are dropped, parts restart.
  const enterTurn = useCallback((turnId) => {
    if (turnId === turnIdRef.current) return false;
    turnIdRef.current = turnId;
    if (promptRef.current) promptRef.current = { ...promptRef.current, turnId };
    outboxRef.current?.setTurn(turnId);
    segmenterRef.current?.reset();
    setRecording(false);
    answerMsRef.current = 0;
    return true;
  }, []);

  const onPrompt = useCallback((payload) => {
    if (!payload || !isTurnId(payload.turnId) || endedRef.current || modeRef.current !== "turn") return;
    const prompt = { turnId: payload.turnId, kind: String(payload.kind || "question"), text: String(payload.text || ""), assetIds: assetIdsOf(payload.assetIds) };
    // A re-prompt of the same turn (after a rejoin or a hold) keeps the parts already sent.
    if (!enterTurn(prompt.turnId)) dropOpenSegment();
    promptRef.current = prompt;
    serverHeldDuringPauseRef.current = false;
    setPromptKind(prompt.kind);
    if (QUESTION_KINDS.has(prompt.kind) && prompt.text) {
      questionTextRef.current = prompt.text;
      setPromptText(prompt.text);
      setServerState((state) => ({
        ...(state || {}), questionText: prompt.text, followUp: prompt.kind === "follow_up",
        ...(Number.isFinite(payload.questionNumber) ? { questionNumber: payload.questionNumber } : {}),
        ...(Number.isFinite(payload.totalQuestions) ? { totalQuestions: payload.totalQuestions } : {}),
      }));
    }
    if (prompt.text) {
      setCaptions((list) => {
        const last = list.findLast((line) => line.role === "anvi");
        if (last?.final && last.promptTurn === prompt.turnId && norm(last.text) === norm(prompt.text)) return list;
        const next = mergeCaption(list, { role: "anvi", text: prompt.text, final: true });
        return next.map((line, i) => (i === next.length - 1 && line.role === "anvi" ? { ...line, promptTurn: prompt.turnId } : line));
      });
    }
    setPhase(prompt.kind === "follow_up" ? "follow_up" : "preparing");
    refreshCanReplay();
    void playPrompt();
  }, [dropOpenSegment, enterTurn, playPrompt, refreshCanReplay, setPhase]);

  // Plays the current prompt's clips again from the cache: no fetch, no model call.
  const replayClips = useCallback((assetIds, turnId) => {
    const player = playerRef.current;
    if (!player) return false;
    if (!assetIds.length || !assetIds.every((id) => player.hasClip(id))) {
      // No clips: the browser voice says the question again.
      const gen = ++playGenRef.current;
      const spoken = speakLine(questionTextRef.current || promptRef.current?.text, gen, () => {
        emit(CLIENT_EVENTS.REPLAYED, { turnId: promptRef.current?.turnId || turnId });
        startListening();
      });
      if (spoken) { dropOpenSegment(); pendingReplayRef.current = false; }
      return spoken;
    }
    dropOpenSegment();
    const gen = ++playGenRef.current;
    speechRef.current?.cancel();
    pendingReplayRef.current = false;
    setPhase("playing");
    void player.playSequence(assetIds).then((result) => {
      if (gen !== playGenRef.current || endedRef.current || !aliveRef.current) return;
      if (result === "interrupted") { pendingReplayRef.current = true; return; }
      emit(CLIENT_EVENTS.REPLAYED, { turnId: promptRef.current?.turnId || turnId });
      startListening();
    });
    return true;
  }, [dropOpenSegment, emit, setPhase, speakLine, startListening]);

  /** Repeat question: replays the cached question audio and tells the server with `anvi:replayed` only. */
  const replay = useCallback(() => {
    const prompt = promptRef.current;
    if (!prompt || status !== "live" || modeRef.current !== "turn" || heldNow()) return false;
    return replayClips(prompt.assetIds, prompt.turnId);
  }, [heldNow, replayClips, status]);

  // Mute or pause: the open segment is dropped, and a pause also stops the prompt playing. When the
  // pause ends, a prompt it cut off plays again from the cache (a server hold re-prompts by itself).
  const applyGate = useCallback(() => {
    if (gatedNow()) {
      dropOpenSegment();
      if (heldNow() && (playerRef.current?.isSpeaking() || speechRef.current?.speaking())) {
        playGenRef.current += 1;
        pendingReplayRef.current = true;
        playerRef.current?.flush();
        speechRef.current?.cancel();
      }
      return;
    }
    if (pendingReplayRef.current && !serverHeldDuringPauseRef.current && joinedRef.current && promptRef.current && modeRef.current === "turn") {
      pendingReplayRef.current = false;
      void playPrompt();
    }
  }, [dropOpenSegment, gatedNow, heldNow, playPrompt]);

  // ---- Lifecycle ----

  const stopCapture = useCallback(({ keepStream = false } = {}) => {
    const capture = captureRef.current;
    captureRef.current = null;
    if (!capture) return null;
    if (capture.node) {
      capture.node.port.onmessage = null;
      try { capture.node.port.postMessage("stop"); capture.node.port.close(); } catch { /* Port already closed. */ }
      try { capture.node.disconnect(); } catch { /* Not connected. */ }
    }
    try { capture.source?.disconnect(); } catch { /* Not connected. */ }
    if (keepStream) { capture.stream?.getTracks?.().forEach((track) => { track.onended = null; }); return capture.stream; }
    stopTracks(capture.stream);
    return null;
  }, []);

  const teardown = useCallback(() => {
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current.clear();
    rejoinTimerRef.current = null;
    const queued = proctorQueueRef.current;
    proctorQueueRef.current = [];
    queued.forEach((item) => item.resolve(null));
    detachRef.current?.();
    detachRef.current = null;
    playGenRef.current += 1;
    speechRef.current?.cancel();
    speechRef.current = null;
    for (const id of [...clipWaitersRef.current.keys()]) resolveClipWaiters(id, false);
    clipPartsRef.current.clear();
    outboxRef.current?.clear();
    outboxRef.current = null;
    segmenterRef.current?.cancel();
    segmenterRef.current = null;
    stopCapture();
    stopTracks(pendingStreamRef.current);
    pendingStreamRef.current = null;
    void playerRef.current?.close();
    playerRef.current = null;
    const contexts = contextsRef.current;
    contextsRef.current = null;
    if (contexts) {
      contexts.capture.onstatechange = null;
      contexts.playback.onstatechange = null;
      if (contexts.capture.state !== "closed") void contexts.capture.close().catch(() => {});
    }
    joinedRef.current = false;
  }, [resolveClipWaiters, stopCapture]);

  const leave = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !joinRequestedRef.current || endedRef.current) return;
    try { socket.emit("anvi:leave", { attemptId }); } catch { /* Socket already gone. */ }
  }, [attemptId]);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; leave(); teardown(); };
  }, [leave, teardown]);

  // The join ack says this attempt runs Live: stop here and give the microphone and audio back unclosed.
  const handBack = useCallback((runtimeMode) => {
    handedBackRef.current = true;
    endedRef.current = true;
    joinedRef.current = false;
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current.clear();
    detachRef.current?.();
    detachRef.current = null;
    outboxRef.current?.clear();
    segmenterRef.current?.cancel();
    const stream = stopCapture({ keepStream: true }) || pendingStreamRef.current;
    pendingStreamRef.current = null;
    playerRef.current?.flush();
    playerRef.current = null;
    const contexts = contextsRef.current;
    contextsRef.current = null;
    if (contexts) { contexts.capture.onstatechange = null; contexts.playback.onstatechange = null; }
    callbacksRef.current.onRuntimeMode?.({ runtimeMode, handoff: { stream, contexts: contexts ? { capture: contexts.capture, playback: contexts.playback } : null } });
  }, [stopCapture]);

  const clearServerPause = useCallback(() => {
    serverPausedRef.current = false;
    setServerPaused(null);
  }, []);

  const emitProctor = useCallback((socket, event, resolve) => {
    try {
      socket.timeout(PROCTOR_ACK_MS).emit("anvi:proctor", event, (err, res) => {
        if (!err && res?.ok === true && !endedRef.current && aliveRef.current) {
          if (res.paused === true && !serverPausedRef.current) { serverPausedRef.current = true; serverHeldDuringPauseRef.current = true; setServerPaused({ reason: "" }); applyGate(); }
          else if (res.paused !== true && serverPausedRef.current) { clearServerPause(); applyGate(); }
        }
        resolve(err || !res ? null : res);
      });
    } catch { resolve(null); }
  }, [applyGate, clearServerPause]);

  const markJoined = useCallback((state, { fresh = true, newHolder = false } = {}) => {
    joinedRef.current = true;
    joinedOnceRef.current = true;
    takenOverRef.current = false;
    joinTimedOutRef.current = false;
    recoveringRef.current = false;
    if (fresh) clearServerPause();
    setStatus("live");
    setError(null);
    if (state) setServerState((previous) => ({ ...(previous || {}), ...state }));
    if (contextsRef.current?.capture?.state === "suspended") void contextsRef.current.capture.resume();
    const socket = socketRef.current;
    const queued = proctorQueueRef.current;
    proctorQueueRef.current = [];
    queued.forEach(({ event, resolve }) => (socket?.connected ? emitProctor(socket, event, resolve) : resolve(null)));
    // Clips this tab already holds (a reconnect keeps the player), so the server does not push them again.
    const have = playerRef.current?.clipIds() || [];
    if (have.length) emit(CLIENT_EVENTS.CLIP_HAVE, { assetIds: have.slice(-64) });
    // Segments of the current turn that were never committed go again, with the same segmentIds. After a
    // join the server's segment assembler is new and empty, so every chunk goes again from index 0.
    outboxRef.current?.resend({ full: newHolder });
  }, [clearServerPause, emit, emitProctor]);

  const finish = useCallback((payload = {}) => {
    if (endedRef.current) return;
    endedRef.current = true;
    joinedRef.current = false;
    cancelRejoin();
    setEndReason(payload?.endReason || null);
    setStatus("ended");
    setAudioPaused(false);
    setRecording(false);
    stopCapture();
    const startedAt = Date.now();
    const handOver = () => {
      if (!aliveRef.current) return;
      if ((playerRef.current?.isSpeaking() || speechRef.current?.speaking()) && Date.now() - startedAt < 12000) { later(handOver, 200); return; }
      teardown();
      callbacksRef.current.onEnded?.(payload);
    };
    handOver();
  }, [cancelRejoin, later, stopCapture, teardown]);

  const endViaRest = useCallback(async () => {
    if (restEndingRef.current || endedRef.current) return;
    restEndingRef.current = true;
    try {
      const result = await api.endStudentAIAttempt(attemptId);
      finish({ status: result?.status || "abandoned", endReason: "ended_by_student" });
    } catch (cause) {
      if (!aliveRef.current) return;
      setStatus("error");
      setError({ code: "END_FAILED", message: cause?.message || "The interview could not be ended. Try again.", retryable: true, action: "end" });
    } finally {
      restEndingRef.current = false;
    }
  }, [attemptId, finish]);

  const join = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !aliveRef.current || endedRef.current || endingRef.current) return;
    if (joinInFlightRef.current) return;
    cancelRejoin();
    joinedRef.current = false;
    recoveringRef.current = false;
    joinTimedOutRef.current = false;
    if (!socket.connected) { pendingJoinRef.current = true; setStatus(joinedOnceRef.current ? "reconnecting" : "connecting"); return; }
    pendingJoinRef.current = false;
    setStatus(joinedOnceRef.current ? "reconnecting" : "connecting");
    const seq = ++joinSeqRef.current;
    joinInFlightRef.current = true;
    joinRequestedRef.current = true;
    socket.timeout(ACK_TIMEOUT_MS).emit("anvi:join", { attemptId, clientId: ANVI_CLIENT_ID }, (err, res) => {
      if (seq !== joinSeqRef.current) return;
      joinInFlightRef.current = false;
      if (!aliveRef.current || endedRef.current || endingRef.current) return;
      if (err) {
        joinTimedOutRef.current = true;
        setStatus("error");
        setError({ code: "JOIN_TIMEOUT", message: "ANVI did not respond. Check your connection and try again.", retryable: true });
        return;
      }
      if (!res?.ok) {
        const code = res?.code || "JOIN_FAILED";
        if (code === "BUSY") { joinTimedOutRef.current = true; return; }
        if (code === "ATTEMPT_EXPIRED") {
          endingRef.current = true;
          setStatus("ending");
          void endViaRest();
          return;
        }
        setStatus("error");
        setError({ code, message: res?.message || "The interview could not be opened.", retryable: RETRYABLE_JOIN.has(code) });
        callbacksRef.current.onJoinRejected?.(res || {});
        return;
      }
      // The ack's runtimeMode is authoritative: a Live attempt is handed back to the Live call.
      if (typeof res.runtimeMode === "string" && res.runtimeMode !== "hybrid" && typeof callbacksRef.current.onRuntimeMode === "function") {
        handBack(res.runtimeMode);
        return;
      }
      const config = res.hybrid && typeof res.hybrid === "object" ? res.hybrid : {};
      if (config.vad && typeof config.vad === "object") {
        segmenterRef.current?.configure(config.vad);
        if (Number.isFinite(config.vad.hangoverMs) && config.vad.hangoverMs > 0) setHangoverMs(config.vad.hangoverMs);
      }
      ackIdsRef.current = assetIdsOf(config.ackAssetIds);
      // ANVI's speaking speed: every clip is time-stretched to it once (before the first clip arrives).
      playerRef.current?.setSpeechRate?.(config.speechRate);
      speechRateRef.current = Number(config.speechRate) > 0 ? Number(config.speechRate) : 1;
      acksOnRef.current = config.acknowledgements !== false;
      if (res.proctoring && typeof res.proctoring === "object") setJoinProctoring(res.proctoring);
      markJoined(res.state, { newHolder: true });
      // An attempt that an older room switched to push-to-talk goes back to hands-free.
      if (config.inputMode === "ptt") emit(CLIENT_EVENTS.INPUT_MODE, { mode: "vad" });
      if (res.paused === true) { serverPausedRef.current = true; serverHeldDuringPauseRef.current = true; setServerPaused({ reason: typeof res.reason === "string" ? res.reason : "" }); applyGate(); }
    });
  }, [applyGate, attemptId, cancelRejoin, emit, endViaRest, handBack, markJoined]);

  const onFrame = useCallback((event) => {
    const { pcm, rms } = event.data || {};
    if (!(pcm instanceof ArrayBuffer)) return;
    const now = performance.now();
    if (playerRef.current?.isSpeaking() || speechRef.current?.speaking()) holdUntilRef.current = now + ECHO_TAIL_MS;
    const echoHold = now < holdUntilRef.current;
    const isPaused = serverPausedRef.current || localPausedRef.current;
    const silent = echoHold || userMutedRef.current || isPaused;
    inputLevelRef.current = silent ? 0 : rms;
    mutedLevelRef.current = userMutedRef.current && !echoHold && !isPaused ? rms : 0;
    if (modeRef.current === "live") {
      // A Live block streams continuously, as the Live call does.
      const socket = socketRef.current;
      if (!joinedRef.current || !socket?.connected) return;
      socket.emit("anvi:audio", silent || pcm.byteLength !== FRAME_BYTES ? SILENCE : pcm);
      return;
    }
    // Turn mode cuts segments locally, also while reconnecting: the outbox sends them after the rejoin.
    if (silent || endedRef.current || !CAPTURE_PHASES.has(phaseRef.current)) return;
    // A muted microphone (mute key, input volume 0) sends pure silence: say so instead of waiting forever.
    if (rms < DEAD_MIC_RMS) {
      if (!deadSinceRef.current) deadSinceRef.current = now;
      else if (now - deadSinceRef.current >= DEAD_MIC_MS) setMicSilent(true);
    } else if (deadSinceRef.current) { deadSinceRef.current = 0; setMicSilent(false); }
    const segmenter = segmenterRef.current;
    if (segmenter) handleSegmentEvents(segmenter.push({ pcm, rms }));
  }, [handleSegmentEvents]);

  const startCapture = useCallback(async (stream) => {
    let micStream = stream?.active ? stream : null;
    try {
      const context = contextsRef.current?.capture;
      if (!context) throw Object.assign(new Error("Audio is not ready."), { code: "AUDIO_UNAVAILABLE" });
      if (!contextsRef.current.workletReady) {
        await context.audioWorklet.addModule(new URL("./anviPcmCapture.worklet.js", import.meta.url));
        if (contextsRef.current) contextsRef.current.workletReady = true;
      }
      if (!micStream) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
        } catch (cause) {
          throw Object.assign(new Error(micError(cause)), { code: "MIC_UNAVAILABLE" });
        }
      }
      if (!aliveRef.current || !contextsRef.current) { stopTracks(micStream); return false; }
      const source = context.createMediaStreamSource(micStream);
      const node = new AudioWorkletNode(context, "anvi-pcm-capture", {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: "explicit",
      });
      node.port.onmessage = onFrame;
      source.connect(node);
      node.connect(context.destination);
      captureRef.current = { stream: micStream, source, node };
      micStream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (!aliveRef.current || endedRef.current) return;
          stopCapture();
          dropOpenSegment();
          setError({ code: "MIC_UNAVAILABLE", message: "The microphone was disconnected. Reconnect it, then press Try again.", retryable: true });
        };
      });
      return true;
    } catch (failure) {
      if (micStream && captureRef.current?.stream !== micStream) stopTracks(micStream);
      throw failure;
    } finally {
      if (pendingStreamRef.current && pendingStreamRef.current === micStream) pendingStreamRef.current = null;
    }
  }, [dropOpenSegment, onFrame, stopCapture]);

  const attach = useCallback(() => {
    const socket = socketService.connect();
    socketRef.current = socket;
    const handlers = [
      ["connect", () => { if (pendingJoinRef.current && !takenOverRef.current && !endingRef.current) join(); }],
      ["disconnect", () => {
        if (endedRef.current) return;
        joinedRef.current = false;
        recoveringRef.current = false;
        joinTimedOutRef.current = false;
        joinInFlightRef.current = false;
        joinSeqRef.current += 1;
        clearServerPause();
        if (endingRef.current) { void endViaRest(); return; }
        if (!takenOverRef.current) { pendingJoinRef.current = true; setStatus("reconnecting"); }
      }],
      ["anvi:state", (state) => {
        if (!state || typeof state !== "object") return;
        setServerState((previous) => ({
          ...(previous || {}), ...state,
          // The prompt's text is the question on screen; a state without one keeps it.
          questionText: state.questionText || previous?.questionText || "",
        }));
        if ((recoveringRef.current || joinTimedOutRef.current) && socket.connected && !takenOverRef.current && !endingRef.current && !endedRef.current) markJoined(null, { fresh: !recoveringRef.current });
      }],
      ["anvi:caption", (caption) => {
        if (!caption?.role) return;
        // The prompt already added ANVI's line; the same text again is not a second line.
        setCaptions((list) => {
          if (caption.role === "anvi") {
            const last = list.findLast((line) => line.role === "anvi");
            if (last?.final && norm(last.text) === norm(caption.text)) return list;
          }
          return mergeCaption(list, caption);
        });
      }],
      [SERVER_EVENTS.PROMPT, onPrompt],
      [SERVER_EVENTS.CLIP, (payload) => {
        if (endedRef.current || !validateClip(payload).ok) return;
        const parts = clipPartsRef.current;
        const entry = payload.part === 0 || !parts.has(payload.assetId) ? { parts: [], sampleRate: payload.sampleRate } : parts.get(payload.assetId);
        entry.parts[payload.part] = payload.pcm;
        parts.set(payload.assetId, entry);
        if (!payload.final) return;
        parts.delete(payload.assetId);
        const loaded = playerRef.current?.loadClipPcm(payload.assetId, entry.parts.filter(Boolean), entry.sampleRate);
        resolveClipWaiters(payload.assetId, Boolean(loaded));
        refreshCanReplay();
      }],
      // A spoken "repeat" (or a released hold, which may rotate the turnId): the cached clips again.
      [SERVER_EVENTS.REPLAY, (payload) => {
        if (endedRef.current || modeRef.current !== "turn" || !payload || !isTurnId(payload.turnId) || heldNow()) return;
        enterTurn(payload.turnId);
        serverHeldDuringPauseRef.current = false;
        const ids = isAssetId(payload.assetId) ? [payload.assetId] : promptRef.current?.assetIds || [];
        // Nothing cached to replay: the question stays on screen and listening goes on.
        if (!replayClips(ids, payload.turnId)) { emit(CLIENT_EVENTS.REPLAYED, { turnId: payload.turnId }); startListening(); }
      }],
      // The server's cursor. The prompt states (preparing, playing, follow_up) come from anvi:prompt.
      [SERVER_EVENTS.TURN, (payload) => {
        if (endedRef.current || !payload || typeof payload !== "object") return;
        if (isTurnId(payload.turnId)) enterTurn(payload.turnId);
        // The server saw answers come out empty: the room asks for a quieter place, nothing to press.
        if (payload.suggestPtt === true) setNoisyRoom(true);
        const state = payload.state ?? payload.turnState;
        if (!SERVER_TURN_STATES.has(state) || modeRef.current !== "turn") return;
        // The server stopped waiting for the prompt's ack (its timeout) while it still plays here.
        if (state === "listening" && phaseRef.current === "playing") return;
        setPhase(state);
        if (state === "closing" || state === "moving") dropOpenSegment();
      }],
      [SERVER_EVENTS.MODE, (payload) => {
        if (endedRef.current) return;
        const mode = payload?.mode;
        if (mode !== "live" && mode !== "turn") return;
        // Switched without a word to the student, either way.
        modeRef.current = mode;
        setSocketMode(mode);
        if (mode === "live") { dropOpenSegment(); playGenRef.current += 1; setPhase("live"); }
        else { playerRef.current?.flush(); setPhase("processing"); }
      }],
      // ANVI's voice in a Live block only.
      ["anvi:audio", (chunk) => {
        if (endedRef.current || takenOverRef.current || modeRef.current !== "live" || !(joinedRef.current || recoveringRef.current)) return;
        playerRef.current?.enqueue(chunk);
      }],
      ["anvi:interrupted", () => {
        playerRef.current?.flush();
        speechRef.current?.cancel();
        if (modeRef.current === "live") return;
        // A hold: the open segment and the playback stop; the release prompts again.
        playGenRef.current += 1;
        pendingReplayRef.current = true;
        dropOpenSegment();
      }],
      ["anvi:error", (payload = {}) => {
        if (endedRef.current) return;
        const code = payload.code || "ANVI_ERROR";
        if (code === "FINALIZE_FAILED") {
          setStatus("error");
          setError({ code, message: payload.message || "Your answers could not be saved yet. Please try ending again.", retryable: true, action: "end" });
          return;
        }
        if (endingRef.current) return;
        setError({ code, message: payload.message || "Something went wrong with the interview.", retryable: payload.retryable !== false });
        const rejoinOnce = () => { if (!autoRejoinUsedRef.current) { autoRejoinUsedRef.current = true; scheduleRejoin(join, 2000); } };
        if (code === "LIVE_DISCONNECTED") {
          joinedRef.current = false;
          playerRef.current?.flush();
          setStatus("reconnecting");
          if (!payload.reconnecting) { rejoinOnce(); return; }
          recoveringRef.current = true;
          scheduleRejoin(() => { if (recoveringRef.current) { recoveringRef.current = false; join(); } }, RECOVERY_WAIT_MS);
        } else if (recoveringRef.current) {
          recoveringRef.current = false;
          rejoinOnce();
        } else if (payload.retryable === false) {
          joinedRef.current = false;
          setStatus("error");
        }
      }],
      ["anvi:taken_over", () => {
        takenOverRef.current = true;
        joinedRef.current = false;
        pendingJoinRef.current = false;
        cancelRejoin();
        playGenRef.current += 1;
        playerRef.current?.flush();
        speechRef.current?.cancel();
        dropOpenSegment();
        setStatus("taken_over");
        clearServerPause();
        stopCapture();
        const contexts = contextsRef.current;
        if (contexts?.capture?.state === "running") void contexts.capture.suspend();
        if (contexts?.playback?.state === "running") void contexts.playback.suspend();
      }],
      ["anvi:ended", (payload) => finish(payload || {})],
      ["anvi:paused", (payload) => {
        if (endedRef.current) return;
        serverPausedRef.current = true;
        serverHeldDuringPauseRef.current = true;
        setServerPaused({ reason: payload?.reason || "" });
        applyGate();
      }],
      ["anvi:resumed", () => {
        serverPausedRef.current = false;
        setServerPaused(null);
        applyGate();
      }],
      ["anvi:proctor-warning", (payload) => {
        if (!payload || typeof payload !== "object" || endedRef.current) return;
        proctorSeqRef.current += 1;
        setProctorWarning({ ...payload, seq: proctorSeqRef.current });
      }],
    ];
    handlers.forEach(([event, handler]) => socket.on(event, handler));
    detachRef.current = () => handlers.forEach(([event, handler]) => socket.off(event, handler));
  }, [applyGate, cancelRejoin, clearServerPause, dropOpenSegment, emit, endViaRest, enterTurn, finish, heldNow, join, markJoined, onPrompt, refreshCanReplay, replayClips, resolveClipWaiters, scheduleRejoin, setPhase, startListening, stopCapture]);

  const watchAudio = useCallback(() => {
    const check = () => {
      const contexts = contextsRef.current;
      if (!contexts || !aliveRef.current || endedRef.current || takenOverRef.current) return;
      const stalled = [contexts.capture, contexts.playback].filter((context) => usable(context) && context.state !== "running");
      stalled.forEach((context) => { void context.resume?.().catch(() => {}); });
      setAudioPaused(stalled.length > 0);
    };
    const contexts = contextsRef.current;
    contexts.capture.onstatechange = check;
    contexts.playback.onstatechange = check;
  }, []);

  const start = useCallback(({ stream, contexts } = {}) => {
    if (contextsRef.current || endedRef.current) return;
    pendingStreamRef.current = stream?.active ? stream : null;
    const handed = contexts && usable(contexts.capture) && usable(contexts.playback) ? contexts : null;
    const { capture, playback } = handed || createAnviAudioContexts();
    if (handed) { void capture.resume?.()?.catch?.(() => {}); void playback.resume?.()?.catch?.(() => {}); }
    contextsRef.current = { capture, playback, workletReady: false };
    watchAudio();
    playerRef.current = createAnviAudioPlayer({
      context: playback,
      onSpeakingChange: (speaking) => {
        holdUntilRef.current = speaking ? Infinity : performance.now() + ECHO_TAIL_MS + outputLatencyMs(playback);
        if (speaking) autoRejoinUsedRef.current = false;
      },
    });
    segmenterRef.current = createAnviSegmenter({ inputMode: "vad" });
    speechRef.current = createSpeechFallback();
    outboxRef.current = createAnviSegmentOutbox({
      emit: (event, payload, ack) => {
        const socket = socketRef.current;
        if (!socket) return;
        if (typeof ack === "function") socket.timeout(SEGMENT_ACK_MS).emit(event, payload, (err, res) => ack(err ? null : res));
        else socket.emit(event, payload);
      },
      connected: () => Boolean(joinedRef.current && socketRef.current?.connected),
      onCommitted: ({ final, duplicate, turnId }) => {
        if (!final || duplicate || turnId !== turnIdRef.current || answerMsRef.current < ACK_CLIP_MIN_MS) return;
        playAckClip();
      },
    });
    setStatus("connecting");
    setError(null);
    attach();
    startCapture(stream).then((ok) => { if (ok) join(); }).catch((cause) => {
      if (!aliveRef.current) return;
      setStatus("error");
      setError({ code: cause.code || "AUDIO_UNAVAILABLE", message: cause.code ? cause.message : "Audio could not start in this browser. Reload the page and try again.", retryable: true });
    });
  }, [attach, join, playAckClip, startCapture, watchAudio]);

  const resumeAudio = useCallback(() => {
    const contexts = contextsRef.current;
    if (!contexts) return;
    void Promise.all([contexts.capture, contexts.playback].filter(usable).map((context) => context.resume?.()))
      .then(() => { if (aliveRef.current) setAudioPaused([contexts.capture, contexts.playback].some((context) => usable(context) && context.state !== "running")); })
      .catch(() => {});
  }, []);

  const end = useCallback(async () => {
    if (endedRef.current) return;
    endingRef.current = true;
    cancelRejoin();
    setStatus("ending");
    setError(null);
    playGenRef.current += 1;
    playerRef.current?.flush();
    speechRef.current?.cancel();
    dropOpenSegment();
    joinedRef.current = false;
    const socket = socketRef.current;
    if (!socket?.connected) { await endViaRest(); return; }
    socket.timeout(END_ACK_TIMEOUT_MS).emit("anvi:end", { reason: "ended_by_student" }, (err, res) => {
      if (!aliveRef.current || endedRef.current) return;
      if (err || !res?.ok) { void endViaRest(); return; }
      finish({ status: res.status, endReason: res.endReason || "ended_by_student" });
    });
  }, [cancelRejoin, dropOpenSegment, endViaRest, finish]);

  const retry = useCallback(() => {
    if (endedRef.current || !contextsRef.current) return;
    if (endingRef.current) { void end(); return; }
    setError(null);
    cancelRejoin();
    void contextsRef.current.capture.resume?.();
    void playerRef.current?.resume();
    takenOverRef.current = false;
    if (!captureRef.current) {
      setStatus("connecting");
      startCapture().then((ok) => { if (ok && !joinedRef.current) join(); }).catch((cause) => {
        if (!aliveRef.current) return;
        setStatus("error");
        setError({ code: cause.code || "AUDIO_UNAVAILABLE", message: cause.message, retryable: true });
      });
      return;
    }
    join();
  }, [cancelRejoin, end, join, startCapture]);

  useEffect(() => {
    const onHide = () => leave();
    const onShow = (event) => {
      if (!event.persisted || endedRef.current || endingRef.current || !joinRequestedRef.current) return;
      joinedRef.current = false;
      join();
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => { window.removeEventListener("pagehide", onHide); window.removeEventListener("pageshow", onShow); };
  }, [join, leave]);

  // The orb: speaking while a clip or a Live block plays, listening while the answer is open, else thinking.
  useEffect(() => {
    if (status !== "live") { setActivity(status === "ended" ? "idle" : "connecting"); return undefined; }
    const tick = () => {
      let next = "thinking";
      if (playerRef.current?.isSpeaking() || speechRef.current?.speaking()) next = "speaking";
      else if (modeRef.current === "live" || phaseRef.current === "listening" || (phaseRef.current === "processing" && segmenterRef.current?.speaking())) next = "listening";
      setActivity((current) => (current === next ? current : next));
    };
    tick();
    const id = setInterval(tick, 150);
    return () => clearInterval(id);
  }, [status]);

  const sendProctor = useCallback((type, at = Date.now(), detail = null) => new Promise((resolve) => {
    const socket = socketRef.current;
    if (!socket || endedRef.current || endingRef.current || takenOverRef.current) { resolve(null); return; }
    const event = { attemptId, type, at: new Date(at).toISOString() };
    if (detail?.severity) event.severity = String(detail.severity);
    if (Number.isFinite(Number(detail?.confidence)) && detail?.confidence !== null) event.confidence = Number(detail.confidence);
    if (detail?.resync === true) event.resync = true;
    if (joinedRef.current && socket.connected) { emitProctor(socket, event, resolve); return; }
    const queue = proctorQueueRef.current;
    queue.push({ event, resolve });
    if (queue.length > MAX_QUEUED_PROCTOR) {
      const drop = queue.findIndex((item) => !SCREEN_EVENTS.has(item.event.type));
      queue.splice(drop >= 0 ? drop : 0, 1)[0].resolve(null);
    }
  }), [attemptId, emitProctor]);

  /** The room's proctoring pause: segment capture and the turn loop stop until it ends. */
  const setProctorPaused = useCallback((value) => {
    const next = Boolean(value);
    if (localPausedRef.current === next) return;
    localPausedRef.current = next;
    applyGate();
  }, [applyGate]);

  const setMuted = useCallback((value) => {
    userMutedRef.current = Boolean(value);
    if (!value) mutedLevelRef.current = 0;
    setMutedState(Boolean(value));
    applyGate();
  }, [applyGate]);

  // The browser voice gives no level, so the orb moves gently while it speaks.
  const outputLevel = useCallback(() => playerRef.current?.level() || (speechRef.current?.speaking() ? 0.3 : 0), []);
  const inputLevel = useCallback(() => inputLevelRef.current, []);
  const mutedLevel = useCallback(() => mutedLevelRef.current, []);
  // 0..1: how far the student's pause has gone towards sending the answer (0 while they talk).
  const pauseProgress = useCallback(() => {
    const segmenter = segmenterRef.current;
    if (!segmenter?.speaking()) return 0;
    return Math.min(1, segmenter.pauseMs() / Math.max(1, segmenter.hangoverMs()));
  }, []);
  const dismissError = useCallback(() => setError(null), []);
  const dismissNoisyRoom = useCallback(() => setNoisyRoom(false), []);

  return {
    status, activity, serverState, captions, error, audioPaused, muted, setMuted, start, retry, end, resumeAudio, outputLevel, inputLevel, mutedLevel,
    dismissError, endReason, proctorWarning, sendProctor, serverPaused, setProctorPaused, joinProctoring,
    runtimeMode: "hybrid", turnState, promptKind, promptText, replay, canReplay,
    recording, pauseProgress, noisyRoom, dismissNoisyRoom, micSilent, hangoverMs, socketMode,
  };
}
