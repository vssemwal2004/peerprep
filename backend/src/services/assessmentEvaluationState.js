import { createHash } from 'node:crypto';
import { scoreAssessmentWithTestCases } from './assessmentScoringService.js';

export function deliveredAssessmentForEvaluation(assessment, submission) {
  const plain = assessment.toObject?.() || assessment;
  return {
    ...plain,
    sections: submission.deliveryPreparedAt && Array.isArray(submission.deliverySections)
      ? submission.deliverySections
      : plain.sections || [],
  };
}

export function assessmentSourceHash(code, language) {
  return createHash('sha256').update(JSON.stringify([String(language || ''), String(code || '')])).digest('hex');
}

export function isCurrentAssessmentEvaluation(submission, job) {
  if (!submission || !['submitted', 'violation', 'expired'].includes(submission.status)) return false;
  // Old jobs without an evaluation version cannot grade a newer finalized attempt.
  return Number(submission.attemptGeneration || 1) === Number(job.attemptGeneration || 1)
    && Number(submission.evaluationVersion || 0) === Number(job.evaluationVersion || 0);
}

export function refreshAssessmentEvaluationSummary(submission, assessment) {
  const codingAnswers = (submission.answers || []).filter((answer) => Boolean(answer.jobId));
  submission.codingJobsPending = codingAnswers.length;
  submission.codingJobsCompleted = codingAnswers.filter((answer) => (
    answer.executionStatus === 'completed' || answer.executionStatus === 'failed'
  )).length;
  submission.evaluationStatus = submission.codingJobsCompleted < submission.codingJobsPending
    ? 'processing'
    : (codingAnswers.some((answer) => answer.executionStatus === 'failed') ? 'failed' : 'completed');
  const scoring = scoreAssessmentWithTestCases(deliveredAssessmentForEvaluation(assessment, submission), submission.answers || []);
  submission.score = scoring.score;
  submission.maxMarks = scoring.maxMarks;
  submission.accuracy = scoring.accuracy;
}

export function applyAssessmentExecutionResult(submission, assessment, job, result) {
  if (!isCurrentAssessmentEvaluation(submission, job)) return false;
  const answer = (submission.answers || []).find((entry) => (
    Number(entry.sectionIndex) === Number(job.sectionIndex)
    && Number(entry.questionIndex) === Number(job.questionIndex)
  ));
  if (!answer || String(answer.jobId || '') !== String(job.executionJobId || '')) return false;
  const currentHash = assessmentSourceHash(answer.code, answer.language || job.languageKey);
  const expectedHash = job.sourceHash || assessmentSourceHash(job.sourceCode, job.languageKey);
  if (currentHash !== expectedHash) return false;
  // A delayed processing/retry callback must not regress a completed result.
  if (['completed', 'failed'].includes(answer.executionStatus)) return false;
  answer.executionStatus = result.executionStatus;
  answer.executionVerdict = result.executionVerdict;
  answer.executionResult = result.executionResult;
  answer.lastEvaluatedAt = new Date();
  refreshAssessmentEvaluationSummary(submission, assessment);
  return true;
}
