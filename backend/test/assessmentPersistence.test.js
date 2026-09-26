import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';
import { mergeAssessmentAnswers } from '../src/services/assessmentAnswerService.js';
import {
  mutateAssessmentSubmission, finishAssessmentSubmission, acceptAssessmentBatch,
  assertAssessmentSession, normalizeAssessmentAnswerChanges, isTerminalAssessmentSubmission,
} from '../src/services/assessmentPersistenceService.js';

let mongo;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'isolated_assessment_persistence' });
  await AssessmentSubmission.init();
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });
async function attempt() {
  return AssessmentSubmission.create({ assessmentId: new mongoose.Types.ObjectId(), studentId: new mongoose.Types.ObjectId(), status: 'in_progress', startedAt: new Date(), activeSessionId: 'session-a' });
}
test('parallel answer mutations merge against the winning revision without losing disjoint answers', async () => {
  const doc = await attempt();
  await Promise.all(Array.from({ length: 8 }, (_, i) => mutateAssessmentSubmission({
    filter: { _id: doc._id }, maxRetries: 20,
    mutate: async (current) => {
      current.answers = mergeAssessmentAnswers(current.answers, [{ sectionIndex: 0, questionIndex: i, answer: i }]);
      current.answerRevision += 1;
    },
  })));
  const stored = await AssessmentSubmission.findById(doc._id);
  assert.equal(stored.answers.length, 8);
  assert.equal(stored.answerRevision, 8);
  assert.equal(stored.__v, 8);
});
test('duplicate submit returns the single durable receipt and one evaluation obligation', async () => {
  const doc = await attempt();
  const results = await Promise.all(Array.from({ length: 8 }, () => mutateAssessmentSubmission({
    filter: { _id: doc._id }, mutate: (current) => finishAssessmentSubmission(current),
  })));
  const stored = await AssessmentSubmission.findById(doc._id);
  assert.equal(new Set(results.map((r) => r.submission.submissionReceipt)).size, 1);
  assert.equal(stored.attemptCount, 1);
  assert.equal(stored.evaluationVersion, 1);
  assert.equal(stored.pendingWork.status, 'pending');
});
test('autosave racing submit cannot reopen or alter the terminal answer set', async () => {
  const doc = await attempt();
  await Promise.all([
    mutateAssessmentSubmission({ filter: { _id: doc._id }, mutate: (current) => {
      if (isTerminalAssessmentSubmission(current)) return;
      current.answers = [{ sectionIndex: 0, questionIndex: 0, answer: 'final' }];
      finishAssessmentSubmission(current);
    } }),
    mutateAssessmentSubmission({ filter: { _id: doc._id }, mutate: async (current) => {
      if (isTerminalAssessmentSubmission(current)) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
      current.answers = [{ sectionIndex: 0, questionIndex: 0, answer: 'older' }];
    } }),
  ]);
  const stored = await AssessmentSubmission.findById(doc._id);
  assert.equal(stored.status, 'submitted');
  assert.equal(stored.answers[0].answer, 'final');
});
test('ordered batches acknowledge exact retries and reject gaps/content reuse', async () => {
  const doc = await attempt();
  const batch = { mutationId: 'batch-1', saveSequence: 1, answers: [{ sectionIndex: 0, questionIndex: 0, answer: 2 }] };
  await mutateAssessmentSubmission({ filter: { _id: doc._id }, mutate: (current) => acceptAssessmentBatch(current, batch) });
  const retry = await mutateAssessmentSubmission({ filter: { _id: doc._id }, mutate: (current) => acceptAssessmentBatch(current, batch) });
  assert.equal(retry.result, false);
  assert.equal(retry.changed, false);
  await assert.rejects(mutateAssessmentSubmission({ filter: { _id: doc._id }, mutate: (current) => acceptAssessmentBatch(current, { ...batch, mutationId: 'batch-3', saveSequence: 3 }) }), { code: 'SAVE_SEQUENCE_CONFLICT' });
  await assert.rejects(mutateAssessmentSubmission({ filter: { _id: doc._id }, mutate: (current) => acceptAssessmentBatch(current, { ...batch, answers: [] }) }), { code: 'SAVE_SEQUENCE_CONFLICT' });
});
test('old attempt/session requests and forged grading fields cannot mutate accepted answers', async () => {
  const doc = await attempt();
  assert.throws(() => assertAssessmentSession(doc, { attemptGeneration: 2, sessionId: 'session-a' }), { code: 'ATTEMPT_GENERATION_CONFLICT' });
  assert.throws(() => assertAssessmentSession(doc, { sessionId: 'session-b' }), { code: 'ACTIVE_ASSESSMENT_SESSION' });
  const clean = normalizeAssessmentAnswerChanges([{ sectionIndex: 0, questionIndex: 0, answer: 1, score: 100, executionVerdict: 'AC', jobId: 'forged' }], [{ questions: [{}] }]);
  assert.deepEqual(clean, [{ sectionIndex: 0, questionIndex: 0, answer: 1 }]);
});
test('legacy documents missing a version can be upgraded without losing answers', async () => {
  const id = new mongoose.Types.ObjectId();
  await AssessmentSubmission.collection.insertOne({ _id: id, assessmentId: new mongoose.Types.ObjectId(), studentId: new mongoose.Types.ObjectId(), status: 'in_progress', answers: [] });
  const { submission } = await mutateAssessmentSubmission({ filter: { _id: id }, mutate: (current) => { current.answerRevision = 1; } });
  assert.equal(submission.answerRevision, 1);
  assert.equal(submission.__v, 1);
});
