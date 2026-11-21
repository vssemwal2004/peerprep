import { Award, CalendarCheck2, Code2, ListChecks, LogIn, MoonStar, Trophy, XCircle } from 'lucide-react';

// What each kind of Prep Score change is called and how it looks (history graph, breakdown, popups).
export const POINT_KINDS = {
  solve: { label: 'Problems solved', short: 'Solves', Icon: Code2, tone: 'emerald', hint: 'By difficulty, shared across each problem’s topics' },
  challenge: { label: 'Daily challenges', short: 'Challenge', Icon: CalendarCheck2, tone: 'violet', hint: 'Finish today’s daily challenge' },
  login: { label: 'Daily logins', short: 'Login', Icon: LogIn, tone: 'sky', hint: 'First visit of the day' },
  sheet: { label: 'Sheets completed', short: 'Sheet', Icon: ListChecks, tone: 'teal', hint: 'Finish every question in a Quick Prep sheet' },
  badge: { label: 'Monthly badge levels', short: 'Badge', Icon: Award, tone: 'amber', hint: 'Each monthly badge level you reach' },
  milestone: { label: 'Lifetime badges', short: 'Milestone', Icon: Trophy, tone: 'amber', hint: 'Big all-time milestones' },
  wrong: { label: 'Wrong answers', short: 'Wrong', Icon: XCircle, tone: 'rose', hint: 'Given back if you solve that problem the same day' },
  inactive: { label: 'Days without practice', short: 'Inactive', Icon: MoonStar, tone: 'rose', hint: 'After a few free days without a submission (capped per month)' },
};

export const GAIN_KINDS = ['solve', 'challenge', 'login', 'sheet', 'badge', 'milestone'];
export const LOSS_KINDS = ['wrong', 'inactive'];

export const TONE_CLASSES = {
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20',
  sky: 'bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20',
  teal: 'bg-teal-50 text-teal-600 ring-teal-100 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/20',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  rose: 'bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20',
};

export const signed = (value) => {
  // Prep Score changes are small (growth curve), so two decimals.
  const number = Math.round((Number(value) || 0) * 100) / 100;
  return `${number > 0 ? '+' : number < 0 ? '−' : ''}${Math.abs(number)}`;
};

const DAY_MS = 86_400_000;
const shift = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * Every day from `from` (or the first event) to `to`, carrying the running total over quiet days:
 * [{ day, total, gained, lost, net, byKind }].
 */
export function fillDays(history) {
  if (!history) return [];
  const byDay = new Map((history.series || []).map((row) => [row.day, row]));
  const first = history.from || history.series?.[0]?.day || history.to;
  if (!first || !history.to) return [];
  const days = [];
  let total = Number(history.startTotal) || 0;
  for (let day = first; day <= history.to; day = shift(day, 1)) {
    const row = byDay.get(day);
    if (row) total = row.total;
    days.push({ day, total, gained: row?.gained || 0, lost: row?.lost || 0, net: row?.net || 0, byKind: row?.byKind || {} });
    if (days.length > 4000) break;
  }
  return days;
}

export const dayLabel = (day, withYear = false) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
