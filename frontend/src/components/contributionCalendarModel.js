import { parseDayKey } from './dateRange/dateRangeModel.js';

/** Today's UTC day "YYYY-MM-DD": the activity APIs bucket records by UTC day. */
export const utcTodayKey = (now = new Date()) => now.toISOString().slice(0, 10);

/**
 * The 365 calendar days ending on `endingDayKey` (default: today's UTC day, the API's bucket),
 * grouped by month: [{ year, month, days: [Date | null] }]. Each Date is that calendar day built
 * from its parts, so dayKey(date) (dateRangeModel) gives back the API's key in every time zone (the browser's zone
 * never shifts the window or the cells). The first month is padded with nulls so its first day
 * sits on its weekday row.
 */
export function rollingYearMonths(endingDayKey, now = new Date()) {
  const end = parseDayKey(endingDayKey) || parseDayKey(utcTodayKey(now));
  const months = new Map();
  for (let offset = 364; offset >= 0; offset -= 1) {
    // Built from parts (not by adding days to a timestamp) so a DST change can never skip or repeat a day.
    const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - offset);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (!months.has(key)) months.set(key, { year: date.getFullYear(), month: date.getMonth(), days: [] });
    months.get(key).days.push(date);
  }
  const list = [...months.values()];
  if (list.length) list[0].days = [...Array(list[0].days[0].getDay()).fill(null), ...list[0].days];
  return list;
}
