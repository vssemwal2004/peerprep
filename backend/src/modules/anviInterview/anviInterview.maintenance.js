import { anviConfig } from "./anviInterview.config.js";
import { AnviAttempt, AnviLiveSession } from "./anviInterview.models.js";
import { finalizeFromLive } from "./anviInterview.service.js";
import { dispatchPendingAnviEvaluations } from "./anviInterview.evaluation.js";

const MINUTE = 60_000;
// The start request creates the attempt just before its live doc; never sweep inside that gap.
const CREATE_GRACE_MS = 2 * MINUTE;

/**
 * Closes in-progress attempts nobody can resume any more, keeping whatever answers were stored.
 * Runs in the caller's tenant context (sharedMaintenance enters it).
 */
export async function sweepStaleAnviAttempts(now = new Date(), options = {}) {
  const result = await sweepStale(now, options);
  // Question audio upkeep rides on this per-tenant 60 s sweep; it never fails or delays the sweep result.
  await maintainAnviAudio(now, options).catch((error) => console.warn(`[ANVI] Question audio upkeep failed (${error?.name || "Error"}).`));
  return result;
}

/**
 * Hybrid question audio upkeep (no-op unless ANVI_HYBRID_ENABLED): claims due pregen outboxes (the TTS work
 * continues detached), lets failed clips retry after their backoff, and removes attempt-scope clips 24 h
 * after the attempt ended. Static clips are never removed here.
 */
export async function maintainAnviAudio(now = new Date(), { config = anviConfig(), audioPregen = null } = {}) {
  if (!config?.hybridEnabled) return { skipped: true };
  const pregen = audioPregen || (await import("./anviInterview.audioPregen.js")).defaultAudioPregen();
  return pregen.maintain({ now });
}

async function sweepStale(now, { limit = 100, config = anviConfig(), evaluateSoon, onFinalized } = {}) {
  // assignmentId lets finalizeFromLive settle a scheduled attempt's target and booking too.
  const attempts = await AnviAttempt.find({ status: "in_progress" })
    .select("_id studentId interviewId assignmentId bookingId startedAt hardDeadline").sort({ hardDeadline: 1 }).limit(limit).maxTimeMS(8000).lean();
  if (!attempts.length) return { closed: 0 };
  const lives = await AnviLiveSession.find({ attemptId: { $in: attempts.map((row) => row._id) } })
    .select("attemptId lastActivityAt expiresAt").maxTimeMS(8000).lean();
  const byAttempt = new Map(lives.map((row) => [String(row.attemptId), row]));
  const idleBefore = now.getTime() - config.resumeWindowMinutes * MINUTE;
  let closed = 0;
  for (const attempt of attempts) {
    const live = byAttempt.get(String(attempt._id));
    const pastDeadline = now > new Date(attempt.hardDeadline);
    const stale = live
      ? new Date(live.expiresAt) < now || (pastDeadline && new Date(live.lastActivityAt).getTime() < idleBefore)
      : now.getTime() - new Date(attempt.startedAt).getTime() > CREATE_GRACE_MS;
    if (!stale) continue;
    // Closed attempts are queued for evaluation; the evaluation backstop picks them up even if
    // the immediate run has no free slot.
    if (await finalizeFromLive(attempt, { status: pastDeadline ? "expired" : "abandoned", endReason: "stale", now, ...(evaluateSoon ? { evaluateSoon } : {}), ...(onFinalized ? { onFinalized } : {}) })) closed += 1;
  }
  return { closed };
}

/**
 * Evaluation backstop, run every 10 s per university and for the platform. It only claims work;
 * Gemini calls continue in the background so the shared maintenance tick is never held up.
 */
export function dispatchAnviEvaluations(options) {
  return dispatchPendingAnviEvaluations(options);
}
