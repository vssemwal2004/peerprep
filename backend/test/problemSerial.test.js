import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assignPeerPrepSerials,
  parseSerialSearch,
  serialSearchClause,
  shuffleIndex,
} from '../src/utils/problemSerial.js';

test('shuffleIndex is a bijection on 0..count-1 for many sizes', () => {
  for (const count of [1, 2, 3, 5, 16, 17, 100, 1000, 3992, 4096, 5001]) {
    const seen = new Set();
    for (let index = 0; index < count; index += 1) {
      const value = shuffleIndex(index, count);
      assert.ok(value >= 0 && value < count, `value in range for count=${count}`);
      seen.add(value);
    }
    assert.equal(seen.size, count, `every slot used once for count=${count}`);
  }
});

test('shuffleIndex is deterministic, keyed and actually shuffles', () => {
  const count = 4000;
  const first = Array.from({ length: count }, (_, index) => shuffleIndex(index, count));
  const again = Array.from({ length: count }, (_, index) => shuffleIndex(index, count));
  assert.deepEqual(first, again, 'same input, same serials');
  const otherKey = Array.from({ length: count }, (_, index) => shuffleIndex(index, count, 'another-key'));
  assert.notDeepEqual(first, otherKey, 'a different key gives a different order');
  const fixedPoints = first.filter((value, index) => value === index).length;
  assert.ok(fixedPoints < 20, `almost nothing keeps its catalogue position (${fixedPoints})`);
  const adjacentSteps = first.slice(1).filter((value, index) => Math.abs(value - first[index]) === 1).length;
  assert.ok(adjacentSteps < 40, `neighbours in the catalogue are not neighbours in PeerPrep (${adjacentSteps})`);
  assert.throws(() => shuffleIndex(count, count), RangeError);
});

test('assignPeerPrepSerials numbers catalogue problems 1..N and originals after them', () => {
  const problems = [
    ...Array.from({ length: 300 }, (_, index) => ({ _id: `lc${index + 1}`, sourceNumber: (index + 1) * 2, title: `LC ${index}` })),
    { _id: 'orig-b', title: 'Second original', createdAt: '2026-09-02' },
    { _id: 'orig-a', title: 'First original', createdAt: '2026-09-01' },
  ];
  const serials = assignPeerPrepSerials(problems);
  const catalogueSerials = problems.slice(0, 300).map((problem) => serials.get(problem._id)).sort((a, b) => a - b);
  assert.deepEqual(catalogueSerials, Array.from({ length: 300 }, (_, index) => index + 1));
  assert.equal(serials.get('orig-a'), 301);
  assert.equal(serials.get('orig-b'), 302);
  assert.notEqual(serials.get('lc1'), 1, 'LeetCode #2 (rank 0) is not PeerPrep #1');
  assert.deepEqual(assignPeerPrepSerials([...problems].reverse()), serials, 'input order does not matter');
});

test('numeric search matches either number through indexed fields', () => {
  assert.equal(parseSerialSearch('56'), 56);
  assert.equal(parseSerialSearch(' #56 '), 56);
  assert.equal(parseSerialSearch('merge'), null);
  assert.equal(parseSerialSearch('56a'), null);
  assert.deepEqual(serialSearchClause(56), { $or: [{ displayOrder: 56 }, { sourceNumber: 56 }] });
});
