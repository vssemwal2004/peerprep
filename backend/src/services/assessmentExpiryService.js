import Assessment from '../models/Assessment.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import { scoreAssessmentWithTestCases } from './assessmentScoringService.js';
import { enqueueAssessmentCodingEvaluationJobs } from './compilerExecutionWorkflowService.js';
import {
  getAssessmentAttemptDeadline,
  getAssessmentAttemptTimeTakenSec,
  isAssessmentAttemptExpired,
} from './assessmentExpiryPolicy.js';

function assessmentForStoredSubmission(assessment, submission) {
  const source = typeof assessment?.toObject === 'function' ? assessment.toObject() : assessment;
  const storedSections = submission.deliveryPreparedAt && Array.isArray(submission.deliverySections)
    ? submission.deliverySections
    : source.sections || [];
  return { ...source, sections: storedSections };
}

async function finalizeExpiredSubmission(submission, assessment, now) {
  if (!isAssessmentAttemptExpired(assessment, submission, now)) return false;

  const deadline = getAssessmentAttemptDeadline(assessment, submission);
  const deliveredAssessment = assessmentForStoredSubmission(assessment, submission);
  const scoring = scoreAssessmentWithTestCases(deliveredAssessment, submission.answers || []);
  const updated = await AssessmentSubmission.findOneAndUpdate(
    { _id: submission._id, status: 'in_progress' },
    {
      $set: {
        status: 'submitted',
        submittedAt: deadline,
        lastSavedAt: now,
        score: scoring.score,
        maxMarks: scoring.maxMarks,
        accuracy: scoring.accuracy,
        timeTakenSec: getAssessmentAttemptTimeTakenSec(submission, deadline),
        isLate: false,
        activeSessionId: '',
      },
      $unset: {
        activeSessionHeartbeatAt: 1,
        pauseStartedAt: 1,
        securityPauseReason: 1,
      },
      $max: { attemptCount: 1 },
    },
    { new: true },
  );

  if (!updated) return false;
  try {
    await enqueueAssessmentCodingEvaluationJobs({
      assessment: deliveredAssessment,
      submission: updated,
      studentId: updated.studentId,
    });
  } catch (error) {
    console.error(`[AssessmentExpiry] Coding evaluation queue failed for ${updated._id}:`, error.message);
  }
  return true;
}

/**
 * Finalizes expired attempts in bounded batches. Optional filters keep request
 * reconciliation cheap while the background worker handles the global sweep.
 */
export async function reconcileExpiredAssessmentSubmissions({
  assessmentId,
  studentId,
  now = new Date(),
  limit = 1000,
} = {}) {
  const query = { status: 'in_progress', startedAt: { $ne: null } };
  if (assessmentId) query.assessmentId = assessmentId;
  if (studentId) query.studentId = studentId;

  const submissions = await AssessmentSubmission.find(query)
    .sort({ startedAt: 1 })
    .limit(Math.min(5000, Math.max(1, Number(limit) || 1000)));
  if (!submissions.length) return { checked: 0, completed: 0 };

  const assessmentIds = [...new Set(submissions.map((item) => String(item.assessmentId)))];
  const assessments = await Assessment.find({ _id: { $in: assessmentIds } });
  const assessmentById = new Map(assessments.map((item) => [String(item._id), item]));
  let completed = 0;

  // Keep database and queue pressure bounded while avoiding one write round trip
  // at a time when many students leave an assessment simultaneously.
  const concurrency = 10;
  for (let index = 0; index < submissions.length; index += concurrency) {
    const batch = submissions.slice(index, index + concurrency);
    const results = await Promise.all(batch.map((submission) => {
      const assessment = assessmentById.get(String(submission.assessmentId));
      return assessment ? finalizeExpiredSubmission(submission, assessment, now) : false;
    }));
    completed += results.filter(Boolean).length;
  }

  return { checked: submissions.length, completed };
}
