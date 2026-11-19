// One place where "you earned something" enters the student app, whether it came from an HTTP
// response (daily check-in, a submit) or the server's socket push. The same reward can arrive both
// ways; each is shown once.
import socketService from '../../utils/socket';

export const COINS_EARNED = 'peerprep:coins-earned';
export const BADGE_LEVEL_EARNED = 'peerprep:badge-level-earned';

const seen = new Set();
function firstTime(key) {
  if (!key || seen.has(key)) return false;
  seen.add(key);
  if (seen.size > 300) seen.delete(seen.values().next().value);
  return true;
}

/** detail: { kind: 'login' | 'solve' | 'badge', amount, balance, note } */
export function announceCoinsEarned(detail) {
  const amount = Number(detail?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return;
  // The new balance is unique per credit, so it identifies the reward across both channels.
  if (!firstTime(`coin:${detail.kind}:${detail.balance}`)) return;
  window.dispatchEvent(new CustomEvent(COINS_EARNED, { detail: { ...detail, amount, at: Date.now() } }));
}

/** detail: { month, track, title, level, tier, coins, value, unit } */
export function announceBadgeLevel(detail) {
  if (!detail?.track || !firstTime(`badge:${detail.month}:${detail.track}:${detail.level}`)) return;
  window.dispatchEvent(new CustomEvent(BADGE_LEVEL_EARNED, { detail: { ...detail, at: Date.now() } }));
}

/** Forwards the server's pushes into the events above. Returns a cleanup function. */
export function startRewardSocketBridge() {
  const onCoins = (payload) => announceCoinsEarned(payload);
  const onBadge = (payload) => announceBadgeLevel(payload);
  socketService.on('prepcoin:earned', onCoins);
  socketService.on('badge:earned', onBadge);
  return () => {
    socketService.off('prepcoin:earned', onCoins);
    socketService.off('badge:earned', onBadge);
  };
}
