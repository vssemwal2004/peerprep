import test from 'node:test';
import assert from 'node:assert/strict';
import { describeStartError, jdKey } from '../src/features/resume/review/jdMatch/jdMatchModel.js';

const failure = (status, data) => Object.assign(new Error(data.error || 'failed'), { response: { status, data } });

test('every refused start gets its own message, and none of them charge', () => {
  assert.deepEqual(describeStartError(failure(402, { code: 'INSUFFICIENT_PREP_COINS', required: 10, balance: 4, error: 'x' })), { kind: 'shortfall', required: 10, balance: 4, message: 'x' });
  assert.equal(describeStartError(failure(409, { code: 'PREP_COIN_PRICE_CHANGED', cost: 12, balance: 40 })).kind, 'price');
  assert.equal(describeStartError(failure(429, { code: 'JD_MATCH_DAILY_LIMIT', error: 'Used today' })).kind, 'limit');
  assert.equal(describeStartError(failure(503, { code: 'JD_MATCH_PAUSED', error: 'Paused' })).kind, 'paused');
  assert.equal(describeStartError(failure(403, { code: 'STUDENT_FEATURE_DISABLED' })).kind, 'disabled');
  assert.deepEqual(describeStartError(failure(413, { code: 'JD_MATCH_JD_TOO_LONG', jdMaxChars: 6400, error: 'Shorten it' })), { kind: 'tooLong', message: 'Shorten it', jdMaxChars: 6400 });
  assert.equal(describeStartError(failure(413, { code: 'JD_MATCH_RESUME_TOO_LONG', error: 'Résumé too long' })).kind, 'tooLong');
  assert.deepEqual(describeStartError(failure(400, { error: 'Paste the full job description' })), { kind: 'error', message: 'Paste the full job description' });
});

test('the same job description gives the same key, ignoring case and spacing', () => {
  assert.equal(jdKey('Java  Developer\nReact'), jdKey('java developer react'));
  assert.notEqual(jdKey('Java developer'), jdKey('Python developer'));
});
