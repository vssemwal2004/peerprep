import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, History, Info, Loader2, LogIn, RefreshCw, Search, ShieldAlert, Users } from 'lucide-react';
import { api } from '../../utils/api';
import { actionLabel } from './universityModel';
import GuideInfo from '../../guide/platform/GuideInfo';
import PageGuideButton from '../../guide/platform/PageGuideButton';

// Master Admin → Activity log. One timeline merged on the server (platform/masterActivity.js):
// platform settings changes (PlatformAudit) and Master Admin workspace actions incl. sign-ins
// (Activity). University databases are never read here.

const RANGES = [{ days: 1, label: 'Today' }, { days: 7, label: '7D' }, { days: 10, label: '10D' }, { days: 30, label: '30D' }];
const SOURCES = [{ value: '', label: 'All' }, { value: 'workspace', label: 'Workspace' }, { value: 'platform', label: 'Platform settings' }];
const CATEGORY_LABELS = {
  login: 'Sign-ins', assessment: 'Assessments', student: 'Students', coordinator: 'Coordinators', admin: 'Admins', event: 'Events',
  announcement: 'Announcements', master_data: 'Master data', subject: 'Subjects', chapter: 'Chapters', topic: 'Topics', semester: 'Semesters',
  university: 'University management', publication: 'Shared assessments', prep_score: 'Prep Score policy', prep_coin: 'Prep Coin',
  prep_readiness: 'Prep Readiness policy', email_template: 'Email templates', upload_batch: 'Upload batches',
};
const categoryLabel = (key) => CATEGORY_LABELS[key] || String(key || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900';
const card = 'rounded-xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900';
const control = `h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[12.5px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${ring}`;

// 24-hour IST time so it fits the narrow time column on one line.
const istTime = (value) => new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
const istDayKey = (value) => new Date(new Date(value).getTime() + 330 * 60_000).toISOString().slice(0, 10);
function dayHeading(key) {
  const today = istDayKey(new Date());
  const yesterday = istDayKey(new Date(Date.now() - 86_400_000));
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
function relative(value) {
  if (!value) return 'No activity';
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} d ago`;
}
const initials = (name = '') => String(name).split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'A';

function Stat({ icon: Icon, label, value, hint, tone = 'sky' }) {
  const tones = { sky: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300', amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300', violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300', rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' };
  return (
    <div className={`${card} flex items-center gap-3 px-3.5 py-3`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-[20px] font-semibold leading-tight tabular-nums text-slate-900 dark:text-white">{value}</p>
        <p className="truncate text-[10.5px] text-slate-400 dark:text-slate-500">{hint}</p>
      </div>
    </div>
  );
}

function SourceChip({ source }) {
  return source === 'platform'
    ? <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">Platform</span>
    : <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">Workspace</span>;
}

/** Control-plane activity only: what PeerPrep's Master Admins did. Tenant databases are never queried. */
export default function UniversityActivity() {
  const [days, setDays] = useState(10);
  const [source, setSource] = useState('');
  const [category, setCategory] = useState('');
  const [actor, setActor] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const [feed, setFeed] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');

  // Search runs on the server, a moment after typing stops.
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 350); return () => clearTimeout(timer); }, [search]);

  const load = useCallback(async (before = '') => {
    if (before) setMore(true); else setLoading(true);
    setError('');
    try {
      const page = await api.platformAudit({ days, source, category, actor, q: query, before });
      setFeed(page);
      setEntries((previous) => (before ? [...previous, ...(page.entries || [])] : (page.entries || [])));
    } catch (cause) {
      setError(cause.message || 'Activity could not be loaded.');
    } finally {
      setLoading(false);
      setMore(false);
    }
  }, [days, source, category, actor, query]);

  useEffect(() => { setSelectedDay(''); void load(); }, [load]);

  const visible = useMemo(() => (selectedDay ? entries.filter((entry) => istDayKey(entry.createdAt) === selectedDay) : entries), [entries, selectedDay]);
  const groups = useMemo(() => {
    const map = new Map();
    for (const entry of visible) {
      const key = istDayKey(entry.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }
    return [...map.entries()];
  }, [visible]);
  const byDay = feed?.byDay || [];
  const peak = Math.max(1, ...byDay.map((row) => row.count));
  const operators = feed?.operators || [];
  const activeOperators = operators.filter((op) => op.actions + op.logins > 0).length;
  const categories = (feed?.categories || []).filter((row) => !source || row.source === source);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-3 px-4 py-5 font-['Inter',ui-sans-serif,system-ui,sans-serif] text-slate-800 sm:px-6 dark:text-slate-100">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">Master administration</p>
          <h1 className="mt-0.5 flex items-center gap-2 text-[20px] font-semibold tracking-tight text-slate-900 dark:text-white">Activity log<PageGuideButton size="sm" /></h1>
          <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">Every action by PeerPrep&apos;s Master Admins: sign-ins, workspace changes and platform settings.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800" role="group" aria-label="Range">
            {RANGES.map((item) => (
              <button key={item.days} type="button" aria-pressed={days === item.days} onClick={() => setDays(item.days)}
                className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${ring} ${days === item.days ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}>{item.label}</button>
            ))}
          </div>
          <button type="button" onClick={() => load()} disabled={loading} className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${ring}`}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Refresh
          </button>
        </div>
      </header>

      <p className="flex items-center gap-1.5 text-[11.5px] text-slate-500 dark:text-slate-400"><Info className="h-3.5 w-3.5 shrink-0 text-sky-600" aria-hidden="true" />Control plane only. University admin and coordinator logs stay inside each university&apos;s own database.</p>

      {/* KPIs */}
      <section data-guide="ua-stats" className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4" aria-label="Activity summary">
        <Stat icon={Activity} label={days === 1 ? 'Events today' : `Events · ${days} days`} value={feed?.total ?? '—'} hint="Workspace and platform settings" />
        <Stat icon={CalendarDays} label="Today" value={feed?.today ?? '—'} hint="Since midnight IST" tone="violet" />
        <Stat icon={Users} label="Master Admins active" value={feed ? `${activeOperators}/${operators.length}` : '—'} hint="With activity in this range" tone="amber" />
        <Stat icon={ShieldAlert} label="Sensitive actions" value={feed?.sensitive ?? '—'} hint="Deletes, password and restore changes" tone="rose" />
      </section>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-3">
          {/* Activity by day */}
          <section data-guide="ua-days" className={`${card} p-3.5`} aria-labelledby="ua-days-title">
            <div className="flex items-center justify-between gap-2">
              <h2 id="ua-days-title" className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">Activity by day<GuideInfo step="ua-days" /></h2>
              {selectedDay ? <button type="button" onClick={() => setSelectedDay('')} className={`rounded-md px-2 py-0.5 text-[11.5px] font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10 ${ring}`}>Show all days</button> : <span className="text-[11px] text-slate-400">Select a day to focus</span>}
            </div>
            <div className="mt-3 flex h-20 items-end gap-1" role="group" aria-label="Events per day">
              {byDay.map((row) => {
                const active = selectedDay === row.day;
                return (
                  <button key={row.day} type="button" onClick={() => setSelectedDay(active ? '' : row.day)} aria-pressed={active} title={`${dayHeading(row.day)}: ${row.count} event${row.count === 1 ? '' : 's'}`}
                    className={`group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-md ${ring}`}>
                    <span className="text-[9.5px] font-semibold tabular-nums text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200">{row.count || ''}</span>
                    <span className={`w-full max-w-[28px] rounded-t ${active ? 'bg-sky-600' : row.count ? 'bg-sky-300 group-hover:bg-sky-500 dark:bg-sky-700' : 'bg-slate-100 dark:bg-slate-800'}`} style={{ height: `${Math.max(4, (row.count / peak) * 52)}px` }} />
                  </button>
                );
              })}
            </div>
            {byDay.length ? (
              <div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>{dayHeading(byDay[0].day)}</span><span>{dayHeading(byDay.at(-1).day)}</span></div>
            ) : null}
          </section>

          {/* Filters */}
          <section data-guide="ua-filters" className={`${card} flex flex-wrap items-center gap-2 p-2.5`} aria-label="Filters">
            <label className="relative min-w-[200px] flex-1">
              <span className="sr-only">Search activity</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search action, admin or detail" className={`${control} w-full pl-8`} />
            </label>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800" role="group" aria-label="Source">
              {SOURCES.map((item) => (
                <button key={item.value} type="button" aria-pressed={source === item.value} onClick={() => { setSource(item.value); setCategory(''); }}
                  className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${ring} ${source === item.value ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{item.label}</button>
              ))}
            </div>
            <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category" className={control}>
              <option value="">All categories</option>
              {categories.map((row) => <option key={`${row.source}:${row.key}`} value={row.key}>{categoryLabel(row.key)} ({row.count})</option>)}
            </select>
            <select value={actor} onChange={(event) => setActor(event.target.value)} aria-label="Master Admin" className={control}>
              <option value="">All Master Admins</option>
              {operators.map((op) => <option key={op.email} value={String(op.email || '').toLowerCase()}>{op.name}</option>)}
            </select>
          </section>

          {/* Timeline */}
          <section data-guide="ua-timeline" className={`${card} overflow-hidden`} aria-labelledby="ua-timeline-title">
            <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 dark:border-slate-800">
              <h2 id="ua-timeline-title" className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">Timeline<GuideInfo step="ua-timeline" /></h2>
              <span className="text-[11px] text-slate-400">{visible.length} shown{feed?.total ? ` of ${feed.total}` : ''}</span>
            </div>
            {error ? <p role="alert" className="m-3 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{error}</p> : null}
            {loading && !entries.length ? (
              <div className="flex min-h-40 items-center justify-center gap-2 text-[12.5px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />Loading activity…</div>
            ) : !groups.length ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-1.5 px-4 text-center">
                <History className="h-6 w-6 text-slate-300" aria-hidden="true" />
                <p className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">No activity</p>
                <p className="text-[11.5px] text-slate-500 dark:text-slate-400">Nothing matches this range or filter. Try a longer range.</p>
              </div>
            ) : (
              <div>
                {groups.map(([key, rows]) => (
                  <div key={key}>
                    <div className="sticky top-0 z-[1] flex items-center justify-between bg-slate-50/95 px-3.5 py-1.5 backdrop-blur dark:bg-slate-950/80">
                      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{dayHeading(key)}</h3>
                      <span className="text-[10.5px] text-slate-400">{rows.length} event{rows.length === 1 ? '' : 's'}</span>
                    </div>
                    <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                      {rows.map((entry) => (
                        <li key={entry.id} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-3.5 py-2.5 text-[12.5px] transition hover:bg-slate-50/70 sm:grid-cols-[3.25rem_11rem_minmax(0,1fr)] dark:hover:bg-slate-800/40">
                          <time className="pt-0.5 text-[11.5px] font-medium tabular-nums text-slate-500 dark:text-slate-400" dateTime={entry.createdAt}>{istTime(entry.createdAt)}</time>
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white dark:bg-slate-200 dark:text-slate-900">{initials(entry.actorName)}</span>
                            <span className="min-w-0"><span className="block truncate font-medium text-slate-800 dark:text-slate-100" title={entry.actorEmail}>{entry.actorName}</span></span>
                          </div>
                          <div className="col-span-2 min-w-0 sm:col-span-1">
                            <p className="flex flex-wrap items-center gap-1.5">
                              <SourceChip source={entry.source} />
                              {entry.category === 'login' ? <LogIn className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : null}
                              <span className={`font-medium ${entry.sensitive ? 'text-rose-700 dark:text-rose-300' : 'text-slate-800 dark:text-slate-100'}`}>{entry.source === 'platform' ? actionLabel(entry.action) : entry.title}</span>
                            </p>
                            <p className="mt-0.5 truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                              {entry.source === 'platform' ? (entry.detail || 'Platform configuration change') : categoryLabel(entry.category)}
                              {entry.universityId ? ` · ${entry.universityId}` : ''}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
            {feed?.nextCursor && !selectedDay ? (
              <div className="flex justify-center border-t border-slate-100 p-2.5 dark:border-slate-800">
                <button type="button" onClick={() => load(feed.nextCursor)} disabled={more} className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${ring}`}>
                  {more ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}Load older activity
                </button>
              </div>
            ) : null}
          </section>
        </div>

        {/* Master Admins */}
        <aside data-guide="ua-operators" className={`${card} h-fit p-3.5 lg:sticky lg:top-4`} aria-labelledby="ua-operators-title">
          <h2 id="ua-operators-title" className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">Master Admins</h2>
          <p className="text-[11px] text-slate-400">Activity in this range · click to filter</p>
          <ul className="mt-2.5 space-y-1">
            {operators.map((op) => {
              const key = String(op.email || '').toLowerCase();
              const active = actor === key;
              return (
                <li key={key}>
                  <button type="button" onClick={() => setActor(active ? '' : key)} aria-pressed={active}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition ${ring} ${active ? 'bg-sky-50 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold ${op.actions + op.logins ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{initials(op.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-semibold text-slate-800 dark:text-slate-100">{op.name}{op.active ? '' : ' (inactive)'}</span>
                      <span className="block truncate text-[10.5px] text-slate-400" title={op.email}>{relative(op.lastActiveAt)}</span>
                    </span>
                    <span className="shrink-0 text-right text-[10.5px] tabular-nums text-slate-500 dark:text-slate-400">
                      <span className="block font-semibold text-slate-800 dark:text-slate-100">{op.actions}</span>
                      {op.logins ? <span className="block">{op.logins} sign-in{op.logins === 1 ? '' : 's'}</span> : <span className="block">actions</span>}
                    </span>
                  </button>
                </li>
              );
            })}
            {!operators.length ? <li className="py-4 text-center text-[11.5px] text-slate-400">{loading ? 'Loading…' : 'No Master Admins found.'}</li> : null}
          </ul>
        </aside>
      </div>
    </div>
  );
}
