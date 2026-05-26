import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANALYTICS_CONTRACT_VERSION,
  ANALYTICS_SCORE_MODEL,
  __analyticsTestHooks,
  buildReadinessReport,
} from '../src/services/analyticsEngine.js';

const {
  computeAssessmentPenalty,
  computeAssessmentIntegrity,
  computeAssessmentViolationCount,
  computeSecurityRisk,
  computeDerivedScores,
} = __analyticsTestHooks;

test('analytics score model exposes a versioned startup contract', () => {
  assert.equal(ANALYTICS_CONTRACT_VERSION, '2026.05.startup-readiness-v1');
  assert.equal(ANALYTICS_SCORE_MODEL.safety.studentVisibleSecurityAggregatesOnly, true);
});

test('assessment penalties include proctoring events and cap at the model maximum', () => {
  const penalty = computeAssessmentPenalty({
    status: 'violation',
    tabSwitches: 4,
    fullscreenExits: 2,
    copyPasteCount: 3,
    cameraFlags: 2,
    pauseCount: 1,
    violationScore: 4,
  });

  assert.equal(penalty, 40);
  assert.equal(computeAssessmentIntegrity({ status: 'violation', tabSwitches: 99 }), 60);
});

test('assessment violation count uses aggregate warning counts only', () => {
  assert.equal(computeAssessmentViolationCount({
    tabSwitches: 2,
    fullscreenExits: 1,
    copyPasteCount: 3,
    cameraFlags: 4,
    violationLog: [{ hidden: true }],
  }), 10);
});

test('security risk levels follow integrity and violation-rate thresholds', () => {
  assert.equal(computeSecurityRisk(90, 0), 'low');
  assert.equal(computeSecurityRisk(77, 0), 'medium');
  assert.equal(computeSecurityRisk(90, 20), 'medium');
  assert.equal(computeSecurityRisk(54, 0), 'high');
  assert.equal(computeSecurityRisk(90, 45), 'high');
});

test('derived readiness uses adjusted assessment score and integrity signal', () => {
  const clean = computeDerivedScores({
    weeklyActiveDays: 5,
    streak: 4,
    attempts: 20,
    assessments: 3,
    completedTopics: 6,
    problemAccuracy: 80,
    assessmentScore: 82,
    assessmentIntegrityScore: 100,
    assessmentViolationRate: 0,
    interviewScore: 75,
    learningCompletion: 70,
    progress: [{ value: 70 }, { value: 82 }],
  });

  const flagged = computeDerivedScores({
    weeklyActiveDays: 5,
    streak: 4,
    attempts: 20,
    assessments: 3,
    completedTopics: 6,
    problemAccuracy: 80,
    assessmentScore: 82,
    assessmentIntegrityScore: 55,
    assessmentViolationRate: 45,
    interviewScore: 75,
    learningCompletion: 70,
    progress: [{ value: 70 }, { value: 82 }],
  });

  assert.equal(clean.contractVersion, ANALYTICS_CONTRACT_VERSION);
  assert.ok(clean.readinessScore > flagged.readinessScore);
  assert.equal(flagged.riskLevel, 'high');
});

test('company readiness applies benchmark gaps and integrity penalty', () => {
  const analysis = {
    problems: {
      accuracy: 62,
      attempts: 30,
      topics: [{ topic: 'HashMap', accuracy: 52, attempts: 8 }],
    },
    derived: { consistencyScore: 64 },
    interviews: { avgScore: 58 },
    assessments: {
      adjustedAvgScore: 74,
      avgScore: 84,
      integrityScore: 70,
    },
    consistency: { currentStreak: 2 },
  };
  const benchmark = {
    companyName: 'Startup Ready Co',
    dsaAccuracyRequired: 75,
    requiredTopics: ['HashMap', 'Graph'],
    minQuestionAttempts: 40,
    minStreak: 5,
    interviewScore: 70,
    weightDsa: 0.5,
    weightConsistency: 0.2,
    weightInterview: 0.3,
  };

  const report = buildReadinessReport(analysis, benchmark);

  assert.equal(report.contractVersion, ANALYTICS_CONTRACT_VERSION);
  assert.equal(report.breakdown.assessment, 74);
  assert.equal(report.breakdown.integrity, 70);
  assert.ok(report.readinessScore < 70);
  assert.ok(report.gapAnalysis.some((gap) => gap.type === 'Assessment Integrity'));
  assert.ok(report.topicFeedback.some((item) => item.topic === 'Graph'));
  assert.ok(report.actionPlan.some((item) => item.includes('zero tab switches')));
  assert.ok(report.explanations.length >= 2);
});
