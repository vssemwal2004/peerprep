import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertCircle, BellRing, BookOpen, CalendarClock, CalendarDays, CheckCircle2, ClipboardList, Code2,
  Gauge, MessageSquare, Plus, RefreshCw, Sparkles, Trophy, UserPlus, Users,
} from 'lucide-react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { ActivityTrendChart, BandChart, BarRows, DonutChart } from './charts';
import { CardHeader, CardLink, Delta, EmptyHint, Glass, KpiTile, MiniStat, OverviewShell, ProgressBar, SkeletonRows, ToneDot } from './ui';
import {
  MODULE_META, dailyTotals, formatNumber, greeting, linksFor, pendingRows, percent, relativeTime, sum, trendSeries, weekChange, whenLabel,
} from './overviewModel';

const REFRESH_MS = 5 * 60_000;

function useOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.overviewInsights());
    } catch (failure) {
      setError(failure?.message || 'The overview could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);
  return { data, loading, error, reload: load };
}

export function TodayRow({ label, color, today, yesterday }) {
  const change = yesterday ? Math.round(((today - yesterday) / yesterday) * 100) : (today ? null : 0);
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="flex min-w-0 items-center gap-2 text-xs text-slate-600 dark:text-slate-300"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} /><span className="truncate">{label}</span></span>
      <span className="flex items-center gap-3">
        <span className="text-sm font-semibold tabular-nums text-slate-950 dark:text-white">{formatNumber(today)}</span>
        <span className="w-[74px] text-right"><Delta value={change} suffix="" /></span>
      </span>
    </li>
  );
}

export function CodingPanel({ coding, links }) {
  const missed = Math.max(0, coding.attempts - coding.accepted);
  const difficultyColor = { easy: '#10b981', medium: '#f59e0b', hard: '#e11d48' };
  return (
    <Glass className="p-5">
      <CardHeader title="Coding practice" subtitle="Practice submissions, last 14 days" Icon={Code2} action={<CardLink to={links.coding}>Analysis</CardLink>} />
      <DonutChart
        centre={coding.acceptanceRate == null ? '—' : `${Math.round(coding.acceptanceRate)}%`}
        caption="accepted"
        slices={[{ label: 'Accepted', value: coding.accepted, color: MODULE_META.coding.color }, { label: 'Not accepted', value: missed, color: '#cbd5e1' }]}
      />
      <div className="mt-5">
        <BarRows rows={coding.byDifficulty.map((row) => ({
          label: row.difficulty[0].toUpperCase() + row.difficulty.slice(1),
          value: row.attempts,
          color: difficultyColor[row.difficulty],
          hint: `${formatNumber(row.accepted)} / ${formatNumber(row.attempts)} accepted`,
        }))} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniStat label="Active coders · 7 days" value={formatNumber(coding.activeCoders)} />
        <MiniStat label="Problems available" value={formatNumber(coding.problems)} />
      </div>
    </Glass>
  );
}

export function AssessmentPanel({ assessments, links }) {
  const labels = ['0–25', '26–50', '51–75', '76–90', '91–100'];
  return (
    <Glass className="p-5">
      <CardHeader title="Assessments" subtitle={`${formatNumber(assessments.submissions)} submissions, last 14 days`} Icon={ClipboardList} action={<CardLink to={links.reports}>Reports</CardLink>} />
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Live now" value={assessments.live} tone="text-emerald-600 dark:text-emerald-300" />
        <MiniStat label="Upcoming" value={assessments.upcoming} />
        <MiniStat label="Drafts" value={assessments.drafts} tone="text-amber-600 dark:text-amber-300" />
      </div>
      <p className="mb-1 mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Score distribution (% of marks)</span>
        <span className="font-semibold text-slate-900 dark:text-white">{assessments.averageScore == null ? 'No results yet' : `${Math.round(assessments.averageScore)}% average`}</span>
      </p>
      <BandChart bars={assessments.scoreBands.map((value, index) => ({ label: labels[index], value }))} color={MODULE_META.assessments.color} unit="submissions" height={150} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniStat label="Taking a test now" value={formatNumber(assessments.inProgress)} />
        <MiniStat label="Integrity flags · 14 days" value={formatNumber(assessments.flagged)} tone={assessments.flagged ? 'text-rose-600 dark:text-rose-300' : undefined} />
      </div>
    </Glass>
  );
}

