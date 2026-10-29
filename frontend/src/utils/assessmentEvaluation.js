export const RESULT_NOT_ANNOUNCED = 'Result not announced yet';

const UNSUBMITTED_STATUSES = new Set(['not_started', 'in_progress']);

/**
 * Admin-facing evaluation label for a submitted attempt. Returns '' when the
 * score can be shown as-is. Attempts still being written never get a label:
 * their score cell simply reads "—".
 */
export function assessmentEvaluationLabel(report) {
  if (!report || UNSUBMITTED_STATUSES.has(report.status)) return '';
  if (report.evaluationStatus === 'processing') return 'Evaluating…';
  if (report.evaluationStatus === 'failed') return 'Needs review';
  return '';
}

/**
 * Student-facing gate: a result is announced only when the server has released
 * it, grading has finished and a score was actually sent. Anything else is shown
 * to the student as "Result not announced yet".
 */
export function isResultAnnounced(report) {
  if (!report?.permissions?.resultReleased) return false;
  if (['processing', 'failed'].includes(report.evaluationStatus)) return false;
  return report.score !== null && report.score !== undefined;
}
