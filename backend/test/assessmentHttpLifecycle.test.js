import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Assessment from '../src/models/Assessment.js';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';
import AssessmentEvent from '../src/models/AssessmentEvent.js';
import AssessmentAttemptArchive from '../src/models/AssessmentAttemptArchive.js';

// Never load .env, start workers or talk to configured external services.
for (const key of ['CACHE_VALKEY_URL', 'QUEUE_VALKEY_URL', 'REDIS_URL', 'VALKEY_URL', 'REDIS_HOST', 'VALKEY_HOST', 'SUPABASE_URL']) process.env[key] = '';
process.env.EMAIL_ENABLED = 'false';
let mongo, server, base;
const student = { _id: new mongoose.Types.ObjectId(), role: 'student', accessScope: 'platform', name: 'Isolated test' };
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'isolated_assessment_http' });
  await Promise.all([Assessment.init(), AssessmentSubmission.init(), AssessmentEvent.init(), AssessmentAttemptArchive.init()]);
  const c = await import('../src/controllers/assessmentController.js');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = student; next(); });
  app.post('/assessment/:id/start', c.startStudentAssessment);
  app.post('/assessment/:id/setup-step', c.markStudentAssessmentSetupStep);
  app.post('/assessment/:id/begin', c.beginStudentAssessment);
  app.patch('/assessment/:id/answers', c.saveAssessmentProgress);
  app.post('/assessment/:id/heartbeat', c.logStudentHeartbeat);
  app.post('/assessment/:id/monitoring', c.logStudentMonitoring);
  app.post('/assessment/submit', c.submitAssessment);
  app.get('/assessment/:id', c.getStudentAssessment);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});
