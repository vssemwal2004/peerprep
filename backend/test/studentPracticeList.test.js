import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

test('the search box reads question numbers, hashtags and plain text', async () => {
  const priorSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET ||= 'test-secret-abcdefghijklmnopqrstuvwxyz-123456';
  const { matchesPracticeCriteria, parsePracticeSearch } = await import('../src/platform/questionPractice.js');
  if (priorSecret === undefined) delete process.env.JWT_SECRET;
  assert.deepEqual(parsePracticeSearch('12'), { serial: { kind: 'either', number: 12 }, tagTerms: [], text: '' });
  assert.deepEqual(parsePracticeSearch(' #12 '), { serial: { kind: 'either', number: 12 }, tagTerms: [], text: '' });
  assert.deepEqual(parsePracticeSearch('lc:1012'), { serial: { kind: 'leetcode', number: 1012 }, tagTerms: [], text: '' });
  assert.deepEqual(parsePracticeSearch('#two-pointers'), { serial: null, tagTerms: [['two', 'pointers']], text: '' });
  assert.deepEqual(parsePracticeSearch('#Array Two  Sum'), { serial: null, tagTerms: [['array']], text: 'two sum' });
  assert.deepEqual(parsePracticeSearch('#'), { serial: null, tagTerms: [], text: '' });
  assert.equal(parsePracticeSearch('3sum').serial, null, 'Digits inside a title stay text');
  const question = { _id: 'q1', questionText: 'Two Sum', tags: ['Two Pointers', 'Array'], keywords: ['Acme'], displayOrder: 7, sourceNumber: 1, difficulty: 'Easy' };
  const criteria = (search, extra = {}) => ({ search: parsePracticeSearch(search), type: '', difficulty: '', tags: [], companies: [], ids: null, ...extra });
  assert.equal(matchesPracticeCriteria(question, [], criteria('#7')), true);
  assert.equal(matchesPracticeCriteria(question, [], criteria('#8')), false);
  assert.equal(matchesPracticeCriteria(question, [], criteria('lc:1')), true);
  assert.equal(matchesPracticeCriteria(question, [], criteria('lc:7')), false);
  assert.equal(matchesPracticeCriteria(question, [], criteria('#two-pointers')), true);
  assert.equal(matchesPracticeCriteria(question, [], criteria('#graph')), false);
  assert.equal(matchesPracticeCriteria(question, [], criteria('acme')), true, 'Plain text also matches companies');
  assert.equal(matchesPracticeCriteria(question, ['Globex'], criteria('', { companies: ['globex'] })), true, 'Reported companies count');
});

