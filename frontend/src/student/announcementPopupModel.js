/**
 * Login popups: active announcements marked "show as popup" appear once after each login.
 * "Seen" ids live in localStorage under the student's id. Logout clears localStorage
 * (AuthContext), so the next login shows the popups again; announcements published while the
 * student stays signed in show on their next page load.
 */

const PRIORITY = { high: 0, normal: 1, low: 2 };
export const POPUP_SEEN_PREFIX = 'peerprep.announcementPopup.seen.';

export const popupSeenKey = (userId) => `${POPUP_SEEN_PREFIX}${userId || 'anonymous'}`;

/** Pages where a popup must never interrupt: tests, interview rooms, live sessions, the code editor. */
export function popupAllowedOn(pathname = '') {
  return !/^\/student\/(assessment\/|ai-interviews\/room\/|session(\/|$)|change-password)|^\/problems\/./.test(pathname);
}

export function readSeen(storage, userId) {
  try {
    const value = JSON.parse(storage?.getItem(popupSeenKey(userId)) || '[]');
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

export function writeSeen(storage, userId, ids) {
  try {
    storage?.setItem(popupSeenKey(userId), JSON.stringify([...new Set([...ids].map(String))].slice(-200)));
  } catch {
    // Storage blocked: the popup may show again on the next page load, which is harmless.
  }
}

/** Popups still to show, most important first, then newest. */
export function popupQueue(announcements = [], seen = new Set(), now = new Date()) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return (Array.isArray(announcements) ? announcements : [])
    .filter((item) => item && item.showAsPopup && item.status !== 'inactive' && item._id && !seen.has(String(item._id)))
    .filter((item) => !item.expiryDate || new Date(item.expiryDate) >= startOfToday)
    .sort((left, right) => (PRIORITY[left.priority] ?? 1) - (PRIORITY[right.priority] ?? 1)
      || new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
}
