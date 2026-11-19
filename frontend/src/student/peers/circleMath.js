// Plain helpers and constants for the Prep Mates pages (kept out of component files).

export const PERIODS = [
  { key: 'week', label: 'This week', phrase: 'this week' },
  { key: 'month', label: 'This month', phrase: 'this month' },
  { key: 'all', label: 'All time', phrase: 'in total' },
];

// After YOU (sky) and YOUR PREP MATE (amber): up to two circle leaders, teal then purple (fixed order,
// validated with the other two on the light and dark card surfaces).
export const OTHER_COLORS = ['#0d9488', '#a855f7'];

/** Page numbers around the current page: 1 … 4 5 6 … 84 (gaps as 'gap-N' strings). */
export function pageWindow(page, pages) {
  const set = new Set([1, pages, page - 1, page, page + 1].filter((value) => value >= 1 && value <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out = [];
  sorted.forEach((value, index) => {
    if (index && value - sorted[index - 1] > 1) out.push(`gap-${value}`);
    out.push(value);
  });
  return out;
}

/** Per-week values, or the all-time running total at the end of each week ("total so far"). */
export function seriesValues(weekly = [], total = 0, mode = 'week') {
  if (mode !== 'total') return weekly.map((week) => week.solved || 0);
  let after = 0;
  const values = new Array(weekly.length);
  for (let index = weekly.length - 1; index >= 0; index -= 1) {
    values[index] = Math.max(0, total - after);
    after += weekly[index].solved || 0;
  }
  return values;
}
