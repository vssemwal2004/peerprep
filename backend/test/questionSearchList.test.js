import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Problem from '../src/models/Problem.js';
import QuestionLibrary from '../src/models/QuestionLibrary.js';
import Assessment from '../src/models/Assessment.js';
import { createLibraryQuestion, getLibraryQuestion, listLibraryQuestions, resolveLibraryQuestions } from '../src/controllers/questionLibraryController.js';
import { createAssessment, getAssessmentReports, listAssessments, resetMock, updateAssessment } from '../src/controllers/assessmentController.js';
import { Publication, University } from '../src/platform/models.js';
import { listProblems } from '../src/controllers/problemController.js';
import { practiceCompanyCounts } from '../src/platform/questionPractice.js';
import { applyNumberKind } from '../src/utils/problemSerial.js';
import {
  buildLibrarySearchMatch,
  buildSearchPrefixes,
  libraryQuestionMatchesTerm,
  librarySearchTermClause,
  librarySearchTerms,
  syncAssessmentQuestionsToLibrary,
  syncProblemToLibrary,
} from '../src/services/questionLibraryService.js';

// Comma-separated question search: the union of every term's matches, in typed order,
// with the terms that matched nothing reported back. Single-term search is unchanged.
let mongo;
const adminId = new mongoose.Types.ObjectId();
const admin = { _id: adminId, role: 'admin', email: 'mock-test@example.com' };

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

test('PrepMock records and questions stay out of regular assessment and library lists', async () => {
  const importedMainQuestion = await QuestionLibrary.create({
    sourceKey: 'main:import-into-mock', sourceType: 'manual', scope: 'main', questionType: 'mcq',
    questionText: 'Imported from main?', status: 'published', visibility: 'public',
    questionData: { type: 'mcq', questionText: 'Imported from main?', options: ['Yes', 'No'], correctOptionIndex: 0 },
    createdBy: adminId,
  });
  const mainAssessment = await Assessment.create({ title: 'Regular assessment', createdBy: adminId, lifecycleStatus: 'draft' });
  const mock = await Assessment.create({ title: 'Mock assessment', kind: 'mock', createdBy: adminId, lifecycleStatus: 'draft', sections: [{
    sectionName: 'Questions', type: 'mcq', questions: [
      { questionId: 'mock-q', type: 'mcq', questionText: 'Mock only?', options: ['Yes', 'No'], correctOptionIndex: 0 },
      { questionId: 'main-import', librarySourceId: String(importedMainQuestion._id), type: 'mcq', questionText: 'Imported from main?', options: ['Yes', 'No'], correctOptionIndex: 0 },
    ],
  }] });
  await syncAssessmentQuestionsToLibrary(mock);

  const mainList = capture();
  await listAssessments({ query: { view: 'dashboard' }, user: admin }, mainList);
  assert.equal(mainList.state.statusCode, 200, JSON.stringify(mainList.state.body));
  assert.ok(mainList.state.body.assessments.some((item) => String(item._id) === String(mainAssessment._id)));
  assert.ok(mainList.state.body.assessments.every((item) => String(item._id) !== String(mock._id)));

  const mockList = capture();
  await listAssessments({ query: { kind: 'mock', view: 'dashboard' }, user: admin }, mockList);
  assert.equal(mockList.state.statusCode, 200, JSON.stringify(mockList.state.body));
  assert.deepEqual(mockList.state.body.assessments.map((item) => String(item._id)), [String(mock._id)]);

  const mainQuestions = await library({ type: 'mcq', includeMeta: 'false' });
  assert.equal(mainQuestions.questions.some((item) => item.questionText === 'Mock only?'), false);
  const mockQuestions = await library({ type: 'mcq', scope: 'mock', status: 'draft', includeMeta: 'false' });
  assert.deepEqual(mockQuestions.questions.map((item) => item.questionText), ['Mock only?']);
  assert.equal(await QuestionLibrary.countDocuments({ scope: 'mock', sourceAssessmentId: mock._id }), 1, 'importing a main-library question must not copy it into Mock Library');

  const created = capture();
  await createLibraryQuestion({ query: { scope: 'mock' }, user: admin, body: { question: { type: 'short', questionText: 'Mock authored question', status: 'published' } } }, created);
  assert.equal(created.state.statusCode, 200, JSON.stringify(created.state.body));
  const questionId = created.state.body.question._id;
  const mainRead = capture();
  await getLibraryQuestion({ query: {}, params: { id: questionId }, user: admin }, mainRead);
  assert.equal(mainRead.state.statusCode, 404);
  const mockRead = capture();
  await getLibraryQuestion({ query: { scope: 'mock' }, params: { id: questionId }, user: admin }, mockRead);
  assert.equal(mockRead.state.statusCode, 200);
  const mainResolve = capture();
  await resolveLibraryQuestions({ query: {}, body: { ids: [questionId] }, user: admin }, mainResolve);
  assert.deepEqual(mainResolve.state.body.questions, []);

  const coding = await Problem.create({ title: 'Mock coding only', libraryScope: 'mock', difficulty: 'Easy', status: 'draft', supportedLanguages: ['python'], createdBy: adminId });
  await syncProblemToLibrary(coding);
  const mainCoding = await library({ search: 'Mock coding only', type: 'coding', status: 'draft', includeMeta: 'false' });
  assert.equal(mainCoding.questions.length, 0);
  const mockCoding = await library({ search: 'Mock coding only', type: 'coding', status: 'draft', scope: 'mock', includeMeta: 'false' });
  assert.deepEqual(mockCoding.questions.map((item) => item.questionText), ['Mock coding only']);
  assert.equal((await problems({ search: 'Mock coding only' })).problems.length, 0);

  await Assessment.updateMany({ _id: { $in: [mainAssessment._id, mock._id] } }, { $set: { lifecycleStatus: 'published' } });
  const regularReports = capture();
  await getAssessmentReports({ query: { view: 'dashboard' }, user: admin }, regularReports);
  assert.equal(regularReports.state.statusCode, 200, JSON.stringify(regularReports.state.body));
  assert.ok(regularReports.state.body.assessments.some((item) => String(item._id) === String(mainAssessment._id)));
  assert.ok(regularReports.state.body.assessments.every((item) => String(item._id) !== String(mock._id)));
  const mockReports = capture();
  await getAssessmentReports({ query: { view: 'dashboard', kind: 'mock' }, user: admin }, mockReports);
  assert.equal(mockReports.state.statusCode, 200, JSON.stringify(mockReports.state.body));
  assert.deepEqual(mockReports.state.body.assessments.map((item) => String(item._id)), [String(mock._id)]);
});

