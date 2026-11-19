import assert from 'node:assert/strict';
import test from 'node:test';
import { quotaAfterSolve, quotaChip, quotaToast } from '../src/student/prepScore/topicQuota.js';

const quota = (extra = {}) => ({ topic: 'Sorting', limit: 3, used: 1, remaining: 2, unlimited: false, resetsAt: '2026-11-19T18:30:00.000Z', solve: null, ...extra });

test('the problem page chip shows the topic and what is left, warns when full, hides when not useful', () => {
  assert.equal(quotaChip(quota(), 'Unsolved').tone, 'ok');
  assert.match(quotaChip(quota(), 'Unsolved').label, /Sorting · 2\/3 left today/);
  assert.equal(quotaChip(quota({ used: 3, remaining: 0 }), 'Unsolved').tone, 'full');
  assert.match(quotaChip(quota({ used: 3, remaining: 0 }), 'Unsolved').title, /won't add to your Prep Score/);
  assert.equal(quotaChip(quota({ solve: { counted: false, topic: 'Sorting' } }), 'Solved').label, 'Not in Prep Score');
  assert.equal(quotaChip(quota({ solve: { counted: true, topic: 'Sorting' } }), 'Solved').label, 'In Prep Score');
  assert.equal(quotaChip(quota(), 'Solved'), null, 'solved before the limit existed: it already counts');
  assert.equal(quotaChip(quota({ unlimited: true }), 'Unsolved'), null, 'no limit, no chip');
  assert.equal(quotaChip(null, 'Unsolved'), null);
});

test('after an accepted submit the student is told whether it counted', () => {
  assert.equal(quotaToast({ ...quota({ used: 2, remaining: 1 }), counted: true, alreadySolved: false }).type, 'success');
  const full = quotaToast({ ...quota({ used: 3, remaining: 0 }), counted: false, alreadySolved: false });
  assert.equal(full.type, 'warning');
  assert.match(full.title, /Sorting: daily Prep Score limit reached/);
  assert.equal(quotaToast({ ...quota(), counted: true, alreadySolved: true }), null, 're-solving says nothing new');
  assert.equal(quotaToast(null), null);
  const after = quotaAfterSolve(quota(), { ...quota({ used: 3, remaining: 0 }), counted: false, alreadySolved: false });
  assert.deepEqual(after.solve, { counted: false, topic: 'Sorting' });
  assert.equal(after.remaining, 0);
});
