import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadAssessmentEvidence } from '../src/student/assessment/assessmentEvidenceUpload.js';

const canvas = { width: 200, height: 120, toBlob: (callback) => callback(new Blob(['jpeg'], { type: 'image/jpeg' })), toDataURL: () => 'data:image/jpeg;base64,AAAA' };

test('enabled upload sends bytes without API cookies and records only signed object reference', async () => {
  let uploadRequest;
  let record;
  await uploadAssessmentEvidence({ canvas, context: { sessionId: 'session' },
    requestUpload: async (body) => { assert.equal(body.contentType, 'image/jpeg'); assert.equal(body.sizeBytes, 4);
      return { enabled: true, uploadUrl: 'https://storage.example/evidence', objectKey: 'evidence/key', uploadToken: 'signed' }; },
    fetchUpload: async (url, options) => { uploadRequest = { url, options }; return { ok: true }; },
    recordEvidence: async (body) => { record = body; },
  });
  assert.equal(uploadRequest.options.credentials, 'omit');
  assert.equal(record.snapshot.dataUrl, undefined);
  assert.equal(record.snapshot.objectKey, 'evidence/key');
  assert.equal(record.snapshot.uploadToken, 'signed');
  assert.equal(record.sessionId, 'session');
});

test('failed direct upload never falls back to embedding bytes in MongoDB API', async () => {
  let recorded = false;
  await assert.rejects(uploadAssessmentEvidence({ canvas,
    requestUpload: async () => ({ enabled: true, uploadUrl: 'https://storage.example/evidence', objectKey: 'evidence/key', uploadToken: 'signed' }),
    fetchUpload: async () => ({ ok: false }), recordEvidence: async () => { recorded = true; },
  }), /upload failed/);
  assert.equal(recorded, false);
});

test('explicitly disabled object storage supports legacy capture transport', async () => {
  let record;
  await uploadAssessmentEvidence({ canvas, requestUpload: async () => ({ enabled: false }), recordEvidence: async (body) => { record = body; } });
  assert.equal(record.snapshot.dataUrl, 'data:image/jpeg;base64,AAAA');
});
