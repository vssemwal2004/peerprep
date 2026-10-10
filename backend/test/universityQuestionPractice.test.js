import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

test('university student sees and answers shared questions; university admin can open library', async (t) => {
  let mongo;
  try { mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } }); }
  catch (error) {
    if (error?.code === 'EPERM') return t.skip('Local sockets are unavailable in this sandbox');
    throw error;
  }
  const priorFetch = globalThis.fetch;
  const priorEnv = Object.fromEntries(['PEERPREP_DEPLOYMENT_ROLE', 'PEERPREP_UNIVERSITY_ID', 'PEERPREP_CONTROL_URL',
    'PEERPREP_SHARED_API_KEY', 'NODE_ENV', 'FRONTEND_ORIGIN', 'JWT_SECRET'].map((name) => [name, process.env[name]]));
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'university';
  process.env.PEERPREP_UNIVERSITY_ID = 'north-campus';
  process.env.PEERPREP_CONTROL_URL = 'https://control.example.test';
  process.env.PEERPREP_SHARED_API_KEY = 'a'.repeat(48);
  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
  process.env.JWT_SECRET = 'test-secret-abcdefghijklmnopqrstuvwxyz-123456';
  const questionId = new mongoose.Types.ObjectId();
  let policyPermissions = { questions: true, assessments: true, learning: true, interviews: true };
  globalThis.fetch = (input, options) => {
    const url = String(input);
    if (!url.startsWith('https://control.example.test/')) return priorFetch(input, options);
    const body = url.endsWith('/policy')
      ? { permissions: policyPermissions }
      : { questions: [{ _id: questionId.toString(), sourceType: 'manual', questionType: 'mcq', questionText: 'Shared MCQ',
        status: 'published', visibility: 'public', questionData: { options: ['A', 'B'], correctOptionIndex: 1 } }] };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
  let server;
  try {
    await mongoose.connect(mongo.getUri());
    await import('../src/setup.js');
    const { default: app } = await import('../src/setupApp.js');
    const { default: User } = await import('../src/models/User.js');
    const { default: QuestionLibrary } = await import('../src/models/QuestionLibrary.js');
    const { default: QuestionPracticeAttempt } = await import('../src/models/QuestionPracticeAttempt.js');
    const { signToken } = await import('../src/utils/jwt.js');
    const cookieFor = async (role, email) => {
      const user = await User.create({ role, email, name: role, passwordHash: 'unused' });
      const token = signToken({ sub: user._id, role, email });
      user.activeSessionToken = crypto.createHash('sha256').update(token).digest('hex');
      await user.save();
      return { cookie: `accessToken=${token}`, user };
    };
    const student = await cookieFor('student', 'student@test.example');
    const admin = await cookieFor('admin', 'admin@test.example');
    await QuestionLibrary.collection.insertOne({ sourceKey: 'manual:draft', sourceType: 'manual', status: 'draft',
      visibility: 'private', questionType: 'mcq', questionText: 'Local draft', questionData: { options: ['A', 'B'] } });
    server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const url = `http://127.0.0.1:${server.address().port}/api`;
    const list = await priorFetch(`${url}/student/questions`, { headers: { Cookie: student.cookie } });
    assert.equal(list.status, 200);
    assert.deepEqual((await list.json()).questions.map(({ questionText, source }) => ({ questionText, source })),
      [{ questionText: 'Shared MCQ', source: 'shared' }]);
    const attempt = await priorFetch(`${url}/student/questions/shared/${questionId}/attempts`, {
      method: 'POST', headers: { Cookie: student.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ answer: [1] }),
    });
    assert.equal(attempt.status, 201);
    assert.equal(await QuestionPracticeAttempt.countDocuments({ studentId: student.user._id, source: 'shared' }), 1);
    const library = await priorFetch(`${url}/admin/library/questions`, { headers: { Cookie: admin.cookie } });
    assert.equal(library.status, 200);
    assert.equal((await library.json()).questions.some((item) => item.questionText === 'Shared MCQ'), true);
    policyPermissions = { questions: false, assessments: true, learning: false, interviews: false };
    const codingAnalysis = await priorFetch(`${url}/admin/analytics/estimate`, { method: 'POST',
      headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysisType: 'coding', activity: { sources: ['coding'] } }),
    });
    assert.equal(codingAnalysis.status, 403);
    const disabledQuestions = await priorFetch(`${url}/student/questions`, { headers: { Cookie: student.cookie } });
    assert.equal(disabledQuestions.status, 403);
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
