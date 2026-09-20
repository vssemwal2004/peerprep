import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  BellRing,
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  CircleHelp,
  Clock3,
  ClipboardList,
  Code2,
  FileCode2,
  GraduationCap,
  Library,
  Mail,
  Megaphone,
  MessageSquare,
  Plus,
  RefreshCw,
  ShieldCheck,
  Target,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import { api } from '../utils/api';

const emptyDashboard = {
  students: [],
  coordinators: [],
  events: [],
  assessments: [],
  activities: [],
  announcements: [],
  compiler: null,
  activityStats: {},
  studentCount: 0,
  coordinatorCount: 0,
  eventCount: 0,
  assessmentCount: 0,
  announcementCount: 0,
};

const toneStyles = {
  sky: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200',
  amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
  rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-200',
  slate: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200',
};

function asArray(value, keys = []) {
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

function readCount(value, keys = []) {
  if (typeof value === 'number') return value;
  for (const key of keys) {
    if (typeof value?.[key] === 'number') return value[key];
  }
  return asArray(value, keys).length;
}

function settledValue(results, index, fallback) {
  return results[index]?.status === 'fulfilled' ? results[index].value : fallback;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-IN').format(Number(value) || 0);
}

function formatDateTime(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function eventStart(event) {
  return event?.startDate || event?.start || event?.scheduledAt || event?.date;
}

function eventEnd(event) {
  return event?.endDate || event?.end || event?.scheduledEndAt || eventStart(event);
}

function isUpcomingEvent(event) {
  const start = new Date(eventStart(event)).getTime();
  return Number.isFinite(start) && start > Date.now();
}

function isLiveEvent(event) {
  const start = new Date(eventStart(event)).getTime();
  const end = new Date(eventEnd(event)).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start <= Date.now() && end >= Date.now();
}

function statusOfAssessment(item) {
  return String(item?.status || item?.state || (item?.isVisible ? 'published' : '')).toLowerCase();
}

function TonePill({ children, tone = 'slate' }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${toneStyles[tone] || toneStyles.slate}`}>
      {children}
    </span>
  );
}

function MetricCard({ label, value, helper, Icon, tone = 'sky', loading, to }) {
  return (
    <Link to={to} className="group rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm transition hover:border-sky-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-sky-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          {loading ? <div className="mt-2 h-6 w-14 animate-pulse rounded bg-slate-200 dark:bg-gray-700" /> : <p className="mt-0.5 text-xl font-semibold text-slate-950 dark:text-white">{value}</p>}
          <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{helper}</p>
        </div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${toneStyles[tone] || toneStyles.sky}`}>
          {createElement(Icon, { className: 'h-4 w-4' })}
        </div>
      </div>
    </Link>
  );
}