export function InterviewPanel({ mock, ai, links }) {
  return (
    <Glass className="p-5">
      <CardHeader title="Interviews" subtitle={mock ? 'Mock interview pairs and feedback' : 'AI interviews, last 14 days'} Icon={MessageSquare} action={<CardLink to={mock ? links.interviews : links.aiInterviews}>Open</CardLink>} />
      {mock ? (
        <>
          <DonutChart
            centre={formatNumber(mock.pairs.pending + mock.pairs.scheduled + mock.pairs.completed)}
            caption="pairs"
            slices={[
              { label: 'Waiting for a time', value: mock.pairs.pending, color: '#f59e0b' },
              { label: 'Scheduled', value: mock.pairs.scheduled, color: '#0284c7' },
              { label: 'Completed', value: mock.pairs.completed, color: '#10b981' },
            ]}
          />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MiniStat label="Upcoming events" value={mock.upcoming} />
            <MiniStat label="Live now" value={mock.live} tone="text-emerald-600 dark:text-emerald-300" />
            <MiniStat label="Feedback · 14 days" value={formatNumber(mock.feedback)} />
            <MiniStat label="Average feedback" value={mock.averageFeedback == null ? '—' : `${Math.round(mock.averageFeedback)}%`} />
          </div>
        </>
      ) : null}
      {ai ? <div className={mock ? 'mt-2' : ''}><MiniStat label="AI interviews completed · 14 days" value={formatNumber(ai.completed)} /></div> : null}
    </Glass>
  );
}

export function LearningPanel({ learning, students, links }) {
  const share = percent(learning.activeLearners, students);
  return (
    <Glass className="p-5">
      <CardHeader title="Learning" subtitle="Topics and lessons" Icon={BookOpen} action={<CardLink to={links.learning}>Manage</CardLink>} />
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Topics completed · 14 days" value={formatNumber(learning.topicsCompleted)} tone="text-emerald-600 dark:text-emerald-300" />
        <MiniStat label="Active learners · 7 days" value={formatNumber(learning.activeLearners)} />
      </div>
      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-xs text-slate-500 dark:text-slate-400"><span>Students learning this week</span><span className="font-semibold text-slate-900 dark:text-white">{share}%</span></div>
        <ProgressBar value={share} color={MODULE_META.learning.color} label="Students learning this week" />
      </div>
    </Glass>
  );
}

