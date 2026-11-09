import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewOf, sanitizeEffort } from '../src/services/solveEffort.js';
import { buildStudentRows } from '../src/modules/prepAnalysis/studentRows.js';

const NOW = new Date('2026-11-09T10:00:00Z');

test('the start time comes from the server clock minus the reported duration, and every number is clamped', () => {
  const effort = sanitizeEffort({ elapsedMs: 300000, activeMs: 999999999, pastes: -4, pastedChars: 120 }, { now: NOW, sourceCode: 'x'.repeat(200) });
  assert.equal(effort.startedAt.toISOString(), '2026-11-09T09:55:00.000Z', '5 minutes before the submission');
  assert.equal(effort.activeMs, 300000, 'active time never exceeds the time the question was open');
  assert.equal(effort.pastes, 0, 'negative counts become 0');
  assert.equal(effort.codeChars, 200, 'code length is measured on the server');
  assert.equal(sanitizeEffort(null, { now: NOW }), undefined, 'nothing sent, nothing stored');
  assert.equal(sanitizeEffort({ elapsedMs: 0 }, { now: NOW }), undefined, 'no duration, nothing stored');
  assert.equal(sanitizeEffort({ elapsedMs: 60000 }, { now: NOW }).activeMs, 60000, 'missing active time does not read as 0 s');
  assert.equal(sanitizeEffort({ elapsedMs: 30 * 86400000 }, { now: NOW }).elapsedMs, 7 * 86400000, 'capped at 7 days');
});

test('a solve needs review when it is very fast for its difficulty or mostly pasted, never otherwise', () => {
  const at = NOW;
  const effort = (activeSeconds, pastedChars = 0, codeChars = 400) => ({ startedAt: new Date(NOW.getTime() - 20 * 60000), activeMs: activeSeconds * 1000, pastes: pastedChars ? 1 : 0, pastedChars, codeChars });
  assert.deepEqual(reviewOf(effort(30), 'Easy', at).reasons, ['fast'], '30 s for Easy');
  assert.deepEqual(reviewOf(effort(60), 'Easy', at).reasons, [], '60 s for Easy is fine');
  assert.deepEqual(reviewOf(effort(120), 'Hard', at).reasons, ['fast'], '2 min for Hard');
  assert.deepEqual(reviewOf(effort(600, 300), 'Medium', at).reasons, ['pasted'], '75% pasted');
  assert.deepEqual(reviewOf(effort(600, 60, 100), 'Medium', at).reasons, [], 'a short pasted snippet is not a concern');
  assert.deepEqual(reviewOf(effort(20, 400), 'Medium', at).reasons, ['fast', 'pasted']);
  const timed = reviewOf(effort(600, 100), 'Medium', at);
  assert.equal(timed.solveMs, 20 * 60000, 'solve time = submitted - opened');
  assert.equal(timed.pastedShare, 25);
  assert.equal(reviewOf(null, 'Easy', at), null, 'not tracked is not a verdict');
});

test('rows: only first solves in the period count, untracked ones are never flagged, Quick Prep counts its own sheets only', () => {
  // Opened 15 minutes before each solve, as the server records it.
  const solve = (key, at, activeSeconds, pastedChars = 0) => ({
    key, problemId: key.split(':')[1], at: new Date(at),
    effort: activeSeconds === null ? null : { startedAt: new Date(new Date(at).getTime() - 15 * 60000), activeMs: activeSeconds * 1000, pastes: 0, pastedChars, codeChars: 300 },
  });
  const problems = new Map([['p1', { difficulty: 'Easy', topics: [], tags: [] }], ['p2', { difficulty: 'Hard', topics: [], tags: [] }], ['p3', { difficulty: 'Medium', topics: [], tags: [] }]]);
  const efforts = new Map([['s1', [
    solve('local:p1', '2026-11-08T10:00:00Z', 20), // fast Easy
    solve('local:p2', '2026-11-08T11:00:00Z', 900, 250), // pasted Hard, not fast
    solve('local:p3', '2026-11-08T12:00:00Z', null), // solved before tracking
    solve('local:p1x', '2026-09-01T00:00:00Z', 5), // outside the period
    solve('shared:q9', '2026-11-08T13:00:00Z', 10), // shared sheet question, fast
  ]]]);
  const sheets = new Map([['sheet1', { id: 'sheet1', title: 'Sprint', semesters: [], published: true, items: 2, itemKeys: new Set(['local:p2', 'shared:q9']) }]]);
  const quickprep = { sheets, byStudent: new Map([['s1', [{ sheetId: 'sheet1', solved: 2, total: 2, finished: true, startedAt: new Date('2026-11-08T00:00:00Z'), completedAt: new Date('2026-11-08T13:00:00Z'), lastViewedAt: new Date('2026-11-08T13:00:00Z') }]]]) };
  const [row] = buildStudentRows({
    students: [{ _id: 's1', name: 'Asha', semester: 5 }], facts: { byStudent: new Map(), days: new Map() }, problems, quickprep, efforts,
    range: { from: new Date('2026-11-01T00:00:00Z'), to: null }, now: NOW,
  });
  assert.deepEqual([row.coding.review.solved, row.coding.review.tracked, row.coding.review.flagged], [3, 2, 2], 'library problems in the period: p1, p2 tracked, p3 not');
  assert.deepEqual([row.coding.review.fast, row.coding.review.pasted], [1, 1]);
  assert.deepEqual([row.quickprep.review.solved, row.quickprep.review.flagged], [2, 2], 'only the sheet questions (p2 and the shared q9)');
  assert.equal(row.coding.review.items.find((item) => item.key === 'local:p3').review, null, 'untracked is shown as untracked, not flagged');
});
