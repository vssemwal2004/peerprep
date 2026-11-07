// One canonical definition of "how many candidates attempted / finished / passed
// an assessment". Pure functions only (no DB access) so every report surface -
// assessment list, live roster, stored summaries, report and export summaries -
// can share it and be unit tested. Mongo-side counterparts live in
// assessmentReportSummaryService.attemptTallyFields and MUST mirror these rules.
//
// Buckets (a candidate is in exactly one):
//   notStarted : no submission document, or status 'not_started'
//                (also any unknown status - never counted as a start)
//   inProgress : status 'in_progress'
//   finished   : status submitted | expired | violation | incomplete
//   started    = inProgress + finished
// Graded: status submitted|violation|expired, evaluation completed and a numeric
// score. Scores, averages and pass decisions use graded attempts only.

export const DEFAULT_PASS_PERCENTAGE = 40;
export const TERMINAL_STATUSES = Object.freeze(['submitted', 'violation', 'expired']);
export const FINISHED_STATUSES = Object.freeze(['submitted', 'expired', 'violation', 'incomplete']);
export const ATTEMPT_BUCKETS = Object.freeze({ NOT_STARTED: 'notStarted', IN_PROGRESS: 'inProgress', FINISHED: 'finished' });

const finiteOrNull = (value) => (value !== null && value !== '' && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null);
const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;

/** assessment.settings.passPercentage when set (clamped 0..100), else 40. */
export function passPercentageOf(settings = {}) {
  const configured = finiteOrNull(settings?.passPercentage);
  return configured === null ? DEFAULT_PASS_PERCENTAGE : Math.min(100, Math.max(0, configured));
}

export function attemptBucketOf(status) {
  if (status === 'in_progress') return ATTEMPT_BUCKETS.IN_PROGRESS;
  if (FINISHED_STATUSES.includes(status)) return ATTEMPT_BUCKETS.FINISHED;
  return ATTEMPT_BUCKETS.NOT_STARTED;
}

/** Terminal status + completed evaluation + numeric score (same rule as the roster). */
export function isGraded(row) {
  return TERMINAL_STATUSES.includes(row?.status)
    && (row.evaluationStatus ?? 'completed') === 'completed'
    && typeof row.score === 'number' && Number.isFinite(row.score);
}

/** Score as a 0-100 percentage rounded to 2 decimals; null without a positive max. */
export function percentOf(score, maxMarks) {
  const max = finiteOrNull(maxMarks);
  if (!Number.isFinite(score) || max === null || max <= 0) return null;
  return round2(Math.min(100, Math.max(0, (score / max) * 100)));
}

export function emptyTally() {
  return {
    docs: 0, inProgress: 0, finished: 0, submitted: 0, expired: 0, violation: 0, incomplete: 0,
    graded: 0, evaluating: 0, failedEvaluation: 0, passed: 0, late: 0,
    scoreSum: 0, minScore: null, maxScore: null, pctSum: 0, pctCount: 0, minPct: null, maxPct: null,
  };
}

const rank = (row) => ({ [ATTEMPT_BUCKETS.NOT_STARTED]: 0, [ATTEMPT_BUCKETS.IN_PROGRESS]: 1, [ATTEMPT_BUCKETS.FINISHED]: 2 })[attemptBucketOf(row?.status)];

/**
 * Adds one attempt row to a tally. Per-row `passPercentage` / `totalMarks`
 * override the options (rows of several assessments in one tally).
 */
export function addToTally(tally, row, { passPercentage = DEFAULT_PASS_PERCENTAGE, totalMarks = null } = {}) {
  const status = row?.status || 'not_started';
  const bucket = attemptBucketOf(status);
  tally.docs += 1;
  if (bucket === ATTEMPT_BUCKETS.IN_PROGRESS) tally.inProgress += 1;
  if (bucket === ATTEMPT_BUCKETS.FINISHED) {
    tally.finished += 1;
    if (row.isLate) tally.late += 1;
    if (status === 'submitted') tally.submitted += 1;
    if (status === 'expired') tally.expired += 1;
    if (status === 'violation') tally.violation += 1;
    if (status === 'incomplete') tally.incomplete += 1;
  }
  if (TERMINAL_STATUSES.includes(status)) {
    if (row.evaluationStatus === 'processing') tally.evaluating += 1;
    if (row.evaluationStatus === 'failed') tally.failedEvaluation += 1;
  }
  if (!isGraded({ ...row, status })) return tally;
  tally.graded += 1;
  tally.scoreSum += row.score;
  tally.minScore = tally.minScore === null ? row.score : Math.min(tally.minScore, row.score);
  tally.maxScore = tally.maxScore === null ? row.score : Math.max(tally.maxScore, row.score);
  const percentage = percentOf(row.score, finiteOrNull(row.maxMarks) ?? finiteOrNull(row.totalMarks) ?? totalMarks);
  if (percentage === null) return tally;
  tally.pctSum += percentage;
  tally.pctCount += 1;
  tally.minPct = tally.minPct === null ? percentage : Math.min(tally.minPct, percentage);
  tally.maxPct = tally.maxPct === null ? percentage : Math.max(tally.maxPct, percentage);
  if (percentage >= (finiteOrNull(row.passPercentage) ?? passPercentage)) tally.passed += 1;
  return tally;
}

