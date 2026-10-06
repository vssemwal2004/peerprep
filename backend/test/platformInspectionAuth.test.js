import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { signInspection, verifyInspection } from '../src/platform/inspectionAuth.js';

test('inspection signatures are scoped to one university, route and short lifetime', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  process.env.PEERPREP_INSPECTION_PRIVATE_KEY = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  process.env.PEERPREP_INSPECTION_PUBLIC_KEY = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  try {
    const path = '/students?page=1&search=';
    const token = signInspection(path, 'geu-121');
    assert.doesNotThrow(() => verifyInspection(token, path, 'geu-121'));
    assert.throws(() => verifyInspection(token, path, 'other-university'), { status: 401 });
    assert.throws(() => verifyInspection(token, '/students?page=2&search=', 'geu-121'), { status: 401 });
    assert.throws(() => verifyInspection(`${token}x`, path, 'geu-121'), { status: 401 });
    const expired = Buffer.from(JSON.stringify({ path, universityId: 'geu-121', expiresAt: Date.now() - 1000 })).toString('base64url');
    const signature = crypto.sign(null, Buffer.from(expired), privateKey).toString('base64url');
    assert.throws(() => verifyInspection(`${expired}.${signature}`, path, 'geu-121'), { status: 401 });
  } finally {
    delete process.env.PEERPREP_INSPECTION_PRIVATE_KEY;
    delete process.env.PEERPREP_INSPECTION_PUBLIC_KEY;
  }
});
