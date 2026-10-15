import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { acceptProblemAsset, mapImageStorageError, uploadCodingProblemAsset } from '../src/controllers/problemAssetController.js';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Sends a real multipart request through acceptProblemAsset, as the browser's FormData upload does. */
async function postMultipart(buildForm) {
  const app = express();
  app.post('/problem-assets', acceptProblemAsset, (req, res) => {
    res.status(201).json({ field: req.file.fieldname, size: req.file.size, mimetype: req.file.mimetype });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const form = new FormData();
    buildForm(form);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/problem-assets`, { method: 'POST', body: form });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function pngBlob(bytes) {
  return new Blob([Buffer.concat([PNG_SIGNATURE, Buffer.alloc(bytes - PNG_SIGNATURE.length, 1)])], { type: 'image/png' });
}

test('a single 20 KB PNG in the image field passes the upload parser', async () => {
  // Regression: a `parts: 1` limit made busboy reject every one-file upload with LIMIT_PART_COUNT.
  const { status, body } = await postMultipart((form) => form.append('image', pngBlob(20 * 1024), 'diagram.png'));
  assert.equal(status, 201);
  assert.deepEqual(body, { field: 'image', size: 20 * 1024, mimetype: 'image/png' });
});

test('upload parser explains a wrong field name, extra fields, and oversized images', async () => {
  const wrongField = await postMultipart((form) => form.append('file', pngBlob(1024), 'diagram.png'));
  assert.equal(wrongField.status, 400);
  assert.match(wrongField.body.error, /"image" form field/);

  const extraField = await postMultipart((form) => {
    form.append('note', 'x');
    form.append('image', pngBlob(1024), 'diagram.png');
  });
  assert.equal(extraField.status, 400);
  assert.match(extraField.body.error, /only the image/i);

  const twoImages = await postMultipart((form) => {
    form.append('image', pngBlob(1024), 'a.png');
    form.append('image', pngBlob(1024), 'b.png');
  });
  assert.equal(twoImages.status, 400);
  assert.match(twoImages.body.error, /one image at a time/i);

  const oversized = await postMultipart((form) => form.append('image', pngBlob((5 * 1024 * 1024) + 1), 'big.png'));
  assert.equal(oversized.status, 413);
  assert.match(oversized.body.error, /5 MB or smaller/);
});

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

test('problem image upload rejects files larger than 5 MB', async () => {
  const res = responseRecorder();
  await uploadCodingProblemAsset({ file: { size: (5 * 1024 * 1024) + 1, mimetype: 'image/png', buffer: Buffer.alloc(12) } }, res);
  assert.equal(res.statusCode, 413);
  assert.match(res.body.error, /5 MB/i);
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
    [{ http_code: 400, message: 'Invalid image file' }, 422, /could not be processed/i],
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