test('the student list pages, searches and sorts in the database', async (t) => {
  let mongo;
  try { mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } }); }
  catch (error) {
    if (error?.code === 'EPERM') return t.skip('Local sockets are unavailable in this sandbox');
    throw error;
  }
  const priorEnv = Object.fromEntries(['PEERPREP_DEPLOYMENT_ROLE', 'NODE_ENV', 'FRONTEND_ORIGIN', 'JWT_SECRET']
    .map((name) => [name, process.env[name]]));
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
  process.env.JWT_SECRET = 'test-secret-abcdefghijklmnopqrstuvwxyz-123456';
  let server;
  try {
    await mongoose.connect(mongo.getUri());
    await import('../src/setup.js');
    const { default: app } = await import('../src/setupApp.js');
    const { default: User } = await import('../src/models/User.js');
    const { default: QuestionLibrary } = await import('../src/models/QuestionLibrary.js');
    const { signToken } = await import('../src/utils/jwt.js');
    const user = await User.create({ role: 'student', email: 'list@test.example', name: 'Student', passwordHash: 'unused' });
    const token = signToken({ sub: user._id, role: 'student', email: user.email });
    user.activeSessionToken = crypto.createHash('sha256').update(token).digest('hex');
    await user.save();
    const difficulties = ['Easy', 'Medium', 'Hard'];
    await QuestionLibrary.collection.insertMany(Array.from({ length: 30 }, (_, index) => ({
      sourceKey: `manual:${index + 1}`, sourceType: 'manual', status: 'published', visibility: 'public', questionType: 'mcq',
      questionText: index === 0 ? 'Two Sum (pairs)' : `Question ${String(index + 1).padStart(2, '0')}`,
      difficulty: difficulties[index % 3], displayOrder: index + 1, sourceNumber: index === 20 ? 12 : 1001 + index,
      tags: index % 5 === 0 ? ['Two Pointers', 'Array'] : ['Graph'], keywords: index === 3 ? ['Acme'] : [],
      questionData: { options: ['A', 'B'], correctOptionIndex: 0, bulky: 'x'.repeat(2000) },
    })));
    await QuestionLibrary.collection.insertOne({ sourceKey: 'manual:private', sourceType: 'manual', status: 'published',
      visibility: 'private', questionType: 'mcq', questionText: 'Hidden', displayOrder: 99, questionData: { options: ['A'] } });
    server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${server.address().port}/api/student/questions`;
    const list = async (query = '') => {
      const response = await fetch(`${base}?${query}`, { headers: { Cookie: `accessToken=${token}` } });
      assert.equal(response.status, 200, query);
      return response.json();
    };
    const orders = (body) => body.questions.map((question) => question.displayOrder);

    const first = await list();
    assert.deepEqual(first.pagination, { page: 1, limit: 25, total: 30, pages: 2 });
    assert.deepEqual(orders(first), Array.from({ length: 25 }, (_, index) => index + 1));
    assert.equal(first.filters.totalProblems, 30, 'Private questions are not counted');
    assert.deepEqual(first.filters.tagCounts.find(({ tag }) => tag === 'Two Pointers'), { tag: 'Two Pointers', count: 6 });
    assert.deepEqual(first.filters.companyCounts, [{ company: 'Acme', count: 1 }]);
    assert.deepEqual(orders(await list('page=2&limit=25')), [26, 27, 28, 29, 30]);
    assert.equal((await list('limit=5000')).pagination.limit, 200, 'The page size is capped');
    assert.deepEqual(orders(await list('sortOrder=desc&limit=3')), [30, 29, 28]);

    assert.deepEqual(orders(await list('search=12')), [12, 21], 'A number finds both the PeerPrep-ID and source-ID questions');
    assert.deepEqual(orders(await list(`search=${encodeURIComponent('#12')}`)), [12, 21]);
    assert.deepEqual(orders(await list(`search=${encodeURIComponent('pp:12')}`)), [12]);
    assert.deepEqual(orders(await list(`search=${encodeURIComponent('lc:12')}`)), [21]);
    assert.deepEqual(orders(await list(`search=${encodeURIComponent('lc:1012')}`)), [12], 'An lc: prefix finds the original LeetCode number');
    assert.deepEqual(orders(await list(`search=${encodeURIComponent('#two-pointers')}`)), [1, 6, 11, 16, 21, 26]);
    assert.deepEqual(orders(await list(`search=${encodeURIComponent('#arr')}`)), [1, 6, 11, 16, 21, 26], 'A hashtag matches the start of a topic');
    assert.deepEqual(orders(await list(`search=${encodeURIComponent('#two-pointers sum')}`)), [1]);
    assert.deepEqual(orders(await list(`search=${encodeURIComponent('sum (pairs')}`)), [1], 'Regex characters are literal');
    assert.deepEqual(orders(await list('search=acme')), [4], 'Text also matches company tags');
    assert.deepEqual(orders(await list('companies=acme')), [4]);
    assert.deepEqual(orders(await list('difficulty=hard&limit=3')), [3, 6, 9]);
    assert.deepEqual(orders(await list('tags=two%20pointers&limit=2&page=2')), [11, 16]);
    assert.deepEqual(orders(await list('sortBy=difficulty&sortOrder=desc&limit=2')), [3, 6], 'Hard first, then by number');
    assert.deepEqual(orders(await list('sortBy=title&limit=2')), [2, 3], 'Question 02 sorts before Two Sum');
    const [someId] = first.questions.map((question) => question._id).slice(4, 5);
    assert.deepEqual(orders(await list(`ids=${someId}`)), [5]);
    assert.deepEqual(orders(await list('ids=__none__')), []);
    const row = first.questions[0];
    assert.deepEqual(row.options, ['A', 'B']);
    assert.equal('questionData' in row, false);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    const { closeValkeyClient } = await import('../src/utils/valkey.js');
    await closeValkeyClient();
    await mongoose.disconnect();
    await mongo.stop();
    for (const [name, value] of Object.entries(priorEnv)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
