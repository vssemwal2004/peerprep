import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret-that-is-long-enough-for-checks-123456';
const { describeDevice, liveOtherSession, endedSessionError, isEndedMarker, sessionLifetimeMs, tokenHash, SESSION_COOKIE_MAX_AGE_MS } = await import('../src/services/userSessions.js');

test('device names from common browsers', () => {
  assert.equal(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'), 'Chrome on Windows');
  assert.equal(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0'), 'Edge on Windows');
  assert.equal(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'), 'Safari on iOS');
  assert.equal(describeDevice('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'), 'Chrome on Android');
  assert.equal(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:131.0) Gecko/20100101 Firefox/131.0'), 'Firefox on macOS');
  assert.equal(describeDevice(''), null);
  assert.equal(describeDevice('curl/8.0'), null);
});

test('only a usable session elsewhere makes the login ask', () => {
  const now = new Date('2026-11-09T12:00:00Z');
  const started = new Date('2026-11-09T09:00:00Z');
  const user = { activeSessionToken: tokenHash('old-token'), activeSessionCreatedAt: started, activeSessionDevice: 'Chrome on Windows', activeSessionSeenAt: new Date('2026-11-09T11:50:00Z') };
  assert.deepEqual(liveOtherSession(user, null, now), { device: 'Chrome on Windows', signedInAt: started, lastActiveAt: user.activeSessionSeenAt });
  // This very browser signing in again.
  assert.equal(liveOtherSession(user, 'old-token', now), null);
  // A different (stale) cookie on this browser still asks.
  assert.ok(liveOtherSession(user, 'another-token', now));
  // Nothing recorded, signed out, too old, or from before a password change.
  assert.equal(liveOtherSession({}, null, now), null);
  assert.equal(liveOtherSession({ ...user, activeSessionToken: 'ended:abc' }, null, now), null);
  assert.equal(liveOtherSession(user, null, new Date(started.getTime() + sessionLifetimeMs() + 1000)), null);
  assert.equal(liveOtherSession({ ...user, passwordChangedAt: new Date('2026-11-09T10:00:00Z') }, null, now), null);
  assert.ok(sessionLifetimeMs() <= SESSION_COOKIE_MAX_AGE_MS);
  // Last active falls back to the sign-in time.
  assert.equal(liveOtherSession({ ...user, activeSessionSeenAt: undefined }, null, now).lastActiveAt, started);
});

test('an ended session is told why', () => {
  const replaced = endedSessionError({ activeSessionToken: tokenHash('new'), activeSessionDevice: 'Safari on iOS', activeSessionCreatedAt: new Date('2026-11-09T10:00:00Z') });
  assert.equal(replaced.status, 401);
  assert.equal(replaced.details.code, 'SESSION_REPLACED');
  assert.equal(replaced.details.session.device, 'Safari on iOS');
  assert.ok(isEndedMarker('ended:x'));
  assert.equal(endedSessionError({ activeSessionToken: 'ended:x' }).details.code, 'SESSION_ENDED');
});
