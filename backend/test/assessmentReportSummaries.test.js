import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Assessment from '../src/models/Assessment.js';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';
import AssessmentReportSummary from '../src/models/AssessmentReportSummary.js';
import User from '../src/models/User.js';
import { requestAssessmentReportRefresh, refreshPendingAssessmentReports, discoverAssessmentReportRefreshes } from '../src/services/assessmentReportSummaryService.js';
import { acquireAssessmentReportSlot, assertAssessmentExportSize } from '../src/services/assessmentReportLimits.js';

let mongo;
before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' }, instance: { dbName: 'peerprep_report_summary_tests' } });
  await mongoose.connect(mongo.getUri('peerprep_report_summary_tests'));
  await Promise.all([AssessmentSubmission.init(), AssessmentReportSummary.init()]);
});
beforeEach(async () => {
  await Promise.all([Assessment, AssessmentSubmission, AssessmentReportSummary, User].map((model) => model.deleteMany({})));
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

async function fixture({ owner = new mongoose.Types.ObjectId(), scores = [80, 20], pending = 1 } = {}) {
  const assessment = await Assessment.create({ title: 'Test report', createdBy: owner, totalMarks: 100 });
  const data = scores.map((score) => ({ status: 'submitted', score, maxMarks: 100, evaluationStatus: 'completed' }));
  for (let i = 0; i < pending; i += 1) data.push({ status: 'submitted', maxMarks: 100, evaluationStatus: 'processing' });
  const submissions = await AssessmentSubmission.insertMany(data.map((row) => ({
    assessmentId: assessment._id, studentId: new mongoose.Types.ObjectId(), startedAt: new Date(), ...row,
  })));
  await User.collection.insertMany(submissions.map((row, index) => ({ _id: row.studentId, name: `Student ${index}`, email: `student${row.studentId}@example.test`, studentId: String(row.studentId) })));
  return { assessment, submissions, owner };
}

async function call(handler, request) {
  const response = { statusCode: 200 };
  await handler(request, {
    setHeader() {},
    status(code) { response.statusCode = code; return this; },
    json(body) { response.body = body; return this; },
  });
  return response;
}

test('coalesced summary averages only graded submissions and preserves pending counts', async () => {
  const { assessment } = await fixture();
  await Promise.all(Array.from({ length: 5 }, () => requestAssessmentReportRefresh(assessment._id)));
  assert.equal(await AssessmentReportSummary.countDocuments({}), 1);
  const refreshed = await refreshPendingAssessmentReports();
  assert.equal(refreshed.refreshed, 1);
  const summary = await AssessmentReportSummary.findById(assessment._id).lean();
  assert.equal(summary.submissionCount, 3);
  assert.equal(summary.gradedCount, 2);
  assert.equal(summary.pendingEvaluationCount, 1);
  assert.equal(summary.avgScore, 50);
  assert.equal(summary.passCount, 1);
  assert.deepEqual(summary.scoreDistribution, [1, 0, 0, 1, 0]);
  assert.equal(summary.computedVersion, summary.requestedVersion);
});

test('legacy summary discovery and empty/deleted attempt reconciliation are bounded', async () => {
  const { assessment } = await fixture();
  const discovery = await discoverAssessmentReportRefreshes({ limit: 1 });
  assert.equal(discovery.discovered, 1);
  await refreshPendingAssessmentReports();
  await AssessmentSubmission.deleteMany({ assessmentId: assessment._id });
  await requestAssessmentReportRefresh(assessment._id);
  await refreshPendingAssessmentReports();
  const summary = await AssessmentReportSummary.findById(assessment._id).lean();
  assert.equal(summary.submissionCount, 0);
  assert.equal(summary.avgScore, null);
});

test('dashboard summaries respect coordinator ownership and legacy rebuilding state', async () => {
  const { getAssessmentReports } = await import('../src/controllers/assessmentController.js');
  const own = await fixture({ scores: [80], pending: 1 });
  const other = await fixture({ scores: [10], pending: 0 });
  await requestAssessmentReportRefresh(other.assessment._id);
  await refreshPendingAssessmentReports();
  const req = { user: { role: 'coordinator', _id: own.owner }, query: { view: 'dashboard' } };
  const missing = await call(getAssessmentReports, req);
  assert.equal(missing.statusCode, 200);
  assert.equal(missing.body.summary.summaryPending, true);
  assert.equal(missing.body.summary.avgScore, null);
  assert.equal(missing.body.assessments.length, 1);
  assert.equal(String(missing.body.assessments[0]._id), String(own.assessment._id));
  await requestAssessmentReportRefresh(own.assessment._id);
  await refreshPendingAssessmentReports();
  const response = await call(getAssessmentReports, req);
  assert.equal(response.body.summary.avgScore, 80);
  assert.equal(response.body.summary.pendingEvaluationCount, 1);
  assert.equal(response.body.summary.passCount, 1);
  assert.equal(response.body.summary.failCount, 0);
});

test('full report and details expose pending evaluation without a fabricated zero score', async () => {
  const { getAssessmentReports, getStudentAssessmentReport } = await import('../src/controllers/assessmentController.js');
  const { assessment, submissions, owner } = await fixture({ scores: [], pending: 1 });
  const user = { role: 'coordinator', _id: owner };
  const report = await call(getAssessmentReports, { user, query: { assessmentId: String(assessment._id) } });
  assert.equal(report.statusCode, 200);
  assert.equal(report.body.students[0].score, null);
  assert.equal(report.body.students[0].evaluationStatus, 'processing');
  assert.equal(report.body.summary.failCount, 0);
  const beforeVersion = submissions[0].__v;
  const detail = await call(getStudentAssessmentReport, { user, params: { submissionId: String(submissions[0]._id) } });
  assert.equal(detail.body.score, null);
  assert.equal(detail.body.evaluationStatus, 'processing');
  assert.equal((await AssessmentSubmission.findById(submissions[0]._id)).__v, beforeVersion);
});

test('bounded exports reject excess rows rather than silently exporting one capped page', async () => {
  const { getAssessmentReportsExportData } = await import('../src/controllers/assessmentController.js');
  const { assessment, owner } = await fixture({ scores: Array(501).fill(10), pending: 0 });
  const response = await call(getAssessmentReportsExportData, { user: { role: 'coordinator', _id: owner }, query: { assessmentId: String(assessment._id) } });
  assert.equal(response.statusCode, 413);
  assert.equal(response.body.code, 'REPORT_EXPORT_TOO_LARGE');
});

test('report concurrency slots release once and export byte limits reject oversized payloads', () => {
  const release = acquireAssessmentReportSlot('export');
  assert.throws(() => acquireAssessmentReportSlot('export'), { code: 'REPORT_BUSY' });
  release(); release();
  acquireAssessmentReportSlot('export')();
  assert.throws(() => assertAssessmentExportSize(1, null, 11 * 1024 * 1024), { code: 'REPORT_EXPORT_TOO_LARGE' });
});
