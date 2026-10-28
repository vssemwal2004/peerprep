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
 * Most clock time a security re-check pause may give back. Leaving the tab
 * must not buy free exam time, so a longer pause still costs the student time.
 */
export const SECURITY_PAUSE_CREDIT_CAP_MS = 30000;

/**
 * Returns the server deadline for an attempt. This mirrors the assessment
 * timer: duration is capped by the assessment window and completed pauses
 * extend the timer by their (capped) credit. An unresolved security pause
 * extends it by at most that same cap, and only when it began before the
 * deadline; it can also only remain open for the configured recheck period.
 * The answer-save path and the expiry sweeper both use this one rule.
 */
export function getAssessmentAttemptDeadline(assessment = {}, submission = {}) {
  const startedAt = validDate(submission.startedAt);
  const durationMinutes = Number(assessment.duration);
  if (!startedAt || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;

  const durationEnd = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);
  const scheduleEnd = validDate(assessment.endTime) || durationEnd;
  const baseEnd = durationEnd < scheduleEnd ? durationEnd : scheduleEnd;
  let deadline = new Date(baseEnd.getTime() + positiveMilliseconds(submission.pausedDurationMs));

  const pauseStartedAt = submission.pauseStartedAt ? validDate(submission.pauseStartedAt) : null;
  if (pauseStartedAt) {
    const pauseCredit = pauseStartedAt <= deadline ? SECURITY_PAUSE_CREDIT_CAP_MS : 0;
    deadline = new Date(deadline.getTime() + pauseCredit);
    const pauseDeadline = new Date(pauseStartedAt.getTime() + securityRecheckTimeoutMs(assessment));
    if (pauseDeadline < deadline) deadline = pauseDeadline;
  }

  // A stored null is "not completed" (as in the controller), not the epoch.
  const manuallyCompletedAt = assessment.manuallyCompletedAt ? validDate(assessment.manuallyCompletedAt) : null;
  if (manuallyCompletedAt && manuallyCompletedAt < deadline) deadline = manuallyCompletedAt;
  return deadline;
}

const DEFAULT_SUBMIT_GRACE_MS = 15000;

/**
 * Network grace after an attempt's deadline. Clients auto-submit exactly at
 * time-up, so their final write always reaches the server slightly late.
 * Writes inside the grace still count; recorded submit times stay capped at
 * the real deadline. An administrator's manual completion has no grace.
 */
export function getAssessmentSubmitGraceMs(assessment = {}) {
  if (assessment?.manuallyCompletedAt) return 0;
  const raw = process.env.ASSESSMENT_SUBMIT_GRACE_MS;
  const configured = raw === undefined || raw === '' ? DEFAULT_SUBMIT_GRACE_MS : Number(raw);
  return Number.isFinite(configured) && configured > 0 ? Math.min(Math.floor(configured), 120000) : 0;
}

export function isAssessmentAttemptExpired(assessment = {}, submission = {}, now = new Date()) {
  if (submission.status !== 'in_progress') return false;
  const deadline = getAssessmentAttemptDeadline(assessment, submission);
  const current = validDate(now);
  // The sweeper must not close an attempt before the client's final write,
  // which the save path accepts until the same grace has elapsed.
  return Boolean(deadline && current
    && current.getTime() >= deadline.getTime() + getAssessmentSubmitGraceMs(assessment));
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

