import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssessmentOnlyQuestionSelections } from '../src/admin/assessment/assessmentQuestionRetention.js';

test('assessment-only questions carry retention metadata without library ids', () => {
  const [selection] = createAssessmentOnlyQuestionSelections([{
    type: 'mcq',
    questionText: 'Which option is correct?',
    assessmentSetHint: 3,
  }]);

  assert.equal(selection.assessmentOnly, true);
  assert.equal(selection.assessmentSetHint, 3);
  assert.equal(selection.questionData.saveToLibrary, false);
  assert.equal(selection._id, undefined);
});

test('passage children are also marked assessment-only', () => {
  const [selection] = createAssessmentOnlyQuestionSelections([{
    type: 'mcq',
    libraryItemKind: 'passage_set',
    questions: [{ questionText: 'First' }, { questionText: 'Second' }],
  }]);

  assert.deepEqual(selection.questionData.questions.map((question) => question.saveToLibrary), [false, false]);
});
