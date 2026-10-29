import AssessmentEvidenceCleanup from '../models/AssessmentEvidenceCleanup.js';
import { deletePrivateImagesByPrefix, isCloudinaryConfigured } from '../utils/cloudinary.js';

const LEASE_MS = 2 * 60_000;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;

/** Queues deletion of every Cloudinary evidence image under each prefix. Idempotent. */
export async function scheduleEvidenceCleanup(prefixes) {
  const unique = [...new Set(prefixes.filter(Boolean))];
  if (!unique.length || !isCloudinaryConfigured()) return;
  await AssessmentEvidenceCleanup.bulkWrite(unique.map((prefix) => ({
    updateOne: {
      filter: { prefix },
      update: { $setOnInsert: { attempts: 0 }, $set: { nextAttemptAt: new Date() } },
      upsert: true,
    },
  })), { ordered: false });
}

/**
 * Works off up to `limit` Admin API pages of pending deletions in the current
 * tenant. A prefix with more than one page stays queued and continues next pass;
 * failures (including Cloudinary rate limits) back off exponentially.
 */
export async function runEvidenceCleanup({ limit = 5 } = {}) {
  if (!isCloudinaryConfigured()) return 0;
  let pages = 0;
  while (pages < limit) {
    const now = new Date();
    const job = await AssessmentEvidenceCleanup.findOneAndUpdate(
      { nextAttemptAt: { $lte: now }, $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] },
      { $set: { leaseUntil: new Date(now.getTime() + LEASE_MS) }, $inc: { attempts: 1 } },
      { sort: { nextAttemptAt: 1 }, new: true },
    );
    if (!job) break;
    pages += 1;
    try {
      const finished = await deletePrivateImagesByPrefix(job.prefix);
      if (finished) await AssessmentEvidenceCleanup.deleteOne({ _id: job._id, leaseUntil: job.leaseUntil });
      else await AssessmentEvidenceCleanup.updateOne({ _id: job._id }, { $set: { attempts: 0 }, $unset: { leaseUntil: 1, lastError: 1 } });
    } catch (error) {
      const delay = Math.min(MAX_BACKOFF_MS, 60_000 * 2 ** Math.min(8, job.attempts - 1));
      await AssessmentEvidenceCleanup.updateOne({ _id: job._id }, {
        $set: { nextAttemptAt: new Date(Date.now() + delay), lastError: String(error?.message || error?.error?.message || 'Cloudinary deletion failed').slice(0, 300) },
        $unset: { leaseUntil: 1 },
      });
    }
  }
  return pages;
}
