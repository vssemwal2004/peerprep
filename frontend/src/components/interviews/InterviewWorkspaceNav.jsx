import { useEffect, useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarClock, CalendarDays, History, MessageSquareText, Plus, ChevronRight, Search, CircleDot, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../admin/coordinatorPermissions';
import { api } from '../../utils/api';
import { getInterviewNavigation, getInterviewSection } from './interviewNavigation';

const icons = { all: CalendarDays, active: CircleDot, scheduled: CalendarClock, past: History, feedback: MessageSquareText, create: Plus };

function WorkspaceSidebar({ items, section, events, loading, error, root, selectedId, canView }) {
  const [search, setSearch] = useState('');
  const inputId = useId();
  const filtered = events.filter((event) => (event.name || '').toLowerCase().includes(search.toLowerCase()));
  const now = new Date();
  const counts = {
    all: events.length,
    active: events.filter((event) => new Date(event.startDate) <= now && new Date(event.endDate) >= now).length,
    scheduled: events.filter((event) => new Date(event.startDate) > now).length,
    past: events.filter((event) => new Date(event.endDate) < now).length,
  };
  return (
    <div className="px-3 py-4">
      <h2 className="px-2 text-xs font-bold text-slate-900 dark:text-white">One-to-One Interviews</h2>
      <nav className="mt-3 space-y-1" aria-label="Interview workspace sections">
        {items.map(({ id, label, to }) => {
          const Icon = icons[id];
          const active = id === section;
          return (
            <Link key={id} to={to} aria-current={active ? 'page' : undefined}
              className={`flex min-h-9 items-center gap-2 rounded-lg px-2 py-2 text-xs transition-colors focus-visible:outline-sky-500 ${active ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-900/25 dark:text-sky-300' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-white'}`}>
              <Icon className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1">{label}</span>
              {canView && !loading && !error && counts[id] !== undefined && <span className="text-[11px] tabular-nums text-slate-400">{counts[id]}</span>}
            </Link>
          );
        })}
      </nav>
      {canView && (
        <section className="mt-5 border-t border-slate-200 pt-4 dark:border-gray-800" aria-label="All interview rounds">
          <label htmlFor={inputId} className="px-2 text-xs font-semibold text-slate-700 dark:text-gray-200">All interviews</label>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input id={inputId} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find an interview" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-xs text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus:ring-sky-900" />
          </div>
          <div className="mt-2 max-h-72 space-y-1 overflow-y-auto [scrollbar-width:thin] lg:max-h-[calc(100dvh-27rem)] lg:min-h-24">
            {loading ? <p role="status" className="px-2 py-3 text-xs text-slate-400">Loading interviews…</p>
              : error ? <p role="status" className="px-2 py-3 text-xs text-rose-600 dark:text-rose-400">Interviews could not be loaded.</p>
              : filtered.length ? filtered.map((event) => (
                <Link key={event._id} to={`${root}/interviews/one-to-one/${event._id}`} aria-current={selectedId === event._id ? 'true' : undefined}
                  className={`block rounded-lg px-2 py-2 text-xs focus-visible:outline-sky-500 ${selectedId === event._id ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-900/25 dark:text-sky-300' : 'text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-900'}`}>
                  <span className="block break-words">{event.name}</span>
                  <span className="mt-1 block text-[10px] font-normal capitalize text-slate-400">{event.status || 'published'}</span>
                </Link>
              )) : <p className="px-2 py-3 text-xs text-slate-400">{search ? 'No matching interviews' : 'No interviews yet'}</p>}
          </div>
        </section>
      )}
    </div>
  );
}

export default function InterviewWorkspaceNav({ children, events: providedEvents, loading: providedLoading = false, error: providedError = false }) {
  const location = useLocation();
  const { user } = useAuth();
  const root = location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const section = getInterviewSection(location.pathname, location.search);
  const items = getInterviewNavigation(root).filter((item) => hasPermission(user, item.permissionKey));
  const current = items.find((item) => item.id === section);
  const canView = hasPermission(user, 'coordinator.interviews.view');
  const canCreate = hasPermission(user, 'coordinator.interviews.create');
  const [fetchedEvents, setFetchedEvents] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const needsEvents = providedEvents === undefined && canView;

  useEffect(() => {
    if (!needsEvents) return undefined;
    let active = true;
    setFetching(true);
    setFetchError(false);
    api.listEvents().then((data) => { if (active) setFetchedEvents(data); })
      .catch(() => { if (active) setFetchError(true); })
      .finally(() => { if (active) setFetching(false); });
    return () => { active = false; };
  }, [needsEvents, root]);

  const events = providedEvents ?? fetchedEvents;
  const selectedId = location.pathname.split('/').at(-1);
  const sidebarProps = { items, section, events, root, selectedId, canView,
    loading: needsEvents ? fetching : providedLoading, error: needsEvents ? fetchError : providedError };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950">
      <header className="border-b border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><span>Interviews</span><ChevronRight className="h-3 w-3" /><span>One-to-One</span></div>
            <h1 className="mt-0.5 text-lg font-bold tracking-tight text-slate-950 dark:text-white">{current?.title || 'One-to-One Interviews'}</h1>
          </div>
          {canCreate && section !== 'create' && <Link to={`${root}/event/create`} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-500 focus-visible:outline-sky-500"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Create interview</span><span className="sm:hidden">Create</span></Link>}
        </div>
      </header>
      <div className="mx-auto grid max-w-[1600px] items-start lg:grid-cols-[216px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-[calc(100dvh-4rem)] overflow-y-auto border-r border-slate-200 bg-white [scrollbar-width:thin] lg:block dark:border-gray-800 dark:bg-gray-950">
          <WorkspaceSidebar {...sidebarProps} />
        </aside>
        <div className="min-w-0">
          <details key={location.pathname + location.search} className="border-b border-slate-200 bg-white lg:hidden dark:border-gray-800 dark:bg-gray-950">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 dark:text-gray-200"><span>{current?.label || 'Interview navigation'}</span><ChevronDown className="h-4 w-4" /></summary>
            <WorkspaceSidebar {...sidebarProps} />
          </details>
          {children}
        </div>
      </div>
    </div>
  );
}
