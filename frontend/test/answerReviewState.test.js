import assert from 'node:assert/strict';
import test from 'node:test';
import { indexList, optionState } from '../src/admin/reports/answerReviewState.js';

test('MCQ report colours: correct pick deep green, other correct green, wrong pick red', () => {
  const correct = [1];
  assert.equal(optionState(1, correct, [1]), 'hit', 'the student chose the official answer');
  assert.equal(optionState(1, correct, [2]), 'key', 'the official answer the student missed');
  assert.equal(optionState(2, correct, [2]), 'miss', 'the wrong option the student chose');
  assert.equal(optionState(0, correct, [2]), 'plain');
  // Multiple answers: each option on its own.
  assert.deepEqual([0, 1, 2, 3].map((index) => optionState(index, [0, 2], [0, 3])), ['hit', 'plain', 'key', 'miss']);
});

test('index lists come from the list field or the older single index', () => {
  assert.deepEqual(indexList([2, '0']), [2, 0]);
  assert.deepEqual(indexList(undefined, 3), [3]);
  assert.deepEqual(indexList(undefined, '1'), [1]);
  assert.deepEqual(indexList(undefined, null), []);
  assert.deepEqual(indexList(undefined, ''), []);
});
