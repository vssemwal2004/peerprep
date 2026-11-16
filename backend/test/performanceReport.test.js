import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import express from 'express';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Assessment from '../src/models/Assessment.js';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';
import User from '../src/models/User.js';
import Problem from '../src/models/Problem.js';
import Submission from '../src/models/Submission.js';
import QuestionLibrary from '../src/models/QuestionLibrary.js';
import { adaptiveModels } from '../src/models/AdaptiveEngagement.js';
import { requireCoordinatorPermission } from '../src/middleware/auth.js';
import { createQuest, recordQuestView, startQuest } from '../src/services/questService.js';
import {
  MARK_BANDS, bandDistribution, bandIndexOf, bandOf, buildPerformanceReport, percentStats, shareOf, summaryTiles,
} from '../src/modules/performanceReport/performanceReport.model.js';
import { renderBarChartPng } from '../src/modules/performanceReport/chartPng.js';
import { PERFORMANCE_FORMATS, renderPerformanceReport } from '../src/modules/performanceReport/performanceReport.render.js';
import {
  assessmentPerformanceReport, buildAssessmentPerformance, buildQuickPrepPerformance, quickPrepPerformanceReport,
} from '../src/modules/performanceReport/performanceReport.service.js';
import { downloadPerformanceReport } from '../src/modules/performanceReport/performanceReport.routes.js';

// Test-owned in-memory database only; never the backend .env or external services.
for (const key of ['CACHE_VALKEY_URL', 'QUEUE_VALKEY_URL', 'REDIS_URL', 'VALKEY_URL', 'REDIS_HOST', 'VALKEY_HOST', 'SUPABASE_URL']) process.env[key] = '';
process.env.EMAIL_ENABLED = 'false';
const oldRole = process.env.PEERPREP_DEPLOYMENT_ROLE;
const oid = () => new mongoose.Types.ObjectId();

/* ─────────────── band and summary maths ─────────────── */

test('bands: inclusive upper edges, clamping, and no band without a percentage', () => {
  const cases = [[0, '0-25'], [25, '0-25'], [25.01, '26-50'], [25.5, '26-50'], [50, '26-50'], [50.5, '51-75'], [75, '51-75'], [75.1, '76-100'], [100, '76-100'], [-3, '0-25'], [140, '76-100']];
  for (const [percent, key] of cases) assert.equal(bandOf(percent).key, key, `${percent}% -> ${key}`);
  for (const missing of [null, undefined, '', 'abc', NaN]) assert.equal(bandIndexOf(missing), -1);
  assert.deepEqual(MARK_BANDS.map((band) => band.label), ['0–25%', '26–50%', '51–75%', '76–100%']);

  const { base, bands } = bandDistribution([10, 25, 25.5, 60, 100, null]);
  assert.equal(base, 5, 'Students without a percentage are not banded');
  assert.deepEqual(bands.map((band) => band.count), [2, 1, 1, 1]);
  assert.deepEqual(bands.map((band) => band.percent), [40, 20, 20, 20]);
  assert.deepEqual(bandDistribution([]).bands.map((band) => band.percent), [0, 0, 0, 0]);
});

test('summary tiles add up to the total; shares and averages are rounded to one decimal', () => {
  const tiles = summaryTiles({ total: 7, completed: 3, ongoing: 2 });
  assert.deepEqual(tiles.map((tile) => [tile.key, tile.value, tile.percent]), [['total', 7, 100], ['completed', 3, 42.9], ['ongoing', 2, 28.6], ['not_started', 2, 28.6]]);
  // A total smaller than the starters (stale audience) grows so Not started never goes negative.
  assert.deepEqual(summaryTiles({ total: 1, completed: 2, ongoing: 1 }).map((tile) => tile.value), [3, 2, 1, 0]);
  assert.deepEqual(summaryTiles({}).map((tile) => tile.percent), [0, 0, 0, 0]);
  assert.equal(shareOf(1, 3), 33.3);
  assert.deepEqual(percentStats([50, 10, 90, 30]), { count: 4, average: 45, highest: 90, lowest: 10, median: 40 });
  assert.deepEqual(percentStats([20, 80, 50]).median, 50);
  assert.deepEqual(percentStats([null]), { count: 0, average: null, highest: null, lowest: null, median: null });
});

