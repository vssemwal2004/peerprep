import assert from 'node:assert/strict';
import test from 'node:test';
import { __studentAnalysisTestHooks } from '../src/controllers/studentAnalysisController.js';

const { redactSensitiveAnalytics, SENSITIVE_ANALYTICS_KEYS } = __studentAnalysisTestHooks;

test('student analysis redaction removes hidden proctoring fields deeply', () => {
  const payload = {
    overview: { readinessScore: 72 },
    assessments: {
      integrityScore: 81,
      proctoring: { tabSwitches: 2 },
      violationLog: [{ type: 'hidden' }],
      lastIp: '10.0.0.1',
      nested: {
        monitoringEvents: [{ frame: 'hidden' }],
        safe: 'visible',
      },
      recentAttempts: [
        {
          value: 80,
          proctoringSnapshots: [{ image: 'hidden' }],
          lastUserAgent: 'secret',
        },
      ],
    },
  };

  const clean = redactSensitiveAnalytics(payload);

  assert.equal(clean.overview.readinessScore, 72);
  assert.equal(clean.assessments.integrityScore, 81);
  assert.deepEqual(clean.assessments.proctoring, { tabSwitches: 2 });
  assert.equal(clean.assessments.nested.safe, 'visible');
  assert.equal(clean.assessments.violationLog, undefined);
  assert.equal(clean.assessments.lastIp, undefined);
  assert.equal(clean.assessments.nested.monitoringEvents, undefined);
  assert.equal(clean.assessments.recentAttempts[0].proctoringSnapshots, undefined);
  assert.equal(clean.assessments.recentAttempts[0].lastUserAgent, undefined);
});

test('student analysis sensitive-key allowlist covers known hidden fields', () => {
  [
    'violationLog',
    'violations',
    'monitoringEvents',
    'proctoringSnapshots',
    'lastIp',
    'lastUserAgent',
    'securityHeartbeat',
    'snapshot',
    'snapshots',
  ].forEach((key) => {
    assert.equal(SENSITIVE_ANALYTICS_KEYS.has(key), true, `${key} should be redacted`);
  });
});

test('student analysis redaction preserves dates and removes internal identifiers', () => {
  const generatedAt = new Date('2026-08-20T10:00:00.000Z');
  const clean = redactSensitiveAnalytics({
    _id: 'internal',
    studentId: 'internal-student',
    generatedAt,
    evidence: { latestEvidenceAt: generatedAt },
  });

  assert.equal(clean._id, undefined);
  assert.equal(clean.studentId, undefined);
  assert.equal(clean.generatedAt, generatedAt);
  assert.equal(clean.evidence.latestEvidenceAt, generatedAt);
  assert.equal(JSON.stringify(clean).includes('2026-08-20T10:00:00.000Z'), true);
});
