import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Assessment from '../src/models/Assessment.js';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';
import AssessmentReportSummary from '../src/models/AssessmentReportSummary.js';
import User from '../src/models/User.js';
import { requestAssessmentReportRefresh, refreshPendingAssessmentReports } from '../src/services/assessmentReportSummaryService.js';

// Never load .env, start workers or talk to configured external services.
for (const key of ['CACHE_VALKEY_URL', 'QUEUE_VALKEY_URL', 'REDIS_URL', 'VALKEY_URL', 'REDIS_HOST', 'VALKEY_HOST', 'SUPABASE_URL']) process.env[key] = '';
process.env.EMAIL_ENABLED = 'false';

let mongo;
before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' }, instance: { dbName: 'peerprep_counts_agree' } });
  await mongoose.connect(mongo.getUri('peerprep_counts_agree'));
  await Promise.all([Assessment.init(), AssessmentSubmission.init(), AssessmentReportSummary.init(), User.init()]);
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

async function call(handler, request) {
  const response = { statusCode: 200, headers: {} };
  await handler(request, {
    setHeader() {},
    set() {},
    status(code) { response.statusCode = code; return this; },
    json(body) { response.body = body; return this; },
  });
  return response;
}

// 8 assigned students: 6 attempted in different states, 1 never-started document, 1 with no document.
let seeded = 0;
async function seed() {
  seeded += 1;
  const tag = seeded;
  const admin = { _id: new mongoose.Types.ObjectId(), role: 'admin', email: 'admin@test' };
  const ids = Array.from({ length: 8 }, () => new mongoose.Types.ObjectId());
  await User.collection.insertMany(ids.map((_id, index) => ({
    _id, role: 'student', name: `Student ${index + 1}`, email: `s${index + 1}-${_id}@test.example`, studentId: `R${index + 1}-${tag}`,
    college: 'GEU', course: 'B.Tech', branch: index % 2 ? 'CSE' : 'ECE', semester: 4, group: 'G1', passwordHash: 'unused',
  })));
  const assessment = await Assessment.create({
    title: 'Agreement exam', createdBy: admin._id, lifecycleStatus: 'published', totalMarks: 100, targetType: 'selected',
    assignedStudents: ids, startTime: new Date(Date.now() - 600000), endTime: new Date(Date.now() + 3600000), duration: 30,
  });
  // The pass mark is not part of the settings schema; it is stored the way the roster already reads it.
  await Assessment.updateOne({ _id: assessment._id }, { $set: { 'settings.passPercentage': 60 } }, { strict: false });
  const at = new Date();
  const doc = (index, status, extra = {}) => ({
    assessmentId: assessment._id, studentId: ids[index], status, startedAt: at, maxMarks: 100, evaluationStatus: 'completed', ...extra,
  });
  await AssessmentSubmission.insertMany([
    doc(0, 'submitted', { score: 80, submittedAt: at }),
    doc(1, 'submitted', { score: 20, submittedAt: at }),
    doc(2, 'expired', { score: 70, submittedAt: at }),
    doc(3, 'violation', { evaluationStatus: 'processing', submittedAt: at }),
    doc(4, 'in_progress'),
    doc(5, 'incomplete', { score: 95 }),
    doc(6, 'not_started', { startedAt: undefined }),
  ]);
  return { admin, assessment, tag };
}

const EXPECTED = {
  candidates: 8, started: 6, notStarted: 2, inProgress: 1, finished: 5, submitted: 2, graded: 3, passed: 2, failed: 1,
};
const pick = (flat) => ({
  candidates: flat.candidateCount, started: flat.startedCount, notStarted: flat.notStartedCount, inProgress: flat.inProgressCount,
  finished: flat.finishedCount, submitted: flat.submittedCount, graded: flat.gradedCount, passed: flat.passedCount, failed: flat.failedCount,
});