const rosterRow = (overrides) => ({ name: 'S', rollNo: 'R', email: 's@test', group: '', branch: 'CSE', semester: 5, status: 'not_started', evaluationStatus: null, score: null, maxMarks: null, percentage: null, startedAt: null, submittedAt: null, ...overrides });

test('assessment mapping uses the canonical buckets and bands only graded completed attempts', () => {
  const rows = [
    rosterRow({ name: 'A', status: 'submitted', evaluationStatus: 'completed', score: 20, maxMarks: 20, percentage: 100, startedAt: '2026-11-01T04:00:00Z', submittedAt: '2026-11-01T05:00:00Z' }),
    rosterRow({ name: 'B', status: 'expired', evaluationStatus: 'completed', score: 5, maxMarks: 20, percentage: 25 }),
    rosterRow({ name: 'C', status: 'submitted', evaluationStatus: 'processing' }),
    rosterRow({ name: 'D', status: 'in_progress', startedAt: '2026-11-01T04:10:00Z' }),
    rosterRow({ name: 'E' }),
  ];
  const counts = { candidates: 5, finished: 3, inProgress: 1, notStarted: 1 };
  const report = assessmentPerformanceReport({ assessment: { title: 'Mid term', totalMarks: 20, passPercentage: 40, status: 'Completed', startTime: '2026-11-01T03:30:00Z', endTime: '2026-11-01T06:30:00Z' }, rows, counts, university: 'Test University', generatedAt: new Date('2026-11-13T10:00:00Z') });
  assert.deepEqual(report.tiles.map((tile) => tile.value), [5, 3, 1, 1]);
  assert.equal(report.bandBase, 2, 'The attempt awaiting evaluation is completed but not banded');
  assert.deepEqual(report.bands.map((band) => band.count), [1, 0, 0, 1]);
  assert.match(report.bandNote, /2 completed students with a graded score/);
  assert.match(report.bandNote, /1 completed attempt is not graded yet/);
  assert.deepEqual(report.rows.map((row) => [row.name, row.statusLabel, row.band]), [
    ['A', 'Completed', '76–100%'], ['B', 'Completed (expired)', '0–25%'], ['C', 'Completed (evaluating)', ''], ['D', 'Ongoing', ''], ['E', 'Not started', ''],
  ]);
  assert.equal(report.rows[0].scoreText, '20 of 20');
  assert.equal(report.windowLabel, '01 Nov 2026, 09:00 – 01 Nov 2026, 12:00 IST');
  assert.ok(!report.columns.some((column) => column.key === 'group'), 'Empty academic columns are dropped');
  assert.ok(report.columns.some((column) => column.key === 'branch'));
});

test('quick prep mapping: Total is the audience, bands use started students by % solved', () => {
  const insights = {
    quest: { title: 'Amazon Top 3', questionCount: 3, semesters: [3], publishedAt: '2026-10-01T00:00:00Z' },
    summary: { audience: 4, started: 2, completed: 1, inProgress: 1 },
    students: [
      { id: String(oid()), name: 'Aditi', rollNumber: 'GE-1', semester: 3, solved: 3, total: 3, startedAt: '2026-10-02T00:00:00Z', completedAt: '2026-10-05T00:00:00Z' },
      { id: String(oid()), name: 'Ravi', rollNumber: 'GE-2', semester: 3, solved: 1, total: 3, startedAt: '2026-10-03T00:00:00Z', completedAt: null },
    ],
  };
  const report = quickPrepPerformanceReport({ insights, notStartedPeople: [{ _id: oid(), name: 'Neha', studentId: 'GE-3', semester: 3 }] });
  assert.deepEqual(report.tiles.map((tile) => tile.value), [4, 1, 1, 2]);
  assert.equal(report.bandBase, 2);
  assert.deepEqual(report.bands.map((band) => band.count), [0, 1, 0, 1], '1/3 = 33.3% is in 26–50%');
  assert.deepEqual(report.rows.map((row) => [row.name, row.statusLabel, row.scoreText]), [['Aditi', 'Completed', '3 of 3'], ['Ravi', 'Ongoing', '1 of 3'], ['Neha', 'Not started', '']]);
  assert.match(report.windowLabel, /^Published 01 Oct 2026/);
  const unknown = quickPrepPerformanceReport({ insights: { ...insights, summary: { ...insights.summary, audience: null } } });
  assert.equal(unknown.tiles[0].value, 2);
  assert.match(unknown.notes[0], /audience size is not known/);
});

