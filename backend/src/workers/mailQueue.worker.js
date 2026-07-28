import MailJob from '../models/MailJob.js';
import User from '../models/User.js';
import EventParticipant from '../models/EventParticipant.js';
import { decryptMailPayload } from '../services/mailQueueService.js';
import {
  sendAssessmentInvitationEmail,
  sendCoordinatorOnboardingEmail,
  sendEventNotificationEmail,
  sendOnboardingEmail,
} from '../utils/mailer.js';

let timer = null;
let running = false;

async function deliver(job) {
  const payload = decryptMailPayload(job.payloadEncrypted);
  if (job.type === 'student_credentials' || job.type === 'coordinator_onboarding') {
    const passwordHash = await User.hashPassword(payload.password);
    const update = await User.updateOne(
      { _id: job.recipientId, activeSessionCreatedAt: { $exists: false } },
      { $set: { passwordHash, mustChangePassword: true } },
    );
    if (update.matchedCount !== 1) {
      throw new Error('Credential delivery cancelled because this account has already been used.');
    }
    if (job.type === 'student_credentials') return sendOnboardingEmail(payload);
    return sendCoordinatorOnboardingEmail(payload);
  }
  if (job.type === 'assessment_invitation') {
    return sendAssessmentInvitationEmail(payload);
  }
  if (job.type === 'event_invitation') {
    return sendEventNotificationEmail(payload);
  }
  throw new Error(`Unsupported queued email type: ${job.type}`);
}

async function syncRecipientStatus(job, status, error = '') {
  if (job.type === 'student_credentials' || job.type === 'coordinator_onboarding') {
    const credentialStatus = status === 'queued' ? 'pending' : status;
    await User.updateOne(
      { _id: job.recipientId },
      {
        $set: {
          credentialEmailStatus: credentialStatus,
          credentialEmailLastAttemptAt: new Date(),
          ...(status === 'sent' ? { credentialEmailSentAt: new Date() } : {}),
          ...(error ? { credentialEmailLastError: error.slice(0, 500) } : {}),
        },
        ...(status === 'sent' ? { $unset: { credentialEmailLastError: 1, credentialEmailBatchId: 1 } } : {}),
      },
    ).catch(() => {});
  }
  if (job.type === 'event_invitation') {
    await EventParticipant.updateOne(
      { eventId: job.targetId, studentId: job.recipientId },
      {
        $set: {
          invitationStatus: status === 'queued' ? 'pending' : status,
          ...(status === 'sent' ? { invitationSentAt: new Date() } : {}),
        },
      },
    ).catch(() => {});
  }
}

async function claimNextJob() {
  const staleLock = new Date(Date.now() - 10 * 60 * 1000);
  return MailJob.findOneAndUpdate(
    {
      $or: [
        { status: 'queued', nextAttemptAt: { $lte: new Date() } },
        { status: 'processing', lockedAt: { $lte: staleLock } },
      ],
    },
    { $set: { status: 'processing', lockedAt: new Date() }, $inc: { attempts: 1 } },
    { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } },
  );
}

async function processOne() {
  const job = await claimNextJob();
  if (!job) return false;
  try {
    const info = await deliver(job);
    job.status = 'sent';
    job.sentAt = new Date();
    job.providerMessageId = info?.messageId || '';
    job.lastError = undefined;
    job.lockedAt = undefined;
    await job.save();
    await syncRecipientStatus(job, 'sent');
  } catch (error) {
    const message = String(error?.message || 'Email delivery failed');
    if (job.attempts >= job.maxAttempts) {
      job.status = 'failed';
      job.failedAt = new Date();
      if (job.type === 'student_credentials' || job.type === 'coordinator_onboarding') {
        try {
          const payload = decryptMailPayload(job.payloadEncrypted);
          if (payload.previousPasswordHash) {
            await User.updateOne(
              { _id: job.recipientId, activeSessionCreatedAt: { $exists: false } },
              { $set: { passwordHash: payload.previousPasswordHash } },
            );
          }
        } catch {
          // Status below still records the permanent failure.
        }
      }
      await syncRecipientStatus(job, 'failed', message);
    } else {
      job.status = 'queued';
      const delayMinutes = Math.min(60, 2 ** Math.max(0, job.attempts - 1));
      job.nextAttemptAt = new Date(Date.now() + delayMinutes * 60 * 1000);
      await syncRecipientStatus(job, 'queued', message);
    }
    job.lockedAt = undefined;
    job.lastError = message.slice(0, 1000);
    await job.save();
  }
  return true;
}

export async function drainMailQueue() {
  if (running) return;
  running = true;
  try {
    const concurrency = Math.max(1, Math.min(5, Number(process.env.MAIL_QUEUE_CONCURRENCY || 1)));
    await Promise.all(Array.from({ length: concurrency }, async () => {
      for (let processed = 0; processed < 25; processed += 1) {
        if (!await processOne()) break;
      }
    }));
  } finally {
    running = false;
  }
}

export function startMailQueueWorker() {
  if (timer) return;
  const intervalMs = Math.max(2000, Number(process.env.MAIL_QUEUE_POLL_MS || 5000));
  timer = setInterval(() => drainMailQueue().catch((error) => console.error('[MailQueue]', error.message)), intervalMs);
  timer.unref?.();
  drainMailQueue().catch((error) => console.error('[MailQueue]', error.message));
}
