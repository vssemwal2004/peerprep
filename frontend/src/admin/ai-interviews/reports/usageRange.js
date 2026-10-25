// Date ranges for the usage report. The backend reads YYYY-MM-DD as whole IST days (`to` inclusive)
// and keeps usage for 180 days, so a longer range is refused.
export const USAGE_MAX_DAYS = 180;
const DAY_MS = 24 * 60 * 60_000;

// Today's calendar date in India.
export const istDate = (at = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

const shift = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// The last `days` IST days, today included.
export const presetRange = (days, today = istDate()) => ({ from: shift(today, -(days - 1)), to: today });

// An error message for a custom range, or "" when it can be requested.
export function rangeError({ from, to }) {
  if (!from || !to) return "Choose both a start and an end date.";
  if (from > to) return "The start date must be on or before the end date.";
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (days > USAGE_MAX_DAYS) return `Choose at most ${USAGE_MAX_DAYS} days. Older usage is not kept.`;
  return "";
}
