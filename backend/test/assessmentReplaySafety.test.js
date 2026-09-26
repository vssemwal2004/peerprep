import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Assessment from '../src/models/Assessment.js';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';
import { networkPauseCreditFields } from '../src/services/assessmentHeartbeatPolicy.js';
import { acceptAssessmentBatch, assessmentBatchMatches, assertAssessmentSession, assertAssessmentWriteProtocol } from '../src/services/assessmentPersistenceService.js';

// All persistence uses an ephemeral database, with external clients disabled.
for (const key of ['CACHE_VALKEY_URL', 'QUEUE_VALKEY_URL', 'REDIS_URL', 'VALKEY_URL', 'REDIS_HOST', 'VALKEY_HOST', 'SUPABASE_URL']) process.env[key] = '';
process.env.EMAIL_ENABLED = 'false';
process.env.ASSESSMENT_REQUIRE_SAVE_PROTOCOL = 'false';
process.env.ASSESSMENT_NETWORK_PAUSE_CREDIT_ENABLED = 'false';
let mongo, handlers;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'isolated_assessment_replay' });
  await Promise.all([Assessment.init(), AssessmentSubmission.init()]);
  handlers = await import('../src/controllers/assessmentController.js');
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

async function fixture({ sessionId = 'test-session' } = {}) {
  const now = new Date();
  const student = { _id: new mongoose.Types.ObjectId(), role: 'student', accessScope: 'platform' };
  const assessment = await Assessment.create({ title: 'Replay isolated', createdBy: new mongoose.Types.ObjectId(),
    startTime: new Date(now - 600000), endTime: new Date(now.getTime() + 1800000), duration: 30,
    attemptLimit: 1, targetType: 'selected', assignedStudents: [student._id],
    sections: [{ sectionName: 'MCQ', type: 'mcq', questions: [{ type: 'mcq', questionText: 'Choose', options: ['A', 'B'], correctOptionIndex: 0 }] }],
  });
  const submission = await AssessmentSubmission.create({ assessmentId: assessment._id, studentId: student._id,
    status: 'in_progress', startedAt: new Date(now - 300000), securityCompletedAt: now,
    activeSessionId: sessionId, activeSessionHeartbeatAt: now, securityHeartbeat: { at: new Date(now - 180000) },
    deliverySections: assessment.sections, deliveryPreparedAt: now,
  });
  return { student, assessment, submission };
}

async function invoke(handler, context, body) {
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await handler({ body, params: { id: String(context.assessment._id) }, user: context.student, headers: {}, ip: '127.0.0.1' }, response);
  return response;
}

test('exact saved-batch matching rejects reused IDs, sequence or payload changes', () => {
  const doc = {};
  const original = { mutationId: 'original', saveSequence: 1, answers: [{ answer: 0 }], final: true };
  assert.equal(acceptAssessmentBatch(doc, original), true);
  assert.equal(assessmentBatchMatches(doc, original), true);
  assert.equal(assessmentBatchMatches(doc, { ...original, answers: [{ answer: 1 }] }), false);
  assert.equal(assessmentBatchMatches(doc, { ...original, saveSequence: 2 }), false);
  assert.equal(assessmentBatchMatches(doc, { ...original, final: false }), false);
});

test('terminal replay acknowledges only the original payload and preserves violation status', async () => {
  const context = await fixture();
  const final = { assessmentId: String(context.assessment._id), submissionId: String(context.submission._id),
    sessionId: 'test-session', attemptGeneration: 1, mutationId: 'final-receipt', saveSequence: 1,
    status: 'violation', answers: [{ sectionIndex: 0, questionIndex: 0, answer: 0 }] };
  const first = await invoke(handlers.submitAssessment, context, final);
  assert.equal(first.statusCode, 200, JSON.stringify(first.body));
  assert.equal(first.body.status, 'violation');
  assert.equal(first.body.answersAccepted, true);
  const retry = await invoke(handlers.submitAssessment, context, final);
  assert.equal(retry.body.answersAccepted, true);
  assert.equal(retry.body.receipt, first.body.receipt);
  for (const changed of [
    { ...final, saveSequence: 2 },
    { ...final, answers: [{ sectionIndex: 0, questionIndex: 0, answer: 1 }] },
  ]) {
    const replay = await invoke(handlers.submitAssessment, context, changed);
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.body.answersAccepted, false);
    assert.equal(replay.body.receipt, first.body.receipt);
  }
  assert.equal((await AssessmentSubmission.findById(context.submission._id)).answers[0].answer, 0);
});

