import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import QuestionLibrary from '../src/models/QuestionLibrary.js';
import '../src/models/User.js';
import { LIBRARY_SORT_FIELDS, listLibraryQuestions } from '../src/controllers/questionLibraryController.js';

// Column-header sorting on the question library: a fixed whitelist of sort keys, the same order on
// the paged (includeMeta=false) and legacy (includeMeta=true) paths, unknown keys ignored.
let mongo;
const adminId = new mongoose.Types.ObjectId();
const admin = { _id: adminId, role: 'admin' };
const problemIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];

function capture() {
  const state = { statusCode: 200, body: null };
  return { state, status(code) { state.statusCode = code; return this; }, json(body) { state.body = body; return this; } };
}

async function titles(query) {
  const res = capture();
  await listLibraryQuestions({ query: { status: 'published', ...query }, user: admin }, res);
  assert.equal(res.state.statusCode, 200, JSON.stringify(res.state.body));
  return res.state.body.questions.map((question) => question.questionText);
}

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  await mongoose.connect(mongo.getUri(), { dbName: 'question_library_sort_test' });
  await QuestionLibrary.init();
  const base = { status: 'published', visibility: 'public', createdBy: adminId };
  // updatedAt rises with the index, so the default order is the reverse of this list.
  const rows = [
    { questionText: 'Alpha coding', questionType: 'coding', tags: ['Graph'], sourceType: 'compiler', sourceProblemId: problemIds[0], sourceKey: `problem:${problemIds[0]}` },
    { questionText: 'Bravo mcq', questionType: 'mcq', tags: ['Arrays'], sourceType: 'manual', sourceKey: 'manual:bravo' },
    { questionText: 'Charlie coding', questionType: 'coding', tags: [], sourceType: 'compiler', sourceProblemId: problemIds[1], sourceKey: `problem:${problemIds[1]}` },
    { questionText: 'Delta short', questionType: 'short', tags: ['Logic'], sourceType: 'manual', sourceKey: 'manual:delta' },
  ];
  for (const [index, row] of rows.entries()) {
    const doc = await QuestionLibrary.create({ ...base, ...row, questionData: { type: row.questionType } });
    await QuestionLibrary.collection.updateOne({ _id: doc._id }, { $set: { updatedAt: new Date(Date.UTC(2026, 0, index + 1)) } });
  }
  // Charlie's problem is used by two assessments, Alpha's by one. These copies fold into the compiler rows.
  const usage = [[problemIds[1], 'Mid term'], [problemIds[1], 'Final'], [problemIds[0], 'Quiz']];
  for (const [index, [problemId, title]] of usage.entries()) {
    const doc = await QuestionLibrary.create({
      ...base, questionType: 'coding', questionText: 'copy', sourceType: 'assessment', sourceKey: `assessment:${index}`,
      sourceProblemId: problemId, sourceAssessmentId: new mongoose.Types.ObjectId(), sourceAssessmentTitle: title, questionData: { type: 'coding' },
    });
    await QuestionLibrary.collection.updateOne({ _id: doc._id }, { $set: { updatedAt: new Date(Date.UTC(2025, 0, index + 1)) } });
  }
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('the sort whitelist covers every sortable library column', () => {
  for (const key of ['questionText', 'questionType', 'difficulty', 'tags', 'usedIn', 'updatedAt']) assert.ok(LIBRARY_SORT_FIELDS.includes(key), key);
});

for (const includeMeta of ['false', 'true']) {
  test(`library column sorts (includeMeta=${includeMeta})`, async () => {
    assert.deepEqual(await titles({ includeMeta }), ['Delta short', 'Charlie coding', 'Bravo mcq', 'Alpha coding'], 'default stays most recently updated first');
    assert.deepEqual(await titles({ includeMeta, sortBy: 'nope', sortOrder: 'asc' }), await titles({ includeMeta, sortBy: 'updatedAt', sortOrder: 'asc' }), 'unknown keys fall back to updatedAt');
    assert.deepEqual(await titles({ includeMeta, sortBy: 'questionType', sortOrder: 'asc' }), ['Charlie coding', 'Alpha coding', 'Bravo mcq', 'Delta short']);
    assert.deepEqual(await titles({ includeMeta, sortBy: 'tags', sortOrder: 'asc' }), ['Charlie coding', 'Bravo mcq', 'Alpha coding', 'Delta short']);
    assert.deepEqual(await titles({ includeMeta, sortBy: 'usedIn', sortOrder: 'desc' }), ['Charlie coding', 'Alpha coding', 'Delta short', 'Bravo mcq']);
    assert.deepEqual(await titles({ includeMeta, sortBy: 'questionText', sortOrder: 'desc' }), ['Delta short', 'Charlie coding', 'Bravo mcq', 'Alpha coding']);
  });
}

test('column sort keeps server paging', async () => {
  const res = capture();
  await listLibraryQuestions({ query: { status: 'published', includeMeta: 'false', sortBy: 'questionType', sortOrder: 'desc', page: 2, limit: 2 }, user: admin }, res);
  assert.deepEqual(res.state.body.questions.map((question) => question.questionText), ['Charlie coding', 'Alpha coding']);
  assert.equal(res.state.body.pagination.total, 4);
});
