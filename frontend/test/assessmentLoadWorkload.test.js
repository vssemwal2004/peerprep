import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnswerCatalog, changedAnswerBatch, answersMatch } from '../../load-tests/assessment-workload.js';

test('load generator sends real answer arrays using shuffled delivery origins', () => {
  const catalog = buildAnswerCatalog({ sections: [{ type: 'mcq', questions: [
    { __originSectionIndex: 2, __originQuestionIndex: 5, options: ['A', 'B'] },
    { options: ['C', 'D'], allowMultipleAnswers: true },
  ] }] });
  const first = changedAnswerBatch(catalog, 0, 'run');
  const second = changedAnswerBatch(catalog, 1, 'run');
  assert.equal(first[0].sectionIndex, 2);
  assert.equal(first[0].questionIndex, 5);
  assert.equal(typeof first[0].answer, 'number');
  assert.equal(Array.isArray(first[1].answer), true);
  assert.notDeepEqual(first, second);
  assert.notEqual(first[0].answer, second.find((entry) => entry.questionIndex === 5).answer);
});
test('HTTP success cannot hide missing or overwritten persisted answers', () => {
  const expected = [{ sectionIndex: 0, questionIndex: 0, answer: 1 }, { sectionIndex: 0, questionIndex: 1, answer: [0, 2] }];
  assert.equal(answersMatch(expected, [expected[0]]), false);
  assert.equal(answersMatch(expected, [{ ...expected[0], answer: 0 }, expected[1]]), false);
  assert.equal(answersMatch(expected, [{ ...expected[0], answer: '1' }, { ...expected[1], answer: ['2', '0'] }]), true);
  assert.equal(answersMatch([], []), false);
});
