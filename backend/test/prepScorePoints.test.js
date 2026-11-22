import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPointLedger, cleanTopics, summarizeLedger, topicUsageOn } from '../src/services/prepScore/points.js';
import { DEFAULT_POINTS_CONFIG, normalizePrepScoreConfig } from '../src/services/prepScore/policy.js';

// IST 10:00 on a day: 04:30 UTC.
const at = (day, hour = 10) => new Date(`${day}T${String(hour - 5).padStart(2, '0')}:30:00Z`);
// The rule tests read plain activity points (no curve, no protected share); the curve and the
// protection have their own tests at the end.
// allocationFrom far ahead: these tests cover the pre-allocation rule (a full topic loses its own
// share). The allocation rule (full share moves to open tags) is tested in prepReadinessFlow.test.js.
const config = (patch = {}) => ({ ...DEFAULT_POINTS_CONFIG, topicLimitFrom: '2026-01-01', allocationFrom: '2099-01-01', sheetCompleted: 10, lossFloorShare: 0, curve: { scale: 1, exponent: 1 }, ...patch });
const NOW = at('2026-12-01', 12);

test('a solve pays its difficulty points split equally across its topics', () => {
  const ledger = buildPointLedger({ solves: [{ key: 'a', at: at('2026-11-30'), difficulty: 'Medium', topics: ['Array', 'Hash Table'] }], activeDays: ['2026-11-30'] }, config(), { now: NOW });
  assert.equal(ledger.total, 8);
  assert.deepEqual(ledger.events[0].meta.parts.map((part) => [part.topic, part.share, part.counted]), [['Array', 4, true], ['Hash Table', 4, true]]);
});

test('a full topic loses only its own share; the other topics still pay', () => {
  const day = '2026-11-30';
  const solves = [1, 2, 3].map((n) => ({ key: `arr${n}`, at: at(day, 9 + n), difficulty: 'Easy', topics: ['Array'] }));
  solves.push({ key: 'mixed', at: at(day, 15), difficulty: 'Medium', topics: ['Array', 'Graph'] });
  const ledger = buildPointLedger({ solves, activeDays: [day] }, config(), { now: NOW });
  const mixed = ledger.events.find((event) => event.key === 'mixed');
  assert.equal(mixed.delta, 4, 'Array share lost, Graph share kept');
  assert.deepEqual(mixed.meta.parts.map((part) => part.counted), [false, true]);
  assert.equal(ledger.total, 3 * 4 + 4);
  assert.equal(topicUsageOn(ledger, day).get('array'), 3);
  // Next day the bucket is full again.
  const next = buildPointLedger({ solves: [...solves, { key: 'arr4', at: at('2026-12-01', 9), difficulty: 'Easy', topics: ['Array'] }], activeDays: [day, '2026-12-01'] }, config(), { now: at('2026-12-01', 23) });
  assert.equal(next.events.find((event) => event.key === 'arr4').delta, 4);
});

test('solves before the topic limit start count in full', () => {
  const solves = [1, 2, 3, 4].map((n) => ({ key: `old${n}`, at: at('2025-12-30', 9 + n), difficulty: 'Easy', topics: ['Array'] }));
  const ledger = buildPointLedger({ solves, activeDays: ['2025-12-30'] }, config(), { now: at('2025-12-31', 9) });
  assert.equal(ledger.total, 16);
});

test('problems without tags count under General; each problem pays once', () => {
  assert.deepEqual(cleanTopics([]), ['General']);
  assert.deepEqual(cleanTopics(['Array', 'array', ' DP ']), ['Array', 'DP']);
  const ledger = buildPointLedger({ solves: [{ key: 'x', at: at('2026-11-30'), difficulty: 'Hard' }, { key: 'x', at: at('2026-11-30', 14), difficulty: 'Hard' }], activeDays: ['2026-11-30'] }, config(), { now: NOW });
  assert.equal(ledger.total, 14);
});

