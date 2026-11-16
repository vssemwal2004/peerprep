/**
 * The date-range value used by every analysis screen:
 *   { preset: '7d' | '30d' | '90d' | '180d' | '365d' | 'all' | 'custom', from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD' }
 * Pure helpers, no React, so pages and tests share the exact same maths.
 */

export const DATE_RANGE_PRESETS = Object.freeze([
  { value: '7d', label: 'Last 7 days', days: 7 },
  { value: '30d', label: 'Last 30 days', days: 30 },
  { value: '90d', label: 'Last 90 days', days: 90 },
  { value: '180d', label: 'Last 6 months', days: 180 },
  { value: '365d', label: 'Last year', days: 365 },
  { value: 'all', label: 'All time', days: null },
]);

const DAY_MS = 86_400_000;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export const isDayKey = (value) => typeof value === 'string' && DAY_KEY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));

/** Local calendar day "YYYY-MM-DD" (never UTC, so late-evening dates do not jump a day). */
export function dayKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** Parses "YYYY-MM-DD" as a LOCAL date. `new Date('2026-11-13')` is UTC midnight and Safari-safe only in this form. */
export function parseDayKey(value, endOfDay = false) {
  if (!isDayKey(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return endOfDay ? new Date(year, month - 1, day, 23, 59, 59, 999) : new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function normalizeDateRange(value, fallback = 'all') {
  if (typeof value === 'string') value = { preset: value };
  const preset = value?.preset;
  if (preset === 'custom') {
    const from = isDayKey(value.from) ? value.from : '';
    const to = isDayKey(value.to) ? value.to : '';
    if (!from && !to) return { preset: fallback };
    if (from && to && from > to) return { preset: 'custom', from: to, to: from };
    return { preset: 'custom', from, to };
  }
  return DATE_RANGE_PRESETS.some((item) => item.value === preset) ? { preset } : { preset: fallback };
}

/** { from: Date|null, to: Date|null } for filtering rows in the browser. */
export function rangeBounds(value, now = new Date()) {
  const range = normalizeDateRange(value);
  if (range.preset === 'custom') return { from: parseDayKey(range.from), to: parseDayKey(range.to, true) };
  const days = DATE_RANGE_PRESETS.find((item) => item.value === range.preset)?.days;
  return { from: days ? new Date(now.getTime() - days * DAY_MS) : null, to: null };
}

/** True when a timestamp (Date, ISO string or ms) falls inside the range. Missing timestamps are outside a bounded range. */
export function inDateRange(timestamp, value, now = new Date()) {
  const { from, to } = rangeBounds(value, now);
  if (!from && !to) return true;
  if (timestamp === null || timestamp === undefined || timestamp === '') return false;
  const time = timestamp instanceof Date ? timestamp.getTime()
    : typeof timestamp === 'number' ? timestamp
      : Date.parse(String(timestamp).includes(' ') && !String(timestamp).includes('T') ? String(timestamp).replace(' ', 'T') : String(timestamp));
  if (Number.isNaN(time)) return false;
  return (!from || time >= from.getTime()) && (!to || time <= to.getTime());
}

/** Query-string form used by the API: ?range=30d or ?range=custom&from=…&to=… */
export function rangeToQuery(value) {
  const range = normalizeDateRange(value);
  if (range.preset !== 'custom') return { range: range.preset };
  return { range: 'custom', ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) };
}

/** Body form used by POST endpoints: { preset, from?, to? }. */
export function rangeToBody(value) {
  const range = normalizeDateRange(value);
  return range.preset === 'custom' ? { preset: 'custom', ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) } : { preset: range.preset };
}

const DISPLAY = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function rangeLabel(value) {
  const range = normalizeDateRange(value);
  if (range.preset !== 'custom') return DATE_RANGE_PRESETS.find((item) => item.value === range.preset)?.label || 'All time';
  const from = range.from ? DISPLAY.format(parseDayKey(range.from)) : 'Start';
  const to = range.to ? DISPLAY.format(parseDayKey(range.to)) : 'Today';
  return `${from} – ${to}`;
}
