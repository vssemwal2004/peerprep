const SESSION_NOTICE_KEY = 'peerprep:session-notice';

export const SESSION_EXPIRED_MESSAGE = 'Session expired after your password change. Sign in again with your new password.';
export const SESSION_EXPIRED_GENERIC_MESSAGE = 'Your session expired. Please sign in again.';

export function returnToLogin(message = SESSION_EXPIRED_GENERIC_MESSAGE) {
  sessionStorage.setItem(SESSION_NOTICE_KEY, message);
  window.location.replace('/student');
}

export function consumeSessionNotice() {
  const message = sessionStorage.getItem(SESSION_NOTICE_KEY);
  sessionStorage.removeItem(SESSION_NOTICE_KEY);
  return message;
}

// ---------------------------------------------------------------- ended sessions
// One session per account: signing in elsewhere (SESSION_REPLACED) or signing out (SESSION_ENDED)
// ends this one. The page does not sign out by itself: it shows "Your session has expired" and
// signs out when the person presses OK, also after a refresh.

export const SESSION_ENDED_EVENT = 'peerprep:session-ended';
const ENDED_CODES = new Set(['SESSION_REPLACED', 'SESSION_ENDED']);

/** { code, session } when a failed request says this session was ended, otherwise null. */
export function sessionEndOf(status, payload) {
  if (status !== 401 || !ENDED_CODES.has(payload?.code)) return null;
  return { code: payload.code, session: payload.session || null };
}

/** Called by the API clients on every 401 that ends the session. */
export function reportSessionEnded(status, payload) {
  const ended = sessionEndOf(status, payload);
  if (ended && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail: ended }));
  return ended;
}

const APP_PREFIX = /^\/u\/[a-z0-9][a-z0-9-]{1,62}(?=\/|$)/;
/** Where OK goes: the sign-in page (inside /u/<university> when there), or this page when it is public. */
export function afterSessionEndUrl(location = window.location) {
  const prefix = APP_PREFIX.exec(location.pathname)?.[0] || '';
  const path = location.pathname.slice(prefix.length) || '/';
  const inApp = /^\/(admin|coordinator)(\/|$)/.test(path) || /^\/student\//.test(path) || /^\/(assessments?|assessment-reports|assessment-history)(\/|$)/.test(path);
  return inApp ? `${prefix}/student` : `${location.pathname}${location.search}`;
}
