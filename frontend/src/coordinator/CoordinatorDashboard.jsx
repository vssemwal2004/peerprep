import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  CircleHelp,
  ClipboardList,
  Clock3,
  Code2,
  Library,
  Megaphone,
  MessageSquare,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { hasPermission } from '../admin/coordinatorPermissions';

const asArray = (value, keys = []) => {
  if (Array.isArray(value)) return value;
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  return [];
};

const countOf = (value, keys = []) => {
  if (typeof value === 'number') return value;
  for (const key of keys) if (typeof value?.[key] === 'number') return value[key];
  return asArray(value, keys).length;
};

const dateOf = (item) => item?.updatedAt || item?.createdAt || item?.startDate;
const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'No date'
    : date.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const statusTone = {
  published: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200',
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200',
  draft: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200',
  completed: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
};

function Metric({ label, value, helper, Icon, color, to, loading }) {
  return (
    <Link to={to} className="group rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm transition hover:border-sky-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-sky-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-gray-400">{label}</p>
          {loading ? <div className="mt-2 h-6 w-14 animate-pulse rounded bg-slate-100 dark:bg-gray-800" /> : <p className="mt-0.5 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</p>}
          <p className="truncate text-[10px] text-slate-500 dark:text-gray-400">{helper}</p>
        </div>
        <span className={`flex h-8 w-8 items-center justify-center rounded-md ${color}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

function Panel({ title, subtitle, action, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-gray-400">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ActivityTrend({ data, loading }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return <div className="grid h-44 grid-cols-7 items-end gap-2 border-b border-slate-200 px-1 pt-3 dark:border-gray-700">{data.map((item) => <div key={item.key} className="flex h-full flex-col justify-end text-center" title={`${item.label}: ${item.value} actions`}><span className="mb-1 text-[10px] font-bold text-slate-700 dark:text-slate-200">{loading ? '' : item.value}</span><span className={`mx-auto w-full max-w-12 rounded-t bg-sky-500 ${loading ? 'animate-pulse bg-slate-200 dark:bg-gray-700' : ''}`} style={{ height: loading ? '55%' : `${Math.max(item.value ? 8 : 2, (item.value / max) * 100)}%` }} /><span className="py-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">{item.label}</span></div>)}</div>;
}

function SectionHelp({ text }) {
  return <span title={text} aria-label={text} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-sky-700 dark:hover:bg-gray-800"><CircleHelp className="h-4 w-4" /></span>;
}

export default function CoordinatorDashboard() {
  const { user } = useAuth();
  const [coreLoading, setCoreLoading] = useState(true);
  const [secondaryLoading, setSecondaryLoading] = useState(true);
  const [warning, setWarning] = useState('');
  const [data, setData] = useState({
    students: [], studentCount: 0, events: [], assessments: [], feedback: [], feedbackCount: 0, compiler: null, activityStats: {}, activities: [],
  });

  const allowed = useCallback((permission) => hasPermission(user, permission), [user]);

  const loadDashboard = useCallback(async () => {
    setCoreLoading(true);
    setSecondaryLoading(true);
    setWarning('');
    const coreSources = [
      allowed('coordinator.students.view') && ['students', () => api.listAllStudents({ page: 1, limit: 8, sortOrder: 'desc' })],
      allowed('coordinator.interviews.view') && ['events', () => api.listEvents({ view: 'dashboard' })],
      allowed('coordinator.assessment.view') && ['assessments', () => api.listAssessments({ view: 'dashboard' })],
    ].filter(Boolean);
    const secondarySources = [
      allowed('coordinator.feedback.view') && ['feedback', () => api.listCoordinatorFeedback('view=dashboard')],
      allowed('coordinator.compiler.view') && ['compiler', () => api.getCompilerOverview()],
      allowed('coordinator.activity.view') && ['activityStats', () => api.getActivityStats()],
      allowed('coordinator.activity.view') && ['activities', () => {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        return api.getActivities(`limit=250&startDate=${encodeURIComponent(startDate.toISOString())}`);
      }],
    ].filter(Boolean);

    const applyResults = (sources, results) => setData((current) => {
      const next = { ...current };
      results.forEach((result, index) => {
        if (result.status !== 'fulfilled') return;
        const key = sources[index][0];
        if (key === 'students') {
          next.students = asArray(result.value, ['students', 'data']);
          next.studentCount = countOf(result.value, ['total', 'count', 'students']);
        } else if (key === 'events') next.events = asArray(result.value, ['events', 'data']);
        else if (key === 'assessments') next.assessments = asArray(result.value, ['assessments', 'data']);
        else if (key === 'feedback') {
          next.feedback = asArray(result.value, ['feedback', 'data']);
          next.feedbackCount = countOf(result.value, ['count', 'total', 'feedback']);
        }
        else if (key === 'compiler') next.compiler = result.value;
        else if (key === 'activityStats') next.activityStats = result.value || {};
        else next.activities = asArray(result.value, ['activities', 'data']);
      });
      return next;
    });

    const coreResults = await Promise.allSettled(coreSources.map(([, request]) => request()));
    applyResults(coreSources, coreResults);
    setCoreLoading(false);

    const secondaryResults = await Promise.allSettled(secondarySources.map(([, request]) => request()));
    applyResults(secondarySources, secondaryResults);
    const failed = [...coreResults, ...secondaryResults].filter((result) => result.status === 'rejected').length;
    if (failed) setWarning(`${failed} dashboard source${failed > 1 ? 's are' : ' is'} temporarily unavailable. Showing available data.`);
    setSecondaryLoading(false);
  }, [allowed]);

  const loading = coreLoading || secondaryLoading;

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const summary = useMemo(() => {
    const now = Date.now();
    const upcoming = data.events.filter((event) => new Date(event.startDate || event.start).getTime() > now).length;
    const activeAssessments = data.assessments.filter((assessment) =>
      ['published', 'active', 'live'].includes(String(assessment.status || '').toLowerCase()) || assessment.isVisible
    ).length;
    const compilerSummary = data.compiler?.summary || {};
    return {
      students: data.studentCount || data.students.length,
      interviews: data.events.length,
      upcoming,
      assessments: data.assessments.length,
      activeAssessments,
      feedback: data.feedbackCount || data.feedback.length,
      problems: compilerSummary.totalProblems || 0,
      activeCoders: compilerSummary.activeStudentsLast7Days || 0,
      todayActions: data.activityStats?.todayActivities || 0,
      totalActions: data.activityStats?.totalActivities || 0,
    };
  }, [data]);

  const updates = useMemo(() => [
    ...data.events.map((item) => ({
      id: `event-${item._id || item.id}`,
      title: item.name || item.title || 'Interview',
      type: 'Interview',
      status: item.status || 'scheduled',
      date: dateOf(item),
      to: `/coordinator/event/${item._id || item.id}`,
    })),
    ...data.assessments.map((item) => ({
      id: `assessment-${item._id || item.id}`,
      title: item.title || item.name || 'Assessment',
      type: 'Assessment',
      status: item.status || (item.isVisible ? 'published' : 'draft'),
      date: dateOf(item),
      to: '/coordinator/assessment',
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5), [data]);

  const activityTrend = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      return { key: date.toISOString().slice(0, 10), label: date.toLocaleDateString([], { weekday: 'short' }), value: 0 };
    });
    const byDate = new Map(days.map((day) => [day.key, day]));
    data.activities.forEach((entry) => {
      const date = new Date(entry?.createdAt);
      if (!Number.isNaN(date.getTime())) {
        const key = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString().slice(0, 10);
        if (byDate.has(key)) byDate.get(key).value += 1;
      }
    });
    return days;
  }, [data.activities]);

  const shortcuts = [
    allowed('coordinator.interviews.create') && { label: 'Create interview', detail: 'Build a new interview round', to: '/coordinator/event/create', Icon: CalendarDays },
    allowed('coordinator.students.view') && { label: 'My students', detail: 'Review your assigned cohort', to: '/coordinator/students', Icon: Users },
    allowed('coordinator.assessment.create') && { label: 'Create assessment', detail: 'Prepare a new evaluation', to: '/coordinator/assessment/create', Icon: ClipboardList },
    allowed('coordinator.learning.manage') && { label: 'Learning modules', detail: 'Manage semester learning', to: '/coordinator/subjects', Icon: BookOpen },
  ].filter(Boolean);

  const upcomingSchedule = data.events
    .filter((event) => new Date(event.startDate || event.start).getTime() >= Date.now() || String(event.status).toLowerCase() === 'live')
    .sort((a, b) => new Date(a.startDate || a.start) - new Date(b.startDate || b.start))
    .slice(0, 5);

  const workQueue = [
    allowed('coordinator.assessment.view') && {
      label: summary.activeAssessments ? 'Review assessments' : 'Prepare an assessment',
      detail: summary.activeAssessments ? `${summary.activeAssessments} active evaluations` : 'No active evaluation is visible',
      to: allowed('coordinator.assessment.create') && !summary.activeAssessments ? '/coordinator/assessment/create' : '/coordinator/assessment',
      Icon: ClipboardList,
    },
    allowed('coordinator.interviews.view') && {
      label: summary.upcoming ? 'Check interview readiness' : 'Build the next interview',
      detail: summary.upcoming ? `${summary.upcoming} interviews are upcoming` : 'The upcoming schedule is empty',
      to: allowed('coordinator.interviews.create') && !summary.upcoming ? '/coordinator/event/create' : '/coordinator/interviews',
      Icon: CalendarDays,
    },
    allowed('coordinator.students.view') && {
      label: 'Review student cohort', detail: `${summary.students} students are available to manage`, to: '/coordinator/students', Icon: Users,
    },
  ].filter(Boolean);

  const modules = [
    allowed('coordinator.students.view') && { label: 'Students', to: '/coordinator/students', Icon: Users, detail: 'Cohort and profiles' },
    allowed('coordinator.learning.manage') && { label: 'Learning', to: '/coordinator/subjects', Icon: BookOpen, detail: 'Subjects and modules' },
    allowed('coordinator.assessment.view') && { label: 'Assessments', to: '/coordinator/assessment', Icon: ClipboardList, detail: 'Evaluations and reports' },
    allowed('coordinator.library.view') && { label: 'Question library', to: '/coordinator/library', Icon: Library, detail: 'Reusable questions' },
    allowed('coordinator.compiler.manage') && { label: 'Coding workspace', to: '/coordinator/library/coding/problems', Icon: Code2, detail: 'Problems and analytics' },
    allowed('coordinator.feedback.view') && { label: 'Feedback', to: '/coordinator/feedback', Icon: MessageSquare, detail: 'Student responses' },
    allowed('coordinator.announcements.manage') && { label: 'Announcements', to: '/coordinator/announcements/manage', Icon: Megaphone, detail: 'Platform communication' },
    allowed('coordinator.company.view') && { label: 'Company insights', to: '/coordinator/company-insights', Icon: Building2, detail: 'Hiring benchmarks' },
  ].filter(Boolean);

  const dashboardLinks = [...shortcuts, ...modules].filter((item, index, items) => items.findIndex((candidate) => candidate.to === item.to) === index);

  return (
    <div className="min-h-screen bg-slate-100/70 font-sans text-slate-950 dark:bg-gray-950 dark:text-white">
      <main className="mx-auto w-full max-w-[1680px] px-4 py-4 xl:px-6">
        <header className="mb-3 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/50">
              <Sparkles className="h-4 w-4 text-sky-700" />
            </div>
            <div><h1 className="text-lg font-semibold text-slate-950 dark:text-white">Overview</h1><p className="text-[11px] text-slate-500 dark:text-slate-400">{user?.name?.split(' ')[0] || 'Coordinator'} · permission-based workspace</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {allowed('coordinator.assessment.create') && <Link to="/coordinator/assessment/create" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-sky-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-sky-700"><Plus className="h-3.5 w-3.5" />New assessment</Link>}
            <span className="inline-flex h-9 items-center gap-1.5 rounded-md bg-violet-50 px-3 text-xs font-semibold text-violet-700 dark:bg-violet-400/10 dark:text-violet-200"><ShieldCheck className="h-3.5 w-3.5" />{Array.isArray(user?.permissions) ? user.permissions.length : 0} permissions</span>
            <button type="button" onClick={loadDashboard} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200 dark:hover:bg-gray-700"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
          </div>
        </header>

        {warning && (
          <div className="mb-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
            <AlertCircle className="h-4 w-4 shrink-0" /> {warning}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {allowed('coordinator.students.view') && <Metric label="My students" value={summary.students} helper="Students assigned to you" Icon={Users} color="bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200" to="/coordinator/students" loading={coreLoading} />}
          {allowed('coordinator.interviews.view') && <Metric label="Interviews" value={summary.interviews} helper={`${summary.upcoming} upcoming`} Icon={CalendarDays} color="bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200" to="/coordinator/interviews" loading={coreLoading} />}
          {allowed('coordinator.assessment.view') && <Metric label="Assessments" value={summary.assessments} helper={`${summary.activeAssessments} active`} Icon={ClipboardList} color="bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200" to="/coordinator/assessment" loading={coreLoading} />}
          {allowed('coordinator.feedback.view') && <Metric label="Feedback" value={summary.feedback} helper="Visible feedback records" Icon={MessageSquare} color="bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-200" to="/coordinator/feedback" loading={secondaryLoading} />}
          {allowed('coordinator.compiler.view') && <Metric label="Coding problems" value={summary.problems} helper="Problems in workspace" Icon={Code2} color="bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200" to="/coordinator/library/coding/problems" loading={secondaryLoading} />}
        </div>

        <div className="mt-3 grid items-start gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
          <Panel title="Activity trend" action={<div className="flex items-center gap-1"><span className="text-[10px] font-semibold text-slate-500">Last 7 days</span><SectionHelp text="Daily coordinator actions recorded during the last seven days." /></div>}>
            {allowed('coordinator.activity.view') ? <ActivityTrend data={activityTrend} loading={secondaryLoading} /> : <div className="flex h-28 items-center justify-center rounded-md bg-slate-50 text-xs text-slate-500 dark:bg-gray-800">Activity access is not enabled.</div>}
            <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
              {allowed('coordinator.assessment.view') && <Link to="/coordinator/assessment" className="border-l-2 border-emerald-500 pl-2"><span className="block text-lg font-bold text-slate-900 dark:text-white">{summary.activeAssessments}</span><span className="text-[10px] font-semibold text-slate-500">Active assessments</span></Link>}
              {allowed('coordinator.interviews.view') && <Link to="/coordinator/interviews" className="border-l-2 border-sky-500 pl-2"><span className="block text-lg font-bold text-slate-900 dark:text-white">{summary.upcoming}</span><span className="text-[10px] font-semibold text-slate-500">Upcoming interviews</span></Link>}
              {allowed('coordinator.compiler.view') && <Link to="/coordinator/library/coding/problems" className="border-l-2 border-indigo-500 pl-2"><span className="block text-lg font-bold text-slate-900 dark:text-white">{summary.activeCoders}</span><span className="text-[10px] font-semibold text-slate-500">Active coders · 7 days</span></Link>}
              {allowed('coordinator.feedback.view') && <Link to="/coordinator/feedback" className="border-l-2 border-violet-500 pl-2"><span className="block text-lg font-bold text-slate-900 dark:text-white">{summary.feedback}</span><span className="text-[10px] font-semibold text-slate-500">Feedback records</span></Link>}
            </div>
          </Panel>

          <Panel title="Action center" action={<SectionHelp text="The most relevant actions allowed by your current permissions." />}>
            <div className="space-y-2">
              {workQueue.length ? workQueue.map(({ label, detail, to, Icon }) => (
                <Link key={label} to={to} className="group flex items-center gap-2.5 rounded-md border border-slate-200 p-2.5 transition hover:border-sky-200 hover:bg-sky-50/50 dark:border-gray-700 dark:hover:bg-gray-800">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200"><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-900 dark:text-white">{label}</span><span className="block truncate text-[11px] text-slate-500">{detail}</span></span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400 transition group-hover:translate-x-1" />
                </Link>
              )) : <p className="text-xs text-slate-500">No operational modules have been granted yet.</p>}
            </div>
          </Panel>
        </div>

        <div className="mt-3 grid items-start gap-3 xl:grid-cols-[minmax(300px,0.7fr)_minmax(0,1.3fr)]">
          <Panel title="Upcoming schedule" subtitle="Next interview events." action={allowed('coordinator.interviews.view') && <Link to="/coordinator/interviews" className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">View all</Link>}>
            {coreLoading ? <div className="space-y-2">{[1, 2, 3].map((item) => <div key={item} className="h-10 animate-pulse rounded bg-slate-100 dark:bg-gray-800" />)}</div> : upcomingSchedule.length ? (
              <div className="divide-y divide-slate-100 dark:divide-gray-700">
                {upcomingSchedule.map((event) => <Link key={event._id || event.id} to={`/coordinator/event/${event._id || event.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-sky-700"><span className="min-w-0"><span className="block truncate text-xs font-bold text-slate-900 dark:text-white">{event.name || event.title || 'Interview event'}</span><span className="block text-[10px] text-slate-500">{formatDate(event.startDate || event.start)}</span></span><Clock3 className="h-3.5 w-3.5 shrink-0 text-slate-400" /></Link>)}
              </div>
            ) : <p className="py-4 text-xs text-slate-500">No upcoming interviews are scheduled.</p>}
          </Panel>

          <Panel title="Latest updates" subtitle="Last five record changes.">
            <div className="divide-y divide-slate-100 overflow-hidden rounded-md border border-slate-200 dark:divide-gray-700 dark:border-gray-700">
              {coreLoading ? (
                <div className="space-y-2 p-3">{[1, 2, 3, 4].map((item) => <div key={item} className="h-10 animate-pulse rounded bg-slate-100 dark:bg-gray-800" />)}</div>
              ) : updates.length ? updates.map((item) => (
                <Link key={item.id} to={item.to} className="flex items-center justify-between gap-4 px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-gray-800">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{item.title}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">{item.type} · {formatDate(item.date)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusTone[String(item.status).toLowerCase()] || 'bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200'}`}>{item.status}</span>
                </Link>
              )) : (
                <div className="p-5 text-sm font-semibold text-slate-500">No interview or assessment updates yet.</div>
              )}
            </div>
          </Panel>
        </div>

        <div className="mt-3">
          <Panel title="Shortcuts" action={<span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600"><ShieldCheck className="h-3.5 w-3.5" />Permission controlled</span>}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              {dashboardLinks.length ? dashboardLinks.map(({ label, to, Icon }) => <Link key={to} to={to} className="group flex items-center gap-2 rounded-md border border-slate-200 p-2 transition hover:border-sky-300 hover:bg-sky-50/50 dark:border-gray-700 dark:hover:border-sky-700 dark:hover:bg-gray-800"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-700 dark:bg-gray-700 dark:text-gray-200"><Icon className="h-3.5 w-3.5" /></span><span className="truncate text-[11px] font-semibold text-slate-800 dark:text-white">{label}</span></Link>) : <p className="text-xs text-slate-500">No management tools have been granted.</p>}
            </div>
          </Panel>
        </div>
      </main>
    </div>
  );
}
