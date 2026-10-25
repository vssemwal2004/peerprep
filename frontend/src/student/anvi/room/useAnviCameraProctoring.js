import { useCallback, useEffect, useRef, useState } from "react";
import { requestCameraStream, stopCameraStream } from "../../../features/assessment/proctoring/utils/cameraUtils";

export const CAMERA_BLOCKED = "ai_camera_blocked";
export const CAMERA_RESTORED = "ai_camera_restored";
const IDLE_STATUS = Object.freeze({ running: false, camera: "unknown", face: "unknown", eye: "unknown", mobile: "unknown", person: "unknown", error: null });

/**
 * What the room needs from the Assessment proctoring module. The detector (MediaPipe / coco-ssd) is
 * loaded only when an interview turns camera AI on, so other rooms never download it. Tests swap these.
 */
export const cameraProctoringDeps = {
  loadManager: async () => (await import("../../../features/assessment/proctoring/ProctoringManager")).ProctoringManager,
  requestCameraStream,
  stopCameraStream,
};

const hasLiveVideo = (stream) => Boolean(stream?.getVideoTracks?.().some((track) => track.readyState !== "ended"));

/**
 * The live room's camera AI proctoring (Assessment's ProctoringManager), only when `enabled`.
 * - Uses the camera stream handed over by the pre-start phase, or asks for one with cameraUtils.
 * - Runs the manager on the "You" tile's video (`videoRef`), reports its status for the chips, and
 *   passes each confirmed violation to `onViolation({ type, message, severity, confidence })`.
 * - A refused or lost camera is reported once per loss as ai_camera_blocked; `retry()` asks again.
 * - Stops the manager and the camera when `running` turns false or the room unmounts.
 * - `settled`: whether the attempt's settings are known yet (they can arrive with the join ack). Until
 *   then a handed-over stream is kept, not stopped, so it is not asked for a second time.
 * Detection runs in the browser only; no frames leave it.
 */
export function useAnviCameraProctoring({ enabled = false, aiSettings = null, initialStream = null, running = true, settled = true, onViolation } = {}) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState(IDLE_STATUS);
  const [blocked, setBlocked] = useState("");
  const [hasStream, setHasStream] = useState(false);
  const [round, setRound] = useState(0);
  const onViolationRef = useRef(onViolation);
  const settingsRef = useRef(aiSettings);
  const initialRef = useRef(initialStream);
  const lostRef = useRef(false);
  useEffect(() => { onViolationRef.current = onViolation; settingsRef.current = aiSettings; });

  const report = useCallback((event) => {
    try { onViolationRef.current?.(event); } catch { /* Reporting never breaks detection. */ }
  }, []);

  const active = enabled && running;
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let manager = null;
    let stream = null;
    const preview = videoRef.current;
    // One ai_camera_blocked per loss, however many retries fail; ai_camera_restored ends it.
    const loseCamera = (message) => {
      if (cancelled) return;
      setBlocked(message);
      setHasStream(false);
      if (lostRef.current) return;
      lostRef.current = true;
      report({ type: CAMERA_BLOCKED, message, severity: "high", confidence: 1 });
    };

    (async () => {
      // The pre-start camera is used once; a retry asks for a fresh stream.
      const handed = initialRef.current;
      initialRef.current = null;
      if (hasLiveVideo(handed)) stream = handed;
      else {
        if (handed) cameraProctoringDeps.stopCameraStream(handed);
        try { stream = await cameraProctoringDeps.requestCameraStream(); }
        catch { loseCamera("Your camera is blocked or unavailable. Allow camera access in the address bar, then retry."); return; }
      }
      if (cancelled) { cameraProctoringDeps.stopCameraStream(stream); return; }
      stream.getVideoTracks?.().forEach((track) => {
        track.addEventListener?.("ended", () => loseCamera("Your camera stopped. Reconnect it, then retry."));
      });
      setBlocked("");
      setHasStream(true);
      // The server ends a camera pause on this event.
      if (lostRef.current) {
        lostRef.current = false;
        report({ type: CAMERA_RESTORED });
      }
      // The preview shows at once; the manager attaches the same stream again when it starts.
      if (preview) {
        preview.srcObject = stream;
        preview.muted = true;
        try { void preview.play?.()?.catch?.(() => {}); } catch { /* Autoplay is retried by the manager. */ }
      }

      let Manager;
      try { Manager = await cameraProctoringDeps.loadManager(); }
      catch { if (!cancelled) setStatus((current) => ({ ...current, camera: "ok", error: "AI camera checks could not load." })); return; }
      if (cancelled) return;
      manager = new Manager({
        settings: settingsRef.current || { enabled: true },
        videoElement: preview,
        stream,
        requireExistingStream: true,
        onStatusChange: (next) => {
          if (cancelled || !next) return;
          setStatus({ ...IDLE_STATUS, ...next });
          if (next.camera === "blocked") loseCamera(next.error || "Your camera is blocked or unavailable.");
        },
        // The manager already applies its ignore limit and cooldown; its camera-blocked event is ours too.
        onViolationConfirmed: (event) => {
          if (cancelled || !event?.type) return;
          if (event.type === CAMERA_BLOCKED) { loseCamera(event.message || "Your camera is blocked or unavailable."); return; }
          report({ type: event.type, message: event.message || "", severity: event.severity, confidence: event.confidence });
        },
        onError: () => {},
      });
      setStatus({ ...IDLE_STATUS, ...manager.getStatus() });
      try { await manager.start(); } catch { /* Status already says what failed. */ }
      if (cancelled) manager.stop();
    })();

    return () => {
      cancelled = true;
      try { manager?.stop(); } catch { /* Already stopped. */ }
      if (preview) preview.srcObject = null;
      cameraProctoringDeps.stopCameraStream(stream);
      setHasStream(false);
      setStatus(IDLE_STATUS);
    };
  }, [active, round, report]);

  // Nothing handed over is left running once the settings say camera AI is off.
  useEffect(() => {
    if (!enabled && settled && initialRef.current) { cameraProctoringDeps.stopCameraStream(initialRef.current); initialRef.current = null; }
  }, [enabled, settled]);
  useEffect(() => () => { if (initialRef.current) cameraProctoringDeps.stopCameraStream(initialRef.current); }, []);

  const retry = useCallback(() => { setBlocked(""); setRound((value) => value + 1); }, []);

  return { enabled, videoRef, status, hasStream, blocked: enabled && Boolean(blocked), blockedMessage: blocked, retry };
}
