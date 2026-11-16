import { createHash, randomUUID } from 'node:crypto';
import { assessmentDefinitionById } from '../platform/sharedContent.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import Notification from '../models/Notification.js';
import { enqueueAssessmentCodingEvaluationJobs } from './compilerExecutionWorkflowService.js';
import { mutateAssessmentSubmission } from './assessmentPersistenceService.js';
import { getIo } from '../utils/io.js';
import { personalRoom } from '../utils/realtime.js';
import { requestAssessmentReportRefresh } from './assessmentReportSummaryService.js';
import { notifyAssessmentReportChanged } from './assessmentReportRealtime.js';

const LEASE_MS = 120_000;
const RECHECK_MS = 30_000;
export const EXHAUSTED_DISPATCH_ERROR = 'Grading jobs used every retry; requeue with scripts/recoverFailedAssessmentEvaluations.js --stuck-dispatch.';

// Error code and message for logs, with URLs (which may carry credentials) removed.
export function describeDispatchError(error) {
  const label = error?.code || error?.name || 'Error';
  const message = String(error?.message || '')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<url>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return message ? `${label}: ${message}` : label;
}

async function ensureSubmissionNotification(submission) {
  const dedupeKey = `assessment-submitted:${submission._id}:${submission.evaluationVersion}`;
  // A deterministic _id gives this effect a database-enforced idempotency key,
  // including when a lease expires between insert and acknowledgement.
  const id = createHash('sha256').update(dedupeKey).digest('hex').slice(0, 24);
  const fields = {
    userId: submission.studentId,
    title: 'Assessment Submitted',
    message: 'Assessment submitted successfully',
    type: 'ASSESSMENT',
    referenceId: submission.assessmentId,
    actionUrl: '/student/assessments',
    dedupeKey,
    isRead: false,
  };
  try {
    const result = await Notification.updateOne({ _id: id }, { $setOnInsert: fields }, { upsert: true });
    if (result.upsertedCount) getIo()?.to(personalRoom(submission.studentId)).emit('new_notification', { ...fields, _id: id });
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
}

export async function dispatchPendingAssessmentEvaluations({ limit = 25, now = new Date() } = {}) {
  const maxClaims = Math.min(100, Math.max(1, Number(limit) || 25));
  let dispatched = 0;
  let failed = 0;
  for (let index = 0; index < maxClaims; index += 1) {
    const leaseToken = randomUUID();
    const submission = await AssessmentSubmission.findOneAndUpdate({
      status: { $in: ['submitted', 'violation', 'expired'] },
      $expr: { $eq: ['$pendingWork.version', '$evaluationVersion'] },
      $or: [
        {
          'pendingWork.status': { $in: ['pending', 'failed'] },
          'pendingWork.nextAttemptAt': { $lte: now },
        },
        { 'pendingWork.status': 'processing', 'pendingWork.leaseUntil': { $lte: now } },
      ],
    }, {
      $set: {
        'pendingWork.status': 'processing',
        'pendingWork.leaseToken': leaseToken,
        'pendingWork.leaseUntil': new Date(now.getTime() + LEASE_MS),
      },
      $inc: { 'pendingWork.attempts': 1, __v: 1 },
    }, { new: true, sort: { 'pendingWork.nextAttemptAt': 1, _id: 1 } })
      .select('-proctoringSnapshots -monitoringEvents');
    if (!submission) break;

    const releaseFilter = {
      _id: submission._id,
      evaluationVersion: submission.evaluationVersion,
      'pendingWork.leaseToken': leaseToken,
    };
    try {
      const assessment = await assessmentDefinitionById(submission.assessmentId);
      if (!assessment) throw new Error('Assessment definition is missing for evaluation.');
      await enqueueAssessmentCodingEvaluationJobs({ assessment, submission, studentId: submission.studentId });
      await ensureSubmissionNotification(submission);
      await requestAssessmentReportRefresh(submission.assessmentId);
      await mutateAssessmentSubmission({
        filter: releaseFilter,
        mutate(current) {
          current.pendingWork.status = current.evaluationStatus === 'processing' ? 'pending' : 'completed';
          current.pendingWork.nextAttemptAt = new Date(now.getTime() + RECHECK_MS);
          current.pendingWork.leaseToken = undefined;
          current.pendingWork.leaseUntil = undefined;
          current.pendingWork.lastError = '';
        },
      });
      dispatched += 1;
      // Attempts without coding jobs are graded during dispatch.
      notifyAssessmentReportChanged(submission.assessmentId, 'evaluation');
    } catch (error) {
      // A grading job that already used every queue retry cannot be published again under the
      // same job ID, so retrying dispatch would fail forever. Park it for the recovery script.
      const exhausted = error?.code === 'QUEUE_RECOVERY_EXHAUSTED';
      const retryMs = Math.min(15 * 60_000, 2000 * 2 ** Math.min(9, Number(submission.pendingWork?.attempts || 1)));
      await AssessmentSubmission.updateOne(releaseFilter, {
        $set: {
          'pendingWork.status': 'failed',
          'pendingWork.nextAttemptAt': exhausted ? null : new Date(now.getTime() + retryMs),
          // Avoid copying connection URIs or provider credentials into records/logs.
          'pendingWork.lastError': exhausted
            ? EXHAUSTED_DISPATCH_ERROR
            : 'Evaluation dispatch failed; retry scheduled.',
        },
        $unset: { 'pendingWork.leaseToken': 1, 'pendingWork.leaseUntil': 1 },
        $inc: { __v: 1 },
      });
      failed += 1;
      console.error(`[AssessmentDispatch] ${exhausted ? 'Parked' : 'Deferred'} submission ${submission._id} (${describeDispatchError(error)}).`);
    }
  }
  return { dispatched, failed };
}

