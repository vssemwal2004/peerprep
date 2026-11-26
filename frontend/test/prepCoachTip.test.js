import assert from 'node:assert/strict';
import test from 'node:test';
import { markTipSeen, shouldShowTip } from '../src/student/rewards/coachTip.js';
import { rankGapText } from '../src/student/prepScore/formatScore.js';

const NOW = Date.parse('2026-11-26T10:00:00.000Z');

test('once-a-day tips show once per IST day', () => {
  const tip = { code: 'easy-run', title: '3 Easy in a row', once: 'day' };
  assert.equal(shouldShowTip(tip, {}, NOW), true);
  const seen = markTipSeen(tip, {}, NOW);
  assert.equal(shouldShowTip(tip, seen, NOW + 60 * 60 * 1000), false);
  // Next IST day (IST midnight = 18:30 UTC).
  assert.equal(shouldShowTip(tip, seen, Date.parse('2026-11-26T18:31:00.000Z')), true);
});

test('a full-topic warning repeats every time the student keeps going, but not twice in a few seconds', () => {
  const tip = { code: 'topic-full', title: 'Array: daily limit reached', topic: 'Array' };
  const seen = markTipSeen(tip, {}, NOW);
  assert.equal(shouldShowTip(tip, seen, NOW + 1_000), false);
  assert.equal(shouldShowTip(tip, seen, NOW + 30_000), true);
});

test('other tips wait ten minutes before repeating for the same topic', () => {
  const tip = { code: 'last-slot', title: 'Last Array solve', topic: 'Array' };
  const seen = markTipSeen(tip, {}, NOW);
  assert.equal(shouldShowTip(tip, seen, NOW + 5 * 60_000), false);
  assert.equal(shouldShowTip({ ...tip, topic: 'Graph' }, seen, NOW + 5 * 60_000), true);
  assert.equal(shouldShowTip(tip, seen, NOW + 11 * 60_000), true);
  assert.equal(shouldShowTip({ code: 'x' }, {}, NOW), false, 'a tip needs a title');
});

test('the rank line says how far the next rank is', () => {
  assert.equal(rankGapText({ rank: 7, nextRankGap: 0.42 }), '+0.42 Prep Score to pass the next student · updates live');
  assert.equal(rankGapText({ rank: 7, nextRankGap: 3 }), '+3 Prep Score to pass the next student · updates live');
  assert.equal(rankGapText({ rank: 1 }), 'You are #1 in your university');
  assert.match(rankGapText({ rank: 1, tied: true }), /Tied at #1/);
  assert.equal(rankGapText({ rank: null }), '');
});
