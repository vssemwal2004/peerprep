import crypto from 'crypto';
import { HttpError } from '../utils/errors.js';

const maxAgeMs = 60_000;

export function signInspection(path, universityId) {
  const encoded = process.env.PEERPREP_INSPECTION_PRIVATE_KEY;
  if (!encoded) throw new HttpError(503, 'University inspection is not configured');
  const payload = Buffer.from(JSON.stringify({ path, universityId, expiresAt: Date.now() + maxAgeMs })).toString('base64url');
  const key = crypto.createPrivateKey({ key: Buffer.from(encoded, 'base64'), format: 'der', type: 'pkcs8' });
  const signature = crypto.sign(null, Buffer.from(payload), key).toString('base64url');
  return `${payload}.${signature}`;
}

export function verifyInspection(token, path, universityId) {
  const encoded = process.env.PEERPREP_INSPECTION_PUBLIC_KEY;
  if (!encoded) throw new HttpError(503, 'University inspection is not configured');
  const [payload, signature, extra] = String(token || '').split('.');
  if (!payload || !signature || extra || payload.length > 2048 || signature.length > 256) throw new HttpError(401, 'Invalid inspection token');
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(encoded, 'base64'), format: 'der', type: 'spki' });
    const valid = crypto.verify(null, Buffer.from(payload), key, Buffer.from(signature, 'base64url'));
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!valid || claims.path !== path || claims.universityId !== universityId ||
      !Number.isSafeInteger(claims.expiresAt) || claims.expiresAt < Date.now() || claims.expiresAt > Date.now() + maxAgeMs) {
      throw new Error('Invalid claims');
    }
  } catch { throw new HttpError(401, 'Invalid inspection token'); }
}
