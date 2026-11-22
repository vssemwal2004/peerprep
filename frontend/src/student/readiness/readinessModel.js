// Prep Readiness (SBC/PBC coding practice targets): shared wording, colours and formatting.
// Server: backend/src/services/prepReadiness/. Readiness is progress toward a practice target,
// never a prediction of selection by a company.

// Students see the plain names ("Service-Based", "Product-Based Companies"); SBC/PBC only as a hint.
export const TRACK_META = Object.freeze({
  sbc: { key: 'sbc', short: 'SBC', label: 'Service-Based', full: 'Service-Based Companies', word: 'Service', name: 'Service-Based Company', title: 'Service-Based Company readiness', color: '#7c3aed', soft: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-400/20', bar: 'from-violet-400 to-violet-600' },
  pbc: { key: 'pbc', short: 'PBC', label: 'Product-Based', full: 'Product-Based Companies', word: 'Product', name: 'Product-Based Company', title: 'Product-Based Company readiness', color: '#c026d3', soft: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-200 dark:ring-fuchsia-400/20', bar: 'from-fuchsia-400 to-purple-600' },
});
export const TRACK_ORDER = ['sbc', 'pbc'];
export const READINESS_EVENT = 'peerprep:prep-readiness-changed';

export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#1a1a1a]';

/**
 * Status of one track card. Uses the server's unrounded `met` and its display text (which shows
 * "<75" for a value just below the cutoff), never a rounded number.
 */
export function trackStatus(track, hasEvidence) {
  if (!track) return { tone: 'muted', label: 'Not available' };
  if (!hasEvidence) return { tone: 'muted', label: 'No eligible solves yet' };
  if (track.met) return { tone: 'met', label: 'Practice target met' };
  const remaining = Math.max(0, Number(track.remaining) || 0);
  return { tone: 'below', label: remaining < 0.1 ? 'Just below the target' : `${remaining.toFixed(1)} points to target` };
}

export const STATUS_CLASSES = {
  met: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  below: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-400/20',
  muted: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:ring-white/10',
};

export function relativeTime(value) {
  const time = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(time)) return '';
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const shortDay = (day) => {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

export const percent = (value) => `${Math.round((Number(value) || 0) * 100)}%`;
export const signed = (value, places = 2) => {
  const number = Number(value) || 0;
  return `${number > 0 ? '+' : number < 0 ? '−' : ''}${Math.abs(number).toFixed(places)}`;
};

/** A topic's practice link: the problem list filtered to that topic. */
export const topicPracticeUrl = (label) => `/problems?topic=${encodeURIComponent(label)}`;

/** Tells open readiness views to reload (after an accepted solve). */
export function announceReadinessChange() {
  try { window.dispatchEvent(new CustomEvent(READINESS_EVENT)); } catch { /* no window */ }
}
