import Assessment from '../models/Assessment.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import { finishAssessmentSubmission, mutateAssessmentSubmission } from './assessmentPersistenceService.js';
import {
  getAssessmentAttemptDeadline,
  getAssessmentAttemptTimeTakenSec,
  isAssessmentAttemptExpired,
} from './assessmentExpiryPolicy.js';

let globalSweepCursor = null;

async function finalizeExpiredSubmission(submission, assessment, now) {
  if (!isAssessmentAttemptExpired(assessment, submission, now)) return false;

  const updated = await mutateAssessmentSubmission({
    filter: { _id: submission._id, status: 'in_progress' },
    mutate(current) {
      // Re-evaluate after every CAS conflict: a concurrently accepted pause or
      // save must not leave a final score based on an earlier answer snapshot.
      if (!isAssessmentAttemptExpired(assessment, current, now)) return false;
      const deadline = getAssessmentAttemptDeadline(assessment, current);
      const changed = finishAssessmentSubmission(current, {
        now, submittedAt: deadline,
        timeTakenSec: getAssessmentAttemptTimeTakenSec(current, deadline),
      });
      if (changed) {
        current.pauseStartedAt = undefined;
        current.securityPauseReason = undefined;
      }
      return changed;
    },
  });
  return Boolean(updated.result);
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

  const globalSweep = !assessmentId && !studentId;
  if (globalSweep && globalSweepCursor) query._id = { $gt: globalSweepCursor };
  const batchLimit = Math.min(5000, Math.max(1, Number(limit) || 1000));
  const submissions = await AssessmentSubmission.find(query)
    .select('assessmentId status startedAt pausedDurationMs pauseStartedAt')
    .sort({ _id: 1 })
    .limit(batchLimit);
  // Keyset pagination prevents older, long-running attempts from starving
  // later attempts that expire sooner. It wraps after completing each pass.
  if (globalSweep) globalSweepCursor = submissions.length === batchLimit ? submissions.at(-1)._id : null;
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
