import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCodingQuestionScore,
  scoreAssessmentWithTestCases,
} from '../src/services/assessmentScoringService.js';

const codingQuestion = { type: 'coding', points: 10 };
const codingSection = { type: 'coding', marksPerQuestion: 10 };

test('coding question awards weighted partial marks from passed test cases', () => {
  const result = getCodingQuestionScore(codingQuestion, {
    code: 'solution',
    executionStatus: 'completed',
    executionVerdict: 'WA',
    executionResult: {
      passed: 1,
      total: 2,
      passedTestCaseMarks: 1,
      totalTestCaseMarks: 3,
    },
  }, codingSection);

  assert.equal(result.earnedMarks, 3.3333);
  assert.equal(result.fullyCorrect, false);
});

test('all passed test cases award the full question marks', () => {
  const assessment = {
    sections: [{
      type: 'coding',
      questions: [{ type: 'coding', points: 10 }],
    }],
  };
  const result = scoreAssessmentWithTestCases(assessment, [{
    sectionIndex: 0,
    questionIndex: 0,
    code: 'solution',
    executionStatus: 'completed',
    executionVerdict: 'AC',
    executionResult: {
      passed: 3,
      total: 3,
      passedTestCaseMarks: 6,
      totalTestCaseMarks: 6,
    },
  }]);

  assert.equal(result.score, 10);
  assert.equal(result.maxMarks, 10);
  assert.equal(result.accuracy, 100);
});

test('legacy passed/total coding results still receive equal partial marks', () => {
  const result = getCodingQuestionScore(codingQuestion, {
    code: 'solution',
    executionStatus: 'completed',
    executionVerdict: 'WA',
    executionResult: { passed: 1, total: 4 },
  }, codingSection);

  assert.equal(result.earnedMarks, 2.5);
});
