// Pure helpers for the admin student profile. Nothing here invents data: missing values become
// null (or a dash in the UI) instead of a made-up number or date.

export const DASH = '—';

export const tabId = (id) => `admin-student-tab-${id}`;
export const panelId = (id) => `admin-student-panel-${id}`;

export function num(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/** Number or null when the value is missing / not numeric. */
export function nullableNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function hasDate(value) {
  return toDate(value) !== null;
}

export function fmtDate(value, fallback = DASH) {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(value, fallback = DASH) {
  const date = toDate(value);
  if (!date) return fallback;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function fmtRelative(value, fallback = DASH) {
  const date = toDate(value);
  if (!date) return fallback;
  const diffSeconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSeconds < 45) return 'Just now';
  const minutes = Math.round(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(date);
}

export function timeOf(value) {
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

export function plural(count, word, pluralWord = `${word}s`) {
  return `${count} ${count === 1 ? word : pluralWord}`;
}

export function normalizeHref(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  return `https://${raw}`;
}

/** Last `days` UTC days (the backend buckets activity by UTC day), oldest first. */
export function buildDailySeries(activity, days = 30) {
  const today = new Date();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (days - 1 - index)));
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      count: num(activity?.[key]),
      tick: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      full: date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
    };
  });
}

/**
 * Reads the optional `learnerProgress` block (added server-side separately). Returns null when it
 * is absent so callers render nothing extra.
 */
export function readLearnerProgress(student) {
  const raw = student?.learnerProgress;
  if (!raw || typeof raw !== 'object') return null;
  const levelHistory = Array.isArray(raw.levelHistory)
    ? raw.levelHistory
      .filter((entry) => entry && Number.isFinite(Number(entry.level)) && hasDate(entry.achievedAt))
      .map((entry) => ({ level: Number(entry.level), title: entry.title || '', achievedAt: entry.achievedAt }))
      .sort((a, b) => timeOf(b.achievedAt) - timeOf(a.achievedAt))
    : [];
  const awardDates = new Map(
    (Array.isArray(raw.awards) ? raw.awards : [])
      .filter((entry) => entry?.id && hasDate(entry.earnedAt))
      .map((entry) => [String(entry.id), entry.earnedAt]),
  );
  return {
    celebratedLevel: nullableNum(raw.celebratedLevel),
    levelHistory,
    awardDates,
  };
}

/** Most recent date the student reached `level`, or null. */
export function levelReachedAt(progress, level) {
  if (!progress) return null;
  const entry = progress.levelHistory.find((item) => item.level === level);
  return entry ? entry.achievedAt : null;
}