test('wrong submissions cost a little, are capped per day, and are refunded by a same-day solve', () => {
  const base = { solves: [{ key: 'p1', at: at('2026-11-30', 18), difficulty: 'Easy', topics: ['DP'] }], activeDays: ['2026-11-28', '2026-11-29', '2026-11-30'], logins: ['2026-11-28'] };
  const ledger = buildPointLedger({
    ...base,
    wrong: [
      { key: 'p1', day: '2026-11-30', count: 3 }, // refunded: solved the same day
      { key: 'p1', day: '2026-11-29', count: 2 }, // earlier day: counts
      { key: 'p2', day: '2026-11-28', count: 40 }, // capped at 5
    ],
  }, config(), { now: NOW });
  const wrong = ledger.events.filter((event) => event.kind === 'wrong');
  assert.deepEqual(wrong.map((event) => [event.day, event.raw]), [['2026-11-28', -5], ['2026-11-29', -1]]);
  // 1 (login) - 5 floors at 0, then -1 on an empty score removes nothing, then +4.
  assert.equal(ledger.total, 4);
});

test('inactivity: grace days, then a small daily loss up to the monthly cap; never below 0', () => {
  const solves = [{ key: 'a', at: at('2026-10-01'), difficulty: 'Hard', topics: ['Graph'] }, { key: 'b', at: at('2026-10-01', 11), difficulty: 'Hard', topics: ['Tree'] }];
  const ledger = buildPointLedger({ solves, activeDays: ['2026-10-01'] }, config(), { now: at('2026-10-11') });
  const losses = ledger.events.filter((event) => event.kind === 'inactive');
  // Active Oct 1; Oct 2-4 grace; Oct 5..10 lose 1 each (today, Oct 11, is not over).
  assert.equal(losses.length, 6);
  assert.equal(losses[0].day, '2026-10-05');
  assert.equal(ledger.total, 28 - 6);
  const month = buildPointLedger({ solves, activeDays: ['2026-10-01'] }, config(), { now: at('2026-11-30') });
  const october = month.events.filter((event) => event.kind === 'inactive' && event.day.startsWith('2026-10')).reduce((sum, event) => sum + event.delta, 0);
  assert.equal(october, -15, 'monthly cap');
  const tiny = buildPointLedger({ solves: [{ key: 'c', at: at('2026-10-01'), difficulty: 'Easy', topics: ['X'] }], activeDays: ['2026-10-01'] }, config(), { now: at('2026-11-30') });
  assert.equal(tiny.total, 0);
});

test('a login alone does not stop inactivity; any submission does', () => {
  const facts = { solves: [{ key: 'a', at: at('2026-10-01'), difficulty: 'Hard', topics: ['G'] }], activeDays: ['2026-10-01', '2026-10-06'], logins: ['2026-10-05'] };
  const ledger = buildPointLedger(facts, config(), { now: at('2026-10-08') });
  assert.deepEqual(ledger.events.filter((event) => event.kind === 'inactive').map((event) => event.day), ['2026-10-05']);
});

test('logins, daily challenges, sheets and badges add their points', () => {
  const ledger = buildPointLedger({
    logins: ['2026-11-01', '2026-11-01', '2026-11-02'], challenges: ['2026-11-02'],
    sheets: [{ key: 's', at: at('2026-11-02') }], badgeLevels: [{ key: 'm', at: at('2026-11-02'), level: 1 }],
    milestones: [{ key: 'solved-50', at: at('2026-11-02'), tier: 1 }, { key: 'solved-1000', at: at('2026-11-02'), tier: 5 }],
  }, config(), { now: NOW });
  assert.equal(ledger.total, 2 + 5 + 10 + 2 + 10 + 50);
});

test('no Prep Coding licence: solves, wrong answers, challenges and inactivity do not count', () => {
  const ledger = buildPointLedger({ solves: [{ key: 'a', at: at('2026-11-01'), difficulty: 'Hard', topics: ['G'] }], wrong: [{ key: 'b', day: '2026-11-01', count: 2 }], activeDays: ['2026-11-01'], challenges: ['2026-11-01'], logins: ['2026-11-01'] }, config(), { now: NOW, coding: false });
  assert.equal(ledger.total, 1);
});

