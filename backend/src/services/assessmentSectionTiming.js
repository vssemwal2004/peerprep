import { isDeepStrictEqual } from 'node:util';
import { getAssessmentSubmitGraceMs, SECURITY_PAUSE_CREDIT_CAP_MS } from './assessmentExpiryPolicy.js';

export function getActiveAssessmentElapsedMs(submission = {}, now = new Date()) {
  if (!submission.startedAt) return 0;
  const current = new Date(now).getTime();
  const start = new Date(submission.startedAt).getTime();
  const paused = Math.max(0, Number(submission.pausedDurationMs) || 0);
  const activePause = submission.pauseStartedAt
    ? Math.max(0, current - new Date(submission.pauseStartedAt).getTime())
    : 0;
  const pauseCredit = submission.securityPauseReason === 'tab_switch'
    ? Math.min(activePause, SECURITY_PAUSE_CREDIT_CAP_MS)
    : activePause;
  return Math.max(0, current - start - paused - pauseCredit);
}

export function getAssessmentSectionLimitMs(settings = {}, section = {}) {
  const minutes = Number(section.timeLimitMinutes);
  return settings.sectionWiseLock && Number.isInteger(minutes) && minutes > 0 ? minutes * 60000 : 0;
}

export function getAssessmentSectionStartMs(submission, sectionIndex) {
  const start = submission.sectionTimeStarts?.[sectionIndex];
  return Number.isSafeInteger(start) && start >= 0 ? start : null;
}

export function getAssessmentSectionEndMs(settings, section, submission, sectionIndex) {
  const limit = getAssessmentSectionLimitMs(settings, section);
  const start = getAssessmentSectionStartMs(submission, sectionIndex);
  return !limit || start === null ? null : start + limit;
}

export function isAssessmentSectionOpen(settings, section, submission, sectionIndex, now) {
  if (!getAssessmentSectionLimitMs(settings, section)) return true;
  const start = getAssessmentSectionStartMs(submission, sectionIndex);
  const elapsed = getActiveAssessmentElapsedMs(submission, now);
  const end = getAssessmentSectionEndMs(settings, section, submission, sectionIndex);
  return start !== null && elapsed >= start && elapsed < end;
}

export function assessmentSectionClock(submission, now) {
  return {
    sectionTimeStarts: submission.sectionTimeStarts || {},
    elapsedActiveMs: getActiveAssessmentElapsedMs(submission, now),
  };
}

export function filterTimedAssessmentAnswerChanges(assessment, submission, incoming, now) {
  const { settings = {}, sections = [] } = assessment;
  if (!settings.sectionWiseLock || !sections.some((section) => getAssessmentSectionLimitMs(settings, section))) {
    return { answers: incoming, ignoredSectionIndexes: [] };
  }
  const elapsed = getActiveAssessmentElapsedMs(submission, now);
  const grace = getAssessmentSubmitGraceMs(assessment);
  const ignoredSectionIndexes = new Set();
  const saved = new Map((submission.answers || []).map((answer) => [`${answer.sectionIndex}-${answer.questionIndex}`, answer]));
  const answers = incoming.filter((answer) => {
    const { sectionIndex, questionIndex } = answer;
    const section = sections[sectionIndex];
    if (!getAssessmentSectionLimitMs(settings, section)) return true;
    const start = getAssessmentSectionStartMs(submission, sectionIndex);
    const end = getAssessmentSectionEndMs(settings, section, submission, sectionIndex);
    if (start !== null && elapsed >= start && elapsed <= end + grace) return true;
    const previous = saved.get(`${sectionIndex}-${questionIndex}`);
    const hasChanged = ['answer', 'code', 'language'].some((key) => (
      Object.hasOwn(answer, key) && !isDeepStrictEqual(answer[key], previous?.[key])
    ));
    if (hasChanged) ignoredSectionIndexes.add(sectionIndex);
    return false;
  });
  return { answers, ignoredSectionIndexes: [...ignoredSectionIndexes] };
}