test('list, roster, stored summary, report and export agree on every count for one assessment', async () => {
  const { listAssessments, getAssessmentReports, getAssessmentReportsExportData } = await import('../src/controllers/assessmentController.js');
  const { getAssessmentRoster } = await import('../src/controllers/assessmentLiveReportController.js');
  const { admin, assessment } = await seed();
  const id = String(assessment._id);

  const list = await call(listAssessments, { user: admin, query: {} });
  assert.equal(list.statusCode, 200);
  const item = list.body.assessments.find((entry) => String(entry._id) === id);

  const roster = await call(getAssessmentRoster, { user: admin, params: { id }, query: {} });
  assert.equal(roster.statusCode, 200, JSON.stringify(roster.body));

  await requestAssessmentReportRefresh(assessment._id);
  await refreshPendingAssessmentReports();
  const stored = await AssessmentReportSummary.findById(assessment._id).lean();

  const report = await call(getAssessmentReports, { user: admin, query: { assessmentId: id } });
  assert.equal(report.statusCode, 200);
  const exported = await call(getAssessmentReportsExportData, { user: admin, query: { assessmentId: id } });
  assert.equal(exported.statusCode, 200);

  const fromRoster = roster.body.counts;
  const sources = {
    list: pick(item),
    roster: { candidates: fromRoster.candidates, started: fromRoster.started, notStarted: fromRoster.notStarted, inProgress: fromRoster.inProgress,
      finished: fromRoster.finished, submitted: fromRoster.submitted, graded: fromRoster.graded, passed: fromRoster.passed, failed: fromRoster.failed },
    stored: pick(stored),
    report: pick(report.body.summary),
    export: pick(exported.body.summary),
  };
  for (const [name, counts] of Object.entries(sources)) assert.deepEqual(counts, EXPECTED, `${name} disagrees`);

  // Legacy field names now carry the canonical meaning, identically everywhere.
  for (const flat of [item, stored, report.body.summary, exported.body.summary]) {
    assert.equal(flat.submissionCount, 6);
    assert.equal(flat.completedCount, 5);
    assert.equal(flat.passCount, 2);
    assert.equal(flat.pendingEvaluationCount, 1);
  }
  // The stored summary keeps the old schema: failCount was never persisted (failedCount is).
  for (const flat of [item, report.body.summary, exported.body.summary]) assert.equal(flat.failCount, 1);
  assert.equal(item.attempts, 6);
  assert.equal(item.submissions, 2);
  assert.equal(exported.body.summary.totalCandidates, 8);

  // Scores: graded attempts only (80, 20, 70), against the assessment's own pass mark of 60.
  for (const avg of [item.avgScore, stored.avgScore, report.body.summary.avgScore, exported.body.summary.avgScore, fromRoster.avgScore]) {
    assert.equal(Math.round(avg * 100) / 100, 56.67);
  }
  assert.equal(item.maxScore, 80);
  assert.equal(item.minScore, 20);
  assert.equal(stored.passPercentage, 60);
  assert.equal(roster.body.assessment.passPercentage, 60);
  assert.equal(fromRoster.passRate, 66.7);
  assert.equal(item.passRate, 66.7);
});

test('roster rows carry academic fields, empty string when missing', async () => {
  const { getAssessmentRoster } = await import('../src/controllers/assessmentLiveReportController.js');
  const { admin, assessment, tag } = await seed();
  const roster = await call(getAssessmentRoster, { user: admin, params: { id: String(assessment._id) }, query: {} });
  const attempted = roster.body.rows.find((entry) => entry.rollNo === `R1-${tag}`);
  const waiting = roster.body.rows.find((entry) => entry.status === 'not_started' && !entry.submissionId);
  for (const entry of [attempted, waiting]) {
    assert.equal(entry.college, 'GEU');
    assert.equal(entry.course, 'B.Tech');
    assert.equal(entry.semester, 4);
    assert.equal(entry.group, 'G1');
    assert.match(entry.branch, /^(CSE|ECE)$/);
  }
  await User.collection.updateOne({ studentId: `R1-${tag}` },{ $unset: { college: '', semester: '' } });
  const again = await call(getAssessmentRoster, { user: admin, params: { id: String(assessment._id) }, query: {} });
  assert.ok(again.body.rows.some((entry) => entry.college === '' && entry.semester === null));
});

test('roster deltas carry no counts; a full roster always does', async () => {
  const { getAssessmentRoster } = await import('../src/controllers/assessmentLiveReportController.js');
  const { admin, assessment } = await seed();
  const delta = await call(getAssessmentRoster, { user: admin, params: { id: String(assessment._id) }, query: { since: new Date().toISOString() } });
  assert.equal(delta.body.full, false);
  assert.equal(delta.body.counts, null);
});