test('creating a mock draft persists its kind and syncs authored questions into Mock Library', async () => {
  const originalRole = process.env.PEERPREP_DEPLOYMENT_ROLE;
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'control';
  try {
    const response = capture();
    await createAssessment({ user: admin, ip: '127.0.0.1', get: () => 'test', body: {
      kind: 'mock', company: 'Amazon', role: 'SDE 1', title: 'Created through mock flow', lifecycleStatus: 'draft',
      sections: [{ sectionName: 'MCQ', type: 'mcq', questions: [{ questionId: 'created-mock-q', type: 'mcq', questionText: 'Created mock question?', options: ['A', 'B'], correctOptionIndex: 0 }] }],
    } }, response);
    assert.equal(response.state.statusCode, 201, JSON.stringify(response.state.body));
    const saved = await Assessment.findById(response.state.body.assessmentId).lean();
    assert.equal(saved.kind, 'mock');
    assert.equal(saved.company, 'Amazon');
    assert.equal(saved.role, 'SDE 1');
    const noRole = capture();
    await createAssessment({ user: admin, ip: '127.0.0.1', get: () => 'test', body: { kind: 'mock', company: 'Amazon', title: 'No role', lifecycleStatus: 'draft', sections: [] } }, noRole);
    assert.equal(noRole.state.statusCode, 400);
    assert.match(noRole.state.body.error, /role/);
    const mockQuestions = await library({ type: 'mcq', status: 'draft', scope: 'mock', search: 'Created mock question', includeMeta: 'false' });
    assert.deepEqual(mockQuestions.questions.map((item) => item.questionText), ['Created mock question?']);
    const regularQuestions = await library({ type: 'mcq', status: 'draft', search: 'Created mock question', includeMeta: 'false' });
    assert.equal(regularQuestions.questions.length, 0);
  } finally {
    if (originalRole === undefined) delete process.env.PEERPREP_DEPLOYMENT_ROLE;
    else process.env.PEERPREP_DEPLOYMENT_ROLE = originalRole;
  }
});

