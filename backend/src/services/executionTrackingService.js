import { randomUUID } from 'crypto';
import ExecutionJob from '../models/ExecutionJob.js';

export function createExecutionJobId() {
  return randomUUID();
}

export async function createExecutionJobRecord({
  jobId = createExecutionJobId(),
  queueName,
  jobName,
  userId,
  submissionId = null,
  assessmentSubmissionId = null,
  assessmentId = null,
  problemId = null,
  maxAttempts = 3,
  metadata = {},
}) {
  return ExecutionJob.create({
    jobId,
    queueName,
    jobName,
    userId,
    submissionId,
    assessmentSubmissionId,
    assessmentId,
    problemId,
    maxAttempts,
    metadata,
    status: 'queued',
    queuedAt: new Date(),
  });
}

export async function markExecutionJobProcessing(jobId, attemptsMade = 1) {
  return ExecutionJob.findOneAndUpdate(
    { jobId },
    {
      $set: {
        status: 'processing',
        startedAt: new Date(),
      },
      $max: {
        attemptsMade: Number(attemptsMade || 1),
      },
    },
    { new: true },
  );
}

export async function markExecutionJobCompleted(jobId, result) {
  return ExecutionJob.findOneAndUpdate(
    { jobId },
    {
      $set: {
        status: 'completed',
        result,
        error: {
          message: '',
          code: '',
          details: null,
        },
        completedAt: new Date(),
      },
    },
    { new: true },
  );
}

export async function markExecutionJobFailed(jobId, error, { attemptsMade = 0, final = true } = {}) {
  return ExecutionJob.findOneAndUpdate(
    { jobId },
    {
      $set: {
        status: final ? 'failed' : 'queued',
        error: {
          message: error?.message || 'Execution failed',
          code: error?.code || '',
          details: error?.details || null,
        },
        ...(final ? { completedAt: new Date() } : {}),
      },
      $max: {
        attemptsMade: Number(attemptsMade || 0),
      },
    },
    { new: true },
  );
}

export async function getExecutionJobForUser(jobId, user) {
  const query = { jobId };
  if (user?.role !== 'admin') {
    query.userId = user?._id;
  }
  return ExecutionJob.findOne(query).lean();
}

export function buildQueuedJobResponse(job, extra = {}) {
  return {
    status: 'queued',
    jobId: job.jobId,
    queue: job.queueName,
    resultUrl: `/api/results/${job.jobId}`,
    ...extra,
  };
}
