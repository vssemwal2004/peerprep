// Prep Readiness (SBC/PBC coding practice targets): shared wording, colours and formatting.
// Server: backend/src/services/prepReadiness/. Readiness is progress toward a practice target,
// never a prediction of selection by a company.

// Students see the plain names ("Service-Based", "Product-Based Companies"); SBC/PBC only as a hint.
export const TRACK_META = Object.freeze({
  sbc: { key: 'sbc', short: 'SBC', label: 'Service-Based', full: 'Service-Based Companies', word: 'Service', name: 'Service-Based Company', title: 'Service-Based Company readiness', color: '#0284c7', soft: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-400/20', bar: 'from-sky-400 to-sky-600' },
  pbc: { key: 'pbc', short: 'PBC', label: 'Product-Based', full: 'Product-Based Companies', word: 'Product', name: 'Product-Based Company', title: 'Product-Based Company readiness', color: '#0d9488', soft: 'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-500/10 dark:text-teal-200 dark:ring-teal-400/20', bar: 'from-teal-400 to-teal-600' },
});
export const TRACK_ORDER = ['sbc', 'pbc'];
export const READINESS_EVENT = 'peerprep:prep-readiness-changed';

export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#1a1a1a]';

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
  below: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-400/20',
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

/**
 * Smooth SVG path through [x, y] points (monotone cubic, Fritsch–Carlson): never overshoots, so a
 * flat stretch stays flat and the line never dips below a real value.
 */
export function smoothPath(points) {
  const n = points.length;
  if (!n) return '';
  if (n < 3) return points.map(([px, py], index) => `${index ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const dx = [], slope = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(points[i + 1][0] - points[i][0]);
    slope.push(dx[i] ? (points[i + 1][1] - points[i][1]) / dx[i] : 0);
  }
  const tangent = [slope[0]];
  for (let i = 1; i < n - 1; i += 1) tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i += 1) {
    if (!slope[i]) { tangent[i] = 0; tangent[i + 1] = 0; continue; }
    const a = tangent[i] / slope[i], b = tangent[i + 1] / slope[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); tangent[i] = t * a * slope[i]; tangent[i + 1] = t * b * slope[i]; }
  }
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1], step = dx[i] / 3;
    d += ` C${(x0 + step).toFixed(1)},${(y0 + tangent[i] * step).toFixed(1)} ${(x1 - step).toFixed(1)},${(y1 - tangent[i + 1] * step).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

/** Change of one track across a daily series: { change, values } (values = the track's numbers). */
export function trendOf(days = [], key) {
  const values = days.map((row) => Number(row?.[key]) || 0);
  return { values, change: values.length > 1 ? Math.round((values.at(-1) - values[0]) * 10) / 10 : 0 };
}

/** A topic's practice link: the problem list filtered to that topic. */
export const topicPracticeUrl = (label) => `/problems?topic=${encodeURIComponent(label)}`;

/** Tells open readiness views to reload (after an accepted solve). */
export function announceReadinessChange() {
  try { window.dispatchEvent(new CustomEvent(READINESS_EVENT)); } catch { /* no window */ }
}
