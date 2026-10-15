import assert from 'node:assert/strict';
import test from 'node:test';
import { mapImageStorageError, uploadCodingProblemAsset } from '../src/controllers/problemAssetController.js';

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('problem image upload requires a file', async () => {
  const res = responseRecorder();
  await uploadCodingProblemAsset({}, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /select an image/i);
});

test('problem image upload rejects files larger than 1 MB', async () => {
  const res = responseRecorder();
  await uploadCodingProblemAsset({ file: { size: (1024 * 1024) + 1, mimetype: 'image/png', buffer: Buffer.alloc(12) } }, res);
  assert.equal(res.statusCode, 413);
  assert.match(res.body.error, /1 MB/i);
});

test('problem image upload rejects spoofed image MIME types', async () => {
  const res = responseRecorder();
  await uploadCodingProblemAsset({ file: { size: 12, mimetype: 'image/png', buffer: Buffer.from('not-an-image') } }, res);
  assert.equal(res.statusCode, 415);
  assert.match(res.body.error, /valid JPG, PNG, WebP, or GIF/i);
});

test('image storage errors map to safe statuses without leaking provider messages', () => {
  const cases = [
    [{ http_code: 401, message: 'Invalid api_key 123456' }, 503, /credentials are invalid/i],
    [{ error: { http_code: 403, message: 'Forbidden for cloud demo' } }, 503, /credentials are invalid/i],
    [{ http_code: 420, message: 'Rate Limit Exceeded' }, 429, /busy/i],
    [{ error: { http_code: 429 } }, 429, /busy/i],
    [{ error: { http_code: 499, name: 'TimeoutError', message: 'Request Timeout' } }, 504, /timed out/i],
    [Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }), 504, /timed out/i],
    [Object.assign(new Error('connect ETIMEDOUT 1.2.3.4:443'), { code: 'ETIMEDOUT' }), 504, /timed out/i],
    [{ http_code: 500, message: 'Internal provider detail' }, 502, /temporarily unavailable/i],
    [new Error('boom'), 502, /temporarily unavailable/i],
  ];
  for (const [error, status, pattern] of cases) {
    const mapped = mapImageStorageError(error);
    assert.equal(mapped.status, status);
    assert.match(mapped.error, pattern);
    const providerMessage = error.message || error.error?.message;
    if (providerMessage) assert.ok(!mapped.error.includes(providerMessage));
  }
});
