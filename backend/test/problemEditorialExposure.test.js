import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Problem from '../src/models/Problem.js';
import TestCase from '../src/models/TestCase.js';
import { getProblemDetail, listProblems } from '../src/controllers/problemController.js';
import { buildEditorialSolutions, serializeProblem } from '../src/controllers/compilerHelpers.js';

let mongo;
const studentId = new mongoose.Types.ObjectId();
const adminId = new mongoose.Types.ObjectId();

const EDITORIAL = '## Overview\n\nUse a hash map of `vector<int>` indices.\n\n## Edge Cases\n\n- empty input';

function responseCapture() {
  const state = { statusCode: 200, body: null };
  return {
    state,
    status(code) { state.statusCode = code; return this; },
    json(body) { state.body = body; return this; },
  };
}

function studentRequest(extra = {}) {
  return { user: { _id: studentId, role: 'student' }, query: {}, params: {}, ...extra };
}

before(async () => {
  // Generous launch timeout: mongod can start slowly on a busy CI/dev machine.
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  await mongoose.connect(mongo.getUri(), { dbName: 'problem_editorial_exposure_test' });
  await Promise.all([Problem.init(), TestCase.init()]);
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('list endpoint omits editorial fields; detail exposes editorial, meta and validated-only solutions', async () => {
  const problem = await Problem.create({
    title: 'Editorial Exposure',
    difficulty: 'Easy',
    status: 'published',
    visibility: 'public',
    supportedLanguages: ['python', 'cpp', 'java', 'c', 'javascript', 'typescript'],
    validatedLanguages: ['python', 'cpp'],
    referenceSolutions: {
      python: 'class Solution:\n    def f(self):\n        return 1\n',
      cpp: 'class Solution { public: int f() { return 1; } };',
      java: 'class Solution { int f() { return 2; } } // not validated',
      c: '   ',
    },
    executionHarnesses: { python: 'HIDDEN_HARNESS_MARKER' },
    editorial: EDITORIAL,
    editorialMeta: {
      format: 'md-v2',
      version: 2,
      source: 'doocs-derived',
      license: 'CC-BY-SA-4.0',
      attributionUrl: 'https://github.com/doocs/leetcode',
      generatedBy: 'test',
      reviewedAt: new Date('2026-10-01T00:00:00Z'),
      checks: ['sections', 'complexity'],
    },
    createdBy: adminId,
  });
  await TestCase.create([
    { problem: problem._id, kind: 'sample', input: '1', output: '1', position: 1 },
    { problem: problem._id, kind: 'hidden', input: 'HIDDEN_INPUT_MARKER', output: '2', position: 1 },
  ]);

  for (const sortBy of ['displayOrder', 'difficulty']) {
    const listRes = responseCapture();
    await listProblems(studentRequest({ query: { sortBy } }), listRes);
    const listed = listRes.state.body.problems.find((row) => String(row._id) === String(problem._id));
    assert.ok(listed, `problem should be listed (sortBy=${sortBy})`);
    assert.equal(listed.editorial, undefined, `list must omit editorial (sortBy=${sortBy})`);
    assert.equal(listed.editorialMeta, undefined);
    assert.equal(listed.editorialSolutions, undefined);
    assert.equal(listed.referenceSolutions, undefined);
    const json = JSON.stringify(listRes.state.body);
    assert.ok(!json.includes('vector<int>'), 'editorial text must not leak into list payload');
  }

  const detailRes = responseCapture();
  await getProblemDetail(studentRequest({ params: { id: String(problem._id) } }), detailRes);
  const detail = detailRes.state.body;
  assert.equal(detail.editorial, EDITORIAL);
  assert.deepEqual(detail.editorialMeta, {
    format: 'md-v2',
    version: 2,
    source: 'doocs-derived',
    license: 'CC-BY-SA-4.0',
    attributionUrl: 'https://github.com/doocs/leetcode',
    generatedBy: 'test',
    reviewedAt: '2026-10-01T00:00:00.000Z',
    checks: ['sections', 'complexity'],
  });
  assert.deepEqual(Object.keys(detail.editorialSolutions).sort(), ['cpp', 'python']);
  assert.match(detail.editorialSolutions.python, /return 1/);
  assert.equal(detail.referenceSolutions, undefined, 'students never receive the raw referenceSolutions map');
  assert.equal(detail.executionHarnesses, undefined);
  assert.equal(detail.hiddenTestCases, undefined);
  const detailJson = JSON.stringify(detail);
  assert.ok(!detailJson.includes('HIDDEN_HARNESS_MARKER'));
  assert.ok(!detailJson.includes('HIDDEN_INPUT_MARKER'));
  assert.ok(!detailJson.includes('not validated'));
});

test('student and admin plain-number searches return both identifier matches', async () => {
  const [peerPrepMatch, leetCodeMatch] = await Problem.create([
    {
      title: 'PeerPrep Serial Match', displayOrder: 722, sourceNumber: 1,
      status: 'published', visibility: 'public', createdBy: adminId,
    },
    {
      title: 'LeetCode Source Match', displayOrder: 1, sourceNumber: 722,
      status: 'published', visibility: 'public', createdBy: adminId,
    },
  ]);

  for (const role of ['student', 'admin']) {
    const request = (search) => ({ user: { _id: role === 'admin' ? adminId : studentId, role }, query: { search } });

    const combinedResponse = responseCapture();
    await listProblems(request('#722'), combinedResponse);
    assert.deepEqual(new Set(combinedResponse.state.body.problems.map((row) => String(row._id))), new Set([
      String(peerPrepMatch._id), String(leetCodeMatch._id),
    ]));

    const peerPrepResponse = responseCapture();
    await listProblems(request('pp:722'), peerPrepResponse);
    assert.deepEqual(peerPrepResponse.state.body.problems.map((row) => String(row._id)), [String(peerPrepMatch._id)]);

    const leetCodeResponse = responseCapture();
    await listProblems(request('lc:722'), leetCodeResponse);
    assert.deepEqual(leetCodeResponse.state.body.problems.map((row) => String(row._id)), [String(leetCodeMatch._id)]);
  }
});

test('legacy problems without editorialMeta serialize meta as null and still expose editorial', () => {
  const serialized = serializeProblem({
    _id: 'legacy', title: 'Legacy', editorial: 'Old text', validatedLanguages: ['java'],
    referenceSolutions: new Map([['java', 'class Solution {}'], ['python', 'pass']]),
  }, { includeEditorialSolutions: true });
  assert.equal(serialized.editorial, 'Old text');
  assert.equal(serialized.editorialMeta, null);
  assert.deepEqual(serialized.editorialSolutions, { java: 'class Solution {}' });

  const listed = serializeProblem({ _id: 'legacy', title: 'Legacy', editorial: 'Old text' }, { includeEditorial: false });
  assert.equal(listed.editorial, undefined);
  assert.equal(listed.editorialMeta, undefined);
  assert.equal(listed.editorialSolutions, undefined);

  const noEditorial = serializeProblem({
    _id: 'x', title: 'X', editorial: '  ', validatedLanguages: ['java'], referenceSolutions: { java: 'class Solution {}' },
  }, { includeEditorialSolutions: true });
  assert.deepEqual(noEditorial.editorialSolutions, {}, 'no solutions are exposed without an editorial');

  assert.deepEqual(buildEditorialSolutions({ validatedLanguages: [], referenceSolutions: { python: 'x' } }), {});
});
