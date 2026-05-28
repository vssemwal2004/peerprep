import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAiProctoringViolationToSummary,
  calculateAiProctoringRiskLevel,
  getAiProctoringDefaultWeight,
  isAiProctoringViolation,
} from '../src/modules/assessment/proctoring/proctoring.rules.js';

test('AI proctoring violation type allowlist accepts only AI events', () => {
  assert.equal(isAiProctoringViolation('ai_mobile_detected'), true);
  assert.equal(isAiProctoringViolation('ai_multiple_persons'), true);
  assert.equal(isAiProctoringViolation('tab_switch'), false);
  assert.equal(isAiProctoringViolation('ai_unknown_event'), false);
});

test('AI proctoring summary updates counters and risk level', () => {
  const first = applyAiProctoringViolationToSummary({}, 'ai_no_face', new Date('2026-01-01T00:00:00.000Z'));
  assert.equal(first.totalViolations, 1);
  assert.equal(first.noFace, 1);
  assert.equal(first.riskLevel, 'low');

  const second = applyAiProctoringViolationToSummary(first, 'ai_mobile_detected', new Date('2026-01-01T00:00:02.000Z'));
  assert.equal(second.totalViolations, 2);
  assert.equal(second.mobileDetected, 1);
  assert.equal(second.riskLevel, 'medium');
});

test('AI proctoring risk escalates by count and critical event type', () => {
  assert.equal(calculateAiProctoringRiskLevel({ totalViolations: 0 }), 'clean');
  assert.equal(calculateAiProctoringRiskLevel({ totalViolations: 4 }), 'medium');
  assert.equal(calculateAiProctoringRiskLevel({ totalViolations: 7 }), 'high');
  assert.equal(calculateAiProctoringRiskLevel({ totalViolations: 10 }), 'critical');
  assert.equal(calculateAiProctoringRiskLevel({ totalViolations: 1, cameraBlocked: 1 }), 'high');
});

test('AI proctoring default weights are available for scoring', () => {
  assert.equal(getAiProctoringDefaultWeight('ai_no_face'), 5);
  assert.equal(getAiProctoringDefaultWeight('ai_mobile_detected'), 15);
  assert.equal(getAiProctoringDefaultWeight('tab_switch'), null);
});
