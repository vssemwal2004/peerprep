import crypto from 'node:crypto';

function encryptionKey() {
  const encoded = process.env.PEERPREP_TENANT_SECRET_KEY;
  if (!encoded) throw new Error('PEERPREP_TENANT_SECRET_KEY is required in shared mode');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('PEERPREP_TENANT_SECRET_KEY must be a base64-encoded 32-byte key');
  return key;
}

export function encryptTenantSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64url')).join('.');
}

export function decryptTenantSecret(value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 3) throw new Error('University secret is unavailable');
  const [iv, tag, body] = parts.map((part) => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
