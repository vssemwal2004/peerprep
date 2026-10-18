import crypto from 'node:crypto';
import { deploymentRole } from './deployment.js';

export function verifiedSharedInternalRequest(req) {
  if (deploymentRole() !== 'shared' || !/^\/api\/platform\/tenant(?:\/|$)/.test(req.originalUrl || '')) return false;
  const id = String(req.get('X-PeerPrep-University') || '');
  const timestamp = String(req.get('X-PeerPrep-Internal-Time') || '');
  const signature = String(req.get('X-PeerPrep-Internal-Signature') || '');
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(id) || !/^\d{13}$/.test(timestamp)
    || Math.abs(Date.now() - Number(timestamp)) > 30000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${id}:${timestamp}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}
