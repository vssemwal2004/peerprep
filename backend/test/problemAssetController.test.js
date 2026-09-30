import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadCodingProblemAsset } from '../src/controllers/problemAssetController.js';

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
