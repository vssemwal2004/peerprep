import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scopeEngagement } from '../src/student/engagement/scopeEngagement.js';

test('revoked module badges and heatmap evidence disappear before the next API response', () => {
  const input = { version: 2, domains: ['coding', 'learning'], badges: [
    { id: 'code', category: 'coding', earned: true }, { id: 'lesson', category: 'learning', earned: false, progress: 40 },
  ], activity: { activityByDate: { '2026-10-10': 3, '2026-10-11': 1 }, breakdownByDate: { '2026-10-10': { coding: 2, learning: 1 }, '2026-10-11': { coding: 1 } } } };
  const scoped = scopeEngagement(input, (name) => name === 'learning');
  assert.deepEqual(scoped.domains, ['learning']);
  assert.deepEqual(scoped.badges.map((badge) => badge.id), ['lesson']);
  assert.equal(scoped.awards.earnedCount, 0);
  assert.equal(scoped.awards.nextAward.id, 'lesson');
  assert.deepEqual(scoped.activity.activityByDate, { '2026-10-10': 1 });
  assert.equal(input.badges.length, 2, 'The original response is not mutated');
});

test('legacy and pending payloads remain compatible with the scope adapter', () => {
  assert.equal(scopeEngagement(null, () => false), null);
  const old = { daily: { completed: false } };
  assert.equal(scopeEngagement(old, () => false), old);
});