test('heartbeat stores dollar-prefixed sessions literally and gives no default client time credit', async () => {
  const context = await fixture({ sessionId: '$status' });
  const before = context.submission.pausedDurationMs;
  const response = await invoke(handlers.logStudentHeartbeat, context, {
    submissionId: String(context.submission._id), sessionId: '$status', attemptGeneration: 1,
    networkPauseStartedAt: new Date(Date.now() - 120000).toISOString(), status: { tabActive: true },
  });
  assert.equal(response.statusCode, 200, JSON.stringify(response.body));
  const stored = await AssessmentSubmission.findById(context.submission._id);
  assert.equal(stored.activeSessionId, '$status');
  assert.equal(stored.pausedDurationMs, before);
  assert.equal(stored.lastNetworkPauseAt, undefined);
});

test('opt-in network credit uses durable gap, caps credit, and cannot resurrect an expired attempt', async () => {
  const context = await fixture();
  const now = new Date();
  const apply = async (at, requestedAt) => AssessmentSubmission.findByIdAndUpdate(context.submission._id, [{ $set: {
    ...networkPauseCreditFields(context.assessment, at, requestedAt, { enabled: true }),
    'securityHeartbeat.at': at,
  } }], { new: true });
  await AssessmentSubmission.updateOne({ _id: context.submission._id }, { $set: { 'securityHeartbeat.at': new Date(now - 90000) } });
  let stored = await apply(now, new Date(now - 3600000)); // lying timestamp does not decide credit
  assert.equal(stored.pausedDurationMs, 30000);
  stored = await apply(new Date(now.getTime() + 10), new Date(now - 3600000));
  assert.equal(stored.pausedDurationMs, 30000);
  await AssessmentSubmission.updateOne({ _id: stored._id }, { $set: { pausedDurationMs: 590000, 'securityHeartbeat.at': new Date(now - 900000) } });
  stored = await apply(now, new Date(now - 900000));
  assert.equal(stored.pausedDurationMs, 600000);
  await AssessmentSubmission.updateOne({ _id: stored._id }, { $set: { pausedDurationMs: 0, startedAt: new Date(now - 7200000), 'securityHeartbeat.at': new Date(now - 900000) } });
  stored = await apply(now, new Date(now - 900000));
  assert.equal(stored.pausedDurationMs, 0);
  assert.deepEqual(networkPauseCreditFields({ ...context.assessment.toObject(), manuallyCompletedAt: now }, now, new Date(now - 900000), { enabled: true }), {});
});

test('submission identity and optional strict protocol reject ambient-user replay and old clients', async () => {
  const context = await fixture();
  const wrongId = String(new mongoose.Types.ObjectId());
  assert.throws(() => assertAssessmentSession(context.submission, { submissionId: wrongId }), { code: 'ATTEMPT_IDENTITY_CONFLICT' });
  const heartbeat = await invoke(handlers.logStudentHeartbeat, context, { submissionId: wrongId, sessionId: 'test-session', attemptGeneration: 1 });
  assert.equal(heartbeat.statusCode, 409);
  assert.equal(heartbeat.body.code, 'ATTEMPT_IDENTITY_CONFLICT');
  process.env.ASSESSMENT_REQUIRE_SAVE_PROTOCOL = 'true';
  try {
    assert.throws(() => assertAssessmentWriteProtocol({}), { code: 'CLIENT_UPGRADE_REQUIRED', status: 426 });
    assert.doesNotThrow(() => assertAssessmentWriteProtocol({ submissionId: String(context.submission._id), attemptGeneration: 1, mutationId: 'a', saveSequence: 1 }));
    const rejected = await invoke(handlers.saveAssessmentProgress, context, { answers: [], sessionId: 'test-session' });
    assert.equal(rejected.statusCode, 426);
  } finally { process.env.ASSESSMENT_REQUIRE_SAVE_PROTOCOL = 'false'; }
});
