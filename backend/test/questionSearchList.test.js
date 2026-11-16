import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Problem from '../src/models/Problem.js';
import QuestionLibrary from '../src/models/QuestionLibrary.js';
import { listLibraryQuestions } from '../src/controllers/questionLibraryController.js';
import { listProblems } from '../src/controllers/problemController.js';
import { applyNumberKind } from '../src/utils/problemSerial.js';
import {
  buildLibrarySearchMatch,
  buildSearchPrefixes,
  libraryQuestionMatchesTerm,
  librarySearchTermClause,
  librarySearchTerms,
} from '../src/services/questionLibraryService.js';

// Comma-separated question search: the union of every term's matches, in typed order,
// with the terms that matched nothing reported back. Single-term search is unchanged.
let mongo;
const adminId = new mongoose.Types.ObjectId();
const admin = { _id: adminId, role: 'admin' };

const rows = [
  { title: 'Two Sum', displayOrder: 722, sourceNumber: 1 },
  { title: '3Sum Closest', displayOrder: 7, sourceNumber: 16 },
  { title: 'Trapping Rain Water', displayOrder: 300, sourceNumber: 42 },
  { title: 'Merge Intervals', displayOrder: 15, sourceNumber: 56 },
  { title: 'Valid Parentheses', displayOrder: 56, sourceNumber: 20 },
];

function capture() {
  const state = { statusCode: 200, body: null };
  return { state, status(code) { state.statusCode = code; return this; }, json(body) { state.body = body; return this; } };
}

async function library(query) {
  const res = capture();
  await listLibraryQuestions({ query: { type: 'coding', status: 'published', ...query }, user: admin }, res);
  assert.equal(res.state.statusCode, 200, JSON.stringify(res.state.body));
  return res.state.body;
}

async function problems(query) {
  const res = capture();
  await listProblems({ query, user: admin }, res);
  assert.equal(res.state.statusCode, 200, JSON.stringify(res.state.body));
  return res.state.body;
}

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  await mongoose.connect(mongo.getUri(), { dbName: 'question_search_list_test' });
  await Promise.all([Problem.init(), QuestionLibrary.init()]);
  for (const [index, row] of rows.entries()) {
    const problem = await Problem.create({ ...row, difficulty: 'Easy', status: 'published', supportedLanguages: ['python'], createdBy: adminId,
      updatedAt: new Date(Date.UTC(2026, 0, index + 1)) });
    await QuestionLibrary.create({
      sourceKey: `problem:${problem._id}`, sourceType: 'compiler', sourceProblemId: problem._id, sourceProblemTitle: row.title,
      questionType: 'coding', questionText: row.title, displayOrder: row.displayOrder, sourceNumber: row.sourceNumber,
      status: 'published', visibility: 'public', tags: ['Array'], searchPrefixes: buildSearchPrefixes([row.title, 'Array']),
      questionData: { type: 'coding', problemId: problem._id }, createdBy: adminId,
    });
  }
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('term clauses and the combined match', () => {
  const list = librarySearchTerms('lc 42, two sum, ?!');
  assert.equal(list.multi, true);
  assert.deepEqual(librarySearchTermClause(list.terms[0]), { sourceNumber: 42 });
  assert.deepEqual(librarySearchTermClause(list.terms[1]), { searchPrefixes: { $all: ['two', 'sum'] } });
  assert.deepEqual(librarySearchTermClause(list.terms[2]), { _id: { $exists: false } }, 'a term with nothing searchable matches nothing');
  assert.deepEqual(buildLibrarySearchMatch('lc 42, two sum'), { $or: [{ sourceNumber: 42 }, { searchPrefixes: { $all: ['two', 'sum'] } }] });
  // Single terms keep the exact old clauses.
  assert.deepEqual(buildLibrarySearchMatch('#56'), { $or: [{ displayOrder: 56 }, { sourceNumber: 56 }] });
  assert.deepEqual(buildLibrarySearchMatch('two sum'), { searchPrefixes: { $all: ['two', 'sum'] } });
  assert.equal(libraryQuestionMatchesTerm({ questionText: 'Two Sum', tags: [] }, list.terms[1]), true);
  assert.equal(libraryQuestionMatchesTerm({ searchPrefixes: ['tw', 'two', 's', 'su', 'sum'] }, list.terms[1]), true);
  assert.equal(libraryQuestionMatchesTerm({ searchPrefixes: ['two'] }, list.terms[1]), false);
});

