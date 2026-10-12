import 'express-async-errors';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Test-owned in-memory database only; any request leaving 127.0.0.1 fails the test.
const ENV_KEYS = ['PEERPREP_DEPLOYMENT_ROLE', 'PEERPREP_UNIVERSITY_ID', 'PEERPREP_CONTROL_URL', 'PEERPREP_SHARED_API_KEY',
  'NODE_ENV', 'FRONTEND_ORIGIN', 'JWT_SECRET'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const savedFetch = globalThis.fetch;
const oid = () => new mongoose.Types.ObjectId();
let mongo, server, api, skipReason, m, admin, student;

before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } }); }
  catch (error) {
    if (error?.code === 'EPERM') { skipReason = 'Local sockets are unavailable in this sandbox'; return; }
    throw error;
  }
  Object.assign(process.env, { PEERPREP_DEPLOYMENT_ROLE: 'standalone', NODE_ENV: 'test',
    FRONTEND_ORIGIN: 'http://localhost:5173', JWT_SECRET: 'test-secret-abcdefghijklmnopqrstuvwxyz-123456' });
  globalThis.fetch = (input, options) => (String(input).startsWith('http://127.0.0.1:')
    ? savedFetch(input, options) : Promise.reject(new Error(`Unexpected external request: ${input}`)));
  await mongoose.connect(mongo.getUri(), { dbName: 'interview_companies' });
  const { default: app } = await import('../src/setupApp.js');
  m = {
    ...(await import('../src/platform/interviewCompanies.js')),
    ...(await import('../src/platform/interviewQuestionReports.js')),
    User: (await import('../src/models/User.js')).default,
    Problem: (await import('../src/models/Problem.js')).default,
    QuestionLibrary: (await import('../src/models/QuestionLibrary.js')).default,
    CompanyBenchmark: (await import('../src/models/CompanyBenchmark.js')).default,
    signToken: (await import('../src/utils/jwt.js')).signToken,
  };
  await Promise.all([m.InterviewQuestionReport.init(), m.InterviewCompany.init(), m.User.init()]);
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  api = `http://127.0.0.1:${server.address().port}/api`;
  const login = async (role) => {
    const user = await m.User.create({ role, email: `${role}@test.example`, name: role, passwordHash: 'unused' });
    const token = m.signToken({ sub: user._id, role, email: user.email });
    user.activeSessionToken = crypto.createHash('sha256').update(token).digest('hex');
    await user.save();
    return { user, cookie: `accessToken=${token}` };
  };
  admin = await login('admin');
  student = await login('student');
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongo) {
    const { closeValkeyClient } = await import('../src/utils/valkey.js');
    await closeValkeyClient();
    await mongoose.disconnect();
    await mongo.stop();
  }
  globalThis.fetch = savedFetch;
  for (const key of ENV_KEYS) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
});

beforeEach(async () => {
  if (skipReason) return;
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
  await Promise.all([m.InterviewQuestionReport, m.InterviewCompany, m.InterviewCompanySettings, m.Problem, m.QuestionLibrary, m.CompanyBenchmark]
    .map((model) => model.deleteMany({})));
  await m.Problem.collection.insertOne({ title: 'Tagged', status: 'published', visibility: 'public', companyTags: ['Amazon', 'Google'] });
  m.resetCompanyCatalogCache();
});