test('history summary: daily rows, running total, gains by kind and points by topic', () => {
  const ledger = buildPointLedger({
    solves: [{ key: 'a', at: at('2026-11-28'), difficulty: 'Medium', topics: ['Array', 'DP'] }],
    logins: ['2026-11-28', '2026-11-29'], wrong: [{ key: 'z', day: '2026-11-29', count: 2 }], activeDays: ['2026-11-28', '2026-11-29'],
  }, config(), { now: NOW });
  const summary = summarizeLedger(ledger);
  assert.deepEqual(summary.series.map((row) => [row.day, row.gained, row.lost, row.total]), [['2026-11-28', 9, 0, 9], ['2026-11-29', 1, 1, 9]]);
  assert.equal(summary.byKind.solve, 8);
  assert.equal(summary.byKind.wrong, -1);
  assert.deepEqual(summary.topics, [{ topic: 'Array', points: 4 }, { topic: 'DP', points: 4 }]);
  const trimmed = summarizeLedger(ledger, { from: '2026-11-29' });
  assert.equal(trimmed.startTotal, 9);
  assert.equal(trimmed.series.length, 1);
});

test('the growth curve keeps scores low and slow like the old formula, and a gain never lowers it', () => {
  // Default: Prep Score = 1.3 × points^0.4.
  const solves = (count) => Array.from({ length: count }, (_, index) => ({ key: `p${index}`, at: at('2026-11-30', 9), difficulty: 'Medium', topics: [`T${index}`] }));
  const seven = buildPointLedger({ solves: solves(7), activeDays: ['2026-11-30'] }, { ...DEFAULT_POINTS_CONFIG, topicLimitFrom: '2026-01-01' }, { now: NOW });
  assert.equal(seven.rawTotal, 56);
  assert.equal(seven.total, Math.round(1.3 * 56 ** 0.4 * 100) / 100);
  assert.ok(seven.total < 8, '7 Medium solves stay in the old range (about 6), not 56');
  const hundred = buildPointLedger({ solves: solves(100), activeDays: ['2026-11-30'] }, { ...DEFAULT_POINTS_CONFIG, topicLimitFrom: '2026-01-01' }, { now: NOW });
  assert.ok(hundred.total > 15 && hundred.total < 25, `100 solves ≈ old formula (got ${hundred.total})`);
  const gains = hundred.events.map((event) => event.delta);
  assert.ok(gains.every((gain) => gain > 0), 'every solve raises the score');
  assert.ok(gains.at(-1) < gains[0], 'later solves add less (slow growth)');
  const sum = Math.round(hundred.events.reduce((total, event) => total + event.delta, 0) * 100) / 100;
  assert.equal(sum, hundred.total, 'per-event changes add up to the score (history graph)');
});

test('losses never take away more than a quarter of the points earned by solving', () => {
  const facts = { solves: [{ key: 'a', at: at('2026-09-01'), difficulty: 'Medium', topics: ['G'] }], activeDays: ['2026-09-01'], wrong: [{ key: 'z', day: '2026-09-02', count: 50 }] };
  const ledger = buildPointLedger(facts, { ...DEFAULT_POINTS_CONFIG, curve: { scale: 1, exponent: 1 } }, { now: NOW });
  // 8 points from the solve; months of inactivity and wrong answers stop at 75% of 8 = 6.
  assert.equal(ledger.rawTotal, 6);
  const curved = buildPointLedger(facts, DEFAULT_POINTS_CONFIG, { now: NOW });
  assert.equal(curved.total, Math.round(1.3 * 6 ** 0.4 * 100) / 100);
  assert.ok(curved.total > 2, 'a student who solved once keeps most of it (old formula gave 2.83)');
});

test('policy: point settings are validated and filled with defaults', () => {
  const normalized = normalizePrepScoreConfig({});
  assert.deepEqual(normalized.points.solve, { Easy: 4, Medium: 8, Hard: 14 });
  assert.equal(normalized.points.inactivity.graceDays, 3);
  assert.throws(() => normalizePrepScoreConfig({ points: { solve: { Easy: 9, Medium: 2, Hard: 3 } } }), /ordered/);
  assert.throws(() => normalizePrepScoreConfig({ points: { topicLimitFrom: 'soon' } }), /date/);
  assert.throws(() => normalizePrepScoreConfig({ points: { lifetimeBadge: [1, 2] } }), /tiers/);
  assert.deepEqual(normalized.points.curve, { scale: 1.3, exponent: 0.4 });
  assert.equal(normalized.points.lossFloorShare, 0.75);
  assert.equal(normalized.points.sheetCompleted, 4, 'a finished sheet is worth half a Medium solve');
  assert.throws(() => normalizePrepScoreConfig({ points: { curve: { exponent: 2 } } }), /Curve exponent/);
  assert.throws(() => normalizePrepScoreConfig({ points: { lossFloorShare: 1.5 } }), /Protected share/);
});
