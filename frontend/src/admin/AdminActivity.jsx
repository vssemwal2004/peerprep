import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FilterX,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { api } from '../utils/api';
import { getApiBase } from '../utils/apiBase';
import { useToast } from '../components/CustomToast';

const DAY_MS = 86_400_000;
const PAGE_SIZE = 40;
const ACTIONS = [
  'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE',
  'EXPORT', 'UPLOAD', 'DOWNLOAD', 'ASSIGN', 'UNASSIGN', 'APPROVE',
  'REJECT', 'SCHEDULE', 'RESCHEDULE', 'CANCEL', 'ARCHIVE', 'RESTORE',
  'REORDER', 'BULK_CREATE', 'BULK_UPDATE', 'BULK_DELETE',
];
const TARGETS = [
  'STUDENT', 'ADMIN', 'COORDINATOR', 'EVENT', 'SUBJECT', 'CHAPTER', 'TOPIC',
  'SEMESTER', 'ANNOUNCEMENT', 'ASSESSMENT', 'EMAIL_TEMPLATE', 'FEEDBACK',
  'PROFILE', 'INTERVIEW', 'SCHEDULE', 'PAIR', 'FILE', 'SLOT', 'SYSTEM',
  'MASTER_DATA', 'UPLOAD_BATCH',
];
const ACTION_TONES = {
  CREATE: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  BULK_CREATE: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  UPDATE: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30',
  BULK_UPDATE: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30',
  DELETE: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
  BULK_DELETE: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
  CANCEL: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
  LOGIN: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30',
  EXPORT: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
};
const fieldClass = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-sky-900/40';

