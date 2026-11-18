// The daily heat map's grid and figures: weeks (Monday first) of days from `from` to `to`, month
// labels, a 0–4 level per day, and the numbers shown beside the grid. data: calendarPayload().

const DAY_MS = 86_400_000;
const timeOf = (day) => Date.parse(`${day}T00:00:00Z`);
const dayOf = (time) => new Date(time).toISOString().slice(0, 10);
const monthOf = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });

export function heatmapModel(data) {
  const counts = new Map((data?.days || []).map(([day, value]) => [day, Number(value) || 0]));
  if (!data?.from || !data?.to) return null;
  const from = timeOf(data.from);
  const to = timeOf(data.to);
  const max = Math.max(1, ...counts.values());
  // Four steps of activity; 0 is its own (empty) level.
  const step = Math.max(1, Math.ceil(max / 4));
  const levelOf = (value) => (value > 0 ? Math.min(4, Math.ceil(value / step)) : 0);

  const weeks = [];
  const firstMonday = from - ((new Date(from).getUTCDay() + 6) % 7) * DAY_MS;
  for (let start = firstMonday; start <= to; start += 7 * DAY_MS) {
    weeks.push(Array.from({ length: 7 }, (_, weekday) => {
      const time = start + weekday * DAY_MS;
      if (time < from || time > to) return null;
      const day = dayOf(time);
      const value = counts.get(day) || 0;
      return { day, value, level: levelOf(value) };
    }));
  }

  // A month's name sits over the week its 1st falls in. The first, partial month is named only
  // when there is room before the next name.
  const months = [];
  weeks.forEach((week, index) => {
    const first = week.find((cell) => cell?.day.endsWith("-01"));
    if (first) months.push({ index, label: monthOf(first.day) });
  });
  if (!months.length || months[0].index >= 3) months.unshift({ index: 0, label: monthOf(data.from) });

  // Figures for the period.
  let total = 0;
  let activeDays = 0;
  let busiest = null;
  let best = 0;
  let run = 0;
  for (let time = from; time <= to; time += DAY_MS) {
    const day = dayOf(time);
    const value = counts.get(day) || 0;
    total += value;
    if (value > 0) {
      activeDays += 1;
      run += 1;
      best = Math.max(best, run);
      if (!busiest || value > busiest.value) busiest = { day, value };
    } else run = 0;
  }
  // The current streak may end yesterday: today is not over yet.
  let current = 0;
  let time = counts.get(dayOf(to)) ? to : to - DAY_MS;
  while (time >= from && counts.get(dayOf(time))) { current += 1; time -= DAY_MS; }

  // Recent counts (last 7 and last 30 days, today included) and the last day with activity.
  const sumBetween = (start, end) => {
    let sum = 0;
    for (let day = Math.max(start, from); day <= Math.min(end, to); day += DAY_MS) sum += counts.get(dayOf(day)) || 0;
    return sum;
  };
  const last7 = sumBetween(to - 6 * DAY_MS, to);
  const last30 = sumBetween(to - 29 * DAY_MS, to);
  let lastActive = null;
  for (let day = to; day >= from; day -= DAY_MS) if (counts.get(dayOf(day))) { lastActive = dayOf(day); break; }

  return {
    weeks, months, step, max,
    legend: [0, 1, 2, 3, 4].map((level) => {
      const low = (level - 1) * step + 1;
      const high = level * step;
      return { level, label: !level ? "0" : level === 4 ? `${low}+` : low === high ? String(low) : `${low}–${high}` };
    }),
    stats: {
      total, activeDays, days: Math.round((to - from) / DAY_MS) + 1, busiest,
      currentStreak: current, bestStreak: best,
      perActiveDay: activeDays ? Math.round((total / activeDays) * 10) / 10 : 0,
      last7, last30,
      lastActive, daysSinceActive: lastActive ? Math.round((to - timeOf(lastActive)) / DAY_MS) : null,
    },
  };
}
