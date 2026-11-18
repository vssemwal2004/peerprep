import { useCallback, useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { hasStudentFeature } from '../studentFeatureAccess';

/**
 * Full-access students with the Prep Mates feature who belong to a university: a university
 * account, or (in the shared database) a college set by their institution.
 */
export function canUsePeers(user) {
  return user?.role === 'student'
    && user?.accessScope !== 'assessment_only'
    && Boolean(user?.universityId || String(user?.college || '').trim())
    && hasStudentFeature(user, 'peers');
}

// Window event fired whenever this student's network changes (their own action or a realtime push),
// so every count and button on screen refreshes from the server.
export const PEER_NETWORK_EVENT = 'peerprep:peer-network-updated';

export function announcePeerNetworkChange(detail = {}) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PEER_NETWORK_EVENT, { detail }));
}

// Product vocabulary: one simple idea, "Prep Mates" (request, accept, both are Prep Mates).
// Students never see follow / follower / following.
export const PEER_TERMS = Object.freeze({
  prepMates: 'Prep Mates',
  addMate: 'Add Prep Mate',
  requested: 'Request sent',
  accept: 'Accept',
  decline: 'Decline',
  mates: 'Prep Mates',
});

export function peerInitials(name = '') {
  return String(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'PP';
}

export function peerSubtitle(peer = {}) {
  return [peer.branch || peer.course, peer.semester ? `Sem ${peer.semester}` : ''].filter(Boolean).join(' · ');
}

export function compactCount(value) {
  const number = Number(value) || 0;
  if (number < 1000) return String(number);
  if (number < 10000) return `${(number / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(number / 1000)}k`;
}

/** What the Prep Mate button should say and do for a relation from the API. */
export function mateButtonState(relation = {}) {
  switch (relation?.mate) {
    case 'mates': return { label: PEER_TERMS.mates, action: 'remove', tone: 'success' };
    case 'outgoing': return { label: PEER_TERMS.requested, action: 'cancel', tone: 'muted' };
    case 'incoming': return { label: PEER_TERMS.accept, action: 'accept', tone: 'primary' };
    case 'cooldown': return { label: PEER_TERMS.requested, action: null, tone: 'muted', disabled: true };
    default: return { label: PEER_TERMS.addMate, action: 'request', tone: 'primary' };
  }
}

export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  return error?.response?.data?.error || error?.message || fallback;
}

/** Prep Mate and pending-request counts for the signed-in student, kept fresh by network events. */
export function usePeerSummary(enabled = true) {
  const [summary, setSummary] = useState(null);
  const load = useCallback(() => {
    if (!enabled) return Promise.resolve(null);
    return api.getPeerSummary().then((data) => { setSummary(data); return data; }).catch(() => null);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setSummary(null);
      return undefined;
    }
    load();
    window.addEventListener(PEER_NETWORK_EVENT, load);
    return () => window.removeEventListener(PEER_NETWORK_EVENT, load);
  }, [enabled, load]);

  return { summary, reload: load };
}

/**
 * Runs one Prep Mate action (request, cancel, accept, decline, remove) and returns the server's
 * new relation. Accept/decline need the request id; the others the peer id.
 */
export async function runPeerAction(action, { peerId, requestId }) {
  const calls = {
    request: () => api.requestPrepMate(peerId),
    cancel: () => api.cancelPrepMateRequest(peerId),
    remove: () => api.removePrepMate(peerId),
    accept: () => api.acceptPrepMate(requestId),
    decline: () => api.declinePrepMate(requestId),
  };
  if (!calls[action]) throw new Error('Unknown action');
  const result = await calls[action]();
  announcePeerNetworkChange({ action, peerId });
  return result?.relation || null;
}

// Accept is always green and Decline always red, on every surface (toasts, popups, lists, profile).
export const DECISION_TONES = Object.freeze({
  accept: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500',
  decline: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700 focus-visible:ring-rose-500 dark:bg-rose-600 dark:hover:bg-rose-500',
});

/** "Just now", "5 min ago", "3 hr ago", "2 days ago", then a date. */
export function timeAgo(value, now = Date.now()) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  const minutes = Math.floor(Math.max(0, now - time) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(time).toLocaleDateString();
}

// Requests already announced in this browser, so a request that arrived while the student was away
// pops up once when they come back, not on every page load.
const SEEN_REQUESTS_KEY = (userId) => `pp:prep-mate-requests-seen:${userId}`;
const SEEN_REQUESTS_LIMIT = 200;

export function readSeenRequests(storage, userId) {
  try {
    const parsed = JSON.parse(storage?.getItem(SEEN_REQUESTS_KEY(userId)) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export function writeSeenRequests(storage, userId, ids) {
  try {
    storage?.setItem(SEEN_REQUESTS_KEY(userId), JSON.stringify([...ids].slice(-SEEN_REQUESTS_LIMIT)));
  } catch { /* storage can be blocked; the request then simply shows again next time */ }
}

/** Incoming requests (from the 'incoming' list) this browser has not announced yet. */
export function unseenRequests(items = [], seen = new Set()) {
  return items.filter((item) => item?.relation?.mate === 'incoming' && item.relation.requestId && !seen.has(String(item.relation.requestId)));
}

export const ACTION_TOASTS = {
  request: (name, relation) => (relation?.mate === 'mates'
    ? { type: 'success', message: `You and ${name} are now Prep Mates.` }
    : { type: 'success', message: `Prep Mate request sent to ${name}.` }),
  cancel: (name) => ({ type: 'info', message: `Request to ${name} withdrawn.` }),
  remove: (name) => ({ type: 'info', message: `${name} is no longer your Prep Mate.` }),
  accept: (name) => ({ type: 'success', message: `You and ${name} are now Prep Mates.` }),
  decline: (name) => ({ type: 'info', message: `Request from ${name} declined.` }),
};
