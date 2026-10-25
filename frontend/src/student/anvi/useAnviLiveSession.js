import { useCallback, useEffect, useRef, useState } from "react";
import socketService from "../../utils/socket";
import { api } from "../../utils/api";
import { createAnviAudioPlayer } from "./anviAudioPlayer";

export const MIC_CONSTRAINTS = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } };
const FRAME_BYTES = 3200;
// Half-duplex: the mic is replaced by silence while ANVI plays and for this long after (plus the output
// device's latency), so her own voice never reaches the server's VAD as barge-in. Frames keep flowing
// so VAD timing stays continuous.
const ECHO_TAIL_MS = 250;
const MAX_OUTPUT_LATENCY_MS = 500;
// While the server still reports ANVI speaking, a drained queue is a network gap inside her utterance.
const SERVER_SPEAKING_HOLD_MS = 1500;
const SILENCE = new ArrayBuffer(FRAME_BYTES);
const VOICE_RMS = 0.025;
// Shown as "thinking" once the candidate has been quiet this long; the server's VAD waits about 2 s.
const THINKING_AFTER_MS = 1700;
const THINKING_GIVE_UP_MS = 9000;
// Above the server's worst join: authorisation, releasing a previous tab, and a 15 s Live setup.
const ACK_TIMEOUT_MS = 40000;
// The server waits up to 20 s for answer transcriptions before it acks an end; falling back to the
// REST end sooner would save the rougher live transcript instead.
const END_ACK_TIMEOUT_MS = 30000;
// The server's own Live reconnect can take up to its 15 s setup timeout.
const RECOVERY_WAIT_MS = 20000;
const MAX_CAPTIONS = 60;
// Proctoring events are small and the server answers at once; a slow ack is treated as unsent.
const PROCTOR_ACK_MS = 8000;
// Events raised before the join is acknowledged (or while reconnecting) wait for the next join.
const MAX_QUEUED_PROCTOR = 20;
// The events the server's pause follows; a full queue drops other events (blocked actions, camera
// findings) before these.
const SCREEN_EVENTS = new Set(["fullscreen_enter", "fullscreen_exit", "tab_hidden", "tab_visible", "window_blur", "window_focus", "ai_camera_blocked", "ai_camera_restored"]);
// Join rejections worth a "Try again"; anything else (ended, forbidden, disabled) is final.
const RETRYABLE_JOIN = new Set(["JOIN_FAILED", "LIVE_UNAVAILABLE", "BUSY", "TAKEN_OVER", "JOIN_TIMEOUT", "RATE_LIMITED", "ATTEMPT_ENDING"]);

const CLIENT_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
function makeClientId(length = 24) {
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => CLIENT_ID_ALPHABET[byte % CLIENT_ID_ALPHABET.length]).join("");
}
/**
 * This page load's id, sent with every anvi:join. The server treats a reconnect from the same page
 * (within 5 s, or while it still holds the lease) as the same client, not a proctoring "rejoin".
 * Memory only: a reload is a new page and gets a new id.
 */
export const ANVI_CLIENT_ID = makeClientId();

/** Browser features the hands-free room needs. AudioWorklet and getUserMedia need HTTPS or localhost. */
export function anviBrowserSupport(win = globalThis.window) {
  if (!win) return { ok: false, reason: "This page needs a browser." };
  if (win.isSecureContext === false) return { ok: false, reason: "Voice interviews need a secure (HTTPS) connection. Open PeerPrep over https:// and try again." };
  if (!win.navigator?.mediaDevices?.getUserMedia) return { ok: false, reason: "This browser cannot use a microphone here. Use a recent Chrome, Edge, Safari or Firefox." };
  if (!(win.AudioContext || win.webkitAudioContext) || typeof win.AudioWorkletNode !== "function") return { ok: false, reason: "This browser does not support live audio. Use a recent Chrome, Edge, Safari or Firefox." };
  return { ok: true, reason: "" };
}

/**
 * Merges a caption into the list: streaming chunks extend the speaker's open line, accumulated text
 * replaces it. The open line need not be the last one: the candidate's line stays open while ANVI's
 * reply starts streaming, and its final text arrives after hers.
 */
