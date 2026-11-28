// Prep Analysis v2: the score history's change list and today's topic quota come straight from the
// ledger, show only what the student may see, and mark a topic full once its daily limit is used.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historyEvents, todayStatus } from '../src/services/studentDashboardService.js';

const solve = (day, parts, delta = 0.2, extra = {}) => ({ day, kind: 'solve', delta, raw: 8, meta: { difficulty: 'Medium', parts, problemKey: 'lc:1', ...extra } });

test('history events: newest first, in the period, tiny changes dropped, no internal keys', () => {
  const ledger = { events: [
    { day: '2026-11-20', kind: 'login', delta: 0.02, raw: 1 },
    solve('2026-11-27', [{ topic: 'Arrays', key: 'arrays', share: 4, counted: true }]),
    { day: '2026-11-27', kind: 'wrong', delta: -0.05, raw: -0.5, meta: { count: 1 } },
    { day: '2026-11-28', kind: 'inactive', delta: 0.001, raw: -1, meta: { gap: 4 } },
  ] };
  const events = historyEvents(ledger, '2026-11-25');
  assert.deepEqual(events.map((event) => event.kind), ['wrong', 'solve']);
  assert.deepEqual(events[1], { day: '2026-11-27', kind: 'solve', delta: 0.2, difficulty: 'Medium', topics: [{ topic: 'Arrays', counted: true }] });
  assert.equal(events[0].count, 1);
  assert.ok(!('problemKey' in events[1]) && !('raw' in events[1]), 'no internal fields');
  assert.equal(historyEvents(ledger, null).length, 3);
});

test('today: topics used, full at the limit, login and challenge flags, net change', () => {
  const day = '2026-11-28';
  const ledger = { events: [
    { day, kind: 'login', delta: 0.02 },
    solve(day, [{ topic: 'Arrays', key: 'arrays', counted: true }, { topic: 'Strings', key: 'strings', counted: true }]),
    solve(day, [{ topic: 'Arrays', key: 'arrays', counted: true }]),
    solve(day, [{ topic: 'Arrays', key: 'arrays', counted: true }]),
    // A later solve where Arrays was already full: counted false keeps it full.
    solve(day, [{ topic: 'Arrays', key: null, counted: false }, { topic: 'Graphs', key: 'graphs', counted: true }], 0.1),
    solve('2026-11-27', [{ topic: 'Trees', key: 'trees', counted: true }]),
  ] };
  const today = todayStatus(ledger, day, 3);
  assert.equal(today.solves, 4);
  assert.equal(today.login, true);
  assert.equal(today.challenge, false);
  assert.equal(today.net, 0.72);
  const arrays = today.topics.find((topic) => topic.key === 'arrays');
  assert.deepEqual([arrays.used, arrays.full], [3, true]);
  assert.equal(today.topics[0].key, 'arrays', 'full topics first');
  assert.deepEqual(today.topics.find((topic) => topic.key === 'graphs'), { key: 'graphs', topic: 'Graphs', used: 1, full: false });
  assert.ok(!today.topics.some((topic) => topic.key === 'trees'), 'only today');
  assert.deepEqual(todayStatus({ events: [] }, day, 0).topics, []);
});
