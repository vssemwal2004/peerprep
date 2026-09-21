import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptAssessmentPassword, encryptAssessmentPassword } from '../src/services/assessmentPasswordService.js';

test('assessment invitation passwords are encrypted at rest and decrypt for delivery', () => {
  const previousSecret = process.env.ASSESSMENT_PASSWORD_SECRET;
  process.env.ASSESSMENT_PASSWORD_SECRET = 'test-only-assessment-password-secret';
  try {
    const encrypted = encryptAssessmentPassword('PeerPrep@2026');
    assert.notEqual(encrypted, 'PeerPrep@2026');
    assert.equal(encrypted.split('.').length, 3);
    assert.equal(decryptAssessmentPassword(encrypted), 'PeerPrep@2026');
  } finally {
    if (previousSecret === undefined) delete process.env.ASSESSMENT_PASSWORD_SECRET;
    else process.env.ASSESSMENT_PASSWORD_SECRET = previousSecret;
  }
});
