import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANALYTICS_CONTRACT_VERSION,
  ANALYTICS_EVIDENCE_VERSION,
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
  computeEvidenceQuality,
  normalizeAssessmentScore,
  toUtcDay,
  PREPARATION_ACTIVITY_TYPES,
} = __analyticsTestHooks;

test('analytics score model exposes a versioned startup contract', () => {
  assert.equal(ANALYTICS_CONTRACT_VERSION, '2026.08.evidence-readiness-v2');
  assert.equal(ANALYTICS_EVIDENCE_VERSION, '2026.08.evidence-v1');
  assert.equal(ANALYTICS_SCORE_MODEL.thresholds.topicMinimumAttempts, 4);
  assert.equal(ANALYTICS_SCORE_MODEL.safety.studentVisibleSecurityAggregatesOnly, true);
});

test('assessment points normalize to a comparable percentage and invalid maxima are excluded', () => {
  assert.equal(normalizeAssessmentScore(16, 20), 80);
  assert.equal(normalizeAssessmentScore(80, 100), 80);
  assert.equal(normalizeAssessmentScore(0, 20), 0);
  assert.equal(normalizeAssessmentScore(10, 0), null);
  assert.equal(normalizeAssessmentScore(10, null), null);
});

test('preparation consistency excludes login and scheduling noise', () => {
  assert.deepEqual(PREPARATION_ACTIVITY_TYPES, ['VIDEO_WATCH', 'TOPIC_COMPLETED']);
  assert.equal(PREPARATION_ACTIVITY_TYPES.includes('LOGIN'), false);
  assert.equal(PREPARATION_ACTIVITY_TYPES.includes('SESSION_SCHEDULED'), false);
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

test('explicit zero reliability is preserved and missing evidence produces no readiness', () => {
  const explicitZero = computeDerivedScores({
    weeklyActiveDays: 0,
    streak: 0,
    attempts: 1,
    assessments: 1,
    interviews: 0,
    completedTopics: 0,
    learningTopics: 0,
    problemAccuracy: 0,
    assessmentScore: 0,
    assessmentIntegrityScore: 0,
    assessmentViolationRate: 100,
    interviewScore: 0,
    learningCompletion: 0,
    progress: [{ value: 0 }],
    hasEvidence: true,
  });
  assert.equal(explicitZero.assessmentIntegrityScore, 0);
  assert.equal(explicitZero.riskLevel, 'high');
  assert.equal(typeof explicitZero.readinessScore, 'number');

  const empty = computeDerivedScores({
    weeklyActiveDays: 0,
    streak: 0,
    attempts: 0,
    assessments: 0,
    interviews: 0,
    completedTopics: 0,
    learningTopics: 0,
    problemAccuracy: 0,
    assessmentScore: null,
    assessmentIntegrityScore: null,
    assessmentViolationRate: 0,
    interviewScore: 0,
    learningCompletion: 0,
    progress: [],
    hasEvidence: false,
  });
  assert.equal(empty.readinessScore, null);
  assert.equal(empty.placementSignal, null);
  assert.equal(empty.assessmentIntegrityScore, null);
  assert.equal(empty.riskLevel, 'unknown');
});

test('evidence confidence is deterministic and separate from readiness', () => {
  const evidence = computeEvidenceQuality({
    problemMetrics: { attempts: 4, latestEvidenceAt: new Date('2026-08-19T12:00:00.000Z') },
    assessmentMetrics: { validScoreAttempts: 2, invalidScoreAttempts: 1, latestEvidenceAt: new Date('2026-08-18T12:00:00.000Z') },
    interviewMetrics: { total: 0 },
    learningMetrics: { totalTopics: 3, latestEvidenceAt: new Date('2026-08-10T12:00:00.000Z') },
    asOf: new Date('2026-08-20T12:00:00.000Z'),
  });
  assert.equal(evidence.hasEvidence, true);
  assert.deepEqual(evidence.observedSources, ['coding', 'assessments', 'learning']);
  assert.equal(evidence.coverageScore, 75);
  assert.equal(evidence.freshnessScore, 100);
  assert.equal(evidence.invalidAssessmentAttempts, 1);
  assert.equal(evidence.confidence.level, 'high');
  assert.equal(toUtcDay('2026-08-20T23:59:59.000Z').toISOString(), '2026-08-20T00:00:00.000Z');
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

test('company benchmark attainment changes when requirements become stricter', () => {
  const analysis = {
    evidence: { hasEvidence: true },
    problems: { accuracy: 70, attempts: 30, topics: [{ topic: 'Graph', accuracy: 70, attempts: 8 }] },
    derived: { consistencyScore: 70 },
    interviews: { avgScore: 70, total: 2 },
    assessments: { adjustedAvgScore: 70, avgScore: 70, integrityScore: null, validScoreAttempts: 1 },
    learning: { totalTopics: 2 },
    consistency: { currentStreak: 4 },
  };
  const base = { companyName: 'Target', requiredTopics: ['Graph'], weightDsa: 0.4, weightConsistency: 0.3, weightInterview: 0.3 };
  const easy = buildReadinessReport(analysis, { ...base, dsaAccuracyRequired: 60, minQuestionAttempts: 20, minStreak: 3, interviewScore: 60 });
  const strict = buildReadinessReport(analysis, { ...base, dsaAccuracyRequired: 90, minQuestionAttempts: 60, minStreak: 10, interviewScore: 90 });
  assert.ok(easy.readinessScore > strict.readinessScore);
});

test('company report does not turn no evidence into a positive score', () => {
  const report = buildReadinessReport({ evidence: { hasEvidence: false } }, { companyName: 'Target' });
  assert.equal(report.readinessScore, null);
  assert.equal(report.badge, 'Insufficient evidence');
  assert.equal(report.breakdown.integrity, null);
});
