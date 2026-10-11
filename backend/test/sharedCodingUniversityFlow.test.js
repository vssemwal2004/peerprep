import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

test('shared coding uses university Judge0 and university attempts for normal progress', async (t) => {
  let mongo;
  try { mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } }); }
  catch (error) {
    if (error?.code === 'EPERM') return t.skip('Local sockets are unavailable in this sandbox');
    throw error;
  }
  const priorFetch = globalThis.fetch;
  const names = ['PEERPREP_DEPLOYMENT_ROLE', 'PEERPREP_UNIVERSITY_ID', 'PEERPREP_CONTROL_URL',
    'PEERPREP_SHARED_API_KEY', 'NODE_ENV', 'FRONTEND_ORIGIN', 'JWT_SECRET', 'JUDGE0_URL'];
  const priorEnv = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, { PEERPREP_DEPLOYMENT_ROLE: 'university', PEERPREP_UNIVERSITY_ID: 'north-campus',
    PEERPREP_CONTROL_URL: 'https://control.example.test', PEERPREP_SHARED_API_KEY: 'a'.repeat(48),
    NODE_ENV: 'test', FRONTEND_ORIGIN: 'http://localhost:5173',
    JWT_SECRET: 'test-secret-abcdefghijklmnopqrstuvwxyz-123456', JUDGE0_URL: 'http://judge.north-campus.test' });
  const questionId = new mongoose.Types.ObjectId();
  const problemId = new mongoose.Types.ObjectId();
  const snapshot = { _id: problemId, title: 'Add numbers', executionMode: 'full_program',
    supportedLanguages: ['python'], sampleTestCases: [{ input: '1 2', output: '42' }, { input: '8 9', output: '42' }] };
  const question = { _id: questionId, sourceType: 'compiler', sourceProblemId: problemId,
    questionType: 'coding', questionText: 'Add numbers', status: 'published', visibility: 'public',
    updatedAt: '2026-10-11T00:00:00.000Z', questionData: { problemId, problemDataSnapshot: snapshot } };
  let judgeDataRequests = 0;
  let judgeRuns = 0;
  let judgeOutput = '42';
  let questionsEnabled = true;
  globalThis.fetch = (input, options) => {
    const url = String(input);
    if (url.startsWith('http://judge.north-campus.test/')) {
      judgeRuns += 1;
      return Promise.resolve(new Response(JSON.stringify({ status: { id: 3 },
        stdout: Buffer.from(judgeOutput).toString('base64'), time: '0.02', memory: 512 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (!url.startsWith('https://control.example.test/')) return priorFetch(input, options);
    let data;
    if (url.endsWith('/policy')) data = { permissions: { questions: questionsEnabled } };
    else if (url.endsWith('/questions')) data = { questions: [question] };
    else if (url.endsWith(`/questions/${questionId}/judge-data`)) {
      judgeDataRequests += 1;
      data = { problem: snapshot, testCases: [{ input: '1 2', output: '42' }, { input: '3 4', output: '42' }] };
    } else data = {};
    return Promise.resolve(new Response(JSON.stringify(data), { status: 200,
      headers: { 'Content-Type': 'application/json' } }));
  };
  let server;
  try {
    await mongoose.connect(mongo.getUri());
    await import('../src/setup.js');
    const { default: app } = await import('../src/setupApp.js');
    const { default: User } = await import('../src/models/User.js');
    const { default: QuestionPracticeAttempt } = await import('../src/models/QuestionPracticeAttempt.js');
    const { signToken } = await import('../src/utils/jwt.js');
    const user = await User.create({ role: 'student', email: 'student@test.example', name: 'Student', passwordHash: 'unused' });
    const token = signToken({ sub: user._id, role: 'student', email: user.email });
    user.activeSessionToken = crypto.createHash('sha256').update(token).digest('hex');
    await user.save();
    const cookie = `accessToken=${token}`;
    server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${server.address().port}/api/student/questions/shared/${questionId}`;
    const before = await priorFetch(`${base}/problem`, { headers: { Cookie: cookie } });
    assert.equal(before.status, 200);
    const initial = await before.json();
    assert.equal(initial.studentStatus, 'Unsolved');
    assert.equal(initial.totalSubmissions, 0);
    const run = await priorFetch(`${base}/run`, { method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'python', sourceCode: 'print(42)', customInput: '1 2' }) });
    assert.equal(run.status, 200);
    const runResult = await run.json();
    assert.equal(runResult.mode, 'run');
    assert.equal(runResult.status, 'Passed');
    assert.equal(runResult.total, 2);
    assert.equal(runResult.passed, 2);
    assert.deepEqual(runResult.caseResults.map((row) => row.input), ['1 2', '8 9']);
    assert.deepEqual(runResult.caseResults.map((row) => row.expectedOutput), ['42', '42']);
    assert.equal(JSON.stringify(runResult).includes('3 4'), false);
    assert.equal(judgeDataRequests, 1);
    const afterRun = await priorFetch(`${base}/problem`, { headers: { Cookie: cookie } });
    assert.equal((await afterRun.json()).totalSubmissions, 0);
    const submitted = await priorFetch(`${base}/attempts`, { method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'python', answer: 'print(42)' }) });
    assert.equal(submitted.status, 201);
    const verdict = await submitted.json();
    assert.equal(verdict.result, 'correct');
    assert.equal(verdict.totalSubmissions, 1);
    assert.equal(verdict.acceptanceRate, 100);
    assert.equal(judgeDataRequests, 1);
    assert.equal(judgeRuns, 4);
    assert.equal(await QuestionPracticeAttempt.countDocuments({ studentId: user._id, questionId, source: 'shared' }), 1);
    const afterSubmit = await priorFetch(`${base}/problem`, { headers: { Cookie: cookie } });
    const progress = await afterSubmit.json();
    assert.equal(progress.studentStatus, 'Solved');
    assert.equal(progress.totalSubmissions, 1);
    assert.equal(progress.acceptanceRate, 100);
    const history = await priorFetch(`${base}/submissions`, { headers: { Cookie: cookie } });
    assert.equal(history.status, 200);
    const savedSubmission = (await history.json()).submissions[0];
    assert.equal(savedSubmission.passedTestCases, 2);
    assert.deepEqual(savedSubmission.testCaseResults.map((row) => row.status), ['AC', 'AC']);
    assert.equal(JSON.stringify(savedSubmission).includes('3 4'), false);
    judgeOutput = '0';
    const wrong = await priorFetch(`${base}/attempts`, { method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'python', answer: 'print(0)' }) });
    assert.equal((await wrong.json()).result, 'incorrect');
    const catalog = await priorFetch(`http://127.0.0.1:${server.address().port}/api/student/questions`,
      { headers: { Cookie: cookie } });
    assert.equal((await catalog.json()).questions[0].result, 'correct');
    const refreshed = await priorFetch(`${base}/problem`, { headers: { Cookie: cookie } });
    const refreshedProgress = await refreshed.json();
    assert.equal(refreshedProgress.studentStatus, 'Solved');
    assert.equal(refreshedProgress.totalSubmissions, 2);
    assert.equal(refreshedProgress.acceptanceRate, 50);
    questionsEnabled = false;
    const denied = await priorFetch(`${base}/problem`, { headers: { Cookie: cookie } });
    assert.equal(denied.status, 403);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    const { closeValkeyClient } = await import('../src/utils/valkey.js');
    await closeValkeyClient();
    await mongoose.disconnect();
    await mongo.stop();
    globalThis.fetch = priorFetch;
    for (const [name, value] of Object.entries(priorEnv)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
