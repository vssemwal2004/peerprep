import { useCallback, useEffect, useRef, useState } from "react";
import { aiNeedsFace } from "../anviStartSetup";

const IDLE_STATUS = { running: false, camera: "unknown", faceModel: "unknown", objectModel: "unknown", face: "unknown", eye: "unknown", mobile: "unknown", person: "unknown", error: null };
const CHECKS_FAILED = "The camera checks could not start. Check your connection, then try again.";
const CAMERA_STOPPED = "Your camera stopped. Reconnect it or close any app using it, then try again.";

// The Assessment module's camera AI (ProctoringManager), loaded only when an interview uses it.
const defaultCreateManager = async (options) => {
  const { ProctoringManager } = await import("../../../features/assessment/proctoring");
  return new ProctoringManager(options);
};
const requestCamera = async () => {
  const { requestCameraStream } = await import("../../../features/assessment/proctoring/utils/cameraUtils");
  return requestCameraStream();
};

const liveVideo = (stream) => Boolean(stream?.getVideoTracks?.().some((track) => track.readyState !== "ended"));
const stopTracks = (stream) => stream?.getTracks?.().forEach((track) => { try { track.stop(); } catch { /* Already stopped. */ } });

const cameraErrorOf = (cause) => {
  const name = cause?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera access is blocked. Allow it from the address bar, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found. Connect one, then try again.";
  if (name === "NotReadableError" || name === "AbortError") return "Another app is using the camera. Close it, then try again.";
  return cause?.message || "The camera could not start. Check your camera settings, then try again.";
};

/**
 * The camera step of the System check when the interview uses camera AI proctoring (`ai.enabled`):
 * asks for the camera, shows it in `videoRef` and runs the Assessment `ProctoringManager` on it for a
 * live "Face detected" check. The manager runs only while `active` (the System check is on screen); the
 * last result it reported stays after that (its own stop is ignored), so a face checked on the System
 * check still counts on Ready. The stream is kept for the room, which gets it through `handOver()`, and
 * an unused stream is stopped on unmount. A camera that stops, or checks that cannot start, show as a
 * camera error with Try again. Nothing is recorded or uploaded here.
 *
 * `createManager(options)` builds the manager (a test seam; defaults to the Assessment one).
 */
export default function useCameraCheck({ ai, active, createManager = defaultCreateManager }) {
  const enabled = Boolean(ai?.enabled);
  const [camera, setCamera] = useState({ state: "idle", error: "" });
  const [status, setStatus] = useState(IDLE_STATUS);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const managerRef = useRef(null);
  // The manager whose status reports count; cleared before a stop, so its closing "unknown" is ignored.
  const reportingRef = useRef(null);
  const handedOverRef = useRef(false);
  const aliveRef = useRef(true);
  const createRef = useRef(createManager);
  useEffect(() => { createRef.current = createManager; });

  const stopManager = useCallback(() => {
    const manager = managerRef.current;
    managerRef.current = null;
    reportingRef.current = null;
    try { manager?.stop?.(); } catch { /* Already stopped. */ }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      stopManager();
      if (!handedOverRef.current) stopTracks(streamRef.current);
    };
  }, [stopManager]);

  // The preview shows the stream itself, so it does not depend on the manager starting.
  const attachPreview = useCallback((stream) => {
    const video = videoRef.current;
    if (!video || !stream || video.srcObject === stream) return;
    try { video.srcObject = stream; } catch { /* No preview in this browser; the checks still run. */ }
  }, []);

  // Checks that cannot run (detector not loaded, camera not attached) become a camera error with Try again.
  const failChecks = useCallback((message) => {
    stopManager();
    if (!aliveRef.current) return;
    setStatus(IDLE_STATUS);
    setCamera({ state: "error", error: message });
  }, [stopManager]);

  const startManager = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream || managerRef.current) return;
    const token = {};
    managerRef.current = token;
    reportingRef.current = token;
    try {
      const manager = await createRef.current({
        settings: { ...ai, enabled: true },
        videoElement: videoRef.current,
        stream,
        requireExistingStream: true,
        onStatusChange: (next) => {
          if (!aliveRef.current || reportingRef.current !== token) return;
          // The manager could not attach the camera (it reports this instead of throwing).
          if (next?.camera === "blocked") { failChecks(CHECKS_FAILED); return; }
          setStatus({ ...IDLE_STATUS, ...next });
        },
      });
      if (managerRef.current !== token) { try { manager?.stop?.(); } catch { /* Already stopped. */ } return; }
      managerRef.current = manager;
      await manager.start();
    } catch {
      if (reportingRef.current === token) failChecks(CHECKS_FAILED);
    }
    // `ai` is fixed for one pre-start flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failChecks]);

  // A camera unplugged or taken by another app: drop it and offer Try again (which asks for a new one).
  const watchEnded = useCallback((stream) => {
    const onEnded = () => {
      if (!aliveRef.current || handedOverRef.current || streamRef.current !== stream) return;
      streamRef.current = null;
      stopTracks(stream);
      failChecks(CAMERA_STOPPED);
    };
    stream?.getVideoTracks?.().forEach((track) => track.addEventListener?.("ended", onEnded, { once: true }));
  }, [failChecks]);

  const start = useCallback(async () => {
    if (!enabled || camera.state === "requesting") return;
    const current = streamRef.current;
    if (liveVideo(current)) {
      attachPreview(current);
      setCamera({ state: "on", error: "" });
      void startManager();
      return;
    }
    // A new stream: the detector bound to the old one goes first.
    stopManager();
    if (current && !handedOverRef.current) stopTracks(current);
    streamRef.current = null;
    setCamera({ state: "requesting", error: "" });
    try {
      const stream = await requestCamera();
      if (!aliveRef.current) { stopTracks(stream); return; }
      streamRef.current = stream;
      watchEnded(stream);
      attachPreview(stream);
      setCamera({ state: "on", error: "" });
      void startManager();
    } catch (cause) {
      if (aliveRef.current) setCamera({ state: "error", error: cameraErrorOf(cause) });
    }
  }, [enabled, camera.state, attachPreview, startManager, stopManager, watchEnded]);

  // The detector runs only while the System check is on screen; the camera itself stays on for the room.
  useEffect(() => {
    if (!enabled) return;
    if (!active) { stopManager(); setStatus((current) => ({ ...current, running: false })); }
  }, [enabled, active, stopManager]);
  // The System check's video element is new each time the phase opens.
  useEffect(() => {
    if (enabled && active && camera.state === "on") attachPreview(streamRef.current);
  }, [enabled, active, camera.state, attachPreview]);

  /** The camera stream for the room (or null); after this the room owns it. */
  const handOver = useCallback(() => {
    const stream = liveVideo(streamRef.current) ? streamRef.current : null;
    handedOverRef.current = Boolean(stream);
    stopManager();
    return stream;
  }, [stopManager]);
  const takeBack = useCallback(() => { handedOverRef.current = false; }, []);

  const needsFace = aiNeedsFace(ai);
  const faceModelOut = status.faceModel === "unavailable";
  const faceDetected = camera.state === "on" && status.camera === "ok" && status.face === "ok"
    && ["ready", "fallback"].includes(status.faceModel);
  // When the face model cannot load at all (for example it is blocked on this network), the camera
  // still counts so the student is not locked out; the room reports the missing checks.
  const ready = enabled ? camera.state === "on" && (!needsFace || faceDetected || faceModelOut) : true;

  return { enabled, camera, status, videoRef, start, ready, faceDetected, needsFace, faceModelOut, handOver, takeBack };
}
