import crypto from 'crypto';
import MailJob from '../models/MailJob.js';

function queueSecret() {
  const secret = process.env.MAIL_QUEUE_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('MAIL_QUEUE_SECRET or JWT_SECRET is required for queued email encryption.');
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptMailPayload(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', queueSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((value) => value.toString('base64url')).join('.');
}

export function decryptMailPayload(value) {
  const [ivPart, tagPart, encryptedPart] = String(value || '').split('.');
  if (!ivPart || !tagPart || !encryptedPart) throw new Error('Invalid queued email payload.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', queueSecret(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, 'base64url')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}

export async function enqueueMailJobs(jobs, context = {}) {
  const batchId = context.batchId || crypto.randomUUID();
  const operations = jobs.map((job) => ({
    updateOne: {
      filter: { idempotencyKey: job.idempotencyKey },
      update: {
        $setOnInsert: {
          type: job.type,
          to: job.to,
          payloadEncrypted: encryptMailPayload(job.payload),
          status: 'queued',
          attempts: 0,
          maxAttempts: Number(job.maxAttempts || 4),
          nextAttemptAt: new Date(),
          idempotencyKey: job.idempotencyKey,
          batchId,
          requestedBy: context.requestedBy,
          requestedByEmail: context.requestedByEmail,
          targetType: job.targetType,
          targetId: job.targetId,
          recipientId: job.recipientId,
        },
      },
      upsert: true,
    },
  }));
  if (operations.length) await MailJob.bulkWrite(operations, { ordered: false });
  return {
    batchId,
    queued: jobs.length,
  };
}

export async function getMailBatchStatus(batchId) {
  const rows = await MailJob.aggregate([
    { $match: { batchId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(rows.map((row) => [row._id, row.count]));
  return {
    batchId,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    queued: counts.queued || 0,
    processing: counts.processing || 0,
    sent: counts.sent || 0,
    failed: counts.failed || 0,
    cancelled: counts.cancelled || 0,
  };
}