const reporter = (index) => m.reporterKey('campus', `student-${index}`);
async function vote(company, questionId, from, to, extra = {}) {
  let last;
  for (let index = from; index < to; index += 1) {
    last = await m.saveInterviewReport({ scopeKey: 'control', questionId, reporter: reporter(index),
      body: { company, jobTitle: 'Software Engineer', interviewDate: '2025-02-01', ...extra } });
  }
  return last;
}
const tags = async () => (await m.interviewReportSummaries(['control'])).map(({ company, voters }) => `${company}:${voters}`);
async function call(path, { method = 'GET', body, as = admin } = {}) {
  const response = await fetch(`${api}${path}`, { method, headers: { Cookie: as.cookie, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
const decide = (key, body) => call(`/interview-companies/admin/suggestions/${encodeURIComponent(key)}/decision`, { method: 'POST', body });

test('a company tag appears only once the threshold of distinct students is reached', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const questionId = oid();
  assert.deepEqual((await vote('Amazon', questionId, 0, 19)).company, { name: 'Amazon', status: 'listed' });
  assert.deepEqual(await tags(), []);
  await vote('amazon', questionId, 19, 20);
  assert.deepEqual(await tags(), ['Amazon:20']);
});

test('one student reporting twice with different job titles counts once', async (t) => {
  if (skipReason) return t.skip(skipReason);
  await m.setVoteThreshold(2);
  const questionId = oid();
  await vote('Google', questionId, 0, 1, { jobTitle: 'Intern' });
  await vote('Google', questionId, 0, 1, { jobTitle: 'Analyst' });
  assert.deepEqual(await tags(), []);
  await vote('Google', questionId, 1, 2);
  assert.deepEqual(await tags(), ['Google:2']);
});

test('a student-typed company stays hidden until the super admin approves it', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const questionId = oid();
  assert.deepEqual((await vote('Zeta Robotics', questionId, 0, 25)).company, { name: 'Zeta Robotics', status: 'pending' });
  assert.deepEqual(await tags(), []);
  assert.equal((await m.interviewReportOptions()).companies.includes('Zeta Robotics'), false);
  const listed = await call('/interview-companies/admin/suggestions');
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.rows.map(({ key, status, voters, questions }) => ({ key, status, voters, questions })),
    [{ key: 'zeta robotics', status: 'pending', voters: 25, questions: 1 }]);
  assert.equal(listed.body.counts.pending, 1);
  assert.equal(listed.body.threshold, 20);
  assert.deepEqual(listed.body.catalog.map(({ name }) => name), ['Amazon', 'Google']);
  const approved = await decide('zeta robotics', { action: 'approve' });
  assert.equal(approved.status, 200);
  assert.deepEqual([approved.body.row.status, approved.body.row.name, approved.body.row.verifiedQuestions], ['approved', 'Zeta Robotics', 1]);
  assert.deepEqual(await tags(), ['Zeta Robotics:25']);
  assert.equal((await m.interviewReportOptions()).companies.includes('Zeta Robotics'), true);
  const reset = await decide('zeta robotics', { action: 'reset' });
  assert.equal(reset.body.row.status, 'pending');
  assert.deepEqual(await tags(), []);
});

test('merging a spelling unions its distinct voters into the target company', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const questionId = oid();
  await vote('Amazon', questionId, 0, 12);
  await vote('Amazon Inc', questionId, 10, 22);
  assert.deepEqual(await tags(), []);
  const pending = (await call('/interview-companies/admin/suggestions')).body.rows;
  assert.deepEqual(pending.map(({ key, suggestion }) => [key, suggestion]), [['amazon inc', { key: 'amazon', name: 'Amazon' }]]);
  const merged = await decide('amazon inc', { action: 'merge', mergeInto: 'Amazon' });
  assert.equal(merged.status, 200);
  assert.deepEqual(merged.body.row.mergedInto, { key: 'amazon', name: 'Amazon' });
  assert.deepEqual(await tags(), ['Amazon:22']);
  assert.deepEqual((await vote('AMAZON INC', oid(), 30, 31)).company, { name: 'Amazon', status: 'listed' });
});

