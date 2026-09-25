import assert from 'node:assert/strict';
import test from 'node:test';
import { interviewListFilter, interviewListSort } from '../src/utils/interviewListQuery.js';

test('search is bounded and regex metacharacters are treated literally', () => {
  const [filter] = interviewListFilter({ search: '  C++ (round.1) [A]  ' });
  const pattern = filter.$or[0].name.$regex;
  assert.ok(new RegExp(pattern, 'i').test('C++ (round.1) [A]'));
  assert.ok(!new RegExp(pattern, 'i').test('CCC roundx1 A'));
  assert.equal(interviewListFilter({ search: 'a'.repeat(500) })[0].$or[0].name.$regex.length, 120);
});

test('filters are separate clauses so they cannot replace coordinator scope', () => {
  const clauses = interviewListFilter({ type: 'special', lifecycle: 'cancelled', search: 'round' });
  assert.equal(clauses.length, 3);
  assert.deepEqual(clauses[1], { isSpecial: true });
  assert.deepEqual(clauses[2], { status: 'cancelled' });
  assert.deepEqual(interviewListFilter({ type: 'regular' }), [{ isSpecial: { $ne: true } }]);
  assert.deepEqual(interviewListFilter({ lifecycle: { $ne: 'draft' }, type: 'unknown' }), []);
});

test('active and scheduled filters exclude terminal lifecycle states', () => {
  const now = new Date('2030-01-01');
  for (const period of ['active', 'upcoming']) {
    const [filter] = interviewListFilter({ period }, now);
    assert.deepEqual(filter.status.$nin, ['draft', 'cancelled', 'archived', 'completed']);
  }
  assert.deepEqual(interviewListFilter({ period: 'active' }, now)[0].startDate, { $lte: now });
  assert.deepEqual(interviewListFilter({ period: 'upcoming' }, now)[0].startDate, { $gt: now });
  const [past] = interviewListFilter({ period: 'previous' }, now);
  assert.deepEqual(past.$or[0], { status: 'completed' });
  assert.deepEqual(past.$or[1].status.$nin, ['draft', 'cancelled', 'archived']);
});

test('sorts are allowlisted and stable for equal dates or titles', () => {
  assert.deepEqual(interviewListSort('name'), { name: 1, _id: 1 });
  assert.deepEqual(interviewListSort('starts'), { startDate: 1, _id: 1 });
  assert.deepEqual(interviewListSort('oldest'), { createdAt: 1, _id: 1 });
  assert.deepEqual(interviewListSort({ $where: 'bad' }), { createdAt: -1, _id: -1 });
});
