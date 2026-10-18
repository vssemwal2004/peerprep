// The latest ranking a student page has loaded, shared with the header's Prep
// Score chip so the header never makes requests of its own. Keyed by student,
// so a different account in the same tab never sees someone else's score.
let current = { userId: null, ranking: null };
const listeners = new Set();

export function publishRanking(userId, ranking) {
  if (!userId || !ranking) return;
  current = { userId: String(userId), ranking };
  listeners.forEach((listener) => listener());
}

export function subscribeRanking(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const rankingSnapshot = () => current;
