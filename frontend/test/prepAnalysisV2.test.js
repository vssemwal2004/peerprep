// Prep Analysis v2 pure helpers: score waterfall, topic bubbles, change history, trend segments,
// coin flow, quota timing and the "Do next" list.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  coinFlow, durationText, eventText, flowGeometry, groupEvents, msUntilIstMidnight, nextSteps, packBubbles, scoreRangeFor, signedScore, trendGeometry, waterfallScale, waterfallSteps,
} from '../src/student/insights/analysisModel.js';

test('the waterfall starts at the period start, adds each kind of change and ends at the score', () => {
  const steps = waterfallSteps({ startTotal: 20.65, total: 21.4, byKind: { solve: 0.86, challenge: 0.18, login: 0.06, wrong: -0.13, inactive: -0.4, sheet: 0, badge: 0.18 } });
  assert.deepEqual(steps.map((step) => step.key), ['start', 'solve', 'challenge', 'login', 'badge', 'wrong', 'inactive', 'now']);
  assert.deepEqual(steps.map((step) => step.kind), ['total', 'gain', 'gain', 'gain', 'gain', 'loss', 'loss', 'total']);
  const last = steps.at(-2);
  assert.ok(Math.abs(last.to - 21.4) < 0.001, 'the running bars land on the final score');
  const scale = waterfallScale(steps);
  assert.ok(scale.min < 20.65 && scale.max > Math.max(...steps.map((step) => step.to)));
  assert.deepEqual(waterfallSteps(null), []);
});

test('topic bubbles never overlap, stay inside the box and keep the biggest topic', () => {
  const items = Array.from({ length: 14 }, (_, index) => ({ key: `t${index}`, label: `Topic ${index}`, value: 50 - index * 3 }));
  const circles = packBubbles(items, { width: 560, height: 280 });
  assert.ok(circles.length >= 10, `placed ${circles.length}`);
  assert.equal(circles[0].key, 't0');
  for (const circle of circles) {
    assert.ok(circle.x - circle.r >= 0 && circle.x + circle.r <= 560 && circle.y - circle.r >= 0 && circle.y + circle.r <= 280, `${circle.key} inside`);
  }
  for (let a = 0; a < circles.length; a += 1) {
    for (let b = a + 1; b < circles.length; b += 1) {
      assert.ok(Math.hypot(circles[a].x - circles[b].x, circles[a].y - circles[b].y) >= circles[a].r + circles[b].r, `${circles[a].key} and ${circles[b].key} overlap`);
    }
  }
  assert.ok(circles[0].r > circles.at(-1).r, 'area follows points');
  assert.deepEqual(packBubbles([]), []);
});

test('every change reads as plain words and is grouped by day, newest first', () => {
  const solve = eventText({ kind: 'solve', delta: 0.24, difficulty: 'Medium', topics: [{ topic: 'Strings', counted: true }, { topic: 'Arrays', counted: false }] });
  assert.equal(solve.title, 'Solved a Medium problem');
  assert.match(solve.detail, /Strings · Arrays quota was full/);
  assert.equal(eventText({ kind: 'wrong', delta: -0.05, count: 2 }).title, '2 wrong answers');
  assert.equal(eventText({ kind: 'inactive', delta: -0.1, gap: 4 }).tone, 'down');
  const groups = groupEvents([
    { day: '2026-11-27', kind: 'login', delta: 0.02 },
    { day: '2026-11-28', kind: 'solve', delta: 0.24, difficulty: 'Easy', topics: [] },
    { day: '2026-11-28', kind: 'wrong', delta: -0.05, count: 1 },
  ], '2026-11-28');
  assert.deepEqual(groups.map((group) => group.label), ['Today', 'Yesterday']);
  assert.equal(groups[0].net, 0.19);
  assert.equal(signedScore(-0.05), '−0.05');
});

test('the trend splits rises and falls into separate lines', () => {
  const days = [20, 20.2, 20.1, 20.4].map((total, index) => ({ day: `2026-11-0${index + 1}`, total, byKind: {} }));
  const geometry = trendGeometry(days, { width: 600, height: 200 });
  assert.equal(geometry.points.length, 4);
  assert.equal(geometry.up.split('M').filter(Boolean).length, 2);
  assert.equal(geometry.down.split('M').filter(Boolean).length, 1);
  assert.ok(geometry.points[3].y < geometry.points[0].y, 'higher score is drawn higher');
});

test('coins: sources, spends and what was already earned today', () => {
  const now = Date.parse('2026-11-28T10:00:00Z');
  const movements = [
    { kind: 'earn_login', amount: 1, direction: 'in', createdAt: '2026-11-28T03:00:00Z' },
    { kind: 'earn_challenge', amount: 2, direction: 'in', createdAt: '2026-11-20T03:00:00Z' },
    { kind: 'student_spend', amount: 10, direction: 'out', feature: 'ANVI JD Match', createdAt: '2026-11-21T03:00:00Z' },
    { kind: 'coordinator_to_student', amount: 50, direction: 'in', createdAt: '2026-10-01T03:00:00Z' },
  ];
  const all = coinFlow(movements, { now });
  assert.equal(all.earnedIn, 53);
  assert.equal(all.spentOut, 10);
  assert.deepEqual(all.sources[0], { label: 'From your university', amount: 50 });
  assert.ok(all.today.has('earn_login') && !all.today.has('earn_challenge'));
  const month = coinFlow(movements, { since: Date.parse('2026-11-01T00:00:00Z'), now });
  assert.equal(month.earnedIn, 3);
  const geometry = flowGeometry(all.sources, [...all.spends, { label: 'Wallet', amount: 43, wallet: true }], { width: 520, height: 220 });
  assert.equal(geometry.left.length, 3);
  assert.ok(geometry.right.at(-1).wallet);
  assert.ok(geometry.ribbons.length >= 3);
});

test('quota resets at IST midnight; the period maps to the score history range', () => {
  // 18:30 UTC = 00:00 IST, so a moment before it is ~1 minute from the reset.
  assert.equal(Math.round(msUntilIstMidnight(Date.parse('2026-11-28T18:29:00Z')) / 60_000), 1);
  assert.equal(durationText(7 * 3_600_000 + 12 * 60_000), '7h 12m');
  assert.deepEqual(scoreRangeFor({ period: '180d' }), { range: '180d', from: '' });
  assert.deepEqual(scoreRangeFor({ period: 'custom', from: '2026-11-01', to: '2026-11-20' }), { range: 'custom', from: '2026-11-01' });
  assert.deepEqual(scoreRangeFor({ period: 'weird' }), { range: '30d', from: '' });
});

test('"Do next" puts a full-topic hint first, then the coach steps, never more than three', () => {
  const coach = [1, 2, 3].map((n) => ({ id: `c${n}`, title: `Step ${n}`, reason: 'why', action: { label: 'Go', to: `/x/${n}` } }));
  const steps = nextSteps({ coach, today: { limit: 3, topics: [{ topic: 'Arrays', full: true }, { topic: 'Graphs', full: false }] } });
  assert.equal(steps.length, 3);
  assert.equal(steps[0].id, 'quota');
  assert.match(steps[0].title, /Arrays is full today/);
  assert.equal(nextSteps({ coach, today: { limit: 3, topics: [] } })[0].id, 'c1');
});
