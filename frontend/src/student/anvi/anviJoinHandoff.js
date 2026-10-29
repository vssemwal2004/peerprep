// The pre-start flow (on the AI Interviews page) tests the microphone (and, with camera AI proctoring,
// the camera) and creates the call's audio contexts inside the Join click, then starts the attempt and
// opens its room. The room takes them from here and joins at once, so the student does not pass a second
// lobby or permission prompt. Untaken media is released.

const HOLD_MS = 2 * 60_000;
const handoffs = new Map();

const stopTracks = (stream) => stream?.getTracks?.().forEach((track) => { try { track.stop(); } catch { /* Already stopped. */ } });
const liveVideo = (stream) => Boolean(stream?.getVideoTracks?.().some((track) => track.readyState !== "ended"));

/** Stops a handed-over microphone (and camera) stream and closes its audio contexts. */
export function releaseAudio({ stream = null, contexts = null, cameraStream = null } = {}) {
  stopTracks(stream);
  stopTracks(cameraStream);
  [contexts?.capture, contexts?.playback].forEach((context) => {
    if (context && context.state !== "closed") void context.close?.()?.catch?.(() => {});
  });
}

export function releaseJoinHandoff(attemptId) {
  const key = String(attemptId || "");
  const entry = handoffs.get(key);
  if (!entry) return;
  clearTimeout(entry.timer);
  handoffs.delete(key);
  releaseAudio(entry);
}

/** Releases every handoff still held (for a page where no room can take one). */
export function releaseAllJoinHandoffs() {
  for (const id of [...handoffs.keys()]) releaseJoinHandoff(id);
}

/**
 * Keeps `{ stream, contexts, cameraStream }` for the room of `attemptId`; only one handoff is held at a
 * time. `cameraStream` (a video-only MediaStream) is present only when the interview uses camera AI.
 */
export function setJoinHandoff(attemptId, { stream = null, contexts = null, cameraStream = null } = {}) {
  const key = String(attemptId || "");
  releaseAllJoinHandoffs();
  if (!key) { releaseAudio({ stream, contexts, cameraStream }); return; }
  const timer = setTimeout(() => releaseJoinHandoff(key), HOLD_MS);
  if (typeof timer === "object") timer?.unref?.();
  handoffs.set(key, { stream, contexts, cameraStream, timer });
}

export const hasJoinHandoff = (attemptId) => handoffs.has(String(attemptId || ""));

/**
 * Hands the room its media (the caller now owns it), or null when there is none:
 * `{ stream, contexts, cameraStream }`, with an ended stream as null.
 */
export function takeJoinHandoff(attemptId) {
  const key = String(attemptId || "");
  const entry = handoffs.get(key);
  if (!entry) return null;
  clearTimeout(entry.timer);
  handoffs.delete(key);
  return {
    stream: entry.stream?.active === false ? null : entry.stream,
    contexts: entry.contexts,
    cameraStream: liveVideo(entry.cameraStream) ? entry.cameraStream : null,
  };
}