test('mock company choices are exactly the companies students see on Prep Coding', async () => {
  // Students see published practice questions' company tags; a draft problem's tags stay hidden.
  await Problem.create({ title: 'Hidden draft problem', companyTags: ['Draftonly Labs'], difficulty: 'Easy', status: 'draft', supportedLanguages: ['python'], createdBy: adminId });
  for (const [index, keywords] of [['Zenith Corp', 'Orbit Inc'], ['zenith corp'], ['Orbit Inc']].entries()) {
    await QuestionLibrary.create({
      sourceKey: `company-check:${index}`, sourceType: 'manual', questionType: 'mcq', questionText: `Company check ${index}`,
      status: 'published', visibility: 'public', tags: ['Array'], keywords, questionData: { type: 'mcq', options: ['A', 'B'], correctOptionIndex: 0 }, createdBy: adminId,
    });
  }
  await QuestionLibrary.create({
    sourceKey: 'company-check:draft', sourceType: 'manual', questionType: 'mcq', questionText: 'Draft company check',
    status: 'draft', visibility: 'public', keywords: ['Draftonly Labs'], questionData: { type: 'mcq', options: ['A', 'B'], correctOptionIndex: 0 }, createdBy: adminId,
  });
  const companies = await practiceCompanyCounts();
  const counts = Object.fromEntries(companies.map((row) => [row.company.toLowerCase(), row.count]));
  assert.equal(counts['zenith corp'], 2, 'one entry per company, counted per question, case-insensitive');
  assert.equal(counts['orbit inc'], 2);
  assert.equal(counts['draftonly labs'], undefined, 'drafts are not offered');
  assert.ok(companies.findIndex((row) => row.company.toLowerCase() === 'orbit inc') < companies.findIndex((row) => row.company.toLowerCase() === 'zenith corp'), 'ties sort by name');
});

test('publishing a mock automatically reaches universities with PrepMock dates and reset removes access', async () => {
  const originalRole = process.env.PEERPREP_DEPLOYMENT_ROLE;
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'control';
  try {
    await University.create({ universityId: 'mock-test-uni', name: 'Mock Test University',
      permissions: { assessments: true, prepmock: true }, prepMockStartDate: '2020-01-01', prepMockEndDate: '2099-12-31' });
    const mock = await Assessment.create({
      kind: 'mock', company: 'Amazon', role: 'SDE 1', title: 'University mock', createdBy: adminId,
      lifecycleStatus: 'draft', sections: [{ sectionName: 'Questions', type: 'mcq', questions: [
        { questionId: 'uni-mock-q', type: 'mcq', questionText: 'University question?', options: ['Yes', 'No'], correctOptionIndex: 0 },
      ] }],
    });
    // Publishing a mock needs the month and year of its OA pattern.
    const noDate = capture();
    await updateAssessment({ user: admin, socket: { remoteAddress: '127.0.0.1' }, params: { id: String(mock._id) }, body: {
      lifecycleStatus: 'published', availabilityMode: 'always', duration: 30, targetType: 'selected',
      mockAudienceMode: 'universities', mockUniversityIds: ['mock-test-uni'], assignedStudents: [],
    } }, noDate);
    assert.equal(noDate.state.statusCode, 400);
    assert.match(JSON.stringify(noDate.state.body), /month and year/);
    const published = capture();
    await updateAssessment({ user: admin, socket: { remoteAddress: '127.0.0.1' }, connection: { remoteAddress: '127.0.0.1' }, get: () => 'test', params: { id: String(mock._id) }, body: {
      lifecycleStatus: 'published', availabilityMode: 'always', duration: 30,
      mockAudienceMode: 'students', mockUniversityIds: [], assignedStudents: [],
      patternFrom: { month: 3, year: 2025 },
    } }, published);
    assert.equal(published.state.statusCode, 200, JSON.stringify(published.state.body));
    const publication = await Publication.findOne({ kind: 'assessment', contentId: mock._id }).lean();
    assert.equal(publication.published, true);
    assert.deepEqual(publication.universityIds, ['mock-test-uni']);
    const saved = await Assessment.findById(mock._id).lean();
    assert.deepEqual(saved.assignedStudents, []);
    assert.equal(saved.availabilityMode, 'always');
    assert.equal(saved.mockAudienceMode, 'universities');
    assert.equal(saved.targetType, 'selected');

    const reset = capture();
    await resetMock({ user: admin, params: { id: String(mock._id) } }, reset);
    assert.equal(reset.state.statusCode, 200, JSON.stringify(reset.state.body));
    const afterReset = await Assessment.findById(mock._id).lean();
    const afterPublication = await Publication.findOne({ kind: 'assessment', contentId: mock._id }).lean();
    assert.equal(afterReset.lifecycleStatus, 'draft');
    assert.deepEqual(afterReset.mockUniversityIds, []);
    assert.equal(afterPublication.published, false);
    assert.deepEqual(afterPublication.universityIds, []);
    assert.deepEqual(afterPublication.everUniversityIds, ['mock-test-uni']);
  } finally {
    if (originalRole === undefined) delete process.env.PEERPREP_DEPLOYMENT_ROLE;
    else process.env.PEERPREP_DEPLOYMENT_ROLE = originalRole;
  }
});
