import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Assessment from '../src/models/Assessment.js';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';
import AssessmentEvent from '../src/models/AssessmentEvent.js';
import User from '../src/models/User.js';
import { requireCoordinatorPermission } from '../src/middleware/auth.js';
import { authorizeAssessmentReportAccess } from '../src/services/assessmentReportAccess.js';
import {
  createAssessmentReportNotifier, registerAssessmentReportSocketHandlers, assessmentReportRoom,
} from '../src/services/assessmentReportRealtime.js';

// Never load .env, start workers or talk to configured external services.
for (const key of ['CACHE_VALKEY_URL', 'QUEUE_VALKEY_URL', 'REDIS_URL', 'VALKEY_URL', 'REDIS_HOST', 'VALKEY_HOST', 'SUPABASE_URL']) process.env[key] = '';
process.env.EMAIL_ENABLED = 'false';

let mongo, server, base;
let actor = null;
const ownerId = new mongoose.Types.ObjectId();
const admin = { _id: new mongoose.Types.ObjectId(), role: 'admin', email: 'admin@test' };
const coordinator = (permissions, scope = 'own', id = ownerId) => ({
  _id: id, role: 'coordinator', email: 'coord@test', coordinatorPermissions: permissions, coordinatorDataScope: scope,
});

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'isolated_assessment_live_report' });
  await Promise.all([Assessment.init(), AssessmentSubmission.init(), AssessmentEvent.init(), User.init()]);
  const c = await import('../src/controllers/assessmentController.js');
  const live = await import('../src/controllers/assessmentLiveReportController.js');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = actor; next(); });
  app.get('/admin/assessment/:id/report/roster', requireCoordinatorPermission('coordinator.assessment.reports'), live.getAssessmentRoster);
  app.post('/admin/assessment/:id/release-results', requireCoordinatorPermission('coordinator.assessment.edit'), live.releaseAssessmentResults);
  app.get('/admin/assessment/submissions/:submissionId/violations', requireCoordinatorPermission('coordinator.assessment.reports'), c.getSubmissionViolations);
  app.get('/student/assessment-dashboard', c.getStudentAssessmentDashboard);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