function ActivityTrend({ data, loading }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="grid h-44 grid-cols-7 items-end gap-2 border-b border-slate-200 px-1 pt-3 dark:border-gray-700">
      {data.map((item) => (
        <div key={item.key} className="flex h-full flex-col justify-end text-center" title={`${item.label}: ${item.value} actions`}>
          <span className="mb-1 text-[10px] font-bold text-slate-700 dark:text-slate-200">{loading ? '' : item.value}</span>
          <span className={`mx-auto w-full max-w-12 rounded-t bg-sky-500 transition-all ${loading ? 'animate-pulse bg-slate-200 dark:bg-gray-700' : ''}`} style={{ height: loading ? '55%' : `${Math.max(item.value ? 8 : 2, (item.value / max) * 100)}%` }} />
          <span className="py-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function StatusSummary({ model }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
      <Link to="/admin/assessment" className="border-l-2 border-emerald-500 pl-2"><span className="block text-lg font-bold text-slate-900 dark:text-white">{model.publishedAssessments}</span><span className="text-[10px] font-semibold text-slate-500">Published assessments</span></Link>
      <Link to="/admin/assessment" className="border-l-2 border-amber-500 pl-2"><span className="block text-lg font-bold text-slate-900 dark:text-white">{model.draftAssessments}</span><span className="text-[10px] font-semibold text-slate-500">Assessment drafts</span></Link>
      <Link to="/admin/interviews/scheduled" className="border-l-2 border-sky-500 pl-2"><span className="block text-lg font-bold text-slate-900 dark:text-white">{model.upcomingEvents}</span><span className="text-[10px] font-semibold text-slate-500">Upcoming interviews</span></Link>
      <Link to="/admin/library/coding/analytics" className="border-l-2 border-indigo-500 pl-2"><span className="block text-lg font-bold text-slate-900 dark:text-white">{model.activeCoders}</span><span className="text-[10px] font-semibold text-slate-500">Active coders · 7 days</span></Link>
    </div>
  );
}

function SectionHelp({ text }) {
  return (
    <span title={text} aria-label={text} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-sky-700 dark:hover:bg-gray-800">
      <CircleHelp className="h-4 w-4" />
    </span>
  );
}

function Panel({ title, subtitle, Icon, action, children, className = '' }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200">
              <Icon className="h-4 w-4" />
            </div>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-950 dark:text-white">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ActionLink({ to, icon: Icon, label, detail, tone = 'sky' }) {
  return (
    <Link
      to={to}
      className="group flex min-h-[58px] items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-sky-300 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-sky-700 dark:hover:bg-gray-800"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${toneStyles[tone] || toneStyles.sky}`}>
          {createElement(Icon, { className: 'h-4 w-4' })}
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-slate-800 dark:text-white">{label}</span>
          <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">{detail}</span>
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-sky-600" />
    </Link>
  );
}

function QuickLink({ to, Icon, label, tone = 'sky', badge }) {
  return (
    <Link to={to} className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-transparent px-2 py-3 text-center transition hover:border-slate-200 hover:bg-slate-50 dark:hover:border-white/10 dark:hover:bg-white/[0.04]">
      <span className={`relative flex h-11 w-11 items-center justify-center rounded-xl border ${toneStyles[tone] || toneStyles.sky}`}>
        {createElement(Icon, { className: 'h-5 w-5' })}
        {badge ? <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-slate-950 px-1.5 py-0.5 text-[9px] font-black text-white dark:bg-white dark:text-slate-950">{badge}</span> : null}
      </span>
      <span className="text-[11px] font-bold leading-4 text-slate-600 group-hover:text-slate-950 dark:text-slate-300 dark:group-hover:text-white">{label}</span>
    </Link>
  );
}

export default function AdminOverview() {
  const [coreLoading, setCoreLoading] = useState(true);
  const [secondaryLoading, setSecondaryLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [dashboard, setDashboard] = useState(emptyDashboard);

  const loadData = useCallback(async () => {
    setCoreLoading(true);
    setSecondaryLoading(true);
    setError(null);

    const coreResults = await Promise.allSettled([
      api.listAllStudents({ page: 1, limit: 8, sortOrder: 'desc' }),
      api.listEvents(),
      api.listAssessments(),
      api.listAllCoordinators(),
    ]);
    const studentsRes = settledValue(coreResults, 0, {});
    const eventsRes = settledValue(coreResults, 1, {});
    const assessmentsRes = settledValue(coreResults, 2, {});
    const coordinatorsRes = settledValue(coreResults, 3, {});
    setDashboard((current) => ({
      ...current,
      students: asArray(studentsRes, ['students', 'data']),
      coordinators: asArray(coordinatorsRes, ['coordinators', 'data']),
      events: asArray(eventsRes, ['events', 'data']),
      assessments: asArray(assessmentsRes, ['assessments', 'data']),
      studentCount: readCount(studentsRes, ['total', 'totalStudents', 'count', 'students']),
      coordinatorCount: readCount(coordinatorsRes, ['count', 'total', 'totalCoordinators', 'coordinators']),
      eventCount: readCount(eventsRes, ['count', 'total', 'events']),
      assessmentCount: readCount(assessmentsRes, ['count', 'total', 'assessments']),
    }));
    setCoreLoading(false);

    const secondaryResults = await Promise.allSettled([
      api.getActivityStats(),
      api.getActivities('limit=250'),
      api.listAnnouncementsAdmin({}),
      api.getCompilerOverview(),
    ]);
    const activityStats = settledValue(secondaryResults, 0, {});
    const activityRes = settledValue(secondaryResults, 1, {});
    const announcementsRes = settledValue(secondaryResults, 2, {});
    const compiler = settledValue(secondaryResults, 3, null);
    setDashboard((current) => ({
      ...current,
      activities: asArray(activityRes, ['activities', 'data']),
      announcements: asArray(announcementsRes, ['announcements', 'data']),
      compiler,
      activityStats,
      announcementCount: readCount(announcementsRes, ['count', 'total', 'announcements']),
    }));
    setLastUpdated(new Date());
    const failed = [...coreResults, ...secondaryResults].filter((result) => result.status === 'rejected');
    setError(failed.length ? `${failed.length} dashboard source${failed.length > 1 ? 's' : ''} could not be reached. Showing the rest.` : null);
    setSecondaryLoading(false);
  }, []);

  const loading = coreLoading || secondaryLoading;

  useEffect(() => {
    loadData();
  }, [loadData]);

  const model = useMemo(() => {
    const totalStudents = dashboard.studentCount || dashboard.students.length;
    const totalCoordinators = dashboard.coordinatorCount || dashboard.coordinators.length;
    const upcomingEvents = dashboard.events.filter(isUpcomingEvent).length;
    const liveEvents = dashboard.events.filter(isLiveEvent).length;
    const totalEvents = dashboard.eventCount || dashboard.events.length;
    const publishedAssessments = dashboard.assessments.filter((item) => ['published', 'active', 'live'].includes(statusOfAssessment(item)) || item?.isVisible).length;
    const draftAssessments = dashboard.assessments.filter((item) => ['draft', 'pending'].includes(statusOfAssessment(item))).length;
    const totalAssessments = dashboard.assessmentCount || dashboard.assessments.length;
    const activeUsers = dashboard.activityStats?.todayActivities || dashboard.activityStats?.activeUsers || dashboard.activityStats?.totalToday || 0;
    const totalActivities = dashboard.activityStats?.totalActivities || 0;
    const compilerSummary = dashboard.compiler?.summary || {};
    const totalProblems = compilerSummary.totalProblems || 0;
    const activeCoders = compilerSummary.activeStudentsLast7Days || 0;
    const acceptanceRate = Number(compilerSummary.overallAcceptanceRate || 0);
    const announcements = dashboard.announcementCount || dashboard.announcements.length;

    return {
      totalStudents,
      totalCoordinators,
      upcomingEvents,
      liveEvents,
      totalEvents,
      publishedAssessments,
      draftAssessments,
      totalAssessments,
      activeUsers,
      totalActivities,
      totalProblems,
      activeCoders,
      acceptanceRate,
      announcements,
    };
  }, [dashboard]);

  const metrics = [
    { label: 'Students', value: formatNumber(model.totalStudents), helper: `${formatNumber(model.totalCoordinators)} coordinators managing cohorts`, Icon: Users, tone: 'sky', to: '/admin/students' },
    { label: 'Interviews', value: formatNumber(model.totalEvents), helper: `${model.liveEvents} live, ${model.upcomingEvents} upcoming`, Icon: CalendarDays, tone: 'emerald', to: '/admin/interviews/scheduled' },
    { label: 'Assessments', value: formatNumber(model.totalAssessments), helper: `${model.publishedAssessments} published, ${model.draftAssessments} draft`, Icon: ClipboardList, tone: 'amber', to: '/admin/assessment' },
    { label: 'Today Activity', value: formatNumber(model.activeUsers), helper: 'admin and platform actions today', Icon: Activity, tone: 'indigo', to: '/admin/activity' },
    { label: 'Code Platform', value: formatNumber(model.totalProblems), helper: `${model.activeCoders} active coders in 7 days`, Icon: Code2, tone: 'rose', to: '/admin/library/coding/analytics' },
  ];

  const upcomingSchedule = dashboard.events
    .filter((event) => isUpcomingEvent(event) || isLiveEvent(event))
    .sort((a, b) => new Date(eventStart(a)) - new Date(eventStart(b)))
    .slice(0, 5);

  const activityItems = dashboard.activities.slice(0, 5).map((entry, index) => ({
    id: entry?._id || `${entry?.createdAt || 'activity'}-${index}`,
    title: entry?.description || [entry?.actionType, entry?.targetType].filter(Boolean).join(' ') || 'Platform activity',
    meta: entry?.userEmail || entry?.userRole || 'Admin operation',
    time: formatDateTime(entry?.createdAt),
  }));

  const activityTrend = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      return { key: date.toISOString().slice(0, 10), label: date.toLocaleDateString([], { weekday: 'short' }), value: 0 };
    });
    const byDate = new Map(days.map((day) => [day.key, day]));
    dashboard.activities.forEach((entry) => {
      const date = new Date(entry?.createdAt);
      if (!Number.isNaN(date.getTime())) {
        const key = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString().slice(0, 10);
        if (byDate.has(key)) byDate.get(key).value += 1;
      }
    });
    return days;
  }, [dashboard.activities]);

  const controlQueue = [
    {
      label: model.draftAssessments ? 'Publish waiting assessments' : 'Create next assessment',
      detail: model.draftAssessments ? `${model.draftAssessments} drafts need review` : 'Keep evaluation pipeline moving',
      to: model.draftAssessments ? '/admin/assessment' : '/admin/assessment/create',
      Icon: ClipboardList,
      tone: model.draftAssessments ? 'amber' : 'sky',
    },
    {
      label: model.upcomingEvents ? 'Review interview schedule' : 'Schedule interview event',
      detail: model.upcomingEvents ? `${model.upcomingEvents} upcoming interview events` : 'Create a new pairing or interview round',
      to: model.upcomingEvents ? '/admin/interviews/scheduled' : '/admin/event',
      Icon: CalendarDays,
      tone: 'emerald',
    },
    {
      label: model.totalProblems ? 'Inspect coding analytics' : 'Add coding problem',
      detail: model.totalProblems ? `${model.totalProblems} problems in the coding catalog` : 'Start the controlled coding workspace',
      to: model.totalProblems ? '/admin/library/coding/analytics' : '/admin/library/coding/create',
      Icon: FileCode2,
      tone: 'rose',
    },
    {
      label: model.totalCoordinators ? 'Review coordinator access' : 'Add coordinator',
      detail: model.totalCoordinators ? `${model.totalCoordinators} coordinator accounts in access control` : 'Create coordinator access for your platform team',
      to: model.totalCoordinators ? '/admin/coordinator-access' : '/admin/coordinators',
      Icon: ShieldCheck,
      tone: 'indigo',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100/70 font-sans text-slate-950 dark:bg-gray-950 dark:text-white">
      <div className="mx-auto w-full max-w-[1680px] px-4 py-4 xl:px-6">
        <div className="mb-3 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><h1 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Overview</h1><span className={`h-2 w-2 rounded-full ${loading ? 'animate-pulse bg-amber-400' : 'bg-emerald-500'}`} /></div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Updated {formatDateTime(lastUpdated)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link to="/admin/assessment/create" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-sky-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700">
              <Plus className="h-4 w-4" />
              New Assessment
            </Link>
            <Link to="/admin/onboarding" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200 dark:hover:bg-gray-700">
              <UserPlus className="h-4 w-4" />
              Add Students
            </Link>
            <button
              type="button"
              onClick={loadData}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200 dark:hover:bg-gray-700"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {metrics.map((item) => (
            <MetricCard key={item.label} {...item} loading={item.label === 'Today Activity' || item.label === 'Code Platform' ? secondaryLoading : coreLoading} />
          ))}
        </div>

        <div className="mt-3 grid items-start gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
          <Panel title="Activity trend" Icon={BarChart3} action={<div className="flex items-center gap-1"><span className="text-[10px] font-semibold text-slate-500">Last 7 days</span><SectionHelp text="Daily administrator actions recorded during the last seven days." /></div>}>
            <ActivityTrend data={activityTrend} loading={secondaryLoading} />
            <div className="mt-3"><StatusSummary model={model} /></div>
          </Panel>

          <Panel title="Action center" Icon={Zap} action={<SectionHelp text="The most relevant management actions based on current records." />}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {controlQueue.map((item) => (
                <ActionLink key={item.label} to={item.to} icon={item.Icon} label={item.label} detail={item.detail} tone={item.tone} />
              ))}
            </div>
          </Panel>
        </div>

        <div className="mt-3 grid items-start gap-3 xl:grid-cols-[minmax(320px,0.7fr)_minmax(0,1.3fr)]">
          <Panel title="Upcoming schedule" Icon={Clock3} action={<Link to="/admin/interviews/scheduled" className="text-xs font-semibold text-sky-700 dark:text-sky-300">View calendar</Link>}>
            <div className="divide-y divide-slate-100 dark:divide-gray-700">
              {coreLoading ? <div className="space-y-2">{[1, 2, 3].map((item) => <div key={item} className="h-10 animate-pulse rounded bg-slate-100 dark:bg-gray-800" />)}</div> : upcomingSchedule.length ? upcomingSchedule.map((event) => (
                <Link key={event._id || event.id} to={`/admin/event/${event._id || event.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-sky-700 dark:hover:text-sky-300">
                  <span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-800 dark:text-white">{event.title || event.name || 'Interview event'}</span><span className="mt-0.5 block text-[10px] text-slate-500">{formatDateTime(eventStart(event))}</span></span>
                  <TonePill tone={isLiveEvent(event) ? 'emerald' : 'sky'}>{isLiveEvent(event) ? 'Live' : 'Upcoming'}</TonePill>
                </Link>
              )) : <p className="py-5 text-xs text-slate-500">No upcoming interviews. Schedule the next event.</p>}
            </div>
          </Panel>

          <Panel
            title="Recent activity"
            Icon={Activity}
            action={<Link to="/admin/activity" className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 hover:text-sky-900 dark:text-sky-300">View all <ArrowRight className="h-3.5 w-3.5" /></Link>}
          >
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
              {secondaryLoading ? (
                <div className="space-y-2 p-3">{[1, 2, 3, 4].map((item) => <div key={item} className="h-10 animate-pulse rounded bg-slate-100 dark:bg-gray-800" />)}</div>
              ) : activityItems.length ? (
                <div className="divide-y divide-slate-100 dark:divide-white/10">
                  {activityItems.map((item) => (
                    <div key={item.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{item.title}</p>
                        <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{item.meta}</p>
                      </div>
                      <div className="text-xs font-semibold text-slate-400 sm:text-right">{item.time}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-5 text-sm font-semibold text-slate-500 dark:text-slate-400">No recent admin activity yet.</div>
              )}
            </div>
          </Panel>
        </div>

        <Panel title="Shortcuts" action={<SectionHelp text="Direct links to the most-used administration areas." />} className="mt-3">
          <div className="grid grid-cols-4 gap-1 md:grid-cols-6 xl:grid-cols-10">
            <QuickLink to="/admin/assessment/create" Icon={Plus} label="New assessment" tone="sky" />
            <QuickLink to="/admin/event" Icon={CalendarDays} label="New interview" tone="emerald" />
            <QuickLink to="/admin/learning" Icon={BookOpen} label="Learning" tone="sky" />
            <QuickLink to="/admin/library" Icon={Library} label="Questions" tone="amber" />
            <QuickLink to="/admin/assessment/reports" Icon={ClipboardList} label="Reports" tone="amber" />
            <QuickLink to="/admin/coordinator-access" Icon={ShieldCheck} label="Access" tone="indigo" />
            <QuickLink to="/admin/announcements/manage" Icon={Megaphone} label="Notices" tone="rose" badge={model.announcements || null} />
            <QuickLink to="/admin/email-queue" Icon={Mail} label="Email queue" tone="sky" />
            <QuickLink to="/admin/coordinator-directory" Icon={GraduationCap} label="Coordinators" tone="emerald" />
            <QuickLink to="/admin/company-insights" Icon={Building2} label="Benchmarks" tone="indigo" />
          </div>
        </Panel>
      </div>
    </div>
  );
}