async function request(path, body, method = 'POST') {
  const response = await fetch(`${base}${path}`, { method, ...(method !== 'GET' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) } : {}) });
  return { status: response.status, body: await response.json() };
}
async function fixture() {
  student._id = new mongoose.Types.ObjectId();
  return Assessment.create({ title: 'LOAD TEST isolated', createdBy: new mongoose.Types.ObjectId(),
    startTime: new Date(Date.now() - 60000), endTime: new Date(Date.now() + 3600000), duration: 30,
    attemptLimit: 2, targetType: 'selected', assignedStudents: [student._id],
    settings: { environmentCheck: false, locationTracking: false },
    sections: [{ sectionName: 'MCQ', type: 'mcq', questions: [
      { type: 'mcq', questionText: 'First?', options: ['A', 'B'], correctOptionIndex: 0 },
      { type: 'mcq', questionText: 'Second?', options: ['A', 'B'], correctOptionIndex: 1 },
    ] }],
  });
}
async function begin(assessment) {
  const root = `/assessment/${assessment._id}`;
  assert.equal((await request(`${root}/start`)).status, 200);
  assert.equal((await request(`${root}/setup-step`, { step: 'final' })).status, 200);
  const result = await request(`${root}/begin`, { sessionId: 'test-session', attemptGeneration: 1 });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return root;
}
const context = { sessionId: 'test-session', attemptGeneration: 1 };
test('HTTP lifecycle persists ordered deltas, ignores forged grading, and issues one final receipt', async () => {
  const assessment = await fixture();
  const root = await begin(assessment);
  const read = await request(root, null, 'GET');
  assert.equal(read.body.assessment.sections[0].questions[0].correctOptionIndex, undefined);
  const batch = { ...context, mutationId: 'first', saveSequence: 1, answers: [{ sectionIndex: 0, questionIndex: 0, answer: 0, executionVerdict: 'AC', jobId: 'forged' }] };
  const saved = await request(`${root}/answers`, batch, 'PATCH');
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.acceptedSequence, 1);
  const retry = await request(`${root}/answers`, batch, 'PATCH');
  assert.equal(retry.body.answerRevision, saved.body.answerRevision);
  const badOrder = await request(`${root}/answers`, { ...batch, mutationId: 'gap', saveSequence: 3 }, 'PATCH');
  assert.equal(badOrder.status, 409);
  const final = { ...context, assessmentId: String(assessment._id), status: 'submitted', mutationId: 'final', saveSequence: 2,
    answers: [{ sectionIndex: 0, questionIndex: 1, answer: 1 }] };
  const responses = await Promise.all(Array.from({ length: 6 }, () => request('/assessment/submit', final)));
  assert.ok(responses.every((response) => response.status === 200), JSON.stringify(responses));
  assert.equal(new Set(responses.map((response) => response.body.receipt)).size, 1);
  assert.ok(responses[0].body.receipt);
  const stored = await AssessmentSubmission.findOne({ assessmentId: assessment._id }).lean();
  assert.equal(stored.answers.length, 2);
  assert.equal(stored.answers[0].jobId, undefined);
  assert.equal(stored.attemptCount, 1);
  assert.equal(stored.pendingWork.status, 'pending');
  assert.equal(stored.evaluationStatus, 'processing');
  assert.equal((await request(`${root}/start`)).status, 409); // no implicit retake during grading
});
test('deadline closes using accepted answers; retry cannot silently accept late edits', async () => {
  const assessment = await fixture();
  const root = await begin(assessment);
  await AssessmentSubmission.updateOne({ assessmentId: assessment._id }, { $set: { startedAt: new Date(Date.now() - 7200000) }, $inc: { __v: 1 } });
  const final = { ...context, assessmentId: String(assessment._id), status: 'submitted', mutationId: 'late-final', saveSequence: 1,
    answers: [{ sectionIndex: 0, questionIndex: 0, answer: 1 }] };
  for (let i = 0; i < 2; i += 1) {
    const result = await request('/assessment/submit', final);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.answersAccepted, false);
    assert.ok(result.body.receipt);
  }
  assert.equal((await AssessmentSubmission.findOne({ assessmentId: assessment._id })).answers.length, 0);
});
test('heartbeat advances version; stale generation is rejected and monitoring is deduplicated outside attempt', async () => {
  const assessment = await fixture();
  const root = await begin(assessment);
  const before = await AssessmentSubmission.findOne({ assessmentId: assessment._id }).lean();
  const heartbeat = await request(`${root}/heartbeat`, { ...context, status: { fullscreen: true, tabActive: true } });
  assert.equal(heartbeat.status, 200, JSON.stringify(heartbeat.body));
  const afterHeartbeat = await AssessmentSubmission.findById(before._id).lean();
  assert.equal(afterHeartbeat.__v, before.__v + 1);
  assert.equal((await request(`${root}/heartbeat`, { ...context, attemptGeneration: 2 })).status, 409);
  const event = { ...context, event: { eventId: 'event-1', type: 'connection', message: 'Restored' } };
  assert.equal((await request(`${root}/monitoring`, event)).status, 200);
  assert.equal((await request(`${root}/monitoring`, event)).status, 200);
  assert.equal(await AssessmentEvent.countDocuments({ submissionId: before._id }), 1);
  const afterEvent = await AssessmentSubmission.findById(before._id).lean();
  assert.equal(afterEvent.__v, afterHeartbeat.__v);
  assert.equal(afterEvent.monitoringEvents.length, 0);
});
test('explicit completed retake archives old attempt, increments generation and rejects old saves', async () => {
  const assessment = await fixture();
  const root = await begin(assessment);
  await request('/assessment/submit', { ...context, assessmentId: String(assessment._id), status: 'submitted', mutationId: 'end', saveSequence: 1, answers: [] });
  await AssessmentSubmission.updateOne({ assessmentId: assessment._id }, { $set: { evaluationStatus: 'completed', 'pendingWork.status': 'completed' }, $inc: { __v: 1 } });
  const result = await request(`${root}/start`);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.submission.attemptGeneration, 2);
  assert.equal(await AssessmentAttemptArchive.countDocuments({ assessmentId: assessment._id }), 1);
  const stale = await request(`${root}/answers`, { ...context, mutationId: 'old', saveSequence: 2, answers: [] }, 'PATCH');
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'ATTEMPT_GENERATION_CONFLICT');
});