/* ─────────────── generators ─────────────── */

function sampleReport(rowCount = 3) {
  const students = Array.from({ length: rowCount }, (_, index) => ({
    name: index === 0 ? '=HYPERLINK("x")' : `Student ${index}`, studentId: `R${index}`, email: `s${index}@test`, branch: 'CSE', semester: 5,
    status: index % 3 === 0 ? 'completed' : index % 3 === 1 ? 'ongoing' : 'not_started',
    scoreText: index % 3 === 0 ? `${index % 20} / 20` : '', percent: index % 3 === 0 ? (index % 20) * 5 : null, banded: index % 3 === 0,
    startedAt: index % 3 !== 2 ? '2026-11-01T04:00:00Z' : null, finishedAt: index % 3 === 0 ? '2026-11-01T05:00:00Z' : null,
  }));
  return buildPerformanceReport({ kind: 'assessment', title: 'Mid term – DSA', university: 'Test University', windowLabel: '01 Nov 2026', counts: { total: rowCount, completed: students.filter((s) => s.status === 'completed').length, ongoing: students.filter((s) => s.status === 'ongoing').length }, students, bandNote: 'Bands over completed students.', meta: [['Total marks', 20]] });
}

test('chart PNG is a valid image of the requested size', () => {
  const png = renderBarChartPng({ title: 'Marks distribution', bars: [{ label: '0–25%', count: 3, percent: 30, color: '#0284c7' }, { label: 'Not started', count: 0, percent: 0 }], width: 300, height: 160 });
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.readUInt32BE(16), 300);
  assert.equal(png.readUInt32BE(20), 160);
  const idatLength = png.readUInt32BE(33);
  assert.equal(inflateSync(png.subarray(41, 41 + idatLength)).length, (300 * 3 + 1) * 160);
});

test('every format renders non-empty output with its content type', async () => {
  const report = sampleReport(5);
  for (const format of ['pdf', 'xlsx', 'csv']) {
    const result = await renderPerformanceReport(report, format);
    assert.ok(result.buffer.length > 200, `${format} is not empty`);
    assert.equal(result.contentType, PERFORMANCE_FORMATS[format].contentType);
    assert.match(result.fileName, new RegExp(`^performance-report-mid-term-dsa-\\d{4}-\\d{2}-\\d{2}\\.${format}$`));
  }
  await assert.rejects(renderPerformanceReport(report, 'docx'), /pdf, xlsx or csv/);
});

test('PDF: A4 with the table paginated over several pages', async () => {
  const { buffer } = await renderPerformanceReport(sampleReport(120), 'pdf');
  const text = buffer.toString('latin1');
  assert.ok(text.startsWith('%PDF-'));
  assert.match(text, /\/MediaBox \[0 0 595\.28 841\.89\]/, 'Summary page is A4 portrait');
  assert.match(text, /\/MediaBox \[0 0 841\.89 595\.28\]/, 'Table pages are A4 landscape');
  const pages = (text.match(/\/Type \/Page\b/g) || []).length;
  assert.ok(pages >= 4, `120 rows need several table pages (got ${pages})`);
});

test('Excel: Summary (tiles, bands, chart images) and Students (autofilter, frozen header)', async () => {
  const report = sampleReport(6);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await renderPerformanceReport(report, 'xlsx')).buffer);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Summary', 'Students']);
  const summary = workbook.getWorksheet('Summary');
  const values = [];
  summary.eachRow((row) => values.push(row.values.slice(1).map((value) => (value && typeof value === 'object' ? JSON.stringify(value) : value))));
  const flat = values.flat();
  for (const label of ['Total', 'Completed', 'Ongoing', 'Not started', '0–25%', '26–50%', '51–75%', '76–100%', 'Median %']) assert.ok(flat.includes(label), `Summary lists ${label}`);
  assert.equal(summary.getImages().length, 2, 'Both charts are embedded');
  const students = workbook.getWorksheet('Students');
  assert.equal(students.rowCount, 7);
  assert.ok(students.autoFilter);
  assert.equal(students.views[0].state, 'frozen');
  assert.equal(students.views[0].ySplit, 1);
  assert.equal(students.getRow(1).getCell(1).value, 'Name');
});