test('a rejected company never becomes a tag or an option and still reads as pending to students', async (t) => {
  if (skipReason) return t.skip(skipReason);
  await m.setVoteThreshold(1);
  const questionId = oid();
  await vote('Spam Corp', questionId, 0, 3);
  assert.equal((await decide('spam corp', { action: 'reject' })).body.row.status, 'rejected');
  assert.deepEqual(await tags(), []);
  assert.equal((await m.interviewReportOptions()).companies.includes('Spam Corp'), false);
  assert.deepEqual((await vote('Spam Corp', questionId, 5, 6)).company, { name: 'Spam Corp', status: 'pending' });
  const rejected = (await call('/interview-companies/admin/suggestions?status=rejected')).body;
  assert.deepEqual([rejected.rows.length, rejected.counts.rejected, rejected.counts.pending], [1, 1, 0]);
});

test('interview options list catalog companies only and job titles shared by three students', async (t) => {
  if (skipReason) return t.skip(skipReason);
  await m.CompanyBenchmark.collection.insertOne({ companyName: 'Infosys' });
  await m.QuestionLibrary.collection.insertOne({ sourceKey: 'manual:central', sourceType: 'manual', status: 'published',
    visibility: 'public', questionType: 'mcq', questionText: 'Central', keywords: ['Microsoft'], questionData: {} });
  await m.QuestionLibrary.collection.insertOne({ sourceKey: 'manual:private', sourceType: 'manual', status: 'published',
    visibility: 'private', questionType: 'mcq', questionText: 'Private', keywords: ['Secret Startup'], questionData: {} });
  await m.Problem.collection.insertMany([{ title: 'Draft', status: 'draft', visibility: 'public', companyTags: ['Draft Partner'] },
    { title: 'Private', status: 'published', visibility: 'private', companyTags: ['Confidential Partner Co'] },
    { title: 'Assessment', status: 'published', visibility: 'assessment', companyTags: ['Exam Partner'] }]);
  m.resetCompanyCatalogCache();
  await vote('Other Campus Startup', oid(), 0, 3, { jobTitle: 'Backend Engineer' });
  await vote('Amazon', oid(), 0, 2, { jobTitle: 'Rare Title' });
  const options = await call('/student/questions/interview-options', { as: student });
  assert.equal(options.status, 200);
  assert.deepEqual(options.body.companies, ['Amazon', 'Google', 'Infosys', 'Microsoft']);
  assert.equal(options.body.jobTitles.includes('Backend Engineer'), true);
  assert.equal(options.body.jobTitles.includes('Rare Title'), false);
  assert.equal(options.body.jobTitles.includes('Software Engineer'), true);
  assert.deepEqual((await vote('Confidential Partner Co', oid(), 0, 1)).company, { name: 'Confidential Partner Co', status: 'pending' });
});

test('a company approved under another name resolves from that name and its votes count', async (t) => {
  if (skipReason) return t.skip(skipReason);
  await m.setVoteThreshold(3);
  const questionId = oid();
  await vote('Gogle Labs', questionId, 0, 1);
  assert.equal((await decide('gogle labs', { action: 'approve', name: 'Zeta Search' })).status, 200);
  assert.equal((await m.interviewReportOptions()).companies.includes('Zeta Search'), true);
  assert.deepEqual((await vote('Zeta Search', questionId, 1, 3)).company, { name: 'Zeta Search', status: 'listed' });
  assert.deepEqual(await tags(), ['Zeta Search:3']);
  const listed = (await call('/interview-companies/admin/suggestions?status=all')).body;
  assert.deepEqual(listed.rows.map(({ key, status, verifiedQuestions, bestQuestionVoters }) => [key, status, verifiedQuestions, bestQuestionVoters]),
    [['gogle labs', 'approved', 1, 3]]);
  assert.equal(listed.counts.pending, 0, 'The approved display name is not a new request');
  // A catalog source with the same name later takes over; the approved spelling keeps counting toward it.
  await m.Problem.collection.insertOne({ title: 'Later', status: 'published', visibility: 'public', companyTags: ['Zeta Search'] });
  m.resetCompanyCatalogCache();
  assert.deepEqual(await tags(), ['Zeta Search:3']);
  assert.deepEqual((await vote('gogle labs', questionId, 3, 4)).company, { name: 'Zeta Search', status: 'listed' });
});

