import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Code2,
  MessageSquare,
  RefreshCw,
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

function Metric({ label, value, helper, Icon, color }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">{value}</p>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{helper}</p>
        </div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${color}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, action, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-900">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-950 dark:text-white">{title}</h2>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function CoordinatorDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState('');
  const [data, setData] = useState({
    students: [], studentCount: 0, events: [], assessments: [], feedback: [], compiler: null,
  });

  const allowed = useCallback((permission) => hasPermission(user, permission), [user]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setWarning('');
    const sources = [
      allowed('coordinator.students.view') && ['students', () => api.listAllStudents({ page: 1, limit: 8, sortOrder: 'desc' })],
      allowed('coordinator.interviews.view') && ['events', () => api.listEvents()],
      allowed('coordinator.assessment.view') && ['assessments', () => api.listAssessments()],
      allowed('coordinator.feedback.view') && ['feedback', () => api.listCoordinatorFeedback()],
      allowed('coordinator.compiler.view') && ['compiler', () => api.getCompilerOverview()],
    ].filter(Boolean);

    const results = await Promise.allSettled(sources.map(([, request]) => request()));
    const next = { students: [], studentCount: 0, events: [], assessments: [], feedback: [], compiler: null };
    results.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      const key = sources[index][0];
      if (key === 'students') {
        next.students = asArray(result.value, ['students', 'data']);
        next.studentCount = countOf(result.value, ['total', 'count', 'students']);
      } else if (key === 'events') next.events = asArray(result.value, ['events', 'data']);
      else if (key === 'assessments') next.assessments = asArray(result.value, ['assessments', 'data']);
      else if (key === 'feedback') next.feedback = asArray(result.value, ['feedback', 'data']);
      else next.compiler = result.value;
    });
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed) setWarning(`${failed} dashboard source${failed > 1 ? 's are' : ' is'} temporarily unavailable.`);
    setData(next);
    setLoading(false);
  }, [allowed]);

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
      feedback: data.feedback.length,
      problems: compilerSummary.totalProblems || 0,
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
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8), [data]);

  const shortcuts = [
    allowed('coordinator.interviews.create') && { label: 'Create interview', detail: 'Build a new interview round', to: '/coordinator/event/create', Icon: CalendarDays },
    allowed('coordinator.students.view') && { label: 'My students', detail: 'Review your assigned cohort', to: '/coordinator/students', Icon: Users },
    allowed('coordinator.assessment.create') && { label: 'Create assessment', detail: 'Prepare a new evaluation', to: '/coordinator/assessment/create', Icon: ClipboardList },
    allowed('coordinator.learning.manage') && { label: 'Learning modules', detail: 'Manage semester learning', to: '/coordinator/subjects', Icon: BookOpen },
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-50 pt-20 dark:bg-gray-950">
      <main className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">
              <Sparkles className="h-3.5 w-3.5" /> Coordinator workspace
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
              Welcome back, {user?.name?.split(' ')[0] || 'Coordinator'}.
            </h1>
            <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">
              Your assigned students, interviews, assessments and recent updates in one place.
            </p>
          </div>
          <button type="button" onClick={loadDashboard} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:border-sky-300 hover:text-sky-700 dark:border-white/10 dark:bg-gray-900 dark:text-slate-200">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </header>

        {warning && (
          <div className="mb-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
            <AlertCircle className="h-4 w-4 shrink-0" /> {warning}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {allowed('coordinator.students.view') && <Metric label="My students" value={loading ? '...' : summary.students} helper="Students assigned to you" Icon={Users} color="bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200" />}
          {allowed('coordinator.interviews.view') && <Metric label="Interviews" value={loading ? '...' : summary.interviews} helper={`${summary.upcoming} upcoming`} Icon={CalendarDays} color="bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200" />}
          {allowed('coordinator.assessment.view') && <Metric label="Assessments" value={loading ? '...' : summary.assessments} helper={`${summary.activeAssessments} active`} Icon={ClipboardList} color="bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200" />}
          {allowed('coordinator.feedback.view') && <Metric label="Feedback" value={loading ? '...' : summary.feedback} helper="Visible feedback records" Icon={MessageSquare} color="bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-200" />}
          {allowed('coordinator.compiler.view') && <Metric label="Coding problems" value={loading ? '...' : summary.problems} helper="Problems in workspace" Icon={Code2} color="bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200" />}
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <Panel title="Latest updates" subtitle="Recent interviews and assessment changes available to you.">
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-white/10 dark:border-white/10">
              {loading ? (
                <div className="p-5 text-sm font-semibold text-slate-500">Loading updates...</div>
              ) : updates.length ? updates.map((item) => (
                <Link key={item.id} to={item.to} className="flex items-center justify-between gap-4 p-4 transition hover:bg-slate-50 dark:hover:bg-white/[0.04]">
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

          <Panel title="Quick actions" subtitle="Actions shown here follow access granted by the admin.">
            <div className="space-y-3">
              {shortcuts.length ? shortcuts.map(({ label, detail, to, Icon }) => (
                <Link key={to} to={to} className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-sky-200 hover:bg-sky-50/50 dark:border-white/10 dark:hover:border-sky-400/30 dark:hover:bg-sky-400/10">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"><Icon className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900 dark:text-white">{label}</span><span className="block truncate text-xs text-slate-500">{detail}</span></span>
                  <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-1" />
                </Link>
              )) : <p className="text-sm font-medium text-slate-500">No management actions have been granted yet.</p>}
            </div>
          </Panel>
        </div>
      </main>
    </div>
  );
}