test('CSV: BOM, summary, band rows, blank line, then student rows; formulas defused', async () => {
  const csv = (await renderPerformanceReport(sampleReport(4), 'csv')).buffer.toString('utf8');
  assert.equal(csv.charCodeAt(0), 0xfeff);
  for (const line of ['"Total","4","100"', '"0–25%",', '"26–50%",', '"51–75%",', '"76–100%",']) assert.ok(csv.includes(line), `CSV has ${line}`);
  const lines = csv.slice(1).split('\r\n');
  const header = lines.indexOf('"Name","Student ID","Email","Branch","Semester","Status","Score","%","Band","Started","Submitted"');
  assert.ok(header > 0, 'Student header row present');
  assert.equal(lines[header - 1], '', 'A blank line separates the summary from the students');
  assert.equal(lines.slice(header + 1).filter(Boolean).length, 4);
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`), 'A formula-looking name is prefixed with an apostrophe');
});

/* ─────────────── endpoints against an in-memory database ─────────────── */

let mongo; let server; let base; let actor = null;
const admin = { _id: oid(), role: 'admin', email: 'admin@test' };

before(async () => {
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', launchTimeout: 60000 } });
  await mongoose.connect(mongo.getUri(), { dbName: 'isolated_performance_report' });
  await Promise.all([Assessment, AssessmentSubmission, User, Problem, Submission, QuestionLibrary, ...adaptiveModels].map((model) => model.init()));
  const app = express();
  app.use((req, _res, next) => { req.user = actor; next(); });
  app.get('/assessment/:id', requireCoordinatorPermission('coordinator.assessment.reports'), downloadPerformanceReport(buildAssessmentPerformance));
  app.get('/quickprep/:id', downloadPerformanceReport(buildQuickPrepPerformance));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
  if (oldRole === undefined) delete process.env.PEERPREP_DEPLOYMENT_ROLE; else process.env.PEERPREP_DEPLOYMENT_ROLE = oldRole;
});

async function download(user, path) {
  actor = user;
  const response = await fetch(`${base}${path}`);
  return { status: response.status, type: response.headers.get('content-type'), disposition: response.headers.get('content-disposition'), body: Buffer.from(await response.arrayBuffer()) };
}

test('assessment endpoint: roster counts, every format, access rule', async () => {
  const students = await User.create([1, 2, 3, 4].map((n) => ({ name: `Student ${n}`, email: `p${n}-${oid()}@test`, passwordHash: 'x'.repeat(60), role: 'student', studentId: `P${n}`, branch: 'CSE', semester: 5 })));
  const ownerId = oid();
  const assessment = await Assessment.create({ title: 'Unit test 1', createdBy: ownerId, lifecycleStatus: 'published', startTime: new Date(Date.now() - 3600000), endTime: new Date(Date.now() + 3600000),
    duration: 30, totalMarks: 4, targetType: 'selected', assignedStudents: students.map((s) => s._id), passwordHash: 'secret', settings: { environmentCheck: false, locationTracking: false },
    sections: [{ sectionName: 'MCQ', type: 'mcq', questions: [{ type: 'mcq', questionText: 'Q?', options: ['A', 'B'], correctOptionIndex: 0, points: 4 }] }] });
  const now = new Date();
  await AssessmentSubmission.create([
    { assessmentId: assessment._id, studentId: students[0]._id, status: 'submitted', startedAt: new Date(now - 600000), submittedAt: now, evaluationStatus: 'completed', score: 4, maxMarks: 4 },
    { assessmentId: assessment._id, studentId: students[1]._id, status: 'submitted', startedAt: new Date(now - 600000), submittedAt: now, evaluationStatus: 'completed', score: 1, maxMarks: 4 },
    { assessmentId: assessment._id, studentId: students[2]._id, status: 'in_progress', startedAt: new Date(now - 60000) },
  ]);
  const id = String(assessment._id);

  const csv = await download(admin, `/assessment/${id}?format=csv`);
  assert.equal(csv.status, 200, csv.body.toString());
  assert.equal(csv.type, 'text/csv; charset=utf-8');
  assert.match(csv.disposition, /attachment; filename="performance-report-unit-test-1-\d{4}-\d{2}-\d{2}\.csv"/);
  const text = csv.body.toString('utf8');
  for (const line of ['"Total","4","100"', '"Completed","2","50"', '"Ongoing","1","25"', '"Not started","1","25"', '"0–25%","1","50"', '"76–100%","1","50"']) assert.ok(text.includes(line), `CSV has ${line}`);
  assert.ok(text.includes('"Student 4"'), 'Assigned students without an attempt are listed');

  const pdf = await download(admin, `/assessment/${id}?format=pdf`);
  assert.equal(pdf.type, 'application/pdf');
  assert.ok(pdf.body.subarray(0, 5).toString() === '%PDF-');
  const xlsx = await download(admin, `/assessment/${id}?format=xlsx`);
  assert.equal(xlsx.type, PERFORMANCE_FORMATS.xlsx.contentType);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx.body);
  assert.equal(workbook.getWorksheet('Students').rowCount, 5);

  assert.equal((await download(admin, `/assessment/${id}?format=doc`)).status, 400);
  assert.equal((await download(admin, '/assessment/nope?format=csv')).status, 400);
  assert.equal((await download(admin, `/assessment/${oid()}?format=csv`)).status, 404);
  const outsider = { _id: oid(), role: 'coordinator', email: 'c@test', coordinatorPermissions: ['coordinator.assessment.reports'], coordinatorDataScope: 'own' };
  assert.equal((await download(outsider, `/assessment/${id}?format=csv`)).status, 403);
  assert.equal((await download({ ...outsider, _id: ownerId }, `/assessment/${id}?format=csv`)).status, 200, 'The owning coordinator may download');
});

test('quick prep endpoint: audience total, started/completed from insights, not-started rows', async () => {
  const problems = ['Two Sum', 'Valid Anagram'].map((title, index) => ({ _id: oid(), title, difficulty: 'Easy', tags: ['Array'], companyTags: [], visibility: 'public', status: 'published', displayOrder: index + 1 }));
  await Problem.collection.insertMany(problems);
  const [aditi, ravi, neha] = [['Aditi', 'GE-1'], ['Ravi', 'GE-2'], ['Neha', 'GE-3']].map(([name, studentId]) => ({ _id: oid(), role: 'student', accessScope: 'full', name, studentId, email: `${studentId}@test`, semester: 3 }));
  await User.collection.insertMany([aditi, ravi, neha, { _id: oid(), role: 'student', semester: 5, name: 'Other semester' }]);
  const quest = await createQuest(admin, undefined, { title: 'Arrays Starter', category: 'topic', status: 'published', semesters: [3], items: problems.map((p) => ({ source: 'university', problemId: String(p._id) })) });
  const at = new Date('2026-11-01T08:00:00Z');
  for (const problem of problems) await Submission.collection.insertOne({ user: aditi._id, problem: problem._id, mode: 'submit', status: 'AC', language: 'python', createdAt: at, updatedAt: at });
  await startQuest(aditi, quest.slug, at);
  await recordQuestView(ravi, quest.slug, `coding:local:${problems[0]._id}`, at);

  const csv = await download(admin, `/quickprep/${quest.id}?format=csv`);
  assert.equal(csv.status, 200, csv.body.toString());
  const text = csv.body.toString('utf8');
  for (const line of ['"Total","3","100"', '"Completed","1","33.3"', '"Ongoing","1","33.3"', '"Not started","1","33.3"', '"0–25%","1","50"', '"76–100%","1","50"']) assert.ok(text.includes(line), `CSV has ${line}`);
  assert.ok(text.includes('"Neha"'), 'The audience student who never started is listed');
  assert.ok(!text.includes('Other semester'), 'Students outside the sheet audience are not listed');
  const pdf = await download(admin, `/quickprep/${quest.id}?format=pdf`);
  assert.equal(pdf.type, 'application/pdf');
  assert.equal((await download(admin, `/quickprep/${oid()}?format=pdf`)).status, 404);
});
