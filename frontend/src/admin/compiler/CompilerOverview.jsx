import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, CheckCircle2, FileCode2, Users } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import { formatPercent } from './compilerUtils';
import { LoadingPanel, SectionCard, StatCard } from './CompilerUi';

function ChartTooltip({ children }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-0 z-10 hidden -translate-x-1/2 -translate-y-[105%] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-xl group-hover:block dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
      {children}
    </div>
  );
}

function LineTrendChart({ data = [] }) {
  const safe = data.length ? data : [{ date: '', count: 0 }];
  const max = Math.max(...safe.map((item) => item.count || 0), 1);
  const points = safe.map((item, index) => {
    const x = safe.length === 1 ? 0 : (index / (safe.length - 1)) * 100;
    const y = 100 - ((item.count || 0) / max) * 100;
    return `${x},${y}`;
  }).join(' ');
  const peak = safe.reduce((best, item) => (item.count || 0) > (best.count || 0) ? item : best, safe[0]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-900/60">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Peak Day</p>
          <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{peak.date || '-'}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-900/60">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Peak Volume</p>
          <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{peak.count || 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-900/60">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Trend Window</p>
          <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">Last 30 days</p>
        </div>
      </div>
      <div className="space-y-3">
        <svg viewBox="0 0 100 100" className="h-64 w-full overflow-visible rounded-2xl bg-slate-50 p-4 dark:bg-gray-900/60">
          <polyline fill="none" stroke="url(#overviewTrendLine)" strokeWidth="2.5" points={points} vectorEffect="non-scaling-stroke" />
          <defs>
            <linearGradient id="overviewTrendLine" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
          </defs>
        </svg>
        <div className="grid grid-cols-5 gap-2 text-[11px] text-slate-500 dark:text-gray-400">
          {safe.slice(-5).map((item, index) => <span key={`${item.date}-${index}`}>{item.date ? item.date.slice(5) : '-'}</span>)}
        </div>
      </div>
    </div>
  );
}

function HorizontalBarChart({ items = [], labelKey = 'title', valueKey = 'attempts', accent = 'from-sky-500 to-cyan-300', formatter = (value) => value, tooltip = () => '', emptyLabel = 'No data available.' }) {
  const max = Math.max(...items.map((item) => item[valueKey] || 0), 1);
  if (!items.length) return <p className="text-sm text-slate-500 dark:text-gray-400">{emptyLabel}</p>;

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const value = item[valueKey] || 0;
        const width = (value / max) * 100;
        const label = item[labelKey] || item.name || `Item ${index + 1}`;
        return (
          <div key={`${label}-${index}`} className="group relative rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
            <ChartTooltip>{tooltip(item)}</ChartTooltip>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-800 dark:text-gray-100">{label}</span>
              <span className="font-semibold text-slate-500 dark:text-gray-300">{formatter(value)}</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 dark:bg-gray-800">
              <div className={`h-2.5 rounded-full bg-gradient-to-r ${accent}`} style={{ width: `${Math.max(width, value ? 8 : 0)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VerticalLeaderboardChart({ items = [] }) {
  const max = Math.max(...items.map((item) => item.problemsSolved || 0), 1);
  if (!items.length) return <p className="text-sm text-slate-500 dark:text-gray-400">No solver data available.</p>;

  return (
    <div className="space-y-4">
      <div className="flex h-72 items-end gap-3">
        {items.map((item) => {
          const solvedHeight = Math.max(((item.problemsSolved || 0) / max) * 100, item.problemsSolved ? 12 : 0);
          const easy = item.easySolved || 0;
          const medium = item.mediumSolved || 0;
          const hard = item.hardSolved || 0;
          const total = Math.max(easy + medium + hard, 1);
          return (
            <div key={item.studentId} className="group relative flex flex-1 flex-col items-center gap-2">
              <ChartTooltip>{`${item.name} | ${item.problemsSolved} solved | Easy ${easy}, Medium ${medium}, Hard ${hard}`}</ChartTooltip>
              <span className="text-xs font-medium text-slate-500 dark:text-gray-400">{item.problemsSolved}</span>
              <div className="flex h-56 w-full items-end rounded-2xl bg-slate-100 p-2 dark:bg-gray-900/60">
                <div className="flex w-full flex-col overflow-hidden rounded-xl" style={{ height: `${solvedHeight}%` }}>
                  <div className="bg-emerald-500" style={{ height: `${(easy / total) * 100}%` }} />
                  <div className="bg-amber-500" style={{ height: `${(medium / total) * 100}%` }} />
                  <div className="bg-rose-500" style={{ height: `${(hard / total) * 100}%` }} />
                </div>
              </div>
              <span className="w-full truncate text-center text-[11px] text-slate-600 dark:text-gray-300">{item.name}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Easy</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Medium</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" />Hard</span>
      </div>
    </div>
  );
}

function AreaGrowthChart({ data = [] }) {
  const safe = data.length ? data : [{ date: '', count: 0 }];
  const max = Math.max(...safe.map((item) => item.count || 0), 1);
  const points = safe.map((item, index) => {
    const x = safe.length === 1 ? 0 : (index / (safe.length - 1)) * 100;
    const y = 100 - ((item.count || 0) / max) * 100;
    return `${x},${y}`;
  }).join(' ');
  const polygon = `0,100 ${points} 100,100`;

  return (
    <div className="space-y-3">
      <svg viewBox="0 0 100 100" className="h-64 w-full overflow-visible rounded-2xl bg-slate-50 p-4 dark:bg-gray-900/60">
        <polygon fill="url(#problemGrowthFill)" points={polygon} />
        <polyline fill="none" stroke="#0ea5e9" strokeWidth="2.4" points={points} vectorEffect="non-scaling-stroke" />
        <defs>
          <linearGradient id="problemGrowthFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(14,165,233,0.45)" />
            <stop offset="100%" stopColor="rgba(14,165,233,0.04)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="grid grid-cols-5 gap-2 text-[11px] text-slate-500 dark:text-gray-400">
        {safe.slice(-5).map((item, index) => <span key={`${item.date}-${index}`}>{item.date ? item.date.slice(5) : '-'}</span>)}
      </div>
    </div>
  );
}

function SubmissionInsightsPanel({ cells = [] }) {
  if (!cells.length) {
    return <p className="text-sm text-slate-500 dark:text-gray-400">No submission pattern data available yet.</p>;
  }

  const hourMap = new Map();
  const dayMap = new Map([
    [1, { label: 'Sun', count: 0 }],
    [2, { label: 'Mon', count: 0 }],
    [3, { label: 'Tue', count: 0 }],
    [4, { label: 'Wed', count: 0 }],
    [5, { label: 'Thu', count: 0 }],
    [6, { label: 'Fri', count: 0 }],
    [7, { label: 'Sat', count: 0 }],
  ]);

  cells.forEach((cell) => {
    hourMap.set(cell.hour, (hourMap.get(cell.hour) || 0) + (cell.count || 0));
    if (dayMap.has(cell.day)) {
      dayMap.get(cell.day).count += cell.count || 0;
    }
  });

  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: hourMap.get(hour) || 0,
  }));
  const weekdays = Array.from(dayMap.entries()).map(([, value]) => value);
  const peakHour = hourly.reduce((best, item) => item.count > best.count ? item : best, hourly[0]);
  const peakDay = weekdays.reduce((best, item) => item.count > best.count ? item : best, weekdays[0]);
  const hourlyMax = Math.max(...hourly.map((item) => item.count), 1);
  const weekdayMax = Math.max(...weekdays.map((item) => item.count), 1);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-900/60">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Peak Hour</p>
          <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{String(peakHour.hour).padStart(2, '0')}:00</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{peakHour.count} submissions</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-900/60">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Peak Day</p>
          <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{peakDay.label}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{peakDay.count} submissions</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-900/60">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Coverage</p>
          <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{hourly.filter((item) => item.count > 0).length} active hours</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">within the tracked window</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-900/60">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Active Hours</p>
            <p className="text-xs text-slate-500 dark:text-gray-400">Submissions by hour</p>
          </div>
          <div className="flex h-52 items-end gap-1.5">
            {hourly.map((item) => (
              <div key={item.hour} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-2">
                <ChartTooltip>{`${String(item.hour).padStart(2, '0')}:00 | ${item.count} submissions`}</ChartTooltip>
                <div className="w-full rounded-t-lg bg-gradient-to-t from-sky-500 to-sky-300" style={{ height: `${Math.max(((item.count || 0) / hourlyMax) * 100, item.count ? 8 : 2)}%` }} />
                <span className="text-[10px] text-slate-400 dark:text-gray-500">{item.hour}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-900/60">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Weekday Pattern</p>
            <p className="text-xs text-slate-500 dark:text-gray-400">Submission spread</p>
          </div>
          <div className="space-y-3">
            {weekdays.map((item) => (
              <div key={item.label} className="group relative">
                <ChartTooltip>{`${item.label} | ${item.count} submissions`}</ChartTooltip>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-700 dark:text-gray-200">{item.label}</span>
                  <span className="text-slate-500 dark:text-gray-400">{item.count}</span>
                </div>
                <div className="h-2.5 rounded-full bg-white dark:bg-gray-800">
                  <div className="h-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-lime-300" style={{ width: `${Math.max((item.count / weekdayMax) * 100, item.count ? 8 : 0)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CompilerOverview() {
  const toast = useToast();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [solverWindow, setSolverWindow] = useState('overall');

  useEffect(() => {
    let isMounted = true;
    const loadOverview = async () => {
      try {
        setLoading(true);
        const response = await api.getCompilerOverview();
        if (isMounted) setOverview(response);
      } catch (error) {
        toast.error(error.message || 'Failed to load compiler overview.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadOverview();
    return () => {
      isMounted = false;
    };
  }, [toast]);

  const topSolvers = useMemo(() => overview?.charts?.topSolversByWindow?.[solverWindow] || [], [overview, solverWindow]);

  if (loading) return <LoadingPanel label="Loading compiler overview..." />;

  const summary = overview?.summary || {};
  const topPerformers = overview?.topPerformers || {};
  const problemEngagement = overview?.problemEngagement || {};
  const charts = overview?.charts || {};

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total Students" value={summary.totalStudents || 0} helper="Admin-added students only" Icon={Users} />
        <StatCard label="Total Problems" value={summary.totalProblems || 0} helper="Published and draft problems" Icon={FileCode2} />
        <StatCard label="Total Submissions" value={summary.totalSubmissions || 0} helper="Controlled judge activity" Icon={Activity} />
        <StatCard label="Active Students" value={summary.activeStudentsLast7Days || 0} helper="Active in last 7 days" Icon={CheckCircle2} />
        <StatCard label="Acceptance Rate" value={formatPercent(summary.overallAcceptanceRate || 0)} helper="Across all controlled submissions" Icon={BarChart3} />
      </div>

      <SectionCard title="Activity & Submission Trends" subtitle="Time-series visibility into submission spikes, engagement patterns, and active windows.">
        <LineTrendChart data={charts.submissionsOverTime || []} />
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Most Attempted Problems" subtitle="Top problems by submission volume across the controlled student base.">
          <HorizontalBarChart items={problemEngagement.mostAttempted || []} formatter={(value) => `${value} attempts`} tooltip={(item) => `${item.title} | ${item.difficulty} | ${item.attempts} attempts`} />
        </SectionCard>
        <SectionCard title="Least Attempted Problems" subtitle="Low-frequency problems that may be ignored, too hard, or need stronger promotion.">
          <HorizontalBarChart items={problemEngagement.leastAttempted || []} accent="from-slate-500 to-slate-300" formatter={(value) => `${value} attempts`} tooltip={(item) => `${item.title} | ${item.difficulty} | ${item.attempts} attempts`} />
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Top Solvers" subtitle="Leaderboard-style view of students solving the most problems.">
          <div className="mb-4 flex items-center gap-2">
            {['daily', 'weekly', 'overall'].map((window) => (
              <button key={window} type="button" onClick={() => setSolverWindow(window)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${solverWindow === window ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700'}`}>
                {window}
              </button>
            ))}
          </div>
          {solverWindow === 'overall' ? (
            <VerticalLeaderboardChart items={charts.topSolversDetailed || []} />
          ) : (
            <HorizontalBarChart items={topSolvers} labelKey="name" valueKey="problemsSolved" accent="from-emerald-500 to-lime-300" formatter={(value) => `${value} solved`} tooltip={(item) => `${item.name} | ${item.problemsSolved} solved | ${item.attempts} attempts`} />
          )}
        </SectionCard>

        <SectionCard title="Best Acceptance Rate" subtitle="Ranked accuracy view with minimum-attempt filtering to reduce noise.">
          <HorizontalBarChart items={topPerformers.bestAcceptanceRate || []} labelKey="name" valueKey="acceptanceRate" accent="from-amber-500 to-yellow-300" formatter={(value) => `${Number(value || 0).toFixed(1)}%`} tooltip={(item) => `${item.name} | ${Number(item.acceptanceRate || 0).toFixed(1)}% acceptance | ${item.attempts} attempts`} />
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <SectionCard title="Submission Insights" subtitle="Cleaner visibility into when students submit, without the oversized yearly heatmap.">
          <SubmissionInsightsPanel cells={charts.activityHeatmap || []} />
        </SectionCard>

        <SectionCard title="Recently Added Problems" subtitle="Catalog growth over time to track authoring momentum.">
          <AreaGrowthChart data={charts.problemGrowthTrend || []} />
        </SectionCard>
      </div>
    </div>
  );
}
