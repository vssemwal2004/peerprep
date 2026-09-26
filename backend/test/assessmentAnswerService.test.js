import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAssessmentAnswers } from '../src/services/assessmentAnswerService.js';

test('partial autosave preserves answers omitted from the incoming batch', () => {
  const existing = [
    { sectionIndex: 0, questionIndex: 0, answer: 1 },
    { sectionIndex: 0, questionIndex: 1, answer: 2 },
  ];

  assert.deepEqual(mergeAssessmentAnswers(existing, [
    { sectionIndex: 0, questionIndex: 1, answer: 3 },
  ]), [
    { sectionIndex: 0, questionIndex: 0, answer: 1 },
    { sectionIndex: 0, questionIndex: 1, answer: 3 },
  ]);
});

test('unchanged coding source preserves its asynchronous evaluation fields', () => {
  const merged = mergeAssessmentAnswers([{
    sectionIndex: 1,
    questionIndex: 2,
    language: 'javascript',
    code: 'return 1;',
    jobId: 'job-1',
    executionStatus: 'completed',
    executionVerdict: 'AC',
    executionResult: { passed: 3, total: 3 },
  }], [{
    sectionIndex: 1,
    questionIndex: 2,
    language: 'javascript',
    code: 'return 1;',
  }]);

  assert.equal(merged[0].jobId, 'job-1');
  assert.equal(merged[0].executionVerdict, 'AC');
});

test('changed coding source clears stale evaluation fields', () => {
  const merged = mergeAssessmentAnswers([{
    sectionIndex: 0,
    questionIndex: 0,
    language: 'javascript',
    code: 'return 1;',
    executionVerdict: 'AC',
  }], [{
    sectionIndex: 0,
    questionIndex: 0,
    language: 'javascript',
    code: 'return 2;',
  }]);

  assert.equal(merged[0].executionVerdict, undefined);
});

