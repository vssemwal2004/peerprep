import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_SEARCH_TERMS,
  QUESTION_SEARCH_PLACEHOLDER,
  addFoundToSelection,
  isMultiTermSearch,
  splitSearchTerms,
  unmatchedTermsLabel,
} from '../src/admin/library/searchTerms.js';

test('splits comma-separated searches like the server', () => {
  assert.deepEqual(splitSearchTerms('1, 15 ,pp 3, lc 42, two  sum, Two Sum,, '), ['1', '15', 'pp 3', 'lc 42', 'two sum']);
  assert.deepEqual(splitSearchTerms(''), []);
  assert.equal(splitSearchTerms(Array.from({ length: 70 }, (_, index) => index + 1).join(',')).length, MAX_SEARCH_TERMS);
  assert.equal(isMultiTermSearch('two sum'), false);
  assert.equal(isMultiTermSearch('12,'), false);
  assert.equal(isMultiTermSearch('12, 12'), false);
  assert.equal(isMultiTermSearch('12, two sum'), true);
  assert.match(QUESTION_SEARCH_PLACEHOLDER, /commas/);
});

test('labels unmatched terms compactly', () => {
  assert.equal(unmatchedTermsLabel([]), '');
  assert.equal(unmatchedTermsLabel(['999', 'foo']), 'Not found: 999, foo');
  assert.equal(unmatchedTermsLabel(['a', 'b', 'c'], 2), 'Not found: a, b and 1 more');
});

test('"Select all found" adds to the existing selection and skips blocked rows', () => {
  const rows = [{ _id: 'a' }, { _id: 'b', added: true }, { _id: 'c' }, { _id: 'x' }];
  const next = addFoundToSelection(new Set(['x']), { x: { _id: 'x' } }, rows, (row) => !row.added);
  assert.deepEqual([...next.ids], ['x', 'a', 'c']);
  assert.deepEqual(Object.keys(next.meta), ['x', 'a', 'c']);
  assert.equal(next.added, 2);
});
