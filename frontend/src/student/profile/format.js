// Pure formatting helpers shared by the student profile sections.

const STALE_PENDING_MS = 10 * 60 * 1000;

export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#242424]';

export function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function formatDateTime(value) {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRelative(value) {
  if (!value) return 'Just now';
  const date = new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time)) return 'Unknown date';
  const diffSeconds = Math.round((Date.now() - time) / 1000);
  if (diffSeconds < 45) return 'Just now';
  const minutes = Math.round(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Returns null when there is no meaningful runtime to show (0 ms, missing, or still judging). */
export function formatRuntime(value, status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PENDING' || normalized === 'RUNNING') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (numeric >= 1000) return `${(numeric / 1000).toFixed(2)} s`;
  return `${numeric < 10 ? numeric.toFixed(2) : Math.round(numeric)} ms`;
}

export function formatPercent(value, decimals = 1) {
  const numeric = toNumber(value);
  const fixed = numeric.toFixed(decimals);
  return `${fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed}%`;
}

export function capitalize(value) {
  const text = String(value || '').trim();
  if (!text) return 'Unknown';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const LANGUAGE_LABELS = {
  c: 'C',
  cpp: 'C++',
  'c++': 'C++',
  csharp: 'C#',
  python: 'Python',
  python3: 'Python',
  javascript: 'JavaScript',
  js: 'JavaScript',
  typescript: 'TypeScript',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
  kotlin: 'Kotlin',
};

export function languageLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return LANGUAGE_LABELS[key] || capitalize(value);
}

export function difficultyTone(difficulty) {
  if (difficulty === 'Hard') return 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30';
  if (difficulty === 'Medium') return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30';
  return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30';
}

const STATUS_META = {
  AC: { label: 'Accepted', tone: 'success' },
  ACCEPTED: { label: 'Accepted', tone: 'success' },
  ACCEPT: { label: 'Accepted', tone: 'success' },
  WA: { label: 'Wrong Answer', tone: 'danger' },
  TLE: { label: 'Time Limit', tone: 'warning' },
  MLE: { label: 'Memory Limit', tone: 'warning' },
  RE: { label: 'Runtime Error', tone: 'danger' },
  CE: { label: 'Compile Error', tone: 'danger' },
  PENDING: { label: 'Queued', tone: 'pending' },
  RUNNING: { label: 'Running', tone: 'pending' },
};

/**
 * Friendly verdict metadata. A PENDING/RUNNING record that is older than a few minutes never
 * reported a verdict (common for "Run" executions), so it is shown as "No verdict" instead of
 * pretending it is still queued.
 */
export function statusMeta(status, createdAt) {
  const key = String(status || 'PENDING').toUpperCase();
  const meta = STATUS_META[key] || { label: key || 'Unknown', tone: 'neutral' };
  if (meta.tone === 'pending' && createdAt) {
    const age = Date.now() - new Date(createdAt).getTime();
    if (Number.isFinite(age) && age > STALE_PENDING_MS) {
      return { key, label: 'No verdict', tone: 'neutral', stale: true };
    }
  }
  return { key, ...meta, stale: false };
}

export const STATUS_TONE_CLASSES = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
  pending: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700',
};

export const STATUS_BAR_COLORS = {
  success: 'bg-emerald-500',
  danger: 'bg-rose-500',
  warning: 'bg-amber-500',
  pending: 'bg-sky-400',
  neutral: 'bg-slate-400 dark:bg-zinc-500',
};

export function submissionTitle(submission) {
  return submission?.problemTitle
    || submission?.problemSnapshot?.title
    || submission?.problem?.title
    || submission?.title
    || 'Untitled Problem';
}