function inputDate(date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function initialDates() {
  const end = new Date();
  const start = new Date(end.getTime() - (9 * DAY_MS));
  return { startDate: inputDate(start), endDate: inputDate(end) };
}

function dayTitle(value) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(Date.now() - DAY_MS);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function changeLines(changes) {
  if (!changes || typeof changes !== 'object') return [];
  return Object.entries(changes).flatMap(([key, value]) => {
    if (!value || typeof value !== 'object') return [];
    if (!Object.prototype.hasOwnProperty.call(value, 'from') && !Object.prototype.hasOwnProperty.call(value, 'to')) return [];
    const show = (item) => {
      if (item === null || item === undefined || item === '') return 'Not set';
      if (typeof item === 'object') return JSON.stringify(item);
      return String(item);
    };
    return [`${key}: ${show(value.from)} → ${show(value.to)}`];
  });
}

function Metric({ icon: Icon, label, value, hint, tone = 'sky' }) {
  const tones = {
    sky: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950 dark:text-white">{value}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
      </div>
    </div>
  );
}

function ActivityRow({ item }) {
  const changes = changeLines(item.changes);
  const tone = ACTION_TONES[item.actionType] || 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
  return (
    <li className="group px-4 py-4 transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40 sm:px-5">
      <div className="grid gap-3 sm:grid-cols-[7rem_minmax(10rem,1fr)_7.5rem_minmax(8rem,.8fr)_minmax(14rem,1.5fr)] sm:items-start sm:gap-4">
        <div>
          <time className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          <p className="mt-0.5 text-xs text-slate-400">{new Date(item.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short' })}</p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{item.userEmail}</p>
          <p className="mt-0.5 text-xs capitalize text-slate-500 dark:text-slate-400">{item.userRole}</p>
        </div>
        <div><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ring-1 ring-inset ${tone}`}>{item.actionType?.replaceAll('_', ' ')}</span></div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.targetType?.replaceAll('_', ' ') || 'System'}</p>
          {item.targetId && <p className="mt-0.5 truncate text-xs text-slate-400" title={item.targetId}>{item.targetId}</p>}
        </div>
        <div className="min-w-0">
          <p className="text-sm leading-5 text-slate-700 dark:text-slate-200">{item.description}</p>
          {changes.length > 0 && (
            <details className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              <summary className="cursor-pointer font-semibold text-sky-700 dark:text-sky-300">View {changes.length} change{changes.length === 1 ? '' : 's'}</summary>
              <ul className="mt-2 space-y-1 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/70">{changes.map((line) => <li key={line} className="break-words">{line}</li>)}</ul>
            </details>
          )}
        </div>
      </div>
    </li>
  );
}

export default function AdminActivity() {
  const toast = useToast();
  const [activities, setActivities] = useState([]);
  const [coordinators, setCoordinators] = useState([]);
  const [stats, setStats] = useState({ totalActivities: 0, todayActivities: 0, actionTypeStats: [] });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [actor, setActor] = useState('all');
  const [actionType, setActionType] = useState('');
  const [targetType, setTargetType] = useState('');
  const [{ startDate, endDate }, setDates] = useState(initialDates);

  const filterParams = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (actor === 'admin' || actor === 'coordinator') params.set('actorScope', actor);
    if (actor.startsWith('person:')) params.set('coordinatorEmail', actor.slice(7));
    if (actionType) params.set('actionType', actionType);
    if (targetType) params.set('targetType', targetType);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return params;
  }, [actionType, actor, endDate, search, startDate, targetType]);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const pageParams = new URLSearchParams(filterParams);
      pageParams.set('page', String(page));
      pageParams.set('limit', String(PAGE_SIZE));
      const [result, summary] = await Promise.all([
        api.getActivities(pageParams.toString()),
        api.getActivityStats(filterParams.toString()),
      ]);
      setActivities(result.activities || []);
      setTotalPages(result.pagination?.pages || 1);
      setStats(summary);
    } catch (error) {
      console.error('Failed to load activities:', error);
      toast.error('Activity log could not be loaded');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterParams, page, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    api.listAllCoordinators().then((result) => setCoordinators(result?.coordinators || [])).catch(() => setCoordinators([]));
  }, []);

  const groupedDays = useMemo(() => {
    const groups = new Map();
    for (const item of activities) {
      const key = new Date(item.createdAt).toDateString();
      if (!groups.has(key)) groups.set(key, { key, title: dayTitle(item.createdAt), items: [] });
      groups.get(key).items.push(item);
    }
    return [...groups.values()];
  }, [activities]);

  const actionCounts = useMemo(() => new Map((stats.actionTypeStats || []).map((item) => [item._id, item.count])), [stats.actionTypeStats]);
  const changes = ['CREATE', 'UPDATE', 'BULK_CREATE', 'BULK_UPDATE'].reduce((sum, type) => sum + (actionCounts.get(type) || 0), 0);
  const sensitive = ['DELETE', 'BULK_DELETE', 'CANCEL', 'REJECT'].reduce((sum, type) => sum + (actionCounts.get(type) || 0), 0);

  const reset = () => {
    setSearchInput(''); setSearch(''); setActor('all'); setActionType(''); setTargetType('');
    setDates(initialDates()); setPage(1);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const response = await fetch(`${getApiBase()}/activity/export?${filterParams}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Export failed');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `university-activity-${inputDate(new Date())}.csv`;
      document.body.appendChild(anchor);
      anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      toast.success('10-day activity sheet exported');
    } catch (error) {
      console.error(error);
      toast.error('Activity export failed');
    } finally { setExporting(false); }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative px-5 py-6 sm:px-7">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-sky-50 to-transparent dark:from-sky-950/30" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-400">University workspace</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">Activity log</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">A focused 10-day audit sheet for university administrators and coordinators. Logs stay inside this university database.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => load(true)} disabled={refreshing} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button type="button" onClick={exportCsv} disabled={exporting} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500">
                <Download className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export sheet'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Activity summary">
        <Metric icon={Activity} label="10-day activity" value={stats.totalActivities || 0} hint="Events in the selected view" />
        <Metric icon={CalendarDays} label="Today" value={stats.todayActivities || 0} hint="Actions recorded since midnight" tone="violet" />
        <Metric icon={ShieldCheck} label="Changes" value={changes} hint="Created or updated records" tone="emerald" />
        <Metric icon={Users} label="Sensitive actions" value={sensitive} hint="Delete, cancel or reject events" tone="rose" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label="Activity filters">
        <form onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); }} className="grid gap-3 xl:grid-cols-[minmax(16rem,1.5fr)_minmax(12rem,1fr)_repeat(2,minmax(9rem,.75fr))_minmax(9rem,.75fr)_minmax(9rem,.75fr)_auto]">
          <label className="relative"><span className="sr-only">Search activity</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className={`${fieldClass} w-full pl-9`} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search action, email or record ID" /></label>
          <select className={fieldClass} value={actor} onChange={(event) => { setActor(event.target.value); setPage(1); }} aria-label="Actor">
            <option value="all">Everyone in this university</option><option value="admin">University admins</option><option value="coordinator">All coordinators</option>
            {coordinators.map((person) => <option key={person._id || person.email} value={`person:${person.email}`}>{person.name || person.email}</option>)}
          </select>
          <select className={fieldClass} value={actionType} onChange={(event) => { setActionType(event.target.value); setPage(1); }} aria-label="Action type"><option value="">All actions</option>{ACTIONS.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select>
          <select className={fieldClass} value={targetType} onChange={(event) => { setTargetType(event.target.value); setPage(1); }} aria-label="Record type"><option value="">All records</option>{TARGETS.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select>
          <label><span className="sr-only">Start date</span><input type="date" className={`${fieldClass} w-full`} value={startDate} max={endDate} onChange={(event) => { setDates((value) => ({ ...value, startDate: event.target.value })); setPage(1); }} /></label>
          <label><span className="sr-only">End date</span><input type="date" className={`${fieldClass} w-full`} value={endDate} min={startDate} onChange={(event) => { setDates((value) => ({ ...value, endDate: event.target.value })); setPage(1); }} /></label>
          <div className="flex gap-2"><button type="submit" className="h-10 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700">Search</button><button type="button" onClick={reset} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Reset filters"><FilterX className="h-4 w-4" /></button></div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-labelledby="sheet-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-5">
          <div><h2 id="sheet-title" className="font-bold text-slate-950 dark:text-white">10-day activity sheet</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Newest actions appear first · Page {page} of {totalPages}</p></div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{stats.totalActivities || 0} records</span>
        </div>
        <div className="hidden grid-cols-[7rem_minmax(10rem,1fr)_7.5rem_minmax(8rem,.8fr)_minmax(14rem,1.5fr)] gap-4 border-b border-slate-100 bg-slate-50/80 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 sm:grid"><span>Time</span><span>Actor</span><span>Action</span><span>Record</span><span>What changed</span></div>
        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-500"><RefreshCw className="h-5 w-5 animate-spin text-sky-600" /> Loading activity…</div>
        ) : groupedDays.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800"><Activity className="h-6 w-6" /></span><p className="mt-4 font-semibold text-slate-900 dark:text-white">No activity in this view</p><p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">Try another actor or clear the filters. New university actions will appear here automatically.</p></div>
        ) : groupedDays.map((day) => (
          <div key={day.key}><div className="sticky top-0 z-[1] flex items-center justify-between border-y border-slate-100 bg-white/95 px-4 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-5"><h3 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-700 dark:text-slate-300">{day.title}</h3><span className="text-xs tabular-nums text-slate-400">{day.items.length} event{day.items.length === 1 ? '' : 's'}</span></div><ol className="divide-y divide-slate-100 dark:divide-slate-800">{day.items.map((item) => <ActivityRow key={item._id} item={item} />)}</ol></div>
        ))}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30 sm:px-5"><p className="text-xs text-slate-500">Page {page} of {totalPages}</p><div className="flex gap-2"><button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><ChevronLeft className="h-4 w-4" /> Previous</button><button type="button" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Next <ChevronRight className="h-4 w-4" /></button></div></div>
        )}
      </section>
    </div>
  );
}
