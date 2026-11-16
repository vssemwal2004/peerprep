// The date range shared by every analysis endpoint. The browser sends the shape built by
// frontend/src/components/dateRange/dateRangeModel.js:
//   ?range=7d|30d|90d|180d|365d|all            (a preset, counted back from now)
//   ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD (either end may be left open)
// POST bodies may send { preset, from, to } instead of { range, from, to }.
// `to` is inclusive: it ends at 23:59:59.999 of that day. Days are read in UTC unless the caller
// passes `offsetMinutes` (e.g. 330 for IST dashboards that bucket by Indian days).

import { HttpError } from './errors.js';

export const DAY_MS = 86_400_000;
export const MAX_RANGE_DAYS = 3 * 366; // "up to 3 years", leap days included
export const RANGE_PRESET_DAYS = Object.freeze({ '7d': 7, '30d': 30, '90d': 90, '180d': 180, '365d': 365, all: null });

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Midnight of a YYYY-MM-DD day in the given offset, as a Date; null when the text is not a real day. */
export function parseDayKey(value, offsetMinutes = 0) {
  if (typeof value !== 'string' || !DAY_KEY.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  // 2026-02-31 rolls over to March: not a real day.
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return new Date(utc - offsetMinutes * 60_000);
}

/** The YYYY-MM-DD day a moment falls on in the given offset. */
export function dayKeyOf(date, offsetMinutes = 0) {
  return new Date(new Date(date).getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/**
 * Parses and validates a range. Options:
 *   defaultPreset  used when nothing is sent (default 'all')
 *   presets        the preset values this endpoint accepts (default: all of RANGE_PRESET_DAYS)
 *   aliases        legacy values still honoured, e.g. { '14d': 14, week: '7d' } (days or a preset)
 *   offsetMinutes  timezone of the calendar days (default 0 = UTC)
 *   maxDays        longest custom range (default 3 years)
 *   now            for tests
 * Returns { preset, from: Date|null, to: Date|null, days: number|null } where `days` is the preset
 * length (null for 'all' and custom). Throws HttpError(400) for anything invalid.
 */
export function parseDateRange(input = {}, options = {}) {
  const {
    defaultPreset = 'all', presets = Object.keys(RANGE_PRESET_DAYS), aliases = {}, offsetMinutes = 0,
    maxDays = MAX_RANGE_DAYS, now = new Date(),
  } = options;
  const source = typeof input === 'string' ? { range: input } : (input || {});
  const fromText = source.from === undefined || source.from === null ? '' : String(source.from).trim();
  const toText = source.to === undefined || source.to === null ? '' : String(source.to).trim();
  let preset = String(source.range ?? source.preset ?? '').trim();
  if (!preset) preset = fromText || toText ? 'custom' : defaultPreset;

  if (preset !== 'custom') {
    if (Object.hasOwn(aliases, preset)) {
      const alias = aliases[preset];
      if (typeof alias === 'string') preset = alias;
      else return { preset, from: new Date(now.getTime() - alias * DAY_MS), to: null, days: alias };
    }
    if (!presets.includes(preset) || !Object.hasOwn(RANGE_PRESET_DAYS, preset)) throw new HttpError(400, 'Unknown date range.');
    const days = RANGE_PRESET_DAYS[preset];
    return { preset, from: days ? new Date(now.getTime() - days * DAY_MS) : null, to: null, days };
  }

  if (!fromText && !toText) throw new HttpError(400, 'Choose a start or an end date.');
  const from = fromText ? parseDayKey(fromText, offsetMinutes) : null;
  const toStart = toText ? parseDayKey(toText, offsetMinutes) : null;
  if ((fromText && !from) || (toText && !toStart)) throw new HttpError(400, 'Dates must be real days written as YYYY-MM-DD.');
  if (from && toStart && from > toStart) throw new HttpError(400, 'The start date must be on or before the end date.');
  const to = toStart ? new Date(toStart.getTime() + DAY_MS - 1) : null;
  if (from && (((to || now) - from) / DAY_MS) > maxDays) {
    throw new HttpError(400, maxDays === MAX_RANGE_DAYS ? 'A date range can cover up to 3 years.' : `A date range can cover up to ${maxDays} days.`);
  }
  return { preset: 'custom', from, to, days: null };
}

/** A Mongo condition for one date field, or {} for an unbounded range. */
export function rangeMatch(field, range) {
  if (!range?.from && !range?.to) return {};
  return { [field]: { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) } };
}

/** True when a date falls inside the range (a missing date is outside a bounded range). */
export function inRange(date, range) {
  if (!range?.from && !range?.to) return true;
  if (!date) return false;
  const time = new Date(date).getTime();
  return !Number.isNaN(time) && (!range.from || time >= range.from.getTime()) && (!range.to || time <= range.to.getTime());
}

/** The query-string echo of a range, for responses and file names: { range, from?, to? }. */
export function rangeEcho(range, offsetMinutes = 0) {
  if (range?.preset !== 'custom') return { range: range?.preset || 'all' };
  return {
    range: 'custom',
    ...(range.from ? { from: dayKeyOf(range.from, offsetMinutes) } : {}),
    ...(range.to ? { to: dayKeyOf(range.to, offsetMinutes) } : {}),
  };
}

/**
 * Every calendar day of a range, oldest first, for daily trend charts. A preset of N days gives
 * the last N days (today included), so callers should count from the first day. An open start uses
 * `fallbackDays` before the end; an open end is today. Capped at `maxDays` days (most recent kept).
 */
export function rangeDayKeys(range, { offsetMinutes = 0, now = new Date(), fallbackDays = 30, maxDays = MAX_RANGE_DAYS } = {}) {
  const end = range?.to && range.to < now ? range.to : now;
  const endDay = parseDayKey(dayKeyOf(end, offsetMinutes), offsetMinutes);
  // A preset of N days is the last N calendar days, today included.
  const startDay = range?.days
    ? new Date(endDay.getTime() - (range.days - 1) * DAY_MS)
    : range?.from
      ? parseDayKey(dayKeyOf(range.from, offsetMinutes), offsetMinutes)
      : new Date(endDay.getTime() - (fallbackDays - 1) * DAY_MS);
  const count = Math.min(maxDays, Math.max(0, Math.round((endDay - startDay) / DAY_MS) + 1));
  return Array.from({ length: count }, (_, index) => dayKeyOf(new Date(endDay.getTime() - (count - 1 - index) * DAY_MS), offsetMinutes));
}