test('the students meter compares the best single question with the threshold', async (t) => {
  if (skipReason) return t.skip(skipReason);
  await vote('Nova Robotics', oid(), 0, 1);
  await vote('Nova Robotics', oid(), 1, 2);
  await vote('Nova Robotics', oid(), 2, 4);
  const [row] = (await call('/interview-companies/admin/suggestions')).body.rows;
  assert.deepEqual([row.voters, row.questions, row.bestQuestionVoters], [4, 3, 2]);
});

test('universities count where reporters study, including reports on shared questions', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const questionId = oid();
  for (const [index, origin] of ['university:north', 'university:south', 'university:north', 'control'].entries()) {
    await m.saveInterviewReport({ scopeKey: 'control', questionId, reporter: reporter(index), origin,
      body: { company: 'Orbit Systems', jobTitle: 'Engineer', interviewDate: '2025-02-01' } });
  }
  await m.InterviewQuestionReport.collection.insertOne({ scopeKey: 'university:east', questionId, reporterKey: reporter(9),
    companyName: 'Orbit Systems', companyKey: 'orbit systems', jobTitle: 'Engineer', jobTitleKey: 'engineer', interviewDate: new Date('2025-02-01'), createdAt: new Date() });
  const [row] = (await call('/interview-companies/admin/suggestions')).body.rows;
  assert.deepEqual([row.key, row.universities], ['orbit systems', 3]);
  await assert.rejects(m.saveInterviewReport({ scopeKey: 'control', questionId, reporter: reporter(1), origin: 'elsewhere',
    body: { company: 'Orbit Systems', jobTitle: 'Engineer', interviewDate: '2025-02-01' } }), (error) => error.status === 400);
});

test('summaries can be narrowed to one question and interview dates allow a local today ahead of UTC', async (t) => {
  if (skipReason) return t.skip(skipReason);
  await m.setVoteThreshold(1);
  const [first, second] = [oid(), oid()];
  await vote('Amazon', first, 0, 1);
  await vote('Google', second, 0, 1);
  assert.deepEqual((await m.interviewReportSummaries(['control'], String(first))).map(({ company }) => company), ['Amazon']);
  assert.equal((await m.interviewReportSummaries(['control'])).length, 2);
  await assert.rejects(m.interviewReportSummaries(['control'], 'not-an-id'), (error) => error.status === 400);
  const day = (offset) => new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert.equal(m.validateInterviewReport({ company: 'Amazon', jobTitle: 'SDE', interviewDate: day(1) }).companyKey, 'amazon');
  assert.throws(() => m.validateInterviewReport({ company: 'Amazon', jobTitle: 'SDE', interviewDate: day(2) }), (error) => error.status === 400);
});

test('a reporter is limited to 20 new reports in 24 hours while exact repeats stay idempotent', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const first = { scopeKey: 'control', questionId: oid(), reporter: reporter(1),
    body: { company: 'Amazon', jobTitle: 'Engineer', interviewDate: '2025-01-01' } };
  await m.saveInterviewReport(first);
  for (let index = 1; index < 20; index += 1) await m.saveInterviewReport({ ...first, questionId: oid() });
  await assert.rejects(m.saveInterviewReport({ ...first, questionId: oid() }), (error) => error.status === 429);
  assert.equal((await m.saveInterviewReport(first)).saved, true);
  assert.equal(await m.InterviewQuestionReport.countDocuments({ reporterKey: reporter(1) }), 20);
  await m.InterviewQuestionReport.collection.updateMany({},{ $set: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
  assert.equal((await m.saveInterviewReport({ ...first, questionId: oid() })).saved, true);
});

test('the super admin threshold setting applies to tags and is validated', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const questionId = oid();
  await vote('Google', questionId, 0, 2);
  assert.deepEqual(await tags(), []);
  for (const voteThreshold of [0, 1001, 2.5, 'many', null]) {
    assert.equal((await call('/interview-companies/admin/settings', { method: 'PUT', body: { voteThreshold } })).status, 400);
  }
  const saved = await call('/interview-companies/admin/settings', { method: 'PUT', body: { voteThreshold: 2 } });
  assert.deepEqual([saved.status, saved.body], [200, { threshold: 2 }]);
  assert.deepEqual(await tags(), ['Google:2']);
  const progress = await call('/interview-companies/admin/tag-progress?status=verified');
  assert.deepEqual(progress.body.rows.map(({ company, voters, verified, threshold, scopeLabel }) => [company, voters, verified, threshold, scopeLabel]),
    [['Google', 2, true, 2, 'Central library']]);
  assert.equal((await call('/interview-companies/admin/tag-progress?status=collecting')).body.rows.length, 0);
});