async function call(user, path, { method = 'GET', body } = {}) {
  actor = user;
  const response = await fetch(`${base}${path}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

let fixtureCount = 0;
async function fixture({ settings = {}, createdBy = ownerId } = {}) {
  fixtureCount += 1;
  const students = await User.create([1, 2, 3].map((n) => ({
    name: `Student ${n}`, email: `s${n}-${new mongoose.Types.ObjectId()}@test`, passwordHash: 'x'.repeat(60), role: 'student', studentId: `R${n}-${fixtureCount}`,
  })));
  const assessment = await Assessment.create({ title: 'Live report', createdBy, lifecycleStatus: 'published',
    startTime: new Date(Date.now() - 600000), endTime: new Date(Date.now() + 3600000), duration: 30, totalMarks: 4,
    targetType: 'selected', assignedStudents: students.map((s) => s._id), passwordHash: 'secret-hash',
    settings: { environmentCheck: false, locationTracking: false, ...settings },
    sections: [{ sectionName: 'MCQ', type: 'mcq', questions: [
      { type: 'mcq', questionText: 'First?', options: ['A', 'B'], correctOptionIndex: 0, points: 2 },
      { type: 'mcq', questionText: 'Second?', options: ['A', 'B'], correctOptionIndex: 1, points: 2 },
    ] }],
  });
  const now = new Date();
  const delivered = assessment.toObject().sections;
  const [graded, live] = await AssessmentSubmission.create([
    { assessmentId: assessment._id, studentId: students[0]._id, status: 'submitted', startedAt: new Date(now - 300000), submittedAt: now,
      evaluationStatus: 'completed', score: 3, maxMarks: 4, timeTakenSec: 250, tabSwitches: 2, violationScore: 2,
      deliverySections: delivered, deliveryPreparedAt: now, proctoringSnapshots: [{ type: 'image', dataUrl: 'HEAVY-SNAPSHOT' }],
      answers: [{ sectionIndex: 0, questionIndex: 0, answer: 0 }, { sectionIndex: 0, questionIndex: 1, answer: 1 }] },
    { assessmentId: assessment._id, studentId: students[1]._id, status: 'in_progress', startedAt: new Date(now - 60000),
      evaluationStatus: 'completed', score: 2, maxMarks: 4, deliverySections: delivered, deliveryPreparedAt: now,
      answers: [{ sectionIndex: 0, questionIndex: 0, answer: 1 }, { sectionIndex: 0, questionIndex: 1, answer: null }] },
  ]);
  return { assessment, students, graded, live };
}

test('one access rule: admins, permitted owners and all-scope coordinators pass; others are refused', async () => {
  const { assessment } = await fixture();
  const id = String(assessment._id);
  assert.equal((await authorizeAssessmentReportAccess(admin, id)).assessmentId, id);
  assert.ok(await authorizeAssessmentReportAccess(coordinator(['coordinator.assessment.reports']), id));
  assert.ok(await authorizeAssessmentReportAccess(coordinator(['coordinator.assessment.reports'], 'all', new mongoose.Types.ObjectId()), id));
  const refusals = [
    [coordinator(['coordinator.assessment.reports'], 'own', new mongoose.Types.ObjectId()), id, 403],
    [coordinator(['coordinator.assessment.view']), id, 403],
    [{ ...coordinator(['coordinator.assessment.reports']), isActive: false }, id, 403],
    [{ _id: new mongoose.Types.ObjectId(), role: 'student' }, id, 403],
    [null, id, 401],
    [admin, 'not-an-id', 400],
    [admin, String(new mongoose.Types.ObjectId()), 404],
  ];
  for (const [user, assessmentId, status] of refusals) {
    await assert.rejects(authorizeAssessmentReportAccess(user, assessmentId), { status });
  }
});

function fakeIo() {
  const io = new EventEmitter();
  const connect = ({ universityId = 'platform', userId = String(admin._id) } = {}) => {
    const socket = new EventEmitter();
    Object.assign(socket, { universityId, userId, rooms: new Set(['self']), disconnected: false,
      join(room) { this.rooms.add(room); }, leave(room) { this.rooms.delete(room); } });
    io.emit('connection', socket);
    return socket;
  };
  return { io, connect };
}
const ask = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

test('socket subscriptions use the shared rule, tenant-scoped rooms and a per-socket cap', async () => {
  const { assessment } = await fixture();
  const id = String(assessment._id);
  const users = new Map([[String(admin._id), admin], ['outsider', coordinator(['coordinator.assessment.reports'], 'own', new mongoose.Types.ObjectId())]]);
  const { io, connect } = fakeIo();
  registerAssessmentReportSocketHandlers(io, { loadUser: async (userId) => users.get(userId), runInTenant: (_socket, work) => work() });

  const socket = connect({ universityId: 'geu-1' });
  assert.deepEqual(await ask(socket, 'assessment-report:subscribe', { assessmentId: id }), { ok: true });
  assert.ok(socket.rooms.has(assessmentReportRoom(id, 'geu-1')));
  assert.deepEqual(await ask(socket, 'assessment-report:subscribe', { assessmentId: 'x' }), { ok: false, error: 'INVALID_ASSESSMENT_ID' });
  assert.deepEqual(await ask(socket, 'assessment-report:subscribe', { assessmentId: String(new mongoose.Types.ObjectId()) }), { ok: false, error: 'ASSESSMENT_NOT_FOUND' });

  const outsider = connect({ userId: 'outsider' });
  assert.deepEqual(await ask(outsider, 'assessment-report:subscribe', { assessmentId: id }), { ok: false, error: 'FORBIDDEN' });
  assert.equal([...outsider.rooms].some((room) => room.startsWith('assessment-report:')), false);

  const extra = await Assessment.insertMany([1, 2, 3, 4, 5].map((n) => ({ title: `Extra ${n}`, createdBy: ownerId, startTime: new Date(), endTime: new Date(Date.now() + 1000), duration: 1 })));
  const results = [];
  for (const doc of extra) results.push(await ask(socket, 'assessment-report:subscribe', { assessmentId: String(doc._id) }));
  assert.deepEqual(results.at(-1), { ok: false, error: 'TOO_MANY_SUBSCRIPTIONS' });
  assert.deepEqual(await ask(socket, 'assessment-report:unsubscribe', { assessmentId: id }), { ok: true });
  assert.equal(socket.rooms.has(assessmentReportRoom(id, 'geu-1')), false);
});

test('change hints are coalesced per assessment to one per window with merged kinds', () => {
  let clock = 1_000_000;
  const timers = [];
  const sent = [];
  const notifier = createAssessmentReportNotifier({
    windowMs: 2000, now: () => clock, setTimer: (fn, ms) => { timers.push({ fn, at: clock + ms }); return timers.length; },
    emit: (room, payload) => sent.push({ room, payload }),
  });
  const a = String(new mongoose.Types.ObjectId());
  const b = String(new mongoose.Types.ObjectId());
  notifier.notify(a, 'answers');
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].payload.kinds, ['answers']);
  assert.equal(sent[0].room, `assessment-report:platform:${a}`);
  clock += 300; notifier.notify(a, 'violation');
  clock += 300; notifier.notify(a, 'answers');
  clock += 300; notifier.notify(a, 'submitted');
  notifier.notify(b, 'started');
  notifier.notify(a, 'not-a-kind');
  notifier.notify('bad-id', 'answers');
  assert.equal(sent.length, 2); // b's first hint goes out at once
  assert.equal(timers.length, 1);
  clock = timers[0].at; timers[0].fn();
  assert.equal(sent.length, 3);
  assert.deepEqual(sent[2].payload, { assessmentId: a, rev: sent[2].payload.rev, kinds: ['answers', 'submitted', 'violation'] });
  assert.ok(sent[2].payload.rev > sent[0].payload.rev);
  assert.doesNotThrow(() => createAssessmentReportNotifier({ emit: () => { throw new Error('adapter down'); } }).notify(a, 'answers'));
});

test('roster: full list with not-started candidates, graded-only scores, no heavy fields; deltas by cursor', async () => {
  const { assessment, students, graded, live } = await fixture();
  const path = `/admin/assessment/${assessment._id}/report/roster`;
  const full = await call(admin, path);
  assert.equal(full.status, 200, JSON.stringify(full.body));
  assert.equal(full.headers.get('cache-control'), 'no-store');
  assert.equal(full.body.full, true);
  assert.equal(full.body.rows.length, 3);
  assert.doesNotMatch(JSON.stringify(full.body), /HEAVY-SNAPSHOT|First\?|correctOptionIndex|secret-hash|deliverySections|"answers"/);
  assert.deepEqual(Object.keys(full.body.assessment).sort(), ['_id', 'duration', 'endTime', 'passPercentage', 'resultsReleasedAt',
    'showResultsAfterSubmit', 'startTime', 'status', 'title', 'totalMarks', 'totalQuestions']);
  assert.equal(full.body.assessment.resultsReleasedAt, null);
  assert.equal(full.body.assessment.showResultsAfterSubmit, false);
  assert.equal(full.body.assessment.totalQuestions, 2);
  assert.equal(full.body.assessment.status, 'Active');
  const byKey = new Map(full.body.rows.map((row) => [row.key, row]));
  const done = byKey.get(String(graded._id));
  assert.equal(done.score, 3);
  assert.equal(done.percentage, 75);
  assert.equal(done.passed, true);
  assert.equal(done.answeredCount, 2);
  assert.equal(done.totalQuestions, 2);
  assert.equal(done.flagged, true);
  assert.match(done.rollNo, /^R1-/);
  const running = byKey.get(String(live._id));
  assert.equal(running.status, 'in_progress');
  assert.equal(running.score, null);
  assert.equal(running.percentage, null);
  assert.equal(running.passed, null);
  assert.equal(running.answeredCount, 1);
  const waiting = byKey.get(`student:${students[2]._id}`);
  assert.equal(waiting.status, 'not_started');
  assert.equal(waiting.submissionId, null);
  assert.equal(waiting.name, 'Student 3');

  // A later write appears in the delta (within the overlap window clients merge by key).
  await new Promise((resolve) => setTimeout(resolve, 20));
  await AssessmentSubmission.updateOne({ _id: live._id }, { $set: { tabSwitches: 1 } });
  const delta = await call(admin, `${path}?since=${encodeURIComponent(full.body.cursor)}`);
  assert.equal(delta.status, 200);
  assert.equal(delta.body.full, false);
  assert.ok(delta.body.rows.every((row) => row.submissionId));
  assert.equal(delta.body.rows.find((row) => row.key === String(live._id)).tabSwitches, 1);
  assert.ok(new Date(delta.body.cursor) >= new Date(full.body.cursor));
  const future = await call(admin, `${path}?since=${encodeURIComponent(new Date(Date.now() + 60000).toISOString())}`);
  assert.deepEqual(future.body.rows, []);

  assert.equal((await call(admin, `${path}?since=yesterday`)).status, 400);
  assert.equal((await call(admin, '/admin/assessment/nope/report/roster')).status, 400);
  assert.equal((await call(coordinator(['coordinator.assessment.reports'], 'own', new mongoose.Types.ObjectId()), path)).status, 403);
  assert.equal((await call(coordinator(['coordinator.assessment.reports']), path)).status, 200);
});

test('release-results: permission matrix, idempotent release time, and the student result gate', async () => {
  const { assessment, students } = await fixture();
  const path = `/admin/assessment/${assessment._id}/release-results`;
  assert.equal((await call(admin, path, { method: 'POST', body: { release: 'yes' } })).status, 400);
  assert.equal((await call(coordinator(['coordinator.assessment.reports']), path, { method: 'POST', body: { release: true } })).status, 403);
  assert.equal((await call(coordinator(['coordinator.assessment.edit'], 'own', new mongoose.Types.ObjectId()), path, { method: 'POST', body: { release: true } })).status, 403);
  assert.equal((await call({ _id: students[0]._id, role: 'student' }, path, { method: 'POST', body: { release: true } })).status, 403);

  const studentUser = { _id: students[0]._id, role: 'student', accessScope: 'platform' };
  const studentRow = async () => (await call(studentUser, '/student/assessment-dashboard')).body.reports
    .find((row) => String(row.assessmentId) === String(assessment._id));
  const held = await studentRow();
  assert.equal(held.permissions.resultReleased, false);
  assert.equal(held.score, null);
  assert.equal(held.evaluationStatus, null);
  assert.deepEqual(held.questionWise, []);

  const released = await call(coordinator(['coordinator.assessment.edit']), path, { method: 'POST', body: { release: true } });
  assert.equal(released.status, 200, JSON.stringify(released.body));
  assert.ok(released.body.resultsReleasedAt);
  const again = await call(admin, path, { method: 'POST', body: { release: true } });
  assert.equal(again.body.resultsReleasedAt, released.body.resultsReleasedAt);
  const roster = await call(admin, `/admin/assessment/${assessment._id}/report/roster`);
  assert.equal(roster.body.assessment.resultsReleasedAt, released.body.resultsReleasedAt);
  const open = await studentRow();
  assert.equal(open.permissions.resultReleased, true);
  assert.equal(open.score, 3);

  // Results are held again while grading is still running.
  await AssessmentSubmission.updateOne({ assessmentId: assessment._id, studentId: students[0]._id }, { $set: { evaluationStatus: 'processing' } });
  assert.equal((await studentRow()).permissions.resultReleased, false);

  const withdrawn = await call(admin, path, { method: 'POST', body: { release: false } });
  assert.equal(withdrawn.body.resultsReleasedAt, null);
  assert.equal((await Assessment.findById(assessment._id).lean()).settings.resultsReleasedAt, null);
});

test('violation report projects the assessment and validates identifiers', async () => {
  const { assessment, graded } = await fixture({ settings: { audioMonitoring: true } });
  assert.equal((await call(admin, '/admin/assessment/submissions/not-an-id/violations')).status, 400);
  assert.equal((await call(admin, `/admin/assessment/submissions/${graded._id}/violations?before=bad`)).status, 400);
  const report = await call(admin, `/admin/assessment/submissions/${graded._id}/violations`);
  assert.equal(report.status, 200, JSON.stringify(report.body));
  assert.deepEqual(Object.keys(report.body.assessment).sort(), ['_id', 'settings', 'title']);
  assert.equal(report.body.assessment.settings.audioMonitoring, true);
  assert.doesNotMatch(JSON.stringify(report.body.assessment), /secret-hash|passwordHash|sections|assignedStudents|correctOptionIndex/);
  assert.equal(String(report.body.assessment._id), String(assessment._id));
  assert.equal((await call(coordinator(['coordinator.assessment.reports'], 'own', new mongoose.Types.ObjectId()), `/admin/assessment/submissions/${graded._id}/violations`)).status, 403);
});