export function mergeCaption(list, { role, text, final }) {
  const clean = String(text || "");
  if (!clean.trim() && !final) return list;
  const index = list.findLastIndex((line) => line.role === role);
  const open = index >= 0 && !list[index].final ? list[index] : null;
  if (open) {
    const merged = clean.startsWith(open.text) ? clean : `${open.text}${clean}`;
    return list.map((line, i) => (i === index ? { ...open, text: merged, final: Boolean(final) } : line));
  }
  if (!clean.trim()) return list;
  const next = [...list, { id: `${role}-${Date.now()}-${list.length}`, role, text: clean, final: Boolean(final) }];
  return next.length > MAX_CAPTIONS ? next.slice(-MAX_CAPTIONS) : next;
}

/** A getUserMedia failure as a sentence for the student; `next` is what they should do afterwards. */
export function micError(cause, next = "press Try again") {
  const name = cause?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError") return `Microphone access is blocked. Allow it from the address bar, then ${next}.`;
  if (name === "NotFoundError" || name === "OverconstrainedError") return `No microphone was found. Connect one, then ${next}.`;
  if (name === "NotReadableError" || name === "AbortError") return `Another app is using the microphone. Close it, then ${next}.`;
  return `The microphone could not start. Check your audio settings, then ${next}.`;
}

/**
 * The capture and 24 kHz playback AudioContexts of a call, created and resumed at once. Call it inside a
 * click: a context resumed during a user gesture keeps running afterwards (autoplay rules).
 */
export function createAnviAudioContexts(win = globalThis.window) {
  const AudioContextClass = win.AudioContext || win.webkitAudioContext;
  const capture = new AudioContextClass({ latencyHint: "interactive" });
  let playback;
  try { playback = new AudioContextClass({ sampleRate: 24000, latencyHint: "interactive" }); }
  catch { playback = new AudioContextClass({ latencyHint: "interactive" }); }
  void capture.resume?.();
  void playback.resume?.();
  return { capture, playback };
}

const stopTracks = (stream) => stream?.getTracks?.().forEach((track) => { track.onended = null; track.stop(); });
const usable = (context) => context && context.state !== "closed";
// Audible output trails the context clock by the device's output latency (Bluetooth can add 300 ms).
const outputLatencyMs = (context) => {
  const seconds = Number(context?.outputLatency) || Number(context?.baseLatency) || 0;
  return Math.min(MAX_OUTPUT_LATENCY_MS, Math.max(0, seconds * 1000));
};

/**
 * Runs one ANVI live interview over the shared Socket.IO connection.
 * `start({ stream })` must be called from a click: it creates and resumes both AudioContexts
 * synchronously. `onEnded(payload)` fires once ANVI's last words have played.
 */