test('company decisions are validated', async (t) => {
  if (skipReason) return t.skip(skipReason);
  await vote('Amazon Inc', oid(), 0, 1);
  await vote('Amazon', oid(), 1, 2);
  assert.equal((await decide('amazon inc', { action: 'merge', mergeInto: 'amazon inc' })).status, 400);
  assert.equal((await decide('amazon inc', { action: 'merge', mergeInto: 'Unknown Corp' })).status, 400);
  assert.equal((await decide('amazon inc', { action: 'merge' })).status, 400);
  assert.equal((await decide('amazon inc', { action: 'delete' })).status, 400);
  assert.equal((await decide('amazon inc', { action: 'approve', name: 'A' })).status, 400);
  assert.equal((await decide('amazon inc', { action: 'approve', name: 'amazon' })).status, 409);
  assert.equal((await decide('never reported', { action: 'approve' })).status, 404);
  assert.equal((await decide('amazon', { action: 'merge', mergeInto: 'Amazon' })).status, 400);
  const renamed = await decide('amazon inc', { action: 'approve', name: '  Amazon   Internal ' });
  assert.deepEqual([renamed.status, renamed.body.row.name], [200, 'Amazon Internal']);
});

test('students see only verified companies for a question; admin routes are closed to students and universities', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const libraryRow = await m.QuestionLibrary.create({ sourceKey: 'manual:q1', sourceType: 'manual', status: 'published',
    visibility: 'public', questionType: 'mcq', questionText: 'Two pointers', questionData: { options: ['A', 'B'] } });
  await vote('Amazon', libraryRow._id, 0, 20);
  await vote('Google', libraryRow._id, 0, 3);
  await vote('Amazon', oid(), 0, 20);
  const companies = await call(`/student/questions/university/${libraryRow._id}/interview-companies`, { as: student });
  assert.equal(companies.status, 200);
  assert.deepEqual(companies.body.companies.map(({ company, companyKey, voters }) => [company, companyKey, voters]), [['Amazon', 'amazon', 20]]);
  assert.deepEqual((await call(`/student/questions/problem/${oid()}/interview-companies`, { as: student })).body, { companies: [] });
  const progress = (await call('/interview-companies/admin/tag-progress')).body.rows;
  assert.equal(progress.find((row) => row.questionId === String(libraryRow._id) && row.company === 'Google').questionTitle, 'Two pointers');
  assert.equal((await call('/interview-companies/admin/suggestions', { as: student })).status, 403);
  assert.equal((await call(`/student/questions/university/${libraryRow._id}/interview-companies`, { as: admin })).status, 403);
  Object.assign(process.env, { PEERPREP_DEPLOYMENT_ROLE: 'university', PEERPREP_UNIVERSITY_ID: 'north-campus' });
  const blocked = await call('/interview-companies/admin/suggestions');
  assert.deepEqual([blocked.status, blocked.body.error], [403, 'Interview companies are managed by the super admin.']);
  assert.equal((await call('/interview-companies/admin/settings', { method: 'PUT', body: { voteThreshold: 2 } })).status, 403);
});
