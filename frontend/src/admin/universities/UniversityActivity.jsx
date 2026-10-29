import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, History, RefreshCw, Search, ShieldCheck, UserRound } from 'lucide-react';
import { api } from '../../utils/api';
import { actionLabel } from './universityModel';
import { Button, EmptyState, Notice, PageHeader, Pill, pageShell, helper, inputClass } from './ui';

const DAY_MS = 86_400_000;
const KINDS = [
  { value: '', label: 'All platform activity' },
  { value: 'university', label: 'University management' },
  { value: 'publication', label: 'Shared assessments' },
  { value: 'prep_score', label: 'Prep Score' },
  { value: 'prep_coin', label: 'Prep Coin' },
];

function dayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayLabel(value) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(Date.now() - DAY_MS);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function detailsText(entry) {
  const details = entry.details || {};
  return details.reason
    || details.name
    || details.title
    || details.email
    || (entry.universityId ? `Platform configuration for ${entry.universityId}` : 'Platform administration change');
}

function toneFor(action = '') {
  if (action.includes('deleted') || action.includes('removed')) return 'danger';
  if (action.includes('created') || action.includes('published') || action.includes('topup')) return 'success';
  if (action.includes('viewed')) return 'neutral';
  return 'info';
}

function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div><p className={helper}>{label}</p><p className="mt-1 text-2xl font-bold tabular-nums text-slate-950 dark:text-white">{value}</p><p className={`mt-1 ${helper}`}>{hint}</p></div>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"><Icon className="h-4 w-4" aria-hidden="true" /></span>
      </div>
    </div>
  );
}

