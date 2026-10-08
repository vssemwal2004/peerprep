import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays } from 'lucide-react';
import ContributionCalendar from '../../components/ContributionCalendar';
import { Card } from './ui';
import { focusRing } from './format';

const TREND_DAYS = 30;

/** Last 30 UTC days (the backend buckets activity by UTC day), oldest first. */
function buildTrend(activity) {
  const today = new Date();
  return Array.from({ length: TREND_DAYS }, (_, index) => {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (TREND_DAYS - 1 - index)));
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      count: Number(activity?.[key] || 0),
      tick: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      full: date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
    };
  });
}

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <p className="text-slate-500 dark:text-zinc-400">{point.full}</p>
      <p className="font-semibold tabular-nums text-slate-900 dark:text-zinc-50">
        {point.count} {point.count === 1 ? 'activity' : 'activities'}
      </p>
    </div>
  );
}

const VIEWS = [
  { key: 'year', label: 'Year' },
  { key: 'month', label: '30 days' },
];

/** Heatmap + 30-day trend in one card. Streak figures live in Coding Progress (not repeated here). */
export default function ActivitySection({ activity, activityStats, loading }) {
  const [view, setView] = useState('year');
  const activeDays = Number(activityStats?.totalActiveDays || 0);
  const trend = useMemo(() => buildTrend(activity), [activity]);
  const trendTotal = trend.reduce((sum, point) => sum + point.count, 0);
  const yearTotal = useMemo(
    () => Object.values(activity || {}).reduce((sum, value) => sum + (Number(value) || 0), 0),
    [activity],
  );

  const toggle = (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-zinc-800" role="tablist" aria-label="Activity range">
      {VIEWS.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={view === item.key}
          onClick={() => setView(item.key)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${focusRing} ${view === item.key
            ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50'
            : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  return (
    <Card
      id="activity"
      title="Activity"
      description={view === 'year'
        ? `${yearTotal} ${yearTotal === 1 ? 'activity' : 'activities'} in the past year · ${activeDays} active ${activeDays === 1 ? 'day' : 'days'}`
        : `${trendTotal} ${trendTotal === 1 ? 'activity' : 'activities'} in the last 30 days`}
      icon={<CalendarDays className="h-4 w-4" />}
      action={toggle}
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500 dark:text-zinc-400" role="status">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" aria-hidden="true" />
          Loading activity...
        </div>
      ) : view === 'year' ? (
        <ContributionCalendar
          title=""
          activity={activity}
          stats={null}
          tooltipFormatter={({ value, formattedDate }) => `${value} tracked activities on ${formattedDate}`}
          legendLabels={{
            none: 'No submissions',
            low: '1-2 submissions',
            medium: '3-4 submissions',
            high: '5-7 submissions',
            highest: '8+ submissions',
          }}
        />
      ) : (
        <div className="h-40 w-full" role="img" aria-label={`Daily activity for the last 30 days, ${trendTotal} total`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} margin={{ top: 4, right: 0, bottom: 0, left: -28 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke="currentColor" className="text-slate-100 dark:text-zinc-800" />
              <XAxis dataKey="tick" interval={6} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} width={36} />
              <Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(14,165,233,0.08)' }} />
              <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
