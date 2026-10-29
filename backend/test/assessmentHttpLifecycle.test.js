import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Assessment from '../src/models/Assessment.js';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';
import AssessmentEvent from '../src/models/AssessmentEvent.js';
import AssessmentAttemptArchive from '../src/models/AssessmentAttemptArchive.js';
import Problem from '../src/models/Problem.js';

// Never load .env, start workers or talk to configured external services.
for (const key of ['CACHE_VALKEY_URL', 'QUEUE_VALKEY_URL', 'REDIS_URL', 'VALKEY_URL', 'REDIS_HOST', 'VALKEY_HOST', 'SUPABASE_URL']) process.env[key] = '';
process.env.EMAIL_ENABLED = 'false';
let mongo, server, base, workflow;
const student = { _id: new mongoose.Types.ObjectId(), role: 'student', accessScope: 'platform', name: 'Isolated test' };
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'isolated_assessment_http' });
  await Promise.all([Assessment.init(), AssessmentSubmission.init(), AssessmentEvent.init(), AssessmentAttemptArchive.init()]);
  const c = await import('../src/controllers/assessmentController.js');
  workflow = await import('../src/services/compilerExecutionWorkflowService.js');
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
  app.post('/assessment/:id/violations', c.logStudentViolation);
  app.get('/assessment-dashboard', c.getStudentAssessmentDashboard);
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
async function fixture({ settings = {}, sections } = {}) {
  student._id = new mongoose.Types.ObjectId();
  return Assessment.create({ title: 'LOAD TEST isolated', createdBy: new mongoose.Types.ObjectId(),
    startTime: new Date(Date.now() - 60000), endTime: new Date(Date.now() + 3600000), duration: 30,
    attemptLimit: 2, targetType: 'selected', assignedStudents: [student._id],
    settings: { environmentCheck: false, locationTracking: false, ...settings },
    sections: sections || [{ sectionName: 'MCQ', type: 'mcq', questions: [
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
async function moveDeadline(assessment, set, unset = {}) {
  await AssessmentSubmission.updateOne({ assessmentId: assessment._id }, { $set: set, $unset: unset, $inc: { __v: 1 } });
  return AssessmentSubmission.findOne({ assessmentId: assessment._id }).lean();
}
test('writes inside the submit grace are accepted and the record stays capped at the real deadline', async () => {
  const assessment = await fixture();
  const root = await begin(assessment);
  const { startedAt } = await moveDeadline(assessment, { startedAt: new Date(Date.now() - 1800000 - 10000) });
  const deadline = startedAt.getTime() + 1800000;
  const autosave = await request(`${root}/answers`, { ...context, mutationId: 'grace-save', saveSequence: 1,
    answers: [{ sectionIndex: 0, questionIndex: 0, answer: 0 }] }, 'PATCH');
  assert.equal(autosave.status, 200, JSON.stringify(autosave.body));
  assert.equal(autosave.body.answersAccepted, true);
  assert.equal(autosave.body.status, 'in_progress');
  const final = await request('/assessment/submit', { ...context, assessmentId: String(assessment._id), status: 'submitted',
    mutationId: 'grace-final', saveSequence: 2, answers: [{ sectionIndex: 0, questionIndex: 0, answer: 0 }, { sectionIndex: 0, questionIndex: 1, answer: 1 }] });
  assert.equal(final.status, 200, JSON.stringify(final.body));
  assert.equal(final.body.answersAccepted, true);
  assert.ok(final.body.receipt);
  const stored = await AssessmentSubmission.findOne({ assessmentId: assessment._id }).lean();
  assert.equal(stored.status, 'submitted');
  assert.equal(stored.answers.length, 2);
  assert.equal(stored.submittedAt.getTime(), deadline);
  assert.equal(stored.timeTakenSec, 1800);
  assert.equal(stored.isLate, false);
});
test('a write after the submit grace finalizes with the last accepted answers at the real deadline', async () => {
  const assessment = await fixture();
  const root = await begin(assessment);
  const { startedAt } = await moveDeadline(assessment, { startedAt: new Date(Date.now() - 1800000 - 20000) });
  const late = await request(`${root}/answers`, { ...context, mutationId: 'late-save', saveSequence: 1,
    answers: [{ sectionIndex: 0, questionIndex: 0, answer: 0 }] }, 'PATCH');
  assert.equal(late.status, 200, JSON.stringify(late.body));
  assert.equal(late.body.answersAccepted, false);
  assert.equal(late.body.status, 'submitted');
  const stored = await AssessmentSubmission.findOne({ assessmentId: assessment._id }).lean();
  assert.equal(stored.answers.length, 0);
  assert.equal(stored.submittedAt.getTime(), startedAt.getTime() + 1800000);
  assert.equal(stored.timeTakenSec, 1800);
});
test('security pause: autosaves are rejected, but the recheck-timeout auto-submit finishes the attempt', async () => {
  const assessment = await fixture();
  const root = await begin(assessment);
  const now = Date.now();
  // A tab-switch pause clears securityCompletedAt (resetSubmissionSecuritySetup).
  await moveDeadline(assessment, { startedAt: new Date(now - 600000), pauseStartedAt: new Date(now - 10000), securityPauseReason: 'tab_switch' },
    { securityCompletedAt: 1 });
  const paused = await request(`${root}/answers`, { ...context, mutationId: 'paused-save', saveSequence: 1,
    answers: [{ sectionIndex: 0, questionIndex: 0, answer: 0 }] }, 'PATCH');
  assert.equal(paused.status, 409);
  assert.equal(paused.body.code, 'ASSESSMENT_NOT_STARTED');
  // The 180 s recheck expired 5 s ago (inside the grace) when the client auto-submits.
  const pauseStartedAt = new Date(Date.now() - 185000);
  await moveDeadline(assessment, { pauseStartedAt });
  const final = await request('/assessment/submit', { ...context, assessmentId: String(assessment._id), status: 'submitted',
    mutationId: 'recheck-final', saveSequence: 1, answers: [{ sectionIndex: 0, questionIndex: 0, answer: 0 }] });
  assert.equal(final.status, 200, JSON.stringify(final.body));
  assert.equal(final.body.answersAccepted, true);
  assert.ok(final.body.receipt);
  const stored = await AssessmentSubmission.findOne({ assessmentId: assessment._id }).lean();
  assert.equal(stored.status, 'submitted');
  assert.equal(stored.answers.length, 1);
  assert.equal(stored.submittedAt.getTime(), pauseStartedAt.getTime() + 180000);
  assert.equal(stored.pauseStartedAt, undefined);
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
test('the question paper is withheld until begin; the setup screen gets a section summary', async () => {
  const assessment = await fixture();
  const root = `/assessment/${assessment._id}`;
  const unlocked = await request(`${root}/start`);
  assert.equal(unlocked.status, 200, JSON.stringify(unlocked.body));
  assert.deepEqual(unlocked.body.assessment.sections, []);
  const [summary] = unlocked.body.assessment.sectionSummary;
  assert.equal(unlocked.body.assessment.sectionSummary.length, 1);
  assert.equal(summary.sectionName, 'MCQ');
  assert.equal(summary.type, 'mcq');
  assert.equal(summary.questionCount, 2);
  assert.ok(Number.isFinite(summary.marksPerQuestion) && Number.isFinite(summary.totalMarks) && summary.totalMarks > 0);
  assert.doesNotMatch(JSON.stringify(unlocked.body), /First\?/);
  for (const field of ['assignedStudents', 'createdBy', 'questionSets', 'invitationTemplate']) assert.equal(unlocked.body.assessment[field], undefined, field);
  const beforeBegin = await request(root, null, 'GET');
  assert.deepEqual(beforeBegin.body.assessment.sections, []);
  assert.equal((await request(`${root}/setup-step`, { step: 'final' })).status, 200);
  const begun = await request(`${root}/begin`, { sessionId: 'test-session', attemptGeneration: 1 });
  assert.equal(begun.body.assessment.sections[0].questions.length, 2);
  assert.equal(begun.body.assessment.sections[0].questions[0].correctOptionIndex, undefined);
});
test('an in-progress attempt is never graded back; correct answers wait for the window to close', async () => {
  const assessment = await fixture({ settings: { showResultsAfterSubmit: true, showCorrectAnswers: true } });
  const root = await begin(assessment);
  await request(`${root}/answers`, { ...context, mutationId: 'probe', saveSequence: 1, answers: [{ sectionIndex: 0, questionIndex: 0, answer: 0 }] }, 'PATCH');
  const live = await request('/assessment-dashboard', null, 'GET');
  assert.equal(live.status, 200, JSON.stringify(live.body));
  assert.doesNotMatch(JSON.stringify(live.body), /"isCorrect":true|"correctOptionIndex"/);
  const findRow = (body) => body.reports.find((row) => String(row.assessmentId) === String(assessment._id));
  const partial = findRow(live.body);
  assert.ok(partial, 'report row present');
  assert.deepEqual(partial.questionWise, []);
  assert.equal(partial.score, null);
  assert.equal(partial.permissions.canViewQuestionReview, false);
  await request('/assessment/submit', { ...context, assessmentId: String(assessment._id), status: 'submitted', mutationId: 'final', saveSequence: 2, answers: [{ sectionIndex: 0, questionIndex: 0, answer: 0 }] });
  await AssessmentSubmission.updateOne({ assessmentId: assessment._id }, { $set: { evaluationStatus: 'completed', score: 2 }, $inc: { __v: 1 } });
  const done = findRow((await request('/assessment-dashboard', null, 'GET')).body);
  assert.equal(done.permissions.canViewQuestionReview, true);
  assert.equal(done.permissions.canViewCorrectAnswers, false);
  assert.ok(done.questionWise.length > 0);
  assert.ok(done.questionWise.every((row) => row.correctOptionIndex === undefined && row.correctAnswer === undefined));
});
test('a tab-switch pause gives back at most 30 s, and no pause starts after the deadline', async () => {
  const assessment = await fixture({ settings: { tabSwitchLimit: 1, tabSwitchAction: 'pause' } });
  const root = await begin(assessment);
  const violation = (eventId, meta) => request(`${root}/violations`, { ...context, eventId, type: 'tab_switch', message: 'left', ...(meta ? { meta } : {}) });
  // A client warningOnly flag cannot cancel a tab-switch penalty.
  const paused = await violation('switch-1', { warningOnly: true });
  assert.equal(paused.status, 200, JSON.stringify(paused.body));
  assert.equal(paused.body.action, 'pause');
  await AssessmentSubmission.updateOne({ assessmentId: assessment._id }, { $set: { pauseStartedAt: new Date(Date.now() - 120000) }, $inc: { __v: 1 } });
  assert.equal((await request(`${root}/setup-step`, { ...context, step: 'final' })).status, 200);
  const resumed = await request(`${root}/begin`, { sessionId: 'test-session', attemptGeneration: 1 });
  assert.equal(resumed.status, 200, JSON.stringify(resumed.body));
  let stored = await AssessmentSubmission.findOne({ assessmentId: assessment._id }).lean();
  assert.equal(stored.pausedDurationMs, 30000);
  assert.equal(stored.pauseStartedAt, undefined);
  // Five seconds past the deadline (inside the submit grace): recorded, not paused.
  await AssessmentSubmission.updateOne({ assessmentId: assessment._id }, { $set: { startedAt: new Date(Date.now() - 1800000 - 30000 - 5000) }, $inc: { __v: 1 } });
  const late = await violation('switch-2');
  assert.equal(late.body.action, 'warn');
  stored = await AssessmentSubmission.findOne({ assessmentId: assessment._id }).lean();
  assert.equal(stored.pauseStartedAt, undefined);
  assert.ok(stored.securityCompletedAt);
  assert.equal(stored.status, 'in_progress');
});
test('violation metadata is bounded and warningOnly is honoured only for soft types', async () => {
  const assessment = await fixture();
  const root = await begin(assessment);
  const huge = await request(`${root}/violations`, { ...context, eventId: 'big', type: 'context_menu', message: 'menu',
    meta: { source: 'contextmenu', warningOnly: true, blob: 'x'.repeat(5000), nested: { deep: 'y'.repeat(5000) } } });
  assert.equal(huge.status, 200, JSON.stringify(huge.body));
  const duplicate = await request(`${root}/violations`, { ...context, eventId: 'dup', type: 'duplicate_tab', message: 'tab', meta: { warningOnly: true } });
  assert.equal(duplicate.status, 200);
  const stored = await AssessmentSubmission.findOne({ assessmentId: assessment._id }).lean();
  const [menu, tab] = ['big', 'dup'].map((id) => stored.violationLog.find((entry) => entry.eventId === id));
  assert.ok(Buffer.byteLength(JSON.stringify(menu.meta)) <= 2200);
  assert.equal(menu.meta.metaTruncated, true);
  assert.equal(menu.meta.warningOnly, true);
  assert.equal(menu.meta.weight, 0);
  assert.equal(tab.meta.warningOnly, undefined);
  assert.ok(tab.meta.weight > 0);
});
test('heartbeats record inconsistency and silence as review flags only', async () => {
  const assessment = await fixture({ settings: { tabSwitchDetection: true } });
  const root = await begin(assessment);
  await AssessmentSubmission.updateOne({ assessmentId: assessment._id }, { $set: { activeSessionHeartbeatAt: new Date(Date.now() - 90000) }, $inc: { __v: 1 } });
  const beat = await request(`${root}/heartbeat`, { ...context, status: { fullscreen: true, tabActive: false } });
  assert.equal(beat.status, 200, JSON.stringify(beat.body));
  const stored = await AssessmentSubmission.findOne({ assessmentId: assessment._id }).lean();
  assert.equal(stored.inconsistentHeartbeatCount, 1);
  assert.equal(stored.heartbeatGapCount, 1);
  assert.equal(stored.violationScore, 0);
});
test('stored coding results reach the student without hidden test details', async () => {
  const assessment = await fixture();
  const root = await begin(assessment);
  await AssessmentSubmission.updateOne({ assessmentId: assessment._id }, { $set: { answers: [{ sectionIndex: 0, questionIndex: 0, answer: 0,
    executionResult: { status: 'Wrong Answer', failedTestCase: { index: 2, input: 'HIDDEN-IN', expected: 'HIDDEN-OUT', actual: 'mine' } },
    adminExecutionResult: { status: 'Wrong Answer', failedTestCase: { index: 2, hidden: true, input: 'HIDDEN-ADMIN', expected: 'HIDDEN-OUT' } } }] }, $inc: { __v: 1 } });
  const read = await request(root, null, 'GET');
  assert.equal(read.status, 200);
  assert.doesNotMatch(JSON.stringify(read.body), /HIDDEN-/);
  assert.deepEqual(read.body.submission.answers[0].executionResult.failedTestCase, { index: 2, hidden: true });
  assert.equal(read.body.submission.answers[0].adminExecutionResult, undefined);
  // The admin report shows the full admin-only result.
  const { buildAdminSubmitResult } = workflow;
  const full = buildAdminSubmitResult({ status: 'WA', failedCase: { index: 2, hidden: true, input: 'X'.repeat(9000), expectedOutput: 'Y' } });
  assert.equal(full.failedTestCase.hidden, true);
  assert.ok(full.failedTestCase.input.length <= 4001);
  assert.equal(full.failedTestCase.expected, 'Y');
});
async function codingFixture({ supportedLanguages = ['python'] } = {}) {
  const problem = await Problem.create({ title: 'Echo', createdBy: new mongoose.Types.ObjectId(), status: 'published', visibility: 'assessment', supportedLanguages });
  const assessment = await fixture({ sections: [{ sectionName: 'Code', type: 'coding', marksPerQuestion: 10, questions: [
    { type: 'coding', questionText: 'Echo', problemId: problem._id, coding: { problemId: problem._id, supportedLanguages } },
  ] }] });
  return { problem, assessment };
}
test('coding submits are refused after time-up and during a security re-check', async () => {
  const { problem, assessment } = await codingFixture();
  await begin(assessment);
  const submit = () => workflow.enqueueCompilerSubmitJob({ user: student, body: {
    problemId: String(problem._id), assessmentId: String(assessment._id), language: 'python', source_code: 'print(input())' } });
  await AssessmentSubmission.updateOne({ assessmentId: assessment._id }, { $set: { pauseStartedAt: new Date(), securityPauseReason: 'tab_switch' }, $inc: { __v: 1 } });
  await assert.rejects(submit(), { status: 409, message: /re-check/ });
  await AssessmentSubmission.updateOne({ assessmentId: assessment._id }, { $unset: { pauseStartedAt: 1, securityPauseReason: 1 },
    $set: { startedAt: new Date(Date.now() - 1800000 - 20000) }, $inc: { __v: 1 } });
  await assert.rejects(submit(), { status: 409, message: /not active/ });
});
test('final coding evaluation enforces the question language lock', async () => {
  const { problem, assessment } = await codingFixture({ supportedLanguages: ['c'] });
  await begin(assessment);
  const doc = await AssessmentSubmission.findOneAndUpdate({ assessmentId: assessment._id }, { $set: {
    status: 'submitted', evaluationVersion: 1, submittedAt: new Date(),
    answers: [{ sectionIndex: 0, questionIndex: 0, code: 'print(1)', language: 'python', jobId: 'lock-job', executionStatus: 'queued' }],
  }, $inc: { __v: 1 } }, { new: true });
  const result = await workflow.processAssessmentExecutionJob({ name: 'assessment-final-code-submit', attemptsMade: 0, maxAttempts: 3, data: {
    executionJobId: 'lock-job', assessmentSubmissionId: String(doc._id), assessmentId: String(assessment._id), studentId: String(student._id),
    problemId: String(problem._id), sectionIndex: 0, questionIndex: 0, languageId: 71, languageKey: 'python', sourceCode: 'print(1)',
    attemptGeneration: 1, evaluationVersion: 1,
  } });
  assert.equal(result.response.status, 'Compilation Error');
  assert.equal(result.response.error, 'Language not allowed for this question.');
  const stored = await AssessmentSubmission.findById(doc._id).lean();
  assert.equal(stored.answers[0].executionVerdict, 'CE');
});