/** Control-plane actions only. Tenant databases are deliberately never queried here. */
export default function UniversityActivity() {
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (before = '', refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const page = await api.platformAudit({ action, before });
      setEntries((previous) => (before ? [...previous, ...(page.entries || [])] : (page.entries || [])));
      setCursor(page.nextCursor || null);
      setTotal(page.total ?? page.entries?.length ?? 0);
    } catch (cause) {
      setError(cause.message || 'Activity could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [action]);

  useEffect(() => { setSelectedDay(''); void load(); }, [load]);

  const dayStrip = useMemo(() => {
    const counts = new Map();
    for (const entry of entries) counts.set(dayKey(entry.createdAt), (counts.get(dayKey(entry.createdAt)) || 0) + 1);
    return Array.from({ length: 10 }, (_, index) => {
      const date = new Date(Date.now() - ((9 - index) * DAY_MS));
      const key = dayKey(date);
      return { key, date, count: counts.get(key) || 0 };
    });
  }, [entries]);

  const visibleEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (selectedDay && dayKey(entry.createdAt) !== selectedDay) return false;
      if (!term) return true;
      return [actionLabel(entry.action), entry.actorName, entry.action, entry.universityId, detailsText(entry)]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [entries, search, selectedDay]);

  const days = useMemo(() => {
    const groups = new Map();
    for (const entry of visibleEntries) {
      const key = dayKey(entry.createdAt);
      if (!groups.has(key)) groups.set(key, { key, label: dayLabel(entry.createdAt), entries: [] });
      groups.get(key).entries.push(entry);
    }
    return [...groups.values()];
  }, [visibleEntries]);

  const todayCount = entries.filter((entry) => dayKey(entry.createdAt) === dayKey(new Date())).length;
  const operators = new Set(entries.map((entry) => entry.actorName).filter(Boolean)).size;
  const sensitive = entries.filter((entry) => /delete|remove|restore|rotat/i.test(entry.action)).length;

  return (
    <div className={`${pageShell} max-w-6xl`}>
      <PageHeader
        eyebrow="Master administration"
        title="Activity log"
        description="The last 10 days of control-plane changes made by Master Admins. University admin and coordinator logs remain isolated in each university database."
        actions={<Button variant="secondary" icon={RefreshCw} busy={refreshing} onClick={() => load('', true)}>Refresh</Button>}
      />

      <Notice tone="info">This feed contains PeerPrep control-plane actions only. It does not combine or expose activity from university databases.</Notice>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Platform activity summary">
        <StatCard icon={Activity} label="10-day activity" value={total} hint="Master workspace events" />
        <StatCard icon={CalendarDays} label="Today" value={todayCount} hint="Actions loaded today" />
        <StatCard icon={UserRound} label="Operators" value={operators} hint="Active Master Admins" />
        <StatCard icon={ShieldCheck} label="Sensitive actions" value={sensitive} hint="Remove, restore or rotate" />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-labelledby="days-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 id="days-title" className="text-sm font-bold text-slate-950 dark:text-white">10-day activity sheet</h2><p className={helper}>Select a day to focus the timeline.</p></div>
          {selectedDay && <Button variant="ghost" onClick={() => setSelectedDay('')}>Show all 10 days</Button>}
        </div>
        <div className="mt-4 grid grid-cols-5 gap-2 lg:grid-cols-10">
          {dayStrip.map((day) => {
            const active = selectedDay === day.key;
            return (
              <button key={day.key} type="button" onClick={() => setSelectedDay(active ? '' : day.key)} aria-pressed={active}
                className={`rounded-xl border px-2 py-3 text-center transition ${active ? 'border-sky-500 bg-sky-50 text-sky-800 ring-2 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-900' : 'border-slate-200 hover:border-sky-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">{day.date.toLocaleDateString([], { weekday: 'short' })}</span>
                <span className="mt-0.5 block text-sm font-bold tabular-nums">{day.date.getDate()}</span>
                <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">{day.count} event{day.count === 1 ? '' : 's'}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label="Activity filters">
        <div className="grid gap-3 sm:grid-cols-[minmax(15rem,1fr)_minmax(13rem,.45fr)]">
          <label className="relative"><span className="sr-only">Search platform activity</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className={`${inputClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search action, operator or details" /></label>
          <select className={inputClass} value={action} onChange={(event) => setAction(event.target.value)} aria-label="Kind of activity">{KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-labelledby="timeline-title">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800"><div><h2 id="timeline-title" className="font-bold text-slate-950 dark:text-white">Control-plane timeline</h2><p className={helper}>{visibleEntries.length} loaded event{visibleEntries.length === 1 ? '' : 's'} shown</p></div><Pill tone="neutral">Master only</Pill></div>
        {error && <div className="p-4"><Notice tone="danger">{error}</Notice></div>}
        {loading && !entries.length ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500"><RefreshCw className="h-4 w-4 animate-spin text-sky-600" /> Loading activity…</div>
        ) : days.length === 0 ? (
          <div className="p-5"><EmptyState icon={History} title="No activity">Nothing matches this day or filter.</EmptyState></div>
        ) : (
          <div>
            {days.map((day) => (
              <div key={day.key}>
                <div className="sticky top-0 z-[1] flex items-center justify-between border-y border-slate-100 bg-slate-50/95 px-5 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80"><h3 className="text-xs font-bold uppercase tracking-[.14em] text-slate-600 dark:text-slate-300">{day.label}</h3><span className={helper}>{day.entries.length} event{day.entries.length === 1 ? '' : 's'}</span></div>
                <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                  {day.entries.map((entry) => (
                    <li key={entry.id} className="grid gap-3 px-5 py-4 transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40 sm:grid-cols-[6rem_minmax(11rem,.8fr)_minmax(14rem,1.5fr)] sm:items-start">
                      <time className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                      <div className="min-w-0"><Pill tone={toneFor(entry.action)}>{actionLabel(entry.action)}</Pill><p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">by {entry.actorName || 'System'}</p></div>
                      <div className="min-w-0"><p className="text-sm font-medium text-slate-800 dark:text-slate-100">{detailsText(entry)}</p>{entry.universityId && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Target workspace: {entry.universityId}</p>}</div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
        {cursor && !selectedDay && !search && <div className="flex justify-center border-t border-slate-200 p-4 dark:border-slate-800"><Button variant="secondary" busy={loading} onClick={() => load(cursor)}>Load more within 10 days</Button></div>}
      </section>
    </div>
  );
}
