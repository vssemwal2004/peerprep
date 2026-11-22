import assert from 'node:assert/strict';
import test from 'node:test';
import { quotaAfterSolve, quotaChip, submitNotice } from '../src/student/prepScore/topicQuota.js';

// GET /student/questions/:source/:id/prep-score (backend prepScore/topicStatus.js).
const status = (topics, extra = {}) => ({ solved: false, limit: 3, resetsAt: '2026-11-19T18:30:00.000Z', difficulty: 'Medium',
  points: topics.filter((topic) => !topic.full).length * 4, maxPoints: topics.length * 4,
  topics: topics.map((topic) => ({ limit: 3, share: 4, used: 0, full: false, ...topic })), ...extra });

test('the chip shows what solving pays today: full, partial (a full topic loses only its share) or nothing', () => {
  const open = quotaChip(status([{ topic: 'Array', used: 1 }, { topic: 'Graph' }]));
  assert.equal(open.tone, 'ok');
  assert.equal(open.label, '+8 Prep Score');
  const partial = quotaChip(status([{ topic: 'Array', used: 3, full: true }, { topic: 'Graph' }]));
  assert.equal(partial.tone, 'partial');
  assert.equal(partial.label, '+4 of 8 today');
  assert.match(partial.title, /Array is full today; the other topics still pay/);
  const none = quotaChip(status([{ topic: 'Array', used: 3, full: true }]));
  assert.equal(none.tone, 'full');
  assert.equal(quotaChip(status([{ topic: 'Array' }], { solved: true })).tone, 'done');
  assert.equal(quotaChip(null), null);
});

test('after a submit: a score card for points or a finished challenge, a small toast for a wrong answer', () => {
  const solve = { kind: 'solve', alreadySolved: false, points: 4, total: 40, limit: 3, parts: [{ topic: 'Array', counted: false, used: 3, points: 0 }, { topic: 'Graph', counted: true, used: 1, points: 4 }], fullTopics: ['Array'], suggestions: ['Tree'] };
  assert.deepEqual(submitNotice(solve, null).card.solve, solve);
  // Re-solving: no card, only a short note that nothing changed (repeat accepts count once).
  const repeat = submitNotice({ ...solve, alreadySolved: true }, null);
  assert.equal(repeat.card, undefined);
  assert.match(repeat.toast.message, /already counted/);
  const challenge = { completed: true, coins: 5, points: 5, streak: 3 };
  assert.deepEqual(submitNotice(null, challenge).card, { solve: null, challenge, readiness: null });
  const wrong = submitNotice({ kind: 'wrong', lost: 0.5, refundable: true }, null);
  assert.equal(wrong.toast.type, 'info');
  assert.match(wrong.toast.message, /−0.5 Prep Score .* get it back if you solve this problem today/);
  assert.equal(submitNotice({ kind: 'wrong', lost: 0 }, null), null, 'capped or already solved: nothing to say');
  const after = quotaAfterSolve(status([{ topic: 'Array', used: 2 }, { topic: 'Graph' }]), { ...solve, parts: [{ topic: 'Array', counted: true, used: 3 }, { topic: 'Graph', counted: true, used: 1 }] });
  assert.equal(after.solved, true);
  assert.deepEqual(after.topics.map((topic) => [topic.topic, topic.used, topic.full]), [['Array', 3, true], ['Graph', 1, false]]);
});
