import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Fake credentials: nothing here talks to Cloudinary; every URL is only signed locally.
process.env.CLOUDINARY_CLOUD_NAME = 'demo-cloud';
process.env.CLOUDINARY_API_KEY = 'test-key';
process.env.CLOUDINARY_API_SECRET = 'test-secret';
process.env.ASSESSMENT_EVIDENCE_STORAGE = '';
process.env.ASSESSMENT_EVIDENCE_SIGNING_SECRET = 'isolated-test-only-evidence-secret';
const {
  evidenceProvider, cloudinaryEvidencePrefix, createAssessmentEvidenceUpload, verifyAssessmentEvidenceUpload, signAssessmentEvidenceRead,
} = await import('../src/services/assessmentEvidenceService.js');

const doc = { _id: 'submission-1', assessmentId: 'assessment-1', studentId: 'student-1', attemptGeneration: 2 };
const sha1 = (value) => createHash('sha1').update(value).digest('hex');

test('Cloudinary is the default evidence store when it is configured', () => {
  assert.equal(evidenceProvider(), 'cloudinary');
  assert.equal(cloudinaryEvidencePrefix('assessment-1'), 'peerprep/assessment-evidence/platform/assessment-1/');
  assert.equal(cloudinaryEvidencePrefix('assessment-1', 'submission-1'), 'peerprep/assessment-evidence/platform/assessment-1/submission-1/');
});

test('upload is a signed private POST under the attempt prefix', async () => {
  const upload = await createAssessmentEvidenceUpload(doc, { contentType: 'image/jpeg', sizeBytes: 30_000 });
  assert.equal(upload.provider, 'cloudinary');
  assert.equal(upload.method, 'POST');
  assert.equal(upload.uploadUrl, 'https://api.cloudinary.com/v1_1/demo-cloud/image/upload');
  const { api_key: apiKey, signature, ...signed } = upload.fields;
  assert.equal(apiKey, 'test-key');
  assert.equal(signed.type, 'authenticated');
  assert.match(signed.public_id, /^peerprep\/assessment-evidence\/platform\/assessment-1\/submission-1\/2\/[0-9a-f-]{36}$/);
  assert.equal(upload.objectKey, `cld:${signed.public_id}`);
  const toSign = Object.keys(signed).sort().map((key) => `${key}=${signed[key]}`).join('&');
  assert.equal(signature, sha1(`${toSign}test-secret`));
});

test('evidence is accepted only with the upload response signature Cloudinary would return', async () => {
  const upload = await createAssessmentEvidenceUpload(doc, { contentType: 'image/jpeg', sizeBytes: 30_000 });
  const publicId = upload.fields.public_id;
  const version = 1730000000;
  const snapshot = { objectKey: upload.objectKey, uploadToken: upload.uploadToken, version };
  assert.equal(
    await verifyAssessmentEvidenceUpload(doc, { ...snapshot, signature: sha1(`public_id=${publicId}&version=${version}test-secret`) }),
    upload.objectKey,
  );
  for (const signature of [undefined, 'forged', sha1(`public_id=${publicId}&version=${version + 1}test-secret`)]) {
    await assert.rejects(verifyAssessmentEvidenceUpload(doc, { ...snapshot, signature }), { code: 'EVIDENCE_NOT_UPLOADED' });
  }
});

test('reading evidence returns a short-lived private download link', async () => {
  const before = Math.floor(Date.now() / 1000);
  const url = new URL(await signAssessmentEvidenceRead('cld:peerprep/assessment-evidence/platform/assessment-1/submission-1/2/x'));
  assert.equal(url.origin + url.pathname, 'https://api.cloudinary.com/v1_1/demo-cloud/image/download');
  assert.equal(url.searchParams.get('type'), 'authenticated');
  assert.equal(url.searchParams.get('public_id'), 'peerprep/assessment-evidence/platform/assessment-1/submission-1/2/x');
  const expiresAt = Number(url.searchParams.get('expires_at'));
  assert.ok(expiresAt >= before + 120 && expiresAt <= before + 125);
});
