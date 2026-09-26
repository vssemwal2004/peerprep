import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

// Explicitly disable external storage. These are validation-only tests.
process.env.SUPABASE_URL = '';
process.env.ASSESSMENT_EVIDENCE_BUCKET = '';
process.env.ASSESSMENT_EVIDENCE_SIGNING_SECRET = 'isolated-test-only-evidence-secret';
const { normalizeLegacyEvidence, createAssessmentEvidenceUpload, verifyAssessmentEvidenceUpload } = await import('../src/services/assessmentEvidenceService.js');

test('legacy evidence accepts bounded raster data only, including invalid size config fallback', () => {
  assert.equal(normalizeLegacyEvidence('data:image/jpeg;base64,YQ=='), 'data:image/jpeg;base64,YQ==');
  for (const value of ['https://untrusted.test/file', 'data:image/svg+xml;base64,YQ==', 'data:text/html;base64,YQ==', {}]) {
    assert.throws(() => normalizeLegacyEvidence(value), { code: 'INVALID_EVIDENCE' });
  }
  process.env.ASSESSMENT_EVIDENCE_MAX_BYTES = 'not-a-number';
  assert.throws(() => normalizeLegacyEvidence(`data:image/jpeg;base64,${'A'.repeat(2 * 1024 * 1024)}`), { code: 'INVALID_EVIDENCE' });
  delete process.env.ASSESSMENT_EVIDENCE_MAX_BYTES;
});
test('unconfigured direct upload returns explicit disabled capability without networking', async () => {
  assert.deepEqual(await createAssessmentEvidenceUpload({}, {}), { enabled: false });
});
test('evidence token is scoped to owner, attempt generation, object and audience before storage lookup', async () => {
  const doc = { _id: 'attempt-a', studentId: 'student-a', attemptGeneration: 2 };
  const claims = { kind: 'assessment-evidence', objectKey: 'approved/image.jpg', submissionId: 'attempt-a', studentId: 'student-a', generation: 2 };
  const token = (extra = {}, audience = 'assessment-evidence') => jwt.sign({ ...claims, ...extra }, process.env.ASSESSMENT_EVIDENCE_SIGNING_SECRET, { algorithm: 'HS256', expiresIn: 60, audience });
  for (const extra of [{ studentId: 'student-b' }, { generation: 1 }, { submissionId: 'other' }, { objectKey: 'different/image.jpg' }]) {
    await assert.rejects(verifyAssessmentEvidenceUpload(doc, { objectKey: claims.objectKey, uploadToken: token(extra) }), { code: 'INVALID_EVIDENCE_OWNER' });
  }
  await assert.rejects(verifyAssessmentEvidenceUpload(doc, { objectKey: claims.objectKey, uploadToken: token({}, 'wrong') }), { code: 'INVALID_EVIDENCE_TOKEN' });
  await assert.rejects(verifyAssessmentEvidenceUpload(doc, { objectKey: claims.objectKey, uploadToken: token() }), { code: 'EVIDENCE_NOT_CONFIGURED' });
});
