import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
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
  TrendingUp,
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

function MetricCard({ label, value, helper, Icon, tone = 'sky', loading }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{loading ? '...' : value}</p>
          <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{helper}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${toneStyles[tone] || toneStyles.sky}`}>
          {createElement(Icon, { className: 'h-5 w-5' })}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ label, value, tone = 'sky' }) {
  const width = Math.min(100, Math.max(0, Number(value) || 0));
  const fill = {
    sky: 'bg-sky-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    indigo: 'bg-indigo-500',
  }[tone] || 'bg-sky-500';

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <span>{label}</span>
        <span className="font-bold text-slate-950 dark:text-white">{Math.round(width)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function Panel({ title, subtitle, Icon, action, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-900 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
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
      className="group flex min-h-[72px] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-slate-50 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-sky-400/30 dark:hover:bg-sky-400/10"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${toneStyles[tone] || toneStyles.sky}`}>
          {createElement(Icon, { className: 'h-5 w-5' })}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-slate-900 dark:text-white">{label}</span>
          <span className="mt-1 block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{detail}</span>
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-sky-600" />
    </Link>
  );
}

function ModuleLane({ title, Icon, tone, metrics, to }) {
  return (
    <Link to={to} className="group rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-white hover:shadow-md dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-sky-400/30 dark:hover:bg-white/[0.06]">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${toneStyles[tone] || toneStyles.sky}`}>
          {createElement(Icon, { className: 'h-5 w-5' })}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-950 dark:text-white">{title}</h3>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-sky-600" />
      </div>
      <div className="mt-4 flex items-center gap-5">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0">
            <div className="text-xl font-extrabold tracking-tight text-slate-950 dark:text-white">{metric.value}</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{metric.label}</div>
          </div>
        ))}
      </div>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [dashboard, setDashboard] = useState(emptyDashboard);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const results = await Promise.allSettled([
      api.listAllStudents({ page: 1, limit: 8, sortOrder: 'desc' }),
      api.listEvents(),
      api.listAssessments(),
      api.getActivityStats(),
      api.getActivities('limit=8'),
      api.listAllCoordinators(),
      api.listAnnouncementsAdmin({}),
      api.getCompilerOverview(),
    ]);

    const failed = results.filter((result) => result.status === 'rejected');
    const studentsRes = settledValue(results, 0, {});
    const eventsRes = settledValue(results, 1, {});
    const assessmentsRes = settledValue(results, 2, {});
    const activityStats = settledValue(results, 3, {});
    const activityRes = settledValue(results, 4, {});
    const coordinatorsRes = settledValue(results, 5, {});
    const announcementsRes = settledValue(results, 6, {});
    const compiler = settledValue(results, 7, null);

    setDashboard({
      students: asArray(studentsRes, ['students', 'data']),
      coordinators: asArray(coordinatorsRes, ['coordinators', 'data']),
      events: asArray(eventsRes, ['events', 'data']),
      assessments: asArray(assessmentsRes, ['assessments', 'data']),
      activities: asArray(activityRes, ['activities', 'data']),
      announcements: asArray(announcementsRes, ['announcements', 'data']),
      compiler,
      activityStats,
      studentCount: readCount(studentsRes, ['count', 'total', 'totalStudents', 'students']),
      coordinatorCount: readCount(coordinatorsRes, ['count', 'total', 'totalCoordinators', 'coordinators']),
      eventCount: readCount(eventsRes, ['count', 'total', 'events']),
      assessmentCount: readCount(assessmentsRes, ['count', 'total', 'assessments']),
      announcementCount: readCount(announcementsRes, ['count', 'total', 'announcements']),
    });
    setLastUpdated(new Date());
    setError(failed.length ? `${failed.length} dashboard source${failed.length > 1 ? 's' : ''} could not be reached. Showing the rest.` : null);
    setLoading(false);
  }, []);

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
    const compilerSummary = dashboard.compiler?.summary || {};
    const totalProblems = compilerSummary.totalProblems || 0;
    const activeCoders = compilerSummary.activeStudentsLast7Days || 0;
    const acceptanceRate = Number(compilerSummary.overallAcceptanceRate || 0);
    const announcements = dashboard.announcementCount || dashboard.announcements.length;

    const assessmentCoverage = totalStudents ? Math.min(100, (publishedAssessments / Math.max(totalStudents, 1)) * 100) : 0;
    const eventMomentum = totalEvents ? Math.min(100, ((upcomingEvents + liveEvents) / totalEvents) * 100) : 0;
    const codeEngagement = totalStudents ? Math.min(100, (activeCoders / Math.max(totalStudents, 1)) * 100) : 0;
    const operationsHealth = Math.round((assessmentCoverage + eventMomentum + codeEngagement + Math.min(100, activeUsers * 4)) / 4);

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
      totalProblems,
      activeCoders,
      acceptanceRate,
      announcements,
      assessmentCoverage,
      eventMomentum,
      codeEngagement,
      operationsHealth,
    };
  }, [dashboard]);

  const metrics = [
    { label: 'Students', value: formatNumber(model.totalStudents), helper: `${formatNumber(model.totalCoordinators)} coordinators managing cohorts`, Icon: Users, tone: 'sky' },
    { label: 'Interviews', value: formatNumber(model.totalEvents), helper: `${model.liveEvents} live, ${model.upcomingEvents} upcoming`, Icon: CalendarDays, tone: 'emerald' },
    { label: 'Assessments', value: formatNumber(model.totalAssessments), helper: `${model.publishedAssessments} published, ${model.draftAssessments} draft`, Icon: ClipboardList, tone: 'amber' },
    { label: 'Today Activity', value: formatNumber(model.activeUsers), helper: 'admin and platform actions today', Icon: Activity, tone: 'indigo' },
    { label: 'Code Platform', value: formatNumber(model.totalProblems), helper: `${model.activeCoders} active coders in 7 days`, Icon: Code2, tone: 'rose' },
  ];

  const activityItems = dashboard.activities.slice(0, 8).map((entry, index) => ({
    id: entry?._id || `${entry?.createdAt || 'activity'}-${index}`,
    title: entry?.description || [entry?.actionType, entry?.targetType].filter(Boolean).join(' ') || 'Platform activity',
    meta: entry?.userEmail || entry?.userRole || 'Admin operation',
    time: formatDateTime(entry?.createdAt),
  }));

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
      label: model.totalProblems ? 'Inspect compiler analytics' : 'Add coding problem',
      detail: model.totalProblems ? `${model.totalProblems} problems in the coding catalog` : 'Start the controlled coding workspace',
      to: model.totalProblems ? '/admin/compiler/analytics' : '/admin/compiler/create',
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
    <div className="min-h-screen bg-slate-50 pt-20 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <TonePill tone="sky">Admin Control Center</TonePill>
              <TonePill tone={model.operationsHealth >= 70 ? 'emerald' : model.operationsHealth >= 40 ? 'amber' : 'rose'}>
                {loading ? 'Syncing' : `${model.operationsHealth}% health`}
              </TonePill>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">Good overview, at a glance.</h1>
            <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">Live platform operations and priorities.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link to="/admin/assessment/create" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100">
              <Plus className="h-4 w-4" />
              New Assessment
            </Link>
            <Link to="/admin/onboarding" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:-translate-y-0.5 hover:border-sky-200 hover:text-sky-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:text-sky-200">
              <UserPlus className="h-4 w-4" />
              Add Students
            </Link>
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:-translate-y-0.5 hover:border-sky-200 hover:text-sky-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:text-sky-200"
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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {metrics.map((item) => (
            <MetricCard key={item.label} {...item} loading={loading} />
          ))}
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
          <Panel
            title="Core operations"
            action={<TonePill tone="slate">Updated {formatDateTime(lastUpdated)}</TonePill>}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <ModuleLane
                title="People Operations"
                Icon={Users}
                tone="sky"
                to="/admin/students"
                metrics={[
                  { label: 'students', value: formatNumber(model.totalStudents) },
                  { label: 'coordinators', value: formatNumber(model.totalCoordinators) },
                ]}
              />
              <ModuleLane
                title="Interview Control"
                Icon={CalendarDays}
                tone="emerald"
                to="/admin/interviews/scheduled"
                metrics={[
                  { label: 'live', value: formatNumber(model.liveEvents) },
                  { label: 'upcoming', value: formatNumber(model.upcomingEvents) },
                ]}
              />
              <ModuleLane
                title="Assessment Command"
                Icon={ClipboardList}
                tone="amber"
                to="/admin/assessment"
                metrics={[
                  { label: 'published', value: formatNumber(model.publishedAssessments) },
                  { label: 'draft', value: formatNumber(model.draftAssessments) },
                ]}
              />
              <ModuleLane
                title="Compiler Workspace"
                Icon={Code2}
                tone="rose"
                to="/admin/compiler"
                metrics={[
                  { label: 'problems', value: formatNumber(model.totalProblems) },
                  { label: 'acceptance', value: `${Math.round(model.acceptanceRate)}%` },
                ]}
              />
            </div>
          </Panel>

          <Panel title="Operating health" Icon={TrendingUp}>
            <div className="space-y-4">
              <ProgressBar label="Assessment coverage" value={model.assessmentCoverage} tone={model.assessmentCoverage >= 60 ? 'emerald' : 'amber'} />
              <ProgressBar label="Interview momentum" value={model.eventMomentum} tone={model.eventMomentum >= 40 ? 'emerald' : 'sky'} />
              <ProgressBar label="Coding engagement" value={model.codeEngagement} tone={model.codeEngagement >= 35 ? 'emerald' : 'rose'} />
              <ProgressBar label="Daily operations load" value={Math.min(100, model.activeUsers * 4)} tone="indigo" />
            </div>
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
              <p className="text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">
                {model.draftAssessments
                  ? 'Draft assessments are waiting. Review publishing and report readiness first.'
                  : model.upcomingEvents
                    ? 'Interview schedule is active. Keep pairings and event readiness checked.'
                    : 'Core modules are calm. Use the queue to grow assessments, students, and coding content.'}
              </p>
            </div>
          </Panel>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
          <Panel title="Needs attention" Icon={Zap}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {controlQueue.map((item) => (
                <ActionLink key={item.label} to={item.to} icon={item.Icon} label={item.label} detail={item.detail} tone={item.tone} />
              ))}
            </div>
          </Panel>

          <Panel
            title="Recent activity"
            Icon={Activity}
            action={<Link to="/admin/activity" className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 hover:text-sky-900 dark:text-sky-300">View all <ArrowRight className="h-3.5 w-3.5" /></Link>}
          >
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
              {loading ? (
                <div className="p-5 text-sm font-semibold text-slate-500 dark:text-slate-400">Loading activity...</div>
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

        <Panel title="Explore modules" className="mt-5">
          <div className="grid grid-cols-4 gap-1 sm:grid-cols-8">
            <QuickLink to="/admin/learning" Icon={BookOpen} label="Learning" tone="sky" />
            <QuickLink to="/admin/library" Icon={Library} label="Questions" tone="amber" />
            <QuickLink to="/admin/company-insights" Icon={Building2} label="Insights" tone="indigo" />
            <QuickLink to="/admin/feedback" Icon={MessageSquare} label="Feedback" tone="emerald" />
            <QuickLink to="/admin/announcements/manage" Icon={Megaphone} label="Announcements" tone="rose" badge={model.announcements || null} />
            <QuickLink to="/admin/settings/email-templates" Icon={Mail} label="Email" tone="sky" />
            <QuickLink to="/admin/coordinator-directory" Icon={GraduationCap} label="Coordinators" tone="emerald" />
            <QuickLink to="/admin/company-insights/add" Icon={Briefcase} label="Benchmarks" tone="indigo" />
          </div>
        </Panel>
      </div>
    </div>
  );
}