/**
 * Turns a tally (from addToTally or the Mongo group) into the canonical counts.
 * `assignedCount` = candidates known from the assignment who may have no
 * submission document at all. attempted students are assumed to be a subset of
 * the assignment (submissions are only created for assigned students), so
 * candidates = max(students with a document, assignedCount). Without
 * `assignedCount` (pure aggregations) candidates = students with a document and
 * assigned-but-never-opened students are NOT included.
 */
export function finalizeCounts(tally, { assignedCount = 0, passPercentage = null } = {}) {
  const candidates = Math.max(tally.docs, Math.max(0, Number(assignedCount) || 0));
  const started = tally.inProgress + tally.finished;
  const graded = tally.graded;
  return {
    candidates,
    started,
    notStarted: candidates - started,
    inProgress: tally.inProgress,
    finished: tally.finished,
    submitted: tally.submitted,
    expired: tally.expired,
    violation: tally.violation,
    incomplete: tally.incomplete,
    graded,
    evaluating: tally.evaluating,
    failedEvaluation: tally.failedEvaluation,
    passed: tally.passed,
    failed: graded - tally.passed,
    passRate: graded ? round1((tally.passed / graded) * 100) : null,
    avgScore: graded ? round2(tally.scoreSum / graded) : null,
    minScore: graded ? tally.minScore : null,
    maxScore: graded ? tally.maxScore : null,
    avgPercentage: tally.pctCount ? round1(tally.pctSum / tally.pctCount) : null,
    minPercentage: tally.pctCount ? round1(tally.minPct) : null,
    maxPercentage: tally.pctCount ? round1(tally.maxPct) : null,
    late: tally.late,
    passPercentage,
  };
}

/**
 * rows: plain attempt rows { studentId?, assessmentId?, status, evaluationStatus, score, maxMarks, isLate }.
 * Rows of one student collapse to the furthest-along row (roster deltas, retries).
 * Options: passPercentage (default 40), totalMarks (max-marks fallback), assignedCount.
 */
export function summarizeAttempts(rows = [], { passPercentage = DEFAULT_PASS_PERCENTAGE, totalMarks = null, assignedCount = 0 } = {}) {
  const byStudent = new Map();
  rows.forEach((row, index) => {
    if (!row) return;
    const key = row.studentId === undefined || row.studentId === null ? `row:${index}` : `${row.assessmentId ?? ''}:${row.studentId}`;
    const current = byStudent.get(key);
    if (!current || rank(row) >= rank(current)) byStudent.set(key, row);
  });
  const tally = emptyTally();
  for (const row of byStudent.values()) addToTally(tally, row, { passPercentage, totalMarks });
  return finalizeCounts(tally, { assignedCount, passPercentage });
}

/** Assigned candidates of an assessment: explicit list, else every eligible student for 'all'. */
export function assignedCountOf(assessment = {}, eligibleStudentCount = 0) {
  const assigned = new Set((assessment.assignedStudents || []).map((id) => String(id?._id || id))).size;
  return assessment.targetType === 'all' && !assigned ? Math.max(0, Number(eligibleStudentCount) || 0) : assigned;
}

/**
 * Flat response fields for a counts object. Legacy names keep working but now
 * use the canonical meaning: submissionCount = started, completedCount =
 * finished, passCount/failCount = canonical passed/failed.
 */
export function attemptCountFields(counts) {
  return {
    candidateCount: counts.candidates,
    startedCount: counts.started,
    inProgressCount: counts.inProgress,
    finishedCount: counts.finished,
    submittedCount: counts.submitted,
    expiredCount: counts.expired,
    violationStatusCount: counts.violation,
    incompleteCount: counts.incomplete,
    notStartedCount: counts.notStarted,
    gradedCount: counts.graded,
    passedCount: counts.passed,
    failedCount: counts.failed,
    submissionCount: counts.started,
    completedCount: counts.finished,
    passCount: counts.passed,
    failCount: counts.failed,
    pendingEvaluationCount: counts.evaluating,
    failedEvaluationCount: counts.failedEvaluation,
  };
}
