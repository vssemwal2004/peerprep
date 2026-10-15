import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hydrateAssessmentCodingRuntime,
  normalizeAssessmentSections,
  sanitizeStudentAssessmentForResponse,
} from '../src/controllers/assessmentController.js';
import Assessment from '../src/models/Assessment.js';
import Problem from '../src/models/Problem.js';
import TestCase from '../src/models/TestCase.js';

const PROBLEM_ID = '507f1f77bcf86cd799439011';

const authorSnapshot = () => ({
  _id: PROBLEM_ID,
  title: 'Sum',
  sampleTestCases: [{ input: '1 2', output: '3', images: [] }],
  hiddenTestCases: [{ input: '5 5', output: '10', marks: 2 }, { input: '0 0', output: '0' }],
  hiddenTestCaseTotalMarks: 3,
  referenceSolutions: { python: 'print(sum(map(int, input().split())))' },
  executionHarnesses: { python: 'private runner' },
  validatedLanguages: ['python'],
  sqlConfig: { schemaSql: 'CREATE TABLE t(x);', resultQuery: 'SELECT * FROM t;' },
});

function stubQuery(result) {
  const query = { select: () => query, lean: async () => result };
  return query;
}

test('persisted coding snapshots drop hidden cases and solutions but keep builder counts', () => {
  const [section] = normalizeAssessmentSections([{
    type: 'coding',
    questions: [{ type: 'coding', problemDataSnapshot: authorSnapshot(), coding: { problemData: authorSnapshot() } }],
  }]);
  const question = section.questions[0];
  for (const snapshot of [question.problemDataSnapshot, question.coding.problemData]) {
    assert.equal(snapshot.hiddenTestCases, undefined);
    assert.equal(snapshot.referenceSolutions, undefined);
    assert.equal(snapshot.executionHarnesses, undefined);
    assert.equal(snapshot.hiddenTestCaseCount, 2);
    assert.equal(snapshot.hiddenTestCaseTotalMarks, 3);
    assert.deepEqual(snapshot.sampleTestCases, [{ input: '1 2', output: '3', images: [] }]);
  }
});

test('student response redacts hidden totals, validated languages, and the SQL result query', () => {
  const response = sanitizeStudentAssessmentForResponse({
    sections: [{ type: 'coding', questions: [{ type: 'coding', problemDataSnapshot: authorSnapshot(), coding: { problemData: authorSnapshot() } }] }],
  });
  const question = response.sections[0].questions[0];
  for (const snapshot of [question.problemDataSnapshot, question.coding.problemData]) {
    for (const field of ['hiddenTestCases', 'hiddenTestCaseTotalMarks', 'referenceSolutions', 'executionHarnesses', 'validatedLanguages']) {
      assert.equal(snapshot[field], undefined, `${field} must not reach students`);
    }
    assert.equal(snapshot.sqlConfig.resultQuery, undefined);
    assert.equal(snapshot.sqlConfig.schemaSql, 'CREATE TABLE t(x);');
  }
});

test('runtime hydration refreshes only images, and only for unchanged samples', async (t) => {
  const image = { url: 'https://res.cloudinary.com/demo/sample.png', alt: 'Graph' };
  t.mock.method(Problem, 'find', () => stubQuery([{
    _id: PROBLEM_ID,
    supportedLanguages: ['python'],
    codeTemplates: { python: '' },
    contentImages: [{ url: 'https://res.cloudinary.com/demo/figure.png' }, { url: '' }],
  }]));
  t.mock.method(TestCase, 'find', () => stubQuery([
    { problem: PROBLEM_ID, position: 2, input: 'changed', output: 'x', images: [image] },
    { problem: PROBLEM_ID, position: 1, input: '1 2', output: '3', images: [image] },
  ]));

  const hydrated = await hydrateAssessmentCodingRuntime({
    sections: [{
      type: 'coding',
      questions: [{
        type: 'coding',
        problemId: PROBLEM_ID,
        problemDataSnapshot: {
          _id: PROBLEM_ID,
          sampleTestCases: [{ input: '1 2', output: '3' }, { input: '4 5', output: '9', images: [] }],
        },
      }],
    }],
  });
  const snapshot = hydrated.sections[0].questions[0].problemDataSnapshot;
  assert.deepEqual(snapshot.contentImages, [{ url: 'https://res.cloudinary.com/demo/figure.png' }]);
  assert.deepEqual(snapshot.sampleTestCases[0], { input: '1 2', output: '3', images: [image] });
  assert.deepEqual(snapshot.sampleTestCases[1], { input: '4 5', output: '9', images: [] });
});

test('runtime hydration leaves questions alone when the problem no longer exists', async (t) => {
  t.mock.method(Problem, 'find', () => stubQuery([]));
  t.mock.method(TestCase, 'find', () => stubQuery([]));
  const question = { type: 'coding', problemId: PROBLEM_ID, problemDataSnapshot: { _id: PROBLEM_ID, sampleTestCases: [] } };
  const hydrated = await hydrateAssessmentCodingRuntime({ sections: [{ type: 'coding', questions: [question] }] });
  assert.equal(hydrated.sections[0].questions[0], question);
});

test('legacy coding fallback keeps sample images and statement images', () => {
  const assessment = new Assessment({
    createdBy: PROBLEM_ID,
    sections: [{
      sectionName: 'Coding',
      type: 'coding',
      questions: [{
        type: 'coding',
        coding: {
          testCases: [{ input: '1', output: '1', images: [{ url: 'https://example.com/a.png' }] }],
          sampleTestCases: [{ input: '1', output: '1', images: [{ url: 'https://example.com/a.png' }] }],
          contentImages: [{ url: 'https://example.com/b.png' }],
        },
      }],
    }],
  });
  const coding = assessment.toObject().sections[0].questions[0].coding;
  assert.equal(coding.testCases[0].images[0].url, 'https://example.com/a.png');
  assert.equal(coding.sampleTestCases[0].images[0].url, 'https://example.com/a.png');
  assert.equal(coding.contentImages[0].url, 'https://example.com/b.png');
});
