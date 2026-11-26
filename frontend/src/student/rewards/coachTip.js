// Prep Coach tips (server: backend/src/services/prepScore/coach.js): one short tip after a practice
// submission, shown at the top of the screen by StudentRewardsLayer. This file decides whether a tip
// is shown (no repeats of once-a-day tips, no spam of the same tip) and hands it to the layer.

export const COACH_TIP = 'peerprep:coach-tip';
const STORE_KEY = 'peerprep:coach-seen';
// The same tip for the same topic is not repeated within this window (except a full topic, which
// matters every time the student keeps going: see shouldShowTip).
const REPEAT_MS = 10 * 60 * 1000;

const istDay = (now) => new Date(now + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

function readSeen() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function writeSeen(seen) {
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify(seen)); } catch { /* shown again next time */ }
}

/** Pure rule: show `tip` given what was seen ({ [key]: { day, at } }). */
export function shouldShowTip(tip, seen = {}, now = Date.now()) {
  if (!tip?.code || !tip.title) return false;
  const day = istDay(now);
  if (tip.once === 'day') return seen[tip.code]?.day !== day;
  // A full topic is the core warning: show it every time, but not twice within a few seconds.
  if (tip.code === 'topic-full') return !(seen[`${tip.code}:${tip.topic || ''}`]?.at > now - 5_000);
  const last = seen[`${tip.code}:${tip.topic || ''}`];
  return !(last?.at > now - REPEAT_MS);
}

export function markTipSeen(tip, seen = {}, now = Date.now()) {
  const day = istDay(now);
  const key = tip.once === 'day' ? tip.code : `${tip.code}:${tip.topic || ''}`;
  const next = { ...seen, [key]: { day, at: now } };
  // Keep the store small: today's entries only.
  return Object.fromEntries(Object.entries(next).filter(([, value]) => value?.day === day));
}

/** Shows a tip from a submit outcome (outcome.coach) if it passes the rules above. */
export function announceCoachTip(tip, now = Date.now()) {
  const seen = readSeen();
  if (!shouldShowTip(tip, seen, now)) return false;
  writeSeen(markTipSeen(tip, seen, now));
  window.dispatchEvent(new CustomEvent(COACH_TIP, { detail: { ...tip, at: now } }));
  return true;
}
