import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookOpen,
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
  Plus,
  RefreshCw,
  ShieldCheck,
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
  compilerAnalytics: null,
  assessmentReports: null,
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

function DistributionChart({ values = [], loading }) {
  const labels = ['0–25', '26–50', '51–75', '76–90', '91–100'];
  const max = Math.max(...values, 1);
  return (
    <div className="grid h-36 grid-cols-5 items-end gap-3 border-b border-slate-200 px-2 pt-2 dark:border-gray-700">
      {labels.map((label, index) => (
        <div key={label} className="flex h-full flex-col justify-end text-center" title={`${label}% score: ${values[index] || 0} submissions`}>
          <span className="mb-1 text-[10px] font-semibold text-slate-700 dark:text-slate-200">{loading ? '' : values[index] || 0}</span>
          <span className={`mx-auto w-full max-w-14 rounded-t ${index >= 3 ? 'bg-emerald-500' : index === 2 ? 'bg-sky-500' : 'bg-amber-400'} ${loading ? 'animate-pulse bg-slate-200 dark:bg-gray-700' : ''}`} style={{ height: loading ? '50%' : `${Math.max(values[index] ? 8 : 2, ((values[index] || 0) / max) * 100)}%` }} />
          <span className="py-2 text-[10px] font-medium text-slate-500 dark:text-slate-400">{label}%</span>
        </div>
      ))}
    </div>
  );
}

