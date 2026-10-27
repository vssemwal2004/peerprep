import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../src/models/User.js';
import { exactEmailPattern, normalizeEmailAddress } from '../src/utils/emailIdentity.js';

test('email identity normalization ignores letter casing and surrounding spaces', () => {
  assert.equal(normalizeEmailAddress('  KanikaRawat.DDN@Gmail.Com '), 'kanikarawat.ddn@gmail.com');
  const pattern = exactEmailPattern('kanikarawat.ddn@gmail.com');
  assert.match('Kanikarawat.ddn@gmail.com', pattern);
  assert.doesNotMatch('other.kanikarawat.ddn@gmail.com', pattern);
});

test('new user documents store canonical lowercase email addresses', () => {
  const user = new User({
    role: 'student',
    email: '  KanikaRawat.DDN@Gmail.Com ',
    passwordHash: 'not-used-in-this-unit-test',
  });
  assert.equal(user.email, 'kanikarawat.ddn@gmail.com');
});