export function useAnviLiveSession({ attemptId, onEnded, onJoinRejected } = {}) {
  const [status, setStatus] = useState("idle");
  const [activity, setActivity] = useState("connecting");
  const [serverState, setServerState] = useState(null);
  const [captions, setCaptions] = useState([]);
  const [error, setError] = useState(null);
  const [audioPaused, setAudioPaused] = useState(false);

  const aliveRef = useRef(true);
  const socketRef = useRef(null);
  const detachRef = useRef(null);
  const contextsRef = useRef(null);
  const captureRef = useRef(null);
  const pendingStreamRef = useRef(null);
  const playerRef = useRef(null);
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
  const autoRejoinUsedRef = useRef(false);
  const recoveringRef = useRef(false);
  const rejoinTimerRef = useRef(null);
  const timersRef = useRef(new Set());
  const holdUntilRef = useRef(0);
  const serverSpeakingRef = useRef(false);
  const lastChunkAtRef = useRef(-Infinity);
  const lastVoiceAtRef = useRef(0);
  const awaitingReplyRef = useRef(false);
  const heardAnviRef = useRef(false);
  const inputLevelRef = useRef(0);
  // Student mute: frames keep flowing as silence (like ANVI's echo hold), so the server's VAD stays in step.
  const [muted, setMutedState] = useState(false);
  const userMutedRef = useRef(false);
  const mutedLevelRef = useRef(0);
  // Proctoring: the server's latest warning (with a sequence number so repeats re-render) and events
  // waiting for a join; the room's proctoring hook owns what they mean.
  const [proctorWarning, setProctorWarning] = useState(null);
  const proctorSeqRef = useRef(0);
  const proctorQueueRef = useRef([]);
  const [endReason, setEndReason] = useState(null);
  const [joinProctoring, setJoinProctoring] = useState(null);
  // Proctoring pause: the server's (anvi:paused / anvi:resumed, or `paused: true` on a join or
  // anvi:proctor ack) and the room's own (out of fullscreen). Either sends silence instead of the
  // microphone, like mute, so the server's VAD stays in step. `serverPaused` is `{ reason }` or null.
  const [serverPaused, setServerPaused] = useState(null);
  const serverPausedRef = useRef(false);
  const localPausedRef = useRef(false);
  const callbacksRef = useRef({ onEnded, onJoinRejected });

  useEffect(() => { callbacksRef.current = { onEnded, onJoinRejected }; }, [onEnded, onJoinRejected]);

  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => { timersRef.current.delete(id); fn(); }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

  // At most one scheduled automatic rejoin; a manual retry or a new join cancels it.
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

  const stopCapture = useCallback(() => {
    const capture = captureRef.current;
    captureRef.current = null;
    if (!capture) return;
    if (capture.node) {
      capture.node.port.onmessage = null;
      try { capture.node.port.postMessage("stop"); capture.node.port.close(); } catch { /* Port already closed. */ }
      try { capture.node.disconnect(); } catch { /* Not connected. */ }
    }
    try { capture.source?.disconnect(); } catch { /* Not connected. */ }
    stopTracks(capture.stream);
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
    stopCapture();
    // A stream handed over by the lobby that never became the capture stream is ours to stop.
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
  }, [stopCapture]);

  // Leaving the room inside the app keeps the shared socket open, so the server is told explicitly;
  // it stops ANVI and keeps the interview resumable.
  const leave = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !joinRequestedRef.current || endedRef.current) return;
    try { socket.emit("anvi:leave", { attemptId }); } catch { /* Socket already gone. */ }
  }, [attemptId]);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; leave(); teardown(); };
  }, [leave, teardown]);

  const clearServerPause = useCallback(() => {
    serverPausedRef.current = false;
    setServerPaused(null);
  }, []);

  // Proctoring events ride the same socket as the call, with their own short ack. They never touch
  // the audio path: a lost or slow ack only means the count is not refreshed. An accepted ack says
  // whether the server holds the interview (`paused`), which resyncs a missed anvi:paused / anvi:resumed.
  const emitProctor = useCallback((socket, event, resolve) => {
    try {
      socket.timeout(PROCTOR_ACK_MS).emit("anvi:proctor", event, (err, res) => {
        if (!err && res?.ok === true && !endedRef.current && aliveRef.current) {
          if (res.paused === true && !serverPausedRef.current) { serverPausedRef.current = true; setServerPaused({ reason: "" }); }
          else if (res.paused !== true && serverPausedRef.current) clearServerPause();
        }
        resolve(err || !res ? null : res);
      });
    } catch { resolve(null); }
  }, [clearServerPause]);

  // `fresh`: a new join (under the pause rule the server's new session starts held, which its ack or
  // anvi:paused says; the room then re-reports where it stands with `resync`).
  // The server reconnecting ANVI on its own keeps its session, and its pause.
  const markJoined = useCallback((state, { fresh = true } = {}) => {
    joinedRef.current = true;
    joinedOnceRef.current = true;
    takenOverRef.current = false;
    joinTimedOutRef.current = false;
    recoveringRef.current = false;
    if (fresh) clearServerPause();
    setStatus("live");
    setError(null);
    if (state) setServerState(state);
    if (contextsRef.current?.capture?.state === "suspended") void contextsRef.current.capture.resume();
    // The server accepts proctoring events only from the joined tab: send what waited for this join.
    const socket = socketRef.current;
    const queued = proctorQueueRef.current;
    proctorQueueRef.current = [];
    queued.forEach(({ event, resolve }) => (socket?.connected ? emitProctor(socket, event, resolve) : resolve(null)));
  }, [clearServerPause, emitProctor]);

  const finish = useCallback((payload = {}) => {
    if (endedRef.current) return;
    endedRef.current = true;
    joinedRef.current = false;
    cancelRejoin();
    setEndReason(payload?.endReason || null);
    setStatus("ended");
    setAudioPaused(false);
    stopCapture();
    // Let ANVI finish her closing line before handing over to the completion screen.
    const startedAt = Date.now();
    const handOver = () => {
      if (!aliveRef.current) return;
      if (playerRef.current?.isSpeaking() && Date.now() - startedAt < 8000) { later(handOver, 200); return; }
      teardown();
      callbacksRef.current.onEnded?.(payload);
    };
    handOver();
  }, [cancelRejoin, later, stopCapture, teardown]);

  // Used when the socket cannot end the interview (offline, timed out, or already past its deadline).
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
    // One join at a time; the pending one settles the room.
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
        // The server may still finish this join; its anvi:state then counts as the success.
        joinTimedOutRef.current = true;
        setStatus("error");
        setError({ code: "JOIN_TIMEOUT", message: "ANVI did not respond. Check your connection and try again.", retryable: true });
        return;
      }
      if (!res?.ok) {
        const code = res?.code || "JOIN_FAILED";
        // An earlier join on this connection is still running; its result decides.
        if (code === "BUSY") { joinTimedOutRef.current = true; return; }
        if (code === "ATTEMPT_EXPIRED") {
          // Past the time limit: close it now and show what was saved instead of a retry that cannot work.
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
      // The join ack carries the attempt's proctoring settings and its violation count so far.
      if (res.proctoring && typeof res.proctoring === "object") setJoinProctoring(res.proctoring);
      markJoined(res.state);
      // Under the pause rule the new session starts held (`paused`) until the room reports where it
      // stands; its anvi:paused, which follows, names the reason.
      if (res.paused === true) { serverPausedRef.current = true; setServerPaused({ reason: typeof res.reason === "string" ? res.reason : "" }); }
    });
  }, [attemptId, cancelRejoin, endViaRest, markJoined]);

  const onFrame = useCallback((event) => {
    const { pcm, rms } = event.data || {};
    if (!(pcm instanceof ArrayBuffer)) return;
    const now = performance.now();
    if (playerRef.current?.isSpeaking()) holdUntilRef.current = now + ECHO_TAIL_MS;
    const serverHold = serverSpeakingRef.current && now - lastChunkAtRef.current < SERVER_SPEAKING_HOLD_MS;
    const echoHold = now < holdUntilRef.current || serverHold;
    const paused = serverPausedRef.current || localPausedRef.current;
    const muted = echoHold || userMutedRef.current || paused;
    inputLevelRef.current = muted ? 0 : rms;
    // Lets the room say "you are muted" when the student talks while muted.
    mutedLevelRef.current = userMutedRef.current && !echoHold && !paused ? rms : 0;
    if (!muted && rms > VOICE_RMS) {
      lastVoiceAtRef.current = now;
      if (heardAnviRef.current) awaitingReplyRef.current = true;
    }
    const socket = socketRef.current;
    if (!joinedRef.current || !socket?.connected) return;
    socket.emit("anvi:audio", muted || pcm.byteLength !== FRAME_BYTES ? SILENCE : pcm);
  }, []);

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
      // The node writes nothing; connecting it keeps the graph pulling it on every browser.
      node.connect(context.destination);
      captureRef.current = { stream: micStream, source, node };
      micStream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (!aliveRef.current || endedRef.current) return;
          stopCapture();
          setError({ code: "MIC_UNAVAILABLE", message: "The microphone was disconnected. Reconnect it, then press Try again.", retryable: true });
        };
      });
      return true;
    } catch (failure) {
      // Never leave a live microphone behind that nothing owns.
      if (micStream && captureRef.current?.stream !== micStream) stopTracks(micStream);
      throw failure;
    } finally {
      if (pendingStreamRef.current && pendingStreamRef.current === micStream) pendingStreamRef.current = null;
    }
  }, [onFrame, stopCapture]);

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
        // A join in flight died with the connection; its ack (if any) is ignored.
        joinInFlightRef.current = false;
        joinSeqRef.current += 1;
        playerRef.current?.flush();
        // The next join starts a new, unpaused server session.
        clearServerPause();
        // Ending is sticky: finish it over REST instead of rejoining the interview.
        if (endingRef.current) { void endViaRest(); return; }
        if (!takenOverRef.current) { pendingJoinRef.current = true; setStatus("reconnecting"); }
      }],
      ["anvi:state", (state) => {
        if (!state || typeof state !== "object") return;
        setServerState(state);
        serverSpeakingRef.current = Boolean(state.speaking);
        // The server reconnected ANVI on its own (same session), or a join we gave up on finished after all (new one).
        if ((recoveringRef.current || joinTimedOutRef.current) && socket.connected && !takenOverRef.current && !endingRef.current && !endedRef.current) markJoined(null, { fresh: !recoveringRef.current });
      }],
      ["anvi:caption", (caption) => {
        if (!caption?.role) return;
        if (caption.role === "candidate" && heardAnviRef.current) awaitingReplyRef.current = true;
        setCaptions((list) => mergeCaption(list, caption));
      }],
      // Audio from a join that was never acknowledged would play while the mic is muted.
      ["anvi:audio", (chunk) => {
        if (endedRef.current || takenOverRef.current || !(joinedRef.current || recoveringRef.current)) return;
        lastChunkAtRef.current = performance.now();
        playerRef.current?.enqueue(chunk);
      }],
      ["anvi:interrupted", () => { serverSpeakingRef.current = false; playerRef.current?.flush(); }],
      ["anvi:error", (payload = {}) => {
        if (endedRef.current) return;
        const code = payload.code || "ANVI_ERROR";
        if (code === "FINALIZE_FAILED") {
          // The answers are not saved yet: the only useful action is ending again, never resuming.
          setStatus("error");
          setError({ code, message: payload.message || "Your answers could not be saved yet. Please try ending again.", retryable: true, action: "end" });
          return;
        }
        if (endingRef.current) return;
        setError({ code, message: payload.message || "Something went wrong with the interview.", retryable: payload.retryable !== false });
        // One automatic rejoin per incident; it re-arms once ANVI is heard again.
        const rejoinOnce = () => { if (!autoRejoinUsedRef.current) { autoRejoinUsedRef.current = true; scheduleRejoin(join, 2000); } };
        if (code === "LIVE_DISCONNECTED") {
          joinedRef.current = false;
          playerRef.current?.flush();
          setStatus("reconnecting");
          if (!payload.reconnecting) { rejoinOnce(); return; }
          // The server is reopening ANVI itself; a rejoin now would restart it. Rejoin only if it stays silent.
          recoveringRef.current = true;
          scheduleRejoin(() => { if (recoveringRef.current) { recoveringRef.current = false; join(); } }, RECOVERY_WAIT_MS);
        } else if (recoveringRef.current) {
          // The server's own reconnect failed.
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
        playerRef.current?.flush();
        setStatus("taken_over");
        // This tab's server session is gone; "Continue here" joins a new, unpaused one.
        clearServerPause();
        // Release the microphone and audio here; "Continue here" starts them again.
        stopCapture();
        const contexts = contextsRef.current;
        if (contexts?.capture?.state === "running") void contexts.capture.suspend();
        if (contexts?.playback?.state === "running") void contexts.playback.suspend();
      }],
      ["anvi:ended", (payload) => finish(payload || {})],
      ["anvi:paused", (payload) => {
        if (endedRef.current) return;
        serverPausedRef.current = true;
        setServerPaused({ reason: payload?.reason || "" });
      }],
      ["anvi:resumed", () => {
        serverPausedRef.current = false;
        setServerPaused(null);
      }],
      ["anvi:proctor-warning", (payload) => {
        if (!payload || typeof payload !== "object" || endedRef.current) return;
        proctorSeqRef.current += 1;
        setProctorWarning({ ...payload, seq: proctorSeqRef.current });
      }],
    ];
    handlers.forEach(([event, handler]) => socket.on(event, handler));
    detachRef.current = () => handlers.forEach(([event, handler]) => socket.off(event, handler));
  }, [cancelRejoin, clearServerPause, endViaRest, finish, join, markJoined, scheduleRejoin, stopCapture]);

  // A phone call, Siri, a locked screen or an output-device change can suspend or interrupt audio.
  const watchAudio = useCallback(() => {
    const check = () => {
      const contexts = contextsRef.current;
      if (!contexts || !aliveRef.current || endedRef.current || takenOverRef.current) return;
      const stalled = [contexts.capture, contexts.playback].filter((context) => usable(context) && context.state !== "running");
      // Resuming without a gesture works on most browsers; iOS needs the student to press Resume audio.
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
    // Both contexts are created and resumed inside the click so autoplay rules never block ANVI. A
    // pre-start lobby creates them in its own Join click and hands them over with the stream.
    const handed = contexts && usable(contexts.capture) && usable(contexts.playback) ? contexts : null;
    const { capture, playback } = handed || createAnviAudioContexts();
    if (handed) { void capture.resume?.()?.catch?.(() => {}); void playback.resume?.()?.catch?.(() => {}); }
    contextsRef.current = { capture, playback, workletReady: false };
    watchAudio();
    playerRef.current = createAnviAudioPlayer({
      context: playback,
      onSpeakingChange: (speaking) => {
        holdUntilRef.current = speaking ? Infinity : performance.now() + ECHO_TAIL_MS + outputLatencyMs(playback);
        if (speaking) { heardAnviRef.current = true; awaitingReplyRef.current = false; autoRejoinUsedRef.current = false; }
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
  }, [attach, join, startCapture, watchAudio]);

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
    playerRef.current?.flush();
    joinedRef.current = false;
    const socket = socketRef.current;
    if (!socket?.connected) { await endViaRest(); return; }
    socket.timeout(END_ACK_TIMEOUT_MS).emit("anvi:end", { reason: "ended_by_student" }, (err, res) => {
      if (!aliveRef.current || endedRef.current) return;
      if (err || !res?.ok) { void endViaRest(); return; }
      finish({ status: res.status, endReason: res.endReason || "ended_by_student" });
    });
  }, [cancelRejoin, endViaRest, finish]);

  const retry = useCallback(() => {
    if (endedRef.current || !contextsRef.current) return;
    // Once the student chose to end, "try again" means end again, never resume.
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

  // pagehide: the tab is closing or going into the back-forward cache. If it comes back, rejoin.
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

  // Activity drives the orb and the status line; polled so no audio callback re-renders React.
  useEffect(() => {
    if (status !== "live") { setActivity(status === "ended" ? "idle" : "connecting"); return undefined; }
    const tick = () => {
      const now = performance.now();
      let next = "listening";
      if (playerRef.current?.isSpeaking()) next = "speaking";
      else if (!heardAnviRef.current) next = "thinking";
      else if (awaitingReplyRef.current && now - lastVoiceAtRef.current > THINKING_AFTER_MS) {
        if (now - lastVoiceAtRef.current > THINKING_GIVE_UP_MS) awaitingReplyRef.current = false;
        else next = "thinking";
      }
      setActivity((current) => (current === next ? current : next));
    };
    tick();
    const id = setInterval(tick, 150);
    return () => clearInterval(id);
  }, [status]);

  /**
   * Sends one proctoring event (`anvi:proctor`, plus `{ severity, confidence }` for camera AI events in
   * `detail`) and resolves with the server's ack
   * `{ ok, violations, maxViolations, warning? }`, or null when it could not be sent. Before the join is
   * acknowledged, or while reconnecting, the event waits for the next join.
   */
  const sendProctor = useCallback((type, at = Date.now(), detail = null) => new Promise((resolve) => {
    const socket = socketRef.current;
    if (!socket || endedRef.current || endingRef.current || takenOverRef.current) { resolve(null); return; }
    const event = { attemptId, type, at: new Date(at).toISOString() };
    // Camera AI events carry how sure the detector was; the server sanitises both.
    if (detail?.severity) event.severity = String(detail.severity);
    if (Number.isFinite(Number(detail?.confidence)) && detail?.confidence !== null) event.confidence = Number(detail.confidence);
    // A re-report of a state the server already heard about (after a join, or a resume retry).
    if (detail?.resync === true) event.resync = true;
    if (joinedRef.current && socket.connected) { emitProctor(socket, event, resolve); return; }
    const queue = proctorQueueRef.current;
    queue.push({ event, resolve });
    if (queue.length > MAX_QUEUED_PROCTOR) {
      // The oldest event the pause does not follow goes first, so a queued fullscreen_exit is never lost.
      const drop = queue.findIndex((item) => !SCREEN_EVENTS.has(item.event.type));
      queue.splice(drop >= 0 ? drop : 0, 1)[0].resolve(null);
    }
  }), [attemptId, emitProctor]);

  /** The room's proctoring pause (out of fullscreen): the microphone is replaced by silence meanwhile. */
  const setProctorPaused = useCallback((value) => { localPausedRef.current = Boolean(value); }, []);

  const outputLevel = useCallback(() => playerRef.current?.level() || 0, []);
  const inputLevel = useCallback(() => inputLevelRef.current, []);
  const mutedLevel = useCallback(() => mutedLevelRef.current, []);
  const setMuted = useCallback((value) => {
    userMutedRef.current = Boolean(value);
    if (!value) mutedLevelRef.current = 0;
    setMutedState(Boolean(value));
  }, []);

  return {
    status, activity, serverState, captions, error, audioPaused, muted, setMuted, start, retry, end, resumeAudio, outputLevel, inputLevel, mutedLevel,
    dismissError: () => setError(null), endReason, proctorWarning, sendProctor, serverPaused, setProctorPaused, joinProctoring,
  };
}