function DifficultyChart({ data = [], loading }) {
  return (
    <div className="space-y-3">
      {(loading ? [{ difficulty: 'Easy' }, { difficulty: 'Medium' }, { difficulty: 'Hard' }] : data).map((item) => {
        const value = Number(item?.successRate) || 0;
        return <div key={item.difficulty}><div className="mb-1 flex justify-between text-[11px] font-medium text-slate-600 dark:text-slate-300"><span>{item.difficulty}</span><span>{loading ? '—' : `${Math.round(value)}%`}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-700"><div className={`h-full rounded-full ${item.difficulty === 'Easy' ? 'bg-emerald-500' : item.difficulty === 'Medium' ? 'bg-amber-500' : 'bg-rose-500'} ${loading ? 'animate-pulse' : ''}`} style={{ width: loading ? '45%' : `${value}%` }} /></div></div>;
      })}
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
      api.getActivities('limit=5'),
      api.listAnnouncementsAdmin({}),
      api.getCompilerOverview(),
      api.getAssessmentReports({ page: 1, limit: 5 }),
      api.getCompilerAnalyticsOverview(),
    ]);
    const activityStats = settledValue(secondaryResults, 0, {});
    const activityRes = settledValue(secondaryResults, 1, {});
    const announcementsRes = settledValue(secondaryResults, 2, {});
    const compiler = settledValue(secondaryResults, 3, null);
    const assessmentReports = settledValue(secondaryResults, 4, null);
    const compilerAnalytics = settledValue(secondaryResults, 5, null);
    setDashboard((current) => ({
      ...current,
      activities: asArray(activityRes, ['activities', 'data']),
      announcements: asArray(announcementsRes, ['announcements', 'data']),
      compiler,
      compilerAnalytics,
      assessmentReports,
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
    const codingAnalyticsSummary = dashboard.compilerAnalytics?.summary || {};
    const reportSummary = dashboard.assessmentReports?.summary || {};
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
      averageAssessmentScore: Number(reportSummary.avgScore || 0),
      assessmentAttempts: Number(dashboard.assessmentReports?.pagination?.total || 0),
      assessmentPasses: Number(reportSummary.passCount || 0),
      assessmentFails: Number(reportSummary.failCount || 0),
      assessmentViolations: Number(reportSummary.violationCount || 0),
      scoreDistribution: Array.isArray(reportSummary.scoreDistribution) ? reportSummary.scoreDistribution : [0, 0, 0, 0, 0],
      codingAttempts: Number(codingAnalyticsSummary.totalAttempts || 0),
      codingAcceptance: Number(codingAnalyticsSummary.acceptanceRate || acceptanceRate),
      codingProblemsCovered: Number(codingAnalyticsSummary.problemsCovered || totalProblems),
    };
  }, [dashboard]);

  const metrics = [
    { label: 'Students', value: formatNumber(model.totalStudents), helper: `${formatNumber(model.totalCoordinators)} coordinators`, Icon: Users, tone: 'sky', to: '/admin/students' },
    { label: 'Assessments', value: formatNumber(model.publishedAssessments), helper: `${model.draftAssessments} drafts`, Icon: ClipboardList, tone: 'amber', to: '/admin/assessment' },
    { label: 'Submissions', value: formatNumber(model.assessmentAttempts), helper: `${Math.round(model.averageAssessmentScore)}% average`, Icon: BarChart3, tone: 'indigo', to: '/admin/assessment/reports' },
    { label: 'Interviews', value: formatNumber(model.upcomingEvents), helper: `${model.liveEvents} live now`, Icon: CalendarDays, tone: 'emerald', to: '/admin/interviews/scheduled' },
    { label: 'Active coders', value: formatNumber(model.activeCoders), helper: `${model.codingProblemsCovered} problems`, Icon: Code2, tone: 'rose', to: '/admin/library/coding/analytics' },
    { label: 'Code acceptance', value: `${Math.round(model.codingAcceptance)}%`, helper: `${formatNumber(model.codingAttempts)} attempts`, Icon: FileCode2, tone: 'sky', to: '/admin/library/coding/analytics' },
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

  const recentAssessments = asArray(dashboard.assessmentReports, ['assessments']).slice(0, 5);
  const codingDifficulty = asArray(dashboard.compilerAnalytics?.charts?.difficultyVsSuccessRate);

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

        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {metrics.map((item) => (
            <MetricCard key={item.label} {...item} loading={['Students', 'Assessments', 'Interviews'].includes(item.label) ? coreLoading : secondaryLoading} />
          ))}
        </div>

        <div className="mt-3 grid items-start gap-3 xl:grid-cols-12">
          <Panel title="Assessment performance" Icon={BarChart3} action={<Link to="/admin/assessment/reports" className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">Full report</Link>} className="xl:col-span-7">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              <DistributionChart values={model.scoreDistribution} loading={secondaryLoading} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
                <div className="rounded-md bg-sky-50 p-3 dark:bg-sky-400/10"><span className="text-2xl font-semibold text-sky-800 dark:text-sky-200">{Math.round(model.averageAssessmentScore)}%</span><p className="text-[10px] font-medium text-sky-700 dark:text-sky-300">Average score</p></div>
                <div className="rounded-md bg-emerald-50 p-3 dark:bg-emerald-400/10"><span className="text-2xl font-semibold text-emerald-800 dark:text-emerald-200">{model.assessmentPasses}</span><p className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">Passed submissions</p></div>
              </div>
            </div>
          </Panel>

          <Panel title="Coding performance" Icon={Code2} action={<Link to="/admin/library/coding/analytics" className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">Open analytics</Link>} className="xl:col-span-5">
            <DifficultyChart data={codingDifficulty} loading={secondaryLoading} />
            <div className="mt-4 grid grid-cols-3 divide-x divide-slate-200 dark:divide-gray-700"><div><b className="block text-lg text-slate-950 dark:text-white">{model.activeCoders}</b><span className="text-[10px] text-slate-500">Active students</span></div><div className="pl-3"><b className="block text-lg text-slate-950 dark:text-white">{model.codingAcceptance.toFixed(0)}%</b><span className="text-[10px] text-slate-500">Acceptance</span></div><div className="pl-3"><b className="block text-lg text-slate-950 dark:text-white">{formatNumber(model.codingAttempts)}</b><span className="text-[10px] text-slate-500">Attempts</span></div></div>
          </Panel>
        </div>

        <div className="mt-3 grid items-start gap-3 xl:grid-cols-12">
          <Panel title="Action center" Icon={Zap} className="xl:col-span-4">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">{controlQueue.map((item) => <ActionLink key={item.label} to={item.to} icon={item.Icon} label={item.label} detail={item.detail} tone={item.tone} />)}</div>
          </Panel>

          <Panel title="Recent assessments" Icon={ClipboardList} action={<Link to="/admin/assessment" className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">View all</Link>} className="xl:col-span-5">
            <div className="divide-y divide-slate-100 dark:divide-gray-700">{secondaryLoading ? [1,2,3,4].map((item) => <div key={item} className="my-2 h-9 animate-pulse rounded bg-slate-100 dark:bg-gray-800" />) : recentAssessments.length ? recentAssessments.map((item) => <Link key={item._id || item.id} to="/admin/assessment/reports" className="grid grid-cols-[minmax(0,1fr)_52px_52px] items-center gap-2 py-2"><span className="truncate text-[11px] font-semibold text-slate-800 dark:text-white">{item.title || 'Untitled assessment'}</span><span className="text-right text-[10px] text-slate-500">{item.submissionCount || 0} tries</span><span className="text-right text-[10px] font-semibold text-slate-700 dark:text-slate-300">{Math.round(Number(item.avgScore || 0))}%</span></Link>) : <p className="py-6 text-center text-xs text-slate-500">No assessment results yet.</p>}</div>
          </Panel>

          <Panel title="Upcoming interviews" Icon={Clock3} action={<Link to="/admin/interviews/scheduled" className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">Calendar</Link>} className="xl:col-span-3">
            <div className="divide-y divide-slate-100 dark:divide-gray-700">{coreLoading ? [1,2,3].map((item) => <div key={item} className="my-2 h-9 animate-pulse rounded bg-slate-100 dark:bg-gray-800" />) : upcomingSchedule.length ? upcomingSchedule.slice(0, 4).map((event) => <Link key={event._id || event.id} to={`/admin/event/${event._id || event.id}`} className="block py-2"><span className="block truncate text-[11px] font-semibold text-slate-800 dark:text-white">{event.title || event.name || 'Interview'}</span><span className="text-[10px] text-slate-500">{formatDateTime(eventStart(event))}</span></Link>) : <div className="py-6 text-center"><p className="text-xs text-slate-500">No interviews scheduled.</p><Link to="/admin/event" className="mt-2 inline-block text-[11px] font-semibold text-sky-700">Create interview</Link></div>}</div>
          </Panel>
        </div>

        <div className="mt-3 grid items-start gap-3 xl:grid-cols-12">
          <Panel title="Student engagement" Icon={Users} className="xl:col-span-3"><div className="flex items-end justify-between"><div><span className="text-3xl font-semibold text-slate-950 dark:text-white">{model.totalStudents ? Math.round((model.activeCoders / model.totalStudents) * 100) : 0}%</span><p className="text-[10px] text-slate-500">coded in the last 7 days</p></div><span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{model.activeCoders}/{model.totalStudents}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-700"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${model.totalStudents ? Math.min(100, (model.activeCoders / model.totalStudents) * 100) : 0}%` }} /></div><Link to="/admin/students" className="mt-3 inline-flex text-[11px] font-semibold text-sky-700 dark:text-sky-300">View students <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Panel>

          <Panel title="Assessment integrity" Icon={ShieldCheck} className="xl:col-span-3"><div className="grid grid-cols-3 divide-x divide-slate-200 text-center dark:divide-gray-700"><div><b className="block text-xl text-emerald-700">{model.assessmentPasses}</b><span className="text-[10px] text-slate-500">Passed</span></div><div><b className="block text-xl text-rose-700">{model.assessmentFails}</b><span className="text-[10px] text-slate-500">Failed</span></div><div><b className="block text-xl text-amber-700">{model.assessmentViolations}</b><span className="text-[10px] text-slate-500">Flags</span></div></div><Link to="/admin/assessment/reports" className="mt-4 inline-flex text-[11px] font-semibold text-sky-700 dark:text-sky-300">Review reports <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Panel>

          <Panel title="Recent changes" Icon={Activity} action={<Link to="/admin/activity" className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">Audit log</Link>} className="xl:col-span-6"><div className="divide-y divide-slate-100 dark:divide-gray-700">{secondaryLoading ? [1,2,3,4].map((item) => <div key={item} className="my-2 h-9 animate-pulse rounded bg-slate-100 dark:bg-gray-800" />) : activityItems.slice(0,4).map((item) => <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-3 py-2"><span className="truncate text-[11px] font-medium text-slate-800 dark:text-white">{item.title}</span><span className="text-right text-[10px] text-slate-400">{item.time}</span></div>)}</div></Panel>
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
