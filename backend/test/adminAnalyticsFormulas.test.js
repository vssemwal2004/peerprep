import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessmentMetrics, codingMetrics, combinedScore, consistencyScore,
  FORMULA_VERSION, learningMetrics, percentage,
} from '../src/modules/adminAnalytics/analyticsFormulas.js';

test('analytics percentages preserve missing denominators instead of fabricating zero', () => {
  assert.equal(percentage(0, 0), null);
  assert.equal(percentage(0, 10), 0);
  assert.equal(consistencyScore(3, 10), 30);
});

test('coding and learning evidence thresholds are versioned and deterministic', () => {
  assert.match(FORMULA_VERSION, /^admin-analytics-v2\./);
  assert.equal(codingMetrics({ attempts: 3, distinctProblems: 1, eligibleProblems: 5 }).sufficientEvidence, false);
  assert.equal(codingMetrics({ attempts: 4, distinctProblems: 1, eligibleProblems: 5 }).sufficientEvidence, true);
  assert.equal(codingMetrics({ attempts: 0, eligibleProblems: 5 }).mastery, null);
  assert.equal(learningMetrics({ eligibleTopics: 3, completedTopics: 0 }).sufficientEvidence, true);
  assert.equal(learningMetrics({ eligibleTopics: 3, completedTopics: 0 }).completionRate, 0);
});

test('assessment scoring rejects invalid evaluation and max marks while preserving negative marking', () => {
  const metrics = assessmentMetrics([
    { studentId: 'a', status: 'submitted', evaluationStatus: 'completed', score: 8, maxMarks: 10 },
    { studentId: 'a', status: 'expired', evaluationStatus: 'completed', score: -1, maxMarks: 10 },
    { studentId: 'b', status: 'submitted', evaluationStatus: 'processing', score: 10, maxMarks: 10 },
    { studentId: 'b', status: 'submitted', evaluationStatus: 'completed', score: 4, maxMarks: 0 },
  ]);
  assert.equal(metrics.completedAttempts, 2);
  assert.equal(metrics.normalizedScore, 35);
  assert.equal(metrics.medianStudentPercentage, 35);
  assert.equal(metrics.medianAttemptPercentage, 35);
});

test('combined score renormalizes available weights and requires explicit sufficient evidence', () => {
  const score = combinedScore({
    coding: { value: 80, sufficientEvidence: true },
    assessment: { value: 60, sufficientEvidence: true },
    learning: { value: 100 },
  });
  assert.equal(score.value, 70.77);
  assert.equal(score.label, 'Overall');
  assert.equal(score.sourceFamilies, 2);

  const sourceOnly = combinedScore({
    coding: { value: 80, sufficientEvidence: true },
    consistency: { value: 100, sufficientEvidence: true },
  });
  assert.equal(sourceOnly.isOverall, false);
  assert.equal(sourceOnly.label, 'coding + consistency');
  assert.equal(sourceOnly.sourceFamilies, 1);
});
