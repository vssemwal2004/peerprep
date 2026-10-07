import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { repair } from '../scripts/repairDraftIteratorDownlevels.js';

test('repairs a lowered Map entries loop and preserves all entry values', () => {
  const source = 'var counts = new Map([[1, 2], [3, 4]]); var total = 0; for (var i = 0, entries = counts.entries(); i < entries.length; i++) { total += entries[i][1]; } total;';
  assert.equal(vm.runInNewContext(source), 0);
  assert.equal(vm.runInNewContext(repair(source)), 6);
  assert.equal(repair(repair(source)), repair(source));
});

test('repairs a lowered Set loop without losing values', () => {
  const source = 'var values = new Set([2, 2, 5]); var total = 0; for (var i = 0, list = values; i < list.length; i++) total += list[i]; total;';
  assert.equal(vm.runInNewContext(repair(source)), 7);
});

test('preserves ordinary indexed array loops and correct collection iteration', () => {
  const source = 'var values = [2, 3]; for (var i = 0, list = values; i < list.length; i++) console.log(list[i]);';
  assert.equal(repair(source), source);
  const proper = 'var values = new Map(); for (var entry of values.entries()) console.log(entry);';
  assert.equal(repair(proper), proper);
});
