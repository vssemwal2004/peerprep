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
