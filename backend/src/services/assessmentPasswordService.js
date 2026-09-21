import crypto from 'crypto';

function passwordSecret() {
  const secret = process.env.ASSESSMENT_PASSWORD_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('ASSESSMENT_PASSWORD_SECRET or JWT_SECRET is required for assessment password encryption.');
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptAssessmentPassword(password) {
  const value = String(password || '');
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', passwordSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptAssessmentPassword(payload) {
  const [ivPart, tagPart, encryptedPart] = String(payload || '').split('.');
  if (!ivPart || !tagPart || !encryptedPart) return '';
  const decipher = crypto.createDecipheriv('aes-256-gcm', passwordSecret(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
