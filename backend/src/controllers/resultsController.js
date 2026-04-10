import { HttpError } from '../utils/errors.js';
import { getExecutionJobForUser } from '../services/executionTrackingService.js';

export async function getExecutionResult(req, res) {
  const jobId = String(req.params.jobId || '').trim();
  if (!jobId) {
    throw new HttpError(400, 'jobId is required.');
  }

  const job = await getExecutionJobForUser(jobId, req.user);
  if (!job) {
    throw new HttpError(404, 'Result not found.');
  }

  res.json({
    jobId: job.jobId,
    status: job.status,
    queue: job.queueName,
    jobName: job.jobName,
    attemptsMade: job.attemptsMade || 0,
    maxAttempts: job.maxAttempts || 0,
    submissionId: job.submissionId || undefined,
    assessmentSubmissionId: job.assessmentSubmissionId || undefined,
    result: job.result || null,
    error: job.error?.message
      ? {
        message: job.error.message,
        code: job.error.code || '',
      }
      : null,
    queuedAt: job.queuedAt,
    startedAt: job.startedAt || null,
    completedAt: job.completedAt || null,
  });
}
