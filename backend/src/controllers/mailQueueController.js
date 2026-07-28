import MailJob from '../models/MailJob.js';
import { getMailBatchStatus } from '../services/mailQueueService.js';

export async function getBatchStatus(req, res) {
  const batch = await MailJob.findOne({ batchId: req.params.batchId }).select('requestedBy').lean();
  if (!batch) return res.status(404).json({ error: 'Mail batch not found.' });
  if (req.user.role !== 'admin' && String(batch.requestedBy) !== String(req.user._id)) {
    return res.status(403).json({ error: 'You cannot view this mail batch.' });
  }
  return res.json(await getMailBatchStatus(req.params.batchId));
}

export async function listTargetMailStatus(req, res) {
  const { targetType, targetId } = req.params;
  const jobs = await MailJob.find({
    targetType: String(targetType).toUpperCase(),
    targetId,
  })
    .select('recipientId to status attempts maxAttempts sentAt failedAt lastError batchId createdAt')
    .sort({ createdAt: -1 })
    .lean();
  const latest = new Map();
  jobs.forEach((job) => {
    const key = String(job.recipientId || job.to);
    if (!latest.has(key)) latest.set(key, job);
  });
  return res.json({ count: latest.size, deliveries: [...latest.values()] });
}

export async function retryFailedBatch(req, res) {
  const batch = await MailJob.findOne({ batchId: req.params.batchId }).select('requestedBy').lean();
  if (!batch) return res.status(404).json({ error: 'Mail batch not found.' });
  if (req.user.role !== 'admin' && String(batch.requestedBy) !== String(req.user._id)) {
    return res.status(403).json({ error: 'You cannot retry this mail batch.' });
  }
  const result = await MailJob.updateMany(
    { batchId: req.params.batchId, status: 'failed' },
    {
      $set: { status: 'queued', attempts: 0, nextAttemptAt: new Date() },
      $unset: { failedAt: 1, lockedAt: 1 },
    },
  );
  return res.json({ requeued: result.modifiedCount || 0 });
}
