function positiveMilliseconds(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function securityRecheckTimeoutMs(assessment = {}) {
  const configured = Number(assessment?.settings?.securityRecheckTimeoutSec);
  const seconds = Number.isFinite(configured)
    ? Math.min(1800, Math.max(30, configured))
    : 180;
  return seconds * 1000;
}

/**
 * Returns the server deadline for an attempt. This mirrors the assessment
 * timer: duration is capped by the assessment window, completed pauses extend
 * the timer, and an unresolved security pause can only remain open for the
 * configured recheck period.
 */
export function getAssessmentAttemptDeadline(assessment = {}, submission = {}) {
  const startedAt = validDate(submission.startedAt);
  const durationMinutes = Number(assessment.duration);
  if (!startedAt || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;

  const durationEnd = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);
  const scheduleEnd = validDate(assessment.endTime) || durationEnd;
  const baseEnd = durationEnd < scheduleEnd ? durationEnd : scheduleEnd;
  let deadline = new Date(baseEnd.getTime() + positiveMilliseconds(submission.pausedDurationMs));

  const pauseStartedAt = validDate(submission.pauseStartedAt);
  if (pauseStartedAt) {
    const pauseDeadline = new Date(pauseStartedAt.getTime() + securityRecheckTimeoutMs(assessment));
    if (pauseDeadline < deadline) deadline = pauseDeadline;
  }

  const manuallyCompletedAt = validDate(assessment.manuallyCompletedAt);
  if (manuallyCompletedAt && manuallyCompletedAt < deadline) deadline = manuallyCompletedAt;
  return deadline;
}

export function isAssessmentAttemptExpired(assessment = {}, submission = {}, now = new Date()) {
  if (submission.status !== 'in_progress') return false;
  const deadline = getAssessmentAttemptDeadline(assessment, submission);
  const current = validDate(now);
  return Boolean(deadline && current && current >= deadline);
}

export function getAssessmentAttemptTimeTakenSec(submission = {}, endedAt = new Date()) {
  const startedAt = validDate(submission.startedAt);
  const end = validDate(endedAt);
  if (!startedAt || !end || end < startedAt) return 0;

  let pausedMs = positiveMilliseconds(submission.pausedDurationMs);
  const activePause = validDate(submission.pauseStartedAt);
  if (activePause && end > activePause) pausedMs += end.getTime() - activePause.getTime();
  return Math.max(0, Math.floor((end.getTime() - startedAt.getTime() - pausedMs) / 1000));
}

