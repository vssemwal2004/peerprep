export const FORMULA_VERSION = 'admin-analytics-v2.1';

export const OVERALL_WEIGHTS = Object.freeze({
  coding: 0.35,
  assessment: 0.30,
  learning: 0.20,
  consistency: 0.15,
});

export const MINIMUM_EVIDENCE = Object.freeze({
  codingTerminalAttempts: 4,
  codingDistinctProblems: 2,
  assessmentCompleted: 1,
  learningEligibleTopics: 3,
  learningCompletedTopicsWithEngagement: 1,
  overallSourceFamilies: 2,
});

export function roundMetric(value, precision = 2) {
  if (!Number.isFinite(Number(value))) return null;
  const scale = 10 ** precision;
  return Math.round(Number(value) * scale) / scale;
}

export function percentage(numerator, denominator) {
  const top = Number(numerator);
  const bottom = Number(denominator);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= 0) return null;
  return roundMetric((top / bottom) * 100);
}

export function codingMetrics({ attempts = 0, acceptedAttempts = 0, distinctProblems = 0, solvedProblems = 0, eligibleProblems = 0 } = {}) {
  const sufficientEvidence = attempts >= MINIMUM_EVIDENCE.codingTerminalAttempts
    || distinctProblems >= MINIMUM_EVIDENCE.codingDistinctProblems;
  return {
    attempts,
    acceptedAttempts,
    distinctProblems,
    solvedProblems,
    eligibleProblems,
    acceptanceRate: percentage(acceptedAttempts, attempts),
    mastery: attempts > 0 ? percentage(solvedProblems, eligibleProblems) : null,
    sufficientEvidence,
  };
}

export function assessmentMetrics(attempts = []) {
  const valid = attempts.filter((row) => {
    const terminal = row?.status === undefined || ['submitted', 'violation', 'expired'].includes(row.status);
    const evaluated = row?.evaluationStatus === undefined || row.evaluationStatus === 'completed';
    return terminal && evaluated && Number(row?.maxMarks) > 0 && Number.isFinite(Number(row?.score));
  });
  const score = valid.reduce((sum, row) => sum + Number(row.score), 0);
  const maxMarks = valid.reduce((sum, row) => sum + Number(row.maxMarks), 0);
  const attemptPercentages = valid
    .map((row) => percentage(row.score, row.maxMarks))
    .filter((value) => value !== null)
    .sort((left, right) => left - right);
  const middle = Math.floor(attemptPercentages.length / 2);
  const medianAttempt = attemptPercentages.length === 0
    ? null
    : (attemptPercentages.length % 2 ? attemptPercentages[middle] : roundMetric((attemptPercentages[middle - 1] + attemptPercentages[middle]) / 2));
  const grouped = new Map();
  valid.forEach((row) => {
    if (!row?.studentId) return;
    const key = String(row.studentId);
    const totals = grouped.get(key) || { score: 0, maxMarks: 0 };
    totals.score += Number(row.score);
    totals.maxMarks += Number(row.maxMarks);
    grouped.set(key, totals);
  });
  const studentPercentages = [...grouped.values()].map((row) => percentage(row.score, row.maxMarks)).sort((left, right) => left - right);
  const studentMiddle = Math.floor(studentPercentages.length / 2);
  const medianStudent = studentPercentages.length === 0 ? null : (studentPercentages.length % 2 ? studentPercentages[studentMiddle] : roundMetric((studentPercentages[studentMiddle - 1] + studentPercentages[studentMiddle]) / 2));
  return {
    completedAttempts: valid.length,
    score,
    maxMarks,
    normalizedScore: percentage(score, maxMarks),
    medianAttemptPercentage: medianAttempt,
    medianStudentPercentage: medianStudent,
    sufficientEvidence: valid.length >= MINIMUM_EVIDENCE.assessmentCompleted,
  };
}

export function learningMetrics({ eligibleTopics = 0, completedTopics = 0, engagedTopics = 0, watchedSeconds = 0 } = {}) {
  const sufficientEvidence = eligibleTopics >= MINIMUM_EVIDENCE.learningEligibleTopics
    || (completedTopics >= MINIMUM_EVIDENCE.learningCompletedTopicsWithEngagement && engagedTopics > 0);
  return {
    eligibleTopics,
    completedTopics,
    engagedTopics,
    watchedSeconds,
    completionRate: percentage(completedTopics, eligibleTopics),
    sufficientEvidence,
  };
}

export function consistencyScore(activeDays, availableDays) {
  return percentage(Math.min(Math.max(Number(activeDays) || 0, 0), Math.max(Number(availableDays) || 0, 0)), availableDays);
}

export function combinedScore(metrics = {}, { requireMinimumEvidence = true } = {}) {
  const eligible = [];
  for (const [key, weight] of Object.entries(OVERALL_WEIGHTS)) {
    const item = metrics[key];
    if (!item || item.value === null || !Number.isFinite(Number(item.value))) continue;
    if (requireMinimumEvidence && item.sufficientEvidence !== true) continue;
    eligible.push({ key, value: Number(item.value), weight });
  }
  const sourceFamilies = eligible.filter((item) => item.key !== 'consistency').length;
  const sourceComponent = eligible.find((item) => item.key !== 'consistency');
  const hasConsistency = eligible.some((item) => item.key === 'consistency');
  const availableWeight = eligible.reduce((sum, item) => sum + item.weight, 0);
  const value = availableWeight > 0 && sourceFamilies > 0
    ? roundMetric(eligible.reduce((sum, item) => sum + item.value * item.weight, 0) / availableWeight)
    : null;
  return {
    value,
    label: sourceFamilies >= MINIMUM_EVIDENCE.overallSourceFamilies
      ? 'Overall'
      : (sourceComponent ? `${sourceComponent.key}${hasConsistency ? ' + consistency' : ''}` : 'Unavailable'),
    isOverall: sourceFamilies >= MINIMUM_EVIDENCE.overallSourceFamilies,
    availableWeight: roundMetric(availableWeight, 4),
    sourceFamilies,
    components: eligible.map(({ key, value: componentValue, weight }) => ({ key, value: componentValue, weight })),
  };
}

export function buildFormulaMetadata() {
  return {
    version: FORMULA_VERSION,
    weights: OVERALL_WEIGHTS,
    minimumEvidence: MINIMUM_EVIDENCE,
    notes: {
      coding: 'Terminal submit jobs only; pending and running jobs are excluded.',
      assessment: 'Only terminal, evaluation-complete attempts with maxMarks > 0 are scored.',
      assessmentRange: 'Negative-mark scores are preserved by score/maxMarks; normalized results are not clamped.',
      learning: 'Completion is based on completed topic pairs; watch time alone is engagement.',
      overall: 'Weights are renormalized across sufficiently evidenced signals.',
    },
  };
}
