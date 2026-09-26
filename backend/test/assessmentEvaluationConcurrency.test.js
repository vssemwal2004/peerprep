import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Assessment from '../src/models/Assessment.js';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';
import ExecutionJob from '../src/models/ExecutionJob.js';
import Notification from '../src/models/Notification.js';
import { finishAssessmentSubmission, mutateAssessmentSubmission } from '../src/services/assessmentPersistenceService.js';
import { applyAssessmentExecutionResult, assessmentSourceHash } from '../src/services/assessmentEvaluationState.js';
import { reconcileExpiredAssessmentSubmissions } from '../src/services/assessmentExpiryService.js';

let mongo;
before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' }, instance: { dbName: 'peerprep_evaluation_tests' } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([AssessmentSubmission.init(), ExecutionJob.init(), Notification.init()]);
});
beforeEach(async () => {
  // Only this test-owned MongoMemoryServer database is ever connected here.
  await Promise.all([Assessment, AssessmentSubmission, ExecutionJob, Notification].map((model) => model.deleteMany({})));
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

async function fixture({ coding = true, count = 2 } = {}) {
  const sections = [{
    sectionName: 'Test', type: coding ? 'coding' : 'mcq',
    questions: Array.from({ length: count }, () => ({
      type: coding ? 'coding' : 'mcq', points: 10, correctOptionIndex: 1,
      ...(coding ? { problemId: new mongoose.Types.ObjectId() } : {}),
    })),
  }];
  const assessment = await Assessment.create({ createdBy: new mongoose.Types.ObjectId(), duration: 30, endTime: new Date(Date.now() + 3600_000), sections });
  const submission = await AssessmentSubmission.create({
    assessmentId: assessment._id, studentId: new mongoose.Types.ObjectId(),
    status: 'in_progress', startedAt: new Date(), deliveryPreparedAt: new Date(), deliverySections: sections,
    answers: sections[0].questions.map((_, questionIndex) => ({
      sectionIndex: 0, questionIndex, answer: 1,
      ...(coding ? { code: `print(${questionIndex})`, language: 'python' } : {}),
    })),
  });
  return { assessment, submission };
}

test('parallel coding callbacks preserve every result and compute the score from the final combined answers', async () => {
  const { assessment, submission } = await fixture();
  const finalized = await mutateAssessmentSubmission({ filter: { _id: submission._id }, mutate(doc) {
    finishAssessmentSubmission(doc);
    doc.answers.forEach((answer, index) => { answer.jobId = `job-${index}`; answer.executionStatus = 'queued'; });
  } });
  const jobs = finalized.submission.answers.map((answer) => ({
    sectionIndex: 0, questionIndex: answer.questionIndex, executionJobId: answer.jobId,
    attemptGeneration: 1, evaluationVersion: 1, languageKey: 'python',
    sourceHash: assessmentSourceHash(answer.code, answer.language),
  }));
  await Promise.all(jobs.map((job) => mutateAssessmentSubmission({
    filter: { _id: submission._id },
    mutate: (doc) => applyAssessmentExecutionResult(doc, assessment, job, {
      executionStatus: 'completed', executionVerdict: 'AC', executionResult: { passed: 1, total: 1 },
    }),
  })));
  const stored = await AssessmentSubmission.findById(submission._id);
  assert.equal(stored.score, 20);
  assert.equal(stored.codingJobsCompleted, 2);
  assert.equal(stored.evaluationStatus, 'completed');
  const ignored = await mutateAssessmentSubmission({ filter: { _id: submission._id }, mutate: (doc) => (
    applyAssessmentExecutionResult(doc, assessment, jobs[0], { executionStatus: 'processing', executionVerdict: 'PENDING' })
  ) });
  assert.equal(ignored.changed, false);
  assert.equal(ignored.submission.score, 20);
});

test('old generation, old evaluation and changed-source results cannot grade an attempt', async () => {
  const { assessment, submission } = await fixture({ count: 1 });
  await mutateAssessmentSubmission({ filter: { _id: submission._id }, mutate(doc) {
    finishAssessmentSubmission(doc);
    doc.answers[0].jobId = 'current-job'; doc.answers[0].executionStatus = 'queued';
  } });
  const currentJob = { attemptGeneration: 1, evaluationVersion: 1, sectionIndex: 0, questionIndex: 0, executionJobId: 'current-job', sourceCode: 'print(0)', languageKey: 'python' };
  for (const override of [{ attemptGeneration: 2 }, { evaluationVersion: 0 }, { sourceCode: 'older-source' }]) {
    const update = await mutateAssessmentSubmission({ filter: { _id: submission._id }, mutate: (doc) => (
      applyAssessmentExecutionResult(doc, assessment, { ...currentJob, ...override }, { executionStatus: 'completed', executionVerdict: 'AC' })
    ) });
    assert.equal(update.result, false);
    assert.equal(update.changed, false);
  }
});

test('expiry records durable pending evaluation without scoring stale answers in the expiry request', async () => {
  const { assessment, submission } = await fixture({ coding: false, count: 1 });
  await AssessmentSubmission.updateOne({ _id: submission._id }, { $set: { startedAt: new Date(Date.now() - 3600_000) } });
  const result = await reconcileExpiredAssessmentSubmissions({ assessmentId: assessment._id, studentId: submission.studentId });
  assert.equal(result.completed, 1);
  const stored = await AssessmentSubmission.findById(submission._id);
  assert.equal(stored.status, 'submitted');
  assert.equal(stored.pendingWork.status, 'pending');
  assert.equal(stored.pendingWork.version, stored.evaluationVersion);
  assert.ok(stored.submissionReceipt);
  assert.equal(stored.score, undefined);
});

test('a persisted finalization is recovered without Redis for MCQ and notification is idempotent', async () => {
  const { dispatchPendingAssessmentEvaluations } = await import('../src/services/assessmentEvaluationDispatchService.js');
  const { submission } = await fixture({ coding: false, count: 1 });
  await mutateAssessmentSubmission({ filter: { _id: submission._id }, mutate: (doc) => finishAssessmentSubmission(doc) });
  // Simulate request process disappearing after the final database commit.
  await Promise.all([dispatchPendingAssessmentEvaluations(), dispatchPendingAssessmentEvaluations()]);
  const stored = await AssessmentSubmission.findById(submission._id);
  assert.equal(stored.pendingWork.status, 'completed');
  assert.equal(stored.score, 10);
  assert.equal(await Notification.countDocuments({ userId: submission.studentId }), 1);
});

test('queue publication retries preserve durable intent and reuse the same tracked coding job', async () => {
  const { assessmentQueue } = await import('../src/queues/queueManager.js');
  const { dispatchPendingAssessmentEvaluations } = await import('../src/services/assessmentEvaluationDispatchService.js');
  const { assessment, submission } = await fixture({ count: 1 });
  await mutateAssessmentSubmission({ filter: { _id: submission._id }, mutate: (doc) => finishAssessmentSubmission(doc) });
  const originalAdd = assessmentQueue.add;
  const payloads = [];
  let unavailable = true;
  assessmentQueue.add = async (name, data) => {
    payloads.push(data);
    if (unavailable) throw new Error('isolated test queue unavailable');
    return { id: data.executionJobId };
  };
  try {
    await dispatchPendingAssessmentEvaluations();
    let stored = await AssessmentSubmission.findById(submission._id);
    assert.equal(stored.pendingWork.status, 'failed');
    assert.equal(stored.status, 'submitted');
    unavailable = false;
    await dispatchPendingAssessmentEvaluations({ now: new Date(Date.now() + 3600_000) });
    stored = await AssessmentSubmission.findById(submission._id);
    assert.equal(stored.pendingWork.status, 'pending');
    assert.equal(payloads[0].executionJobId, payloads[1].executionJobId);
    assert.equal(await ExecutionJob.countDocuments({ assessmentSubmissionId: submission._id }), 1);
    // Redis queue loss: another pass recreates the missing job with its stable ID.
    await dispatchPendingAssessmentEvaluations({ now: new Date(Date.now() + 7200_000) });
    assert.equal(payloads.at(-1).executionJobId, payloads[0].executionJobId);
    await mutateAssessmentSubmission({ filter: { _id: submission._id }, mutate: (doc) => (
      applyAssessmentExecutionResult(doc, assessment, payloads[0], { executionStatus: 'completed', executionVerdict: 'AC', executionResult: { passed: 1, total: 1 } })
    ) });
    await dispatchPendingAssessmentEvaluations({ now: new Date(Date.now() + 10800_000) });
    stored = await AssessmentSubmission.findById(submission._id);
    assert.equal(stored.pendingWork.status, 'completed');
    assert.equal(stored.score, 10);
    assert.equal(await Notification.countDocuments({ userId: submission.studentId }), 1);
  } finally {
    assessmentQueue.add = originalAdd;
  }
});
