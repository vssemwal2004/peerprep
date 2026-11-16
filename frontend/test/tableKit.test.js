import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clampPage, compareValues, nextSort, pageCount, pageRange, pageWindow, slicePage, sortRows, sortableValue,
} from '../src/components/table/tableModel.js';
import {
  inDateRange, normalizeDateRange, parseDayKey, rangeBounds, rangeLabel, rangeToBody, rangeToQuery,
} from '../src/components/dateRange/dateRangeModel.js';

test('sortableValue reads numbers, dates (incl. Safari-unsafe "YYYY-MM-DD HH:mm") and text', () => {
  assert.equal(sortableValue(5), 5);
  assert.equal(sortableValue(''), null);
  assert.equal(sortableValue(null), null);
  assert.equal(sortableValue('2026-01-02 10:00'), Date.parse('2026-01-02T10:00'));
  assert.equal(sortableValue('2026-01-02T10:00:00.000Z'), Date.parse('2026-01-02T10:00:00.000Z'));
  assert.equal(sortableValue('  Alice '), 'Alice');
});

test('compareValues: numeric-aware text, blanks always last', () => {
  assert.ok(compareValues('Sem 2', 'Sem 10') < 0);
  assert.ok(compareValues(null, 1, 'asc') > 0);
  assert.ok(compareValues(null, 1, 'desc') > 0);
  assert.ok(compareValues(3, 1, 'desc') < 0);
});

test('nextSort cycles asc → desc → off, and a new column starts at asc', () => {
  let sort = nextSort(null, 'name');
  assert.deepEqual(sort, { key: 'name', direction: 'asc' });
  sort = nextSort(sort, 'name');
  assert.deepEqual(sort, { key: 'name', direction: 'desc' });
  assert.equal(nextSort(sort, 'name'), null);
  assert.deepEqual(nextSort(sort, 'email'), { key: 'email', direction: 'asc' });
});

test('sortRows is stable and uses getValue', () => {
  const rows = [{ id: 1, s: 5 }, { id: 2, s: 3 }, { id: 3, s: 5 }, { id: 4, s: null }];
  assert.deepEqual(sortRows(rows, { key: 's', direction: 'asc' }).map((row) => row.id), [2, 1, 3, 4]);
  assert.deepEqual(sortRows(rows, { key: 's', direction: 'desc' }).map((row) => row.id), [1, 3, 2, 4]);
  assert.deepEqual(sortRows(rows, null).map((row) => row.id), [1, 2, 3, 4]);
  assert.deepEqual(sortRows(rows, { key: 'x', direction: 'asc' }, (row) => -row.id).map((row) => row.id), [4, 3, 2, 1]);
});

test('paging maths: counts, clamping, range text and the page window', () => {
  assert.equal(pageCount(0, 25), 1);
  assert.equal(pageCount(51, 25), 3);
  assert.equal(clampPage(9, 51, 25), 3);
  assert.equal(clampPage(0, 51, 25), 1);
  assert.deepEqual(pageRange(3, 25, 51), { first: 51, last: 51, total: 51 });
  assert.deepEqual(pageRange(1, 25, 0), { first: 0, last: 0, total: 0 });
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(5, 20), [1, null, 4, 5, 6, null, 20]);
  assert.deepEqual(pageWindow(3, 20), [1, 2, 3, 4, null, 20]);
  assert.deepEqual(pageWindow(20, 20), [1, null, 19, 20]);
  assert.deepEqual(slicePage([1, 2, 3, 4, 5], 2, 2), [3, 4]);
  assert.deepEqual(slicePage([1, 2, 3], 9, 2), [3]);
});

test('date range: normalising, bounds and membership', () => {
  assert.deepEqual(normalizeDateRange('30d'), { preset: '30d' });
  assert.deepEqual(normalizeDateRange({ preset: 'nope' }), { preset: 'all' });
  assert.deepEqual(normalizeDateRange({ preset: 'custom' }), { preset: 'all' });
  assert.deepEqual(normalizeDateRange({ preset: 'custom', from: '2026-03-10', to: '2026-03-01' }), { preset: 'custom', from: '2026-03-01', to: '2026-03-10' });
  const custom = { preset: 'custom', from: '2026-03-01', to: '2026-03-10' };
  const { from, to } = rangeBounds(custom);
  assert.equal(from.getTime(), parseDayKey('2026-03-01').getTime());
  assert.equal(to.getHours(), 23);
  assert.equal(inDateRange(new Date(2026, 2, 10, 22), custom), true);
  assert.equal(inDateRange(new Date(2026, 2, 11, 0, 1), custom), false);
  assert.equal(inDateRange(null, custom), false);
  assert.equal(inDateRange(null, { preset: 'all' }), true);
  const now = new Date(2026, 10, 13);
  assert.equal(inDateRange(new Date(2026, 9, 1), '30d', now), false);
  assert.equal(inDateRange(new Date(2026, 10, 1), '30d', now), true);
  assert.deepEqual(rangeToQuery(custom), { range: 'custom', from: '2026-03-01', to: '2026-03-10' });
  assert.deepEqual(rangeToQuery('90d'), { range: '90d' });
  assert.deepEqual(rangeToBody({ preset: 'custom', from: '2026-03-01' }), { preset: 'custom', from: '2026-03-01' });
  assert.match(rangeLabel(custom), /2026/);
  assert.equal(rangeLabel('all'), 'All time');
});
