import MailJob from '../models/MailJob.js';
import User from '../models/User.js';
import { getMailBatchStatus } from '../services/mailQueueService.js';

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listMailJobs(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  const query = {};
  const search = String(req.query.search || '').trim().slice(0, 120);
  const status = String(req.query.status || '').trim();
  const type = String(req.query.type || '').trim();
  const dateFrom = String(req.query.dateFrom || '').trim();
  const dateTo = String(req.query.dateTo || '').trim();

  if (['queued', 'processing', 'sent', 'failed', 'cancelled'].includes(status)) query.status = status;
  if (['student_credentials', 'coordinator_onboarding', 'assessment_invitation', 'event_invitation', 'event_cancellation'].includes(type)) query.type = type;
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    query.$or = [
      { to: regex },
      { requestedByEmail: regex },
      { batchId: regex },
      { lastError: regex },
    ];
  }
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) {
      const from = new Date(`${dateFrom}T00:00:00.000Z`);
      if (!Number.isNaN(from.getTime())) query.createdAt.$gte = from;
    }
    if (dateTo) {
      const to = new Date(`${dateTo}T23:59:59.999Z`);
      if (!Number.isNaN(to.getTime())) query.createdAt.$lte = to;
    }
    if (!Object.keys(query.createdAt).length) delete query.createdAt;
  }

  const [jobs, total, statusRows, typeRows] = await Promise.all([
    MailJob.find(query)
      .select('-payloadEncrypted -idempotencyKey')
      .populate({ path: 'recipientId', select: 'name studentId coordinatorId', model: User })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    MailJob.countDocuments(query),
    MailJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    MailJob.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
  ]);

  const pages = Math.max(1, Math.ceil(total / limit));
  return res.json({
    jobs,
    pagination: { page: Math.min(page, pages), pages, total, limit },
    summary: {
      byStatus: Object.fromEntries(statusRows.map((row) => [row._id, row.count])),
      byType: Object.fromEntries(typeRows.map((row) => [row._id, row.count])),
    },
  });
}

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
