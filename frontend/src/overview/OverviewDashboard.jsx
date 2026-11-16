import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertCircle, BarChart3, BellRing, BookOpen, Bot, Building2, CalendarClock, CalendarDays, CheckCircle2, ClipboardList, Code2,
  Gauge, Library, Megaphone, MessageSquare, ShieldCheck, Trophy, UserCog, UserPlus, Users,
} from 'lucide-react';
import OverviewHeader from './OverviewHeader';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { ActivityTrendChart, BandChart, BarRows, DonutChart } from './charts';
import { CardHeader, CardLink, Delta, EmptyHint, Glass, KpiTile, MiniStat, OverviewShell, ProgressBar, SkeletonRows, ToneDot } from './ui';
import {
  MODULE_META, OVERVIEW_PRESETS, dailyTotals, formatNumber, greeting, linksFor, pendingRows, percent, periodPhrase, periodShort, relativeTime, sum, trendSeries, weekChange, whenLabel,
} from './overviewModel';
import DateRangeFilter from '../components/dateRange/DateRangeFilter';
import { rangeLabel, rangeToQuery } from '../components/dateRange/dateRangeModel';

const REFRESH_MS = 5 * 60_000;

function useOverview(range) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const query = JSON.stringify(rangeToQuery(range));
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.overviewInsights(JSON.parse(query)));
    } catch (failure) {
      setError(failure?.message || 'The overview could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [query]);
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

// `period` is the chosen dashboard period in words ("last 30 days"); `short` its tile form ("30 days").
export function CodingPanel({ coding, links, period = 'last 14 days' }) {
  const missed = Math.max(0, coding.attempts - coding.accepted);
  const difficultyColor = { easy: '#10b981', medium: '#f59e0b', hard: '#e11d48' };
  return (
    <Glass className="p-5">
      <CardHeader title="Coding practice" subtitle={`Practice submissions, ${period}`} Icon={Code2} action={<CardLink to={links.coding}>Analysis</CardLink>} />
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

export function AssessmentPanel({ assessments, links, period = 'last 14 days', short = '14 days' }) {
  const labels = ['0–25', '26–50', '51–75', '76–90', '91–100'];
  return (
    <Glass className="p-5">
      <CardHeader title="Assessments" subtitle={`${formatNumber(assessments.submissions)} submissions, ${period}`} Icon={ClipboardList} action={<CardLink to={links.reports}>Reports</CardLink>} />
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
        <MiniStat label={`Integrity flags · ${short}`} value={formatNumber(assessments.flagged)} tone={assessments.flagged ? 'text-rose-600 dark:text-rose-300' : undefined} />
      </div>
    </Glass>
  );
}

export function InterviewPanel({ mock, ai, links, period = 'last 14 days', short = '14 days' }) {
  return (
    <Glass className="p-5">
      <CardHeader title="Interviews" subtitle={mock ? 'Mock interview pairs and feedback' : `AI interviews, ${period}`} Icon={MessageSquare} action={<CardLink to={mock ? links.interviews : links.aiInterviews}>Open</CardLink>} />
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
            <MiniStat label={`Feedback · ${short}`} value={formatNumber(mock.feedback)} />
            <MiniStat label="Average feedback" value={mock.averageFeedback == null ? '—' : `${Math.round(mock.averageFeedback)}%`} />
          </div>
        </>
      ) : null}
      {ai ? <div className={mock ? 'mt-2' : ''}><MiniStat label={`AI interviews completed · ${short}`} value={formatNumber(ai.completed)} /></div> : null}
    </Glass>
  );
}

export function LearningPanel({ learning, students, links, short = '14 days' }) {
  const share = percent(learning.activeLearners, students);
  return (
    <Glass className="p-5">
      <CardHeader title="Learning" subtitle="Topics and lessons" Icon={BookOpen} action={<CardLink to={links.learning}>Manage</CardLink>} />
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label={`Topics completed · ${short}`} value={formatNumber(learning.topicsCompleted)} tone="text-emerald-600 dark:text-emerald-300" />
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
  const [range, setRange] = useState({ preset: '30d' });
  const { data, loading, error, reload } = useOverview(range);
  const periodLabel = rangeLabel(range);
  const period = periodPhrase(periodLabel);
  const short = periodShort(range);
  const links = useMemo(() => {
    const base = linksFor(role);
    return Object.fromEntries(Object.entries(base).map(([key, value]) => [key, typeof value === 'string' && !allowPath(value) ? null : value]));
  }, [role, allowPath]);

  const view = useMemo(() => {
    if (!data) return null;
    const series = trendSeries(data);
    const trend = data.trend || [];
    const totals = dailyTotals(trend, series).map((row) => row.total);
    // `glance` is [yesterday, today] whatever the period; older servers only send the trend.
    const glance = data.glance?.length === 2 ? data.glance : trend;
    const today = glance.at(-1) || {};
    const yesterday = glance.at(-2) || {};
    return { series, trend, totals, today, yesterday, pending: pendingRows(data.pending, links, short) };
  }, [data, links, short]);

  const firstName = user?.name?.split(' ')[0] || (role === 'admin' ? 'Admin' : 'Coordinator');
  const people = data?.people || {};
  const showSkeleton = loading && !data;

  // Header: only what this role may open (links are already limited to licensed modules).
  const isAdmin = role === 'admin';
  const allowed = (to) => Boolean(to) && allowPath(to);
  const createItems = [
    can('coordinator.students.create') && links.onboarding && { label: 'Add students', hint: 'One student or a CSV list', to: links.onboarding, Icon: UserPlus },
    data?.assessments && can('coordinator.assessment.create') && links.assessmentCreate && { label: 'New assessment', hint: 'Coding, MCQ and written tests', to: links.assessmentCreate, Icon: ClipboardList },
    data?.mockInterviews && can('coordinator.interviews.create') && links.interviewCreate && { label: 'New interview event', hint: 'Peer mock interviews', to: links.interviewCreate, Icon: CalendarDays },
    isAdmin && data?.aiInterviews && allowed('/admin/ai-interviews/new') && { label: 'New AI interview', hint: 'Practice interview with AnvI', to: '/admin/ai-interviews/new', Icon: Bot },
    (isAdmin ? allowed('/admin/announcements/add') : can('coordinator.announcements.create')) && { label: 'Announcement', hint: 'Notify students', to: isAdmin ? '/admin/announcements/add' : '/coordinator/announcements/add', Icon: Megaphone },
    isAdmin && { label: 'Add coordinator', hint: 'Give a faculty member access', to: '/admin/coordinators', Icon: UserCog },
  ].filter(Boolean);
  const shortcuts = (isAdmin ? [
    { label: 'Students', to: links.students, Icon: Users },
    { label: 'Prep Analysis', to: links.analysis, Icon: BarChart3 },
    { label: 'Assessment reports', to: links.reports, Icon: ClipboardList },
    { label: 'Question library', to: allowed('/admin/library') ? '/admin/library' : null, Icon: Library },
    { label: 'Interviews', to: links.interviews, Icon: MessageSquare },
    { label: 'Learning', to: links.learning, Icon: BookOpen },
    { label: 'Coordinators', to: links.coordinators, Icon: UserCog },
    { label: 'Activity log', to: links.activity, Icon: Activity },
    { label: 'Student access', to: allowed('/admin/settings/student-access') ? '/admin/settings/student-access' : null, Icon: ShieldCheck },
  ] : [
    can('coordinator.students.view') && { label: 'My students', to: links.students, Icon: Users },
    can('coordinator.assessment.reports') && { label: 'Assessment reports', to: links.reports, Icon: ClipboardList },
    can('coordinator.library.view') && { label: 'Question library', to: allowed('/coordinator/library') ? '/coordinator/library' : null, Icon: Library },
    can('coordinator.interviews.view') && { label: 'Interviews', to: links.interviews, Icon: MessageSquare },
    can('coordinator.learning.manage') && { label: 'Learning', to: links.learning, Icon: BookOpen },
    can('coordinator.announcements.manage') && { label: 'Announcements', to: links.announcements, Icon: Megaphone },
    can('coordinator.activity.view') && { label: 'My activity', to: links.activity, Icon: Activity },
  ]).filter((item) => item && item.to);
  const headerStats = data && view ? [
    { label: 'Need your attention', value: formatNumber(view.pending.length), hint: view.pending.length ? 'open items' : 'all clear', Icon: BellRing, tone: view.pending.length ? 'rose' : 'emerald', href: '#needs-attention' },
    (data.assessments || data.mockInterviews) && { label: 'Coming up', value: formatNumber(data.upcoming?.length || 0), hint: 'tests and interviews', Icon: CalendarDays, tone: 'amber', href: '#upcoming' },
    { label: 'Active today', value: formatNumber(people.activeToday), hint: `${percent(people.activeToday, people.students)}% of students`, Icon: Activity, tone: 'emerald' },
    data.access?.students && { label: 'Joined in 30 days', value: formatNumber(people.newStudents), hint: data.ownScope ? 'your students' : 'new students', Icon: UserPlus, tone: 'sky', to: links.students },
  ].filter(Boolean) : [];
  const canSearch = links.students && (isAdmin || can('coordinator.students.view'));

  const kpis = data ? [
    data.access?.students && { label: data.ownScope ? 'My students' : 'Students', value: formatNumber(people.students), helper: `+${formatNumber(people.newStudents)} joined in 30 days`, Icon: Users, color: '#0284c7', to: links.students },
    { label: 'Active this week', value: formatNumber(people.activeWeek), helper: `${percent(people.activeWeek, people.students)}% of students · ${formatNumber(people.activeToday)} today`, Icon: Activity, color: '#10b981', trend: view.totals, delta: weekChange(view.totals) },
    data.prepScore && { label: 'Average Prep Score', value: data.prepScore.average == null ? '—' : data.prepScore.average, helper: `${formatNumber(data.prepScore.scored)} students scored`, Icon: Gauge, color: '#0ea5e9', to: links.analysis },
    data.coding && { label: 'Coding acceptance', value: data.coding.acceptanceRate == null ? '—' : `${Math.round(data.coding.acceptanceRate)}%`, helper: `${formatNumber(data.coding.attempts)} submissions · ${short}`, Icon: Code2, color: MODULE_META.coding.color, trend: view.trend.map((row) => row.coding), delta: weekChange(view.trend.map((row) => row.coding)), to: links.coding },
    data.assessments && { label: 'Assessment average', value: data.assessments.averageScore == null ? '—' : `${Math.round(data.assessments.averageScore)}%`, helper: `${formatNumber(data.assessments.submissions)} submissions · ${short}`, Icon: ClipboardList, color: MODULE_META.assessments.color, trend: view.trend.map((row) => row.assessments), delta: weekChange(view.trend.map((row) => row.assessments)), to: links.reports },
    (data.mockInterviews || data.aiInterviews) && { label: 'Interviews', value: formatNumber((data.mockInterviews?.feedback || 0) + (data.aiInterviews?.completed || 0)), helper: data.mockInterviews ? `${data.mockInterviews.upcoming} upcoming events` : `AI interviews · ${short}`, Icon: MessageSquare, color: MODULE_META.interviews.color, trend: view.trend.map((row) => row.interviews), delta: weekChange(view.trend.map((row) => row.interviews)), to: data.mockInterviews ? links.interviews : links.aiInterviews },
    data.learning && { label: 'Topics completed', value: formatNumber(data.learning.topicsCompleted), helper: `${formatNumber(data.learning.activeLearners)} active learners`, Icon: BookOpen, color: MODULE_META.learning.color, trend: view.trend.map((row) => row.learning), delta: weekChange(view.trend.map((row) => row.learning)), to: links.learning },
  ].filter(Boolean) : [];

  const modulePanels = data ? [
    data.coding && <CodingPanel key="coding" coding={data.coding} links={links} period={period} />,
    data.assessments && <AssessmentPanel key="assessments" assessments={data.assessments} links={links} period={period} short={short} />,
    (data.mockInterviews || data.aiInterviews) && <InterviewPanel key="interviews" mock={data.mockInterviews} ai={data.aiInterviews} links={links} period={period} short={short} />,
    data.learning && <LearningPanel key="learning" learning={data.learning} students={people.students} links={links} short={short} />,
  ].filter(Boolean) : [];

  const panelGrid = modulePanels.length >= 3 ? 'md:grid-cols-2 xl:grid-cols-3' : modulePanels.length === 2 ? 'md:grid-cols-2' : '';
  const kpiGrid = kpis.length >= 6 ? 'sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6' : kpis.length >= 4 ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3';

  return (
    <OverviewShell>
      <OverviewHeader
        badge={isAdmin ? 'University Admin' : 'Coordinator'}
        BadgeIcon={isAdmin ? Building2 : UserCog}
        title={`${greeting()}, ${firstName}`}
        subtitle={isAdmin ? 'Your university at a glance: students, practice, tests and interviews' : data?.ownScope ? 'Your assigned students at a glance' : 'Your students at a glance'}
        chips={[
          ...(data?.ownScope ? [{ label: 'Your assigned students' }] : []),
          ...(view?.series || []).map((key) => ({ label: MODULE_META[key].label, className: MODULE_META[key].soft })),
        ]}
        updatedAt={data?.generatedAt}
        loading={loading}
        onRefresh={reload}
        search={canSearch ? { to: links.students, placeholder: isAdmin ? 'Search students by name, ID or email' : 'Search my students' } : null}
        createItems={createItems}
        stats={headerStats}
        shortcuts={shortcuts}
        period={<DateRangeFilter value={range} onChange={setRange} presets={OVERVIEW_PRESETS} align="right" label="Dashboard period" />}
      />

      {error ? <div className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div> : null}
      {data?.partial?.length ? <div className="mb-4 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"><AlertCircle className="h-4 w-4 shrink-0" />Some figures could not be loaded ({data.partial.join(', ')}). The rest are current.</div> : null}

      <div className={`grid gap-3 ${showSkeleton ? 'sm:grid-cols-2 xl:grid-cols-4' : kpiGrid}`}>
        {showSkeleton
          ? [1, 2, 3, 4].map((key) => <KpiTile key={key} label="" loading />)
          : kpis.map((kpi) => <KpiTile key={kpi.label} {...kpi} />)}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Glass className="p-5 xl:col-span-8">
          <CardHeader title="Engagement trend" subtitle={`Daily student actions per module, ${period}`} Icon={Activity} action={data?.access?.activity ? <CardLink to={links.activity}>Activity log</CardLink> : null} />
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
          <Glass id="needs-attention" className="scroll-mt-24 p-5">
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
          <Glass id="upcoming" className="scroll-mt-24 p-5">
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
      {data ? <p className="mt-4 text-center text-[11px] text-slate-400">Totals: {formatNumber(sum(view.trend, 'logins'))} sign-ins · {periodLabel} · refreshed automatically every 5 minutes</p> : null}
    </OverviewShell>
  );
}
