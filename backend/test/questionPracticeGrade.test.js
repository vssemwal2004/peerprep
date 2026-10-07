import test from 'node:test';
import assert from 'node:assert/strict';
import { gradePracticeAnswer, publicShape } from '../src/platform/questionPractice.js';

test('practice answers use backend keys and distinguish ungraded responses', () => {
  const mcq = { questionType: 'mcq', questionData: { correctOptionIndex: 0 } };
  assert.equal(gradePracticeAnswer(mcq, [0]), 'correct');
  assert.equal(gradePracticeAnswer(mcq, [1]), 'incorrect');
  const multiple = { questionType: 'mcq', questionData: { allowMultipleAnswers: true, correctOptionIndexes: [0, 2] } };
  assert.equal(gradePracticeAnswer(multiple, [2, 0]), 'correct');
  assert.equal(gradePracticeAnswer(multiple, [0]), 'incorrect');
  assert.equal(gradePracticeAnswer({ questionType: 'mcq', questionData: {} }, [0]), 'submitted');
  assert.equal(gradePracticeAnswer({ questionType: 'short', questionData: { expectedAnswer: 'PeerPrep' } }, ' peerprep '), 'correct');
  assert.equal(gradePracticeAnswer({ questionType: 'coding', questionData: {} }, 'print(1)'), 'submitted');
  const passage = { questionType: 'mcq', questionData: { libraryItemKind: 'passage_set', questions: [
    { correctOptionIndex: 1 }, { correctOptionIndex: 0 },
  ] } };
  assert.equal(gradePracticeAnswer(passage, { 0: [1], 1: [0] }), 'correct');
  assert.equal(gradePracticeAnswer(passage, { 0: [0], 1: [0] }), 'incorrect');
});

test('student question shape excludes grading keys', () => {
  const safe = publicShape({ _id: 'question', questionType: 'mcq', questionText: 'Example',
    questionData: { options: ['A', 'B'], correctOptionIndex: 1, expectedAnswer: 'B' } }, 'shared');
  assert.deepEqual(safe.options, ['A', 'B']);
  assert.equal(JSON.stringify(safe).includes('correctOptionIndex'), false);
  assert.equal(JSON.stringify(safe).includes('expectedAnswer'), false);
  const passage = publicShape({ questionType: 'mcq', questionData: { libraryItemKind: 'passage_set',
    questions: [{ questionText: 'Child', options: ['A', 'B'], correctOptionIndex: 1 }] } }, 'shared');
  assert.equal(passage.subquestions[0].questionText, 'Child');
  assert.equal(JSON.stringify(passage).includes('correctOptionIndex'), false);
});