export default function OverviewDashboard({ role = 'admin', allowPath = () => true, can = () => true }) {
  const { user } = useAuth();
  const { data, loading, error, reload } = useOverview();
  const links = useMemo(() => {
    const base = linksFor(role);
    return Object.fromEntries(Object.entries(base).map(([key, value]) => [key, typeof value === 'string' && !allowPath(value) ? null : value]));
  }, [role, allowPath]);

  const view = useMemo(() => {
    if (!data) return null;
    const series = trendSeries(data);
    const trend = data.trend || [];
    const totals = dailyTotals(trend, series).map((row) => row.total);
    const today = trend.at(-1) || {};
    const yesterday = trend.at(-2) || {};
    return { series, trend, totals, today, yesterday, pending: pendingRows(data.pending, links) };
  }, [data, links]);

  const firstName = user?.name?.split(' ')[0] || (role === 'admin' ? 'Admin' : 'Coordinator');
  const people = data?.people || {};
  const showSkeleton = loading && !data;

  const actions = [
    can('coordinator.students.create') && links.onboarding && { label: 'Add students', to: links.onboarding, Icon: UserPlus },
    data?.assessments && can('coordinator.assessment.create') && links.assessmentCreate && { label: 'New assessment', to: links.assessmentCreate, Icon: Plus, primary: true },
    data?.mockInterviews && can('coordinator.interviews.create') && links.interviewCreate && { label: 'New interview', to: links.interviewCreate, Icon: CalendarDays },
  ].filter(Boolean);

  const kpis = data ? [
    data.access?.students && { label: data.ownScope ? 'My students' : 'Students', value: formatNumber(people.students), helper: `+${formatNumber(people.newStudents)} joined in 30 days`, Icon: Users, color: '#0284c7', to: links.students },
    { label: 'Active this week', value: formatNumber(people.activeWeek), helper: `${percent(people.activeWeek, people.students)}% of students · ${formatNumber(people.activeToday)} today`, Icon: Activity, color: '#10b981', trend: view.totals, delta: weekChange(view.totals) },
    data.prepScore && { label: 'Average Prep Score', value: data.prepScore.average == null ? '—' : data.prepScore.average, helper: `${formatNumber(data.prepScore.scored)} students scored`, Icon: Gauge, color: '#0ea5e9', to: links.analysis },
    data.coding && { label: 'Coding acceptance', value: data.coding.acceptanceRate == null ? '—' : `${Math.round(data.coding.acceptanceRate)}%`, helper: `${formatNumber(data.coding.attempts)} submissions · 14 days`, Icon: Code2, color: MODULE_META.coding.color, trend: view.trend.map((row) => row.coding), delta: weekChange(view.trend.map((row) => row.coding)), to: links.coding },
    data.assessments && { label: 'Assessment average', value: data.assessments.averageScore == null ? '—' : `${Math.round(data.assessments.averageScore)}%`, helper: `${formatNumber(data.assessments.submissions)} submissions · 14 days`, Icon: ClipboardList, color: MODULE_META.assessments.color, trend: view.trend.map((row) => row.assessments), delta: weekChange(view.trend.map((row) => row.assessments)), to: links.reports },
    (data.mockInterviews || data.aiInterviews) && { label: 'Interviews', value: formatNumber((data.mockInterviews?.feedback || 0) + (data.aiInterviews?.completed || 0)), helper: data.mockInterviews ? `${data.mockInterviews.upcoming} upcoming events` : 'AI interviews · 14 days', Icon: MessageSquare, color: MODULE_META.interviews.color, trend: view.trend.map((row) => row.interviews), delta: weekChange(view.trend.map((row) => row.interviews)), to: data.mockInterviews ? links.interviews : links.aiInterviews },
    data.learning && { label: 'Topics completed', value: formatNumber(data.learning.topicsCompleted), helper: `${formatNumber(data.learning.activeLearners)} active learners`, Icon: BookOpen, color: MODULE_META.learning.color, trend: view.trend.map((row) => row.learning), delta: weekChange(view.trend.map((row) => row.learning)), to: links.learning },
  ].filter(Boolean) : [];

  const modulePanels = data ? [
    data.coding && <CodingPanel key="coding" coding={data.coding} links={links} />,
    data.assessments && <AssessmentPanel key="assessments" assessments={data.assessments} links={links} />,
    (data.mockInterviews || data.aiInterviews) && <InterviewPanel key="interviews" mock={data.mockInterviews} ai={data.aiInterviews} links={links} />,
    data.learning && <LearningPanel key="learning" learning={data.learning} students={people.students} links={links} />,
  ].filter(Boolean) : [];

  const panelGrid = modulePanels.length >= 3 ? 'md:grid-cols-2 xl:grid-cols-3' : modulePanels.length === 2 ? 'md:grid-cols-2' : '';
  const kpiGrid = kpis.length >= 6 ? 'sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6' : kpis.length >= 4 ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3';

  return (
    <OverviewShell>
      <Glass as="header" className="mb-4 flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300"><Sparkles className="h-3.5 w-3.5" />{role === 'admin' ? 'University overview' : 'Coordinator overview'}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{greeting()}, {firstName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {data?.ownScope ? <span className="rounded-full bg-slate-900/[0.05] px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">Your assigned students</span> : null}
            {view?.series.map((key) => <span key={key} className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${MODULE_META[key].soft}`}>{MODULE_META[key].label}</span>)}
            <span className="text-[11px] text-slate-400">{data ? `Updated ${relativeTime(data.generatedAt)}` : 'Loading…'}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions.map(({ label, to, Icon, primary }) => (
            <Link key={label} to={to} className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition ${primary ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/20 hover:bg-sky-700' : 'border border-slate-200 bg-white/80 text-slate-700 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10'}`}>
              <Icon className="h-4 w-4" />{label}
            </Link>
          ))}
          <button type="button" onClick={reload} aria-label="Refresh overview" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </Glass>

      {error ? <div className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div> : null}
      {data?.partial?.length ? <div className="mb-4 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"><AlertCircle className="h-4 w-4 shrink-0" />Some figures could not be loaded ({data.partial.join(', ')}). The rest are current.</div> : null}

      <div className={`grid gap-3 ${showSkeleton ? 'sm:grid-cols-2 xl:grid-cols-4' : kpiGrid}`}>
        {showSkeleton
          ? [1, 2, 3, 4].map((key) => <KpiTile key={key} label="" loading />)
          : kpis.map((kpi) => <KpiTile key={kpi.label} {...kpi} />)}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Glass className="p-5 xl:col-span-8">
          <CardHeader title="Engagement trend" subtitle="Daily student actions per module, last 14 days" Icon={Activity} action={data?.access?.activity ? <CardLink to={links.activity}>Activity log</CardLink> : null} />
          {showSkeleton ? <div className="h-[260px] animate-pulse rounded-xl bg-slate-200/60 dark:bg-white/[0.05]" />
            : view.series.length ? <ActivityTrendChart data={view.trend} series={view.series} />
              : <EmptyHint>No modules are enabled for this account yet. Ask your administrator to grant access.</EmptyHint>}
        </Glass>

        <div className="grid gap-4 xl:col-span-4">
          <Glass className="p-5">
            <CardHeader title="Today at a glance" subtitle="Compared with yesterday" Icon={CalendarClock} />
            {showSkeleton ? <SkeletonRows rows={3} /> : (
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {view.series.map((key) => <TodayRow key={key} label={MODULE_META[key].label} color={MODULE_META[key].color} today={view.today[key] || 0} yesterday={view.yesterday[key] || 0} />)}
                <TodayRow label="Student sign-ins" color={MODULE_META.logins.color} today={view.today.logins || 0} yesterday={view.yesterday.logins || 0} />
              </ul>
            )}
          </Glass>
          <Glass className="p-5">
            <CardHeader title="Needs attention" subtitle="Open items you can act on" Icon={BellRing} />
            {showSkeleton ? <SkeletonRows rows={3} /> : view.pending.length ? (
              <ul className="space-y-1.5">
                {view.pending.map((item) => (
                  <li key={item.key}>
                    <Link to={item.to} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs text-slate-700 transition hover:bg-slate-900/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.05]">
                      <ToneDot tone={item.tone} /><span className="min-w-0 flex-1">{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-3 text-xs font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />Nothing is waiting on you right now.</div>}
          </Glass>
        </div>
      </div>

      {modulePanels.length ? <div className={`mt-4 grid gap-4 ${panelGrid}`}>{modulePanels}</div> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {(data?.assessments || data?.mockInterviews || showSkeleton) ? (
          <Glass className="p-5">
            <CardHeader title="Upcoming schedule" subtitle="Assessments and interview events" Icon={CalendarDays} />
            {showSkeleton ? <SkeletonRows /> : data.upcoming?.length ? (
              <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-slate-200 dark:before:bg-white/10">
                {data.upcoming.map((item) => {
                  const to = item.type === 'interview' ? links.event(item.id) : links.assessments;
                  const color = item.type === 'interview' ? MODULE_META.interviews.color : MODULE_META.assessments.color;
                  return (
                    <li key={`${item.type}-${item.id}`} className="relative pl-6">
                      <span className="absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full ring-4 ring-white dark:ring-slate-900" style={{ backgroundColor: color }} />
                      <Link to={to} className="block rounded-lg transition hover:text-sky-700 dark:hover:text-sky-300">
                        <span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">{item.title}</span>
                        <span className={`text-[11px] ${item.live ? 'font-semibold text-emerald-600 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}>{item.type === 'interview' ? 'Interview' : 'Assessment'} · {whenLabel(item)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            ) : <EmptyHint>Nothing scheduled.</EmptyHint>}
          </Glass>
        ) : null}

        {data?.prepScore && data.access?.students ? (
          <Glass className="p-5">
            <CardHeader title="Top students" subtitle="By current Prep Score" Icon={Trophy} action={<CardLink to={links.analysis}>Prep analysis</CardLink>} />
            {data.prepScore.top.length ? (
              <ol className="space-y-1">
                {data.prepScore.top.map((student, index) => (
                  <li key={student.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${index === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200' : 'bg-slate-900/[0.05] text-slate-600 dark:bg-white/[0.06] dark:text-slate-300'}`}>{index + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">{student.name}</span><span className="block truncate text-[11px] text-slate-500">{student.rollNumber}</span></span>
                    <span className="text-sm font-semibold tabular-nums text-sky-700 dark:text-sky-300">{student.score}</span>
                  </li>
                ))}
              </ol>
            ) : <EmptyHint>No Prep Scores yet.</EmptyHint>}
          </Glass>
        ) : null}

        {data?.access?.activity || showSkeleton ? (
          <Glass className="p-5">
            <CardHeader title="Recent activity" subtitle={role === 'admin' ? 'Changes by admins and coordinators' : 'Your latest changes'} Icon={Activity} action={<CardLink to={links.activity}>All activity</CardLink>} />
            {showSkeleton ? <SkeletonRows /> : data.recent?.length ? (
              <ul className="space-y-2.5">
                {data.recent.map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[10px] font-bold uppercase text-sky-700 dark:bg-sky-400/10 dark:text-sky-200">{(entry.actor || '?').slice(0, 2)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-xs text-slate-800 dark:text-slate-100">{entry.title}</span>
                      <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{entry.actor}{entry.at ? ` · ${relativeTime(entry.at)}` : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <EmptyHint>No recent changes.</EmptyHint>}
          </Glass>
        ) : null}
      </div>
      {data ? <p className="mt-4 text-center text-[11px] text-slate-400">Totals: {formatNumber(sum(view.trend, 'logins'))} sign-ins in 14 days · refreshed automatically every 5 minutes</p> : null}
    </OverviewShell>
  );
}
