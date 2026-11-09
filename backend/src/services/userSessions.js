// One active session per account. A sign-in while another session is still alive does not end it
// silently: the login answers with `sessionConflict` (where and when that session started) and the
// person chooses to end it (login again with `replaceSession: true`) or cancel. The ended session
// learns it on its next request (401 SESSION_REPLACED) or at once through its socket.

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { signToken } from '../utils/jwt.js';
import { getIo } from '../utils/io.js';
import { personalRoom } from '../utils/realtime.js';

// The browser drops the sign-in cookie after this long, so an older session is gone anyway.
export const SESSION_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// "Last active" is written at most this often per session.
export const SEEN_WRITE_INTERVAL_MS = 5 * 60 * 1000;
// A signed-out account keeps a marker that matches no token, so no older token works again.
const ENDED_PREFIX = 'ended:';

export const tokenHash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
export const isEndedMarker = (value) => typeof value === 'string' && value.startsWith(ENDED_PREFIX);
const endedMarker = () => `${ENDED_PREFIX}${crypto.randomBytes(12).toString('hex')}`;

let tokenLifetime = null;
/** How long a sign-in token is valid (JWT_EXPIRES_IN), read from a signed probe so every format works. */
function tokenLifetimeMs() {
  if (tokenLifetime === null) {
    const probe = jwt.decode(signToken({ probe: true }));
    tokenLifetime = probe?.exp && probe?.iat ? (probe.exp - probe.iat) * 1000 : SESSION_COOKIE_MAX_AGE_MS;
  }
  return tokenLifetime;
}
export const sessionLifetimeMs = () => Math.min(tokenLifetimeMs(), SESSION_COOKIE_MAX_AGE_MS);

const BROWSERS = [[/Edg(e|A|iOS)?\//, 'Edge'], [/OPR\/|Opera/, 'Opera'], [/SamsungBrowser\//, 'Samsung Internet'], [/Firefox\/|FxiOS\//, 'Firefox'], [/Chrome\/|CriOS\//, 'Chrome'], [/Safari\//, 'Safari']];
const SYSTEMS = [[/Android/, 'Android'], [/iPhone|iPad|iPod/, 'iOS'], [/Windows/, 'Windows'], [/Mac OS X|Macintosh/, 'macOS'], [/CrOS/, 'ChromeOS'], [/Linux/, 'Linux']];
/** "Chrome on Windows" from a User-Agent; null when nothing is recognised. */
export function describeDevice(userAgent = '') {
  const text = String(userAgent || '');
  const browser = BROWSERS.find(([pattern]) => pattern.test(text))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(text))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser || system || null;
}

/** What the person is told about a session: where and when it started, when it was last used. */
export const sessionSummary = (user) => ({
  device: user.activeSessionDevice || null,
  signedInAt: user.activeSessionCreatedAt || null,
  lastActiveAt: user.activeSessionSeenAt || user.activeSessionCreatedAt || null,
});

/**
 * The account's other session that a new sign-in would end, or null when there is none that is
 * still usable: none recorded, signed out, older than the cookie or token allows, from before a
 * password change, or the session of this very browser (signing in again here ends nothing).
 */
export function liveOtherSession(user, currentToken, now = new Date()) {
  const active = user?.activeSessionToken;
  if (!active || isEndedMarker(active)) return null;
  if (currentToken && tokenHash(currentToken) === active) return null;
  const started = user.activeSessionCreatedAt ? new Date(user.activeSessionCreatedAt) : null;
  if (started && now - started > sessionLifetimeMs()) return null;
  if (started && user.passwordChangedAt && new Date(user.passwordChangedAt) > started) return null;
  return sessionSummary(user);
}

/** Starts the account's one session and returns its token; the previous one stops working. */
export async function startSession(user, { claims, userAgent, now = new Date() }) {
  // `sid` makes every session's token unique, even two sign-ins within the same second.
  const token = signToken({ ...claims, sid: crypto.randomUUID() });
  const hash = tokenHash(token);
  const device = describeDevice(userAgent);
  const replaced = liveOtherSession(user, null, now);
  await User.updateOne({ _id: user._id }, {
    $set: { activeSessionToken: hash, activeSessionCreatedAt: now, activeSessionSeenAt: now, ...(device ? { activeSessionDevice: device } : {}) },
    ...(device ? {} : { $unset: { activeSessionDevice: 1 } }),
  });
  // Pages still open with the old session ask the server and show "Your session has expired".
  if (replaced) notifySessionChange(user._id, 'replaced');
  return { token, hash, device, startedAt: now };
}

/** Signs out the session holding `token`; another session (a newer sign-in) is left alone. */
export async function endSession(userId, token) {
  const result = await User.updateOne(
    { _id: userId, activeSessionToken: tokenHash(token) },
    { $set: { activeSessionToken: endedMarker() }, $unset: { activeSessionSeenAt: 1 } },
  );
  return result.modifiedCount > 0;
}

const lastSeenWrites = new Map();
/** Records that a session is in use, at most every few minutes (one process; a few extra writes elsewhere are harmless). */
export function touchSession(scopedKey, userId, hash, now = Date.now()) {
  const last = lastSeenWrites.get(scopedKey);
  if (last && last.hash === hash && now - last.at < SEEN_WRITE_INTERVAL_MS) return;
  lastSeenWrites.set(scopedKey, { hash, at: now });
  if (lastSeenWrites.size > 50000) lastSeenWrites.delete(lastSeenWrites.keys().next().value);
  void User.updateOne({ _id: userId, activeSessionToken: hash }, { $set: { activeSessionSeenAt: new Date(now) } }).catch(() => {});
}

/** Tells the account's open pages to check their session (they each ask the server, so the new one stays). */
export function notifySessionChange(userId, reason) {
  try {
    getIo()?.to(personalRoom(String(userId))).emit('session-check', { reason });
  } catch {
    // Pages also check on focus and on a timer.
  }
}

/** The 401 a request from an ended session gets: why it ended, and (if replaced) where the new one is. */
export function endedSessionError(state) {
  if (isEndedMarker(state.activeSessionToken)) {
    return { status: 401, message: 'You were signed out of this account.', details: { code: 'SESSION_ENDED' } };
  }
  return {
    status: 401,
    message: 'Your account was signed in on another device. Please sign in again.',
    details: { code: 'SESSION_REPLACED', session: { device: state.activeSessionDevice || null, signedInAt: state.activeSessionCreatedAt || null } },
  };
}