for (const includeMeta of ['false', 'true']) {
  test(`library list (includeMeta=${includeMeta}): union in typed order with unmatched terms`, async () => {
    const body = await library({ includeMeta, search: 'lc 42, two sum, 999, pp 7, merge', sortBy: 'updatedAt', sortOrder: 'desc' });
    assert.deepEqual(body.questions.map((question) => question.questionText), ['Trapping Rain Water', 'Two Sum', '3Sum Closest', 'Merge Intervals']);
    assert.deepEqual(body.questions.map((question) => question.searchTermIndex), [0, 1, 3, 4]);
    assert.equal(body.pagination.total, 4);
    assert.deepEqual(body.searchTerms, ['lc 42', 'two sum', '999', 'pp 7', 'merge']);
    assert.deepEqual(body.unmatchedTerms, ['999']);
  });

  test(`library list (includeMeta=${includeMeta}): a number matching both identifiers is one result`, async () => {
    // 56 is Merge Intervals' LeetCode number and Valid Parentheses' PeerPrep serial.
    const body = await library({ includeMeta, search: '56, 1', sortBy: 'displayOrder', sortOrder: 'asc' });
    assert.deepEqual(body.questions.map((question) => question.questionText), ['Merge Intervals', 'Valid Parentheses', 'Two Sum']);
    assert.deepEqual(body.unmatchedTerms, []);
  });

  test(`library list (includeMeta=${includeMeta}): single-term search is unchanged`, async () => {
    const body = await library({ includeMeta, search: 'lc 42' });
    assert.deepEqual(body.questions.map((question) => question.questionText), ['Trapping Rain Water']);
    assert.equal('unmatchedTerms' in body, false);
    assert.equal('searchTermIndex' in body.questions[0], false);
  });
}

test('number toggle: a bare number becomes a PeerPrep or LeetCode number; prefixes and text are kept', () => {
  assert.equal(applyNumberKind('2', 'leetcode'), 'lc 2');
  assert.equal(applyNumberKind('#2', 'peerprep'), 'pp 2');
  assert.equal(applyNumberKind('2, lc 5, two sum, 7', 'peerprep'), 'pp 2, lc 5, two sum,pp 7');
  assert.equal(applyNumberKind('2', ''), '2', 'no toggle: either number, as before');
  assert.equal(applyNumberKind('2', 'nonsense'), '2');
  assert.equal(applyNumberKind(undefined, 'leetcode'), '');
  assert.equal(applyNumberKind({ $ne: 1 }, 'leetcode'), '', 'non-strings are ignored');
});

for (const includeMeta of ['false', 'true']) {
  test(`library list (includeMeta=${includeMeta}): the toggle picks which number a bare "56" means`, async () => {
    // 56 is Merge Intervals' LeetCode number and Valid Parentheses' PeerPrep number.
    const leetcode = await library({ includeMeta, search: '56', numberKind: 'leetcode' });
    assert.deepEqual(leetcode.questions.map((question) => question.questionText), ['Merge Intervals']);
    const peerprep = await library({ includeMeta, search: '56', numberKind: 'peerprep' });
    assert.deepEqual(peerprep.questions.map((question) => question.questionText), ['Valid Parentheses']);
    const several = await library({ includeMeta, search: '56, 1, pp 7', numberKind: 'leetcode', sortBy: 'displayOrder', sortOrder: 'asc' });
    assert.deepEqual(several.questions.map((question) => question.questionText), ['Merge Intervals', 'Two Sum', '3Sum Closest'], 'an explicit "pp" still wins');
  });
}

test('admin problem list honours the number toggle', async () => {
  assert.deepEqual((await problems({ search: '56', numberKind: 'leetcode' })).problems.map((problem) => problem.title), ['Merge Intervals']);
  assert.deepEqual((await problems({ search: '56', numberKind: 'peerprep' })).problems.map((problem) => problem.title), ['Valid Parentheses']);
});

test('library select-all returns every found question for "Select all found"', async () => {
  const body = await library({ includeMeta: 'false', search: '1, 16, 20, 42, 56', selectAll: 'true', limit: 2 });
  assert.equal(body.questions.length, 5);
  assert.equal(body.pagination.total, 5);
});

test('admin problem list: union in typed order, unmatched terms, single term unchanged', async () => {
  const multi = await problems({ search: 'merge, pp 300, 4242, lc 1', sortBy: 'title', sortOrder: 'asc' });
  assert.deepEqual(multi.problems.map((problem) => problem.title), ['Merge Intervals', 'Trapping Rain Water', 'Two Sum']);
  assert.deepEqual(multi.problems.map((problem) => problem.searchTermIndex), [0, 1, 3]);
  assert.equal(multi.pagination.total, 3);
  assert.deepEqual(multi.unmatchedTerms, ['4242']);

  const paged = await problems({ search: 'merge, pp 300, lc 1', limit: 1, page: 2 });
  assert.deepEqual(paged.problems.map((problem) => problem.title), ['Trapping Rain Water']);

  const single = await problems({ search: 'sum' });
  assert.deepEqual(single.problems.map((problem) => problem.title).sort(), ['3Sum Closest', 'Two Sum']);
  assert.equal('unmatchedTerms' in single, false);

  // Students keep the single-term search: a comma list is one literal text search.
  const res = capture();
  await listProblems({ query: { search: 'merge, two sum' }, user: { _id: new mongoose.Types.ObjectId(), role: 'student' } }, res);
  assert.equal('unmatchedTerms' in (res.state.body || {}), false);
});
