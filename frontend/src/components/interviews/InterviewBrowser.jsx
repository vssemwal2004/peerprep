import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Search, X, Paperclip } from 'lucide-react';
import { interviewStatus } from './interviewSetup';
import InterviewActionMenu from './InterviewActionMenu';

const control = 'h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:ring-2 focus:ring-sky-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200';
const columns = 'xl:grid-cols-[minmax(150px,1.5fr)_105px_90px_minmax(100px,1fr)_95px_85px_32px]';
function date(value, time = false) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Not set';
  return new Date(value).toLocaleString(undefined, time ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: '2-digit' });
}

export default function InterviewBrowser({ events, search, onSearchChange, view, onViewChange, onSelect, actionsFor, remote = false, loading = false, error = '', onRetry, type = 'all', sort = 'newest', lifecycle = 'all', onTypeChange, onSortChange, onLifecycleChange, pagination, onPageChange, onPageSizeChange }) {
  const filtered = remote ? events : events.filter((event) => {
    if (!(event.name || '').toLowerCase().includes(search.toLowerCase())) return false;
    const status = interviewStatus(event);
    return view === 'active' ? status === 'live' : view === 'upcoming' ? status === 'scheduled' : view === 'previous' ? status === 'completed' : true;
  });
  const total = pagination?.total ?? filtered.length;
  const page = pagination?.page || 1;
  const limit = pagination?.limit || 25;
  const pages = pagination?.pages || 1;
  return <section aria-label="Interview list" aria-busy={loading}>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input aria-label="Search interviews" placeholder="Search interviews" value={search} onChange={(e) => onSearchChange(e.target.value)} className={control + ' w-full pl-9 pr-8'} />
        {search && <button type="button" aria-label="Clear search" onClick={() => onSearchChange('')} className="absolute right-1 top-1 rounded p-1.5 text-slate-400"><X className="h-4 w-4" /></button>}
      </div>
      <select aria-label="Interview period" value={view} onChange={(e) => onViewChange(e.target.value)} className={control}><option value="all">All interviews</option><option value="active">Active</option><option value="upcoming">Scheduled</option><option value="previous">Past interviews</option></select>
      {onTypeChange && <select aria-label="Interview type" value={type} onChange={(e) => onTypeChange(e.target.value)} className={control}><option value="all">All types</option><option value="regular">Regular</option><option value="special">Special</option></select>}
      {onLifecycleChange && <select aria-label="Interview lifecycle" value={lifecycle} onChange={(e) => onLifecycleChange(e.target.value)} className={control}><option value="all">All statuses</option><option value="draft">Draft</option><option value="cancelled">Cancelled</option><option value="archived">Archived</option></select>}
      {onSortChange && <select aria-label="Sort interviews" value={sort} onChange={(e) => onSortChange(e.target.value)} className={control}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="starts">Start date</option><option value="name">Name A–Z</option></select>}
    </div>
    {error ? <div role="alert" className="rounded-xl border border-rose-200 p-5 text-center text-sm text-rose-600"><p>{error}</p><button type="button" onClick={onRetry} className={control + ' mt-3'}>Retry loading</button></div> : loading ? <div role="status" className="space-y-2.5"><span className="sr-only">Loading interviews</span>{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-gray-800 dark:bg-gray-900" />)}</div> : filtered.length ? <>
      <div className={'mb-1.5 hidden items-center gap-x-3 px-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400 xl:grid ' + columns}><span>Interview</span><span>Date</span><span>Time</span><span>Students</span><span>Access</span><span>Status</span><span className="sr-only">Actions</span></div>
      <div role="list" className="space-y-2.5">
        {filtered.map((event) => {
          const status = interviewStatus(event);
          const color = status === 'live' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : status === 'scheduled' ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300' : status === 'cancelled' ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300' : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300';
          const joined = event.participantCount ?? (Array.isArray(event.participants) ? event.participants.length : null);
          const selected = event.selectedCount ?? (Array.isArray(event.allowedParticipants) ? event.allowedParticipants.length : null);
          const restricted = event.isSpecial || ['selected', 'csv', 'filters'].includes(event.selectionMode);
          const hasTemplate = event.hasTemplate ?? !!event.templateUrl;
          const actions = actionsFor?.(event) || [{ id: 'open', label: 'View interview', icon: ArrowRight, run: () => onSelect(event._id) }];
          return <div role="listitem" key={event._id}>
            <article role="link" tabIndex={0} aria-label={'Open ' + event.name} onClick={(e) => { if (!e.target.closest('button, a')) onSelect(event._id); }} onKeyDown={(e) => { if (e.target === e.currentTarget && ['Enter', ' '].includes(e.key)) { e.preventDefault(); onSelect(event._id); } }} className={'group grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-sky-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-sky-800 md:grid-cols-[minmax(140px,1.5fr)_minmax(105px,1fr)_90px_32px] ' + columns}>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5"><span title={event.name} className="truncate text-sm font-semibold text-slate-900 group-hover:text-sky-700 dark:text-white dark:group-hover:text-sky-300">{event.name}</span>{hasTemplate && <Paperclip aria-label="Template attached" className="h-3.5 w-3.5 shrink-0 text-slate-400" />}</div>
                <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-slate-400"><span className="shrink-0">{event.isSpecial ? 'Special interview' : 'Regular interview'}</span><span className="truncate" title={event.coordinatorName || event._id}>{event.coordinatorName ? '· ' + event.coordinatorName : '· ' + event._id.slice(-6)}</span></div>
              </div>
              <div className="col-start-1 row-start-2 text-xs md:col-start-2 md:row-start-1 xl:col-auto xl:row-auto"><div className="font-semibold text-slate-700 dark:text-gray-200">{date(event.startDate)}</div><div className="mt-0.5 text-[11px] text-slate-400">Ends {date(event.endDate)}</div></div>
              <div className="hidden text-xs xl:block"><div className="font-semibold text-slate-700 dark:text-gray-200">{date(event.startDate, true)}</div><div className="mt-0.5 text-[11px] text-slate-400">To {date(event.endDate, true)}</div></div>
              <div className="col-span-2 text-xs md:col-auto xl:col-auto"><span className="font-semibold text-slate-700 dark:text-gray-200">{joined === null ? 'View roster' : joined + ' joined'}</span><span className="ml-2 text-[11px] text-slate-400 xl:ml-0 xl:mt-0.5 xl:block">{selected > 0 ? selected + ' selected' : restricted ? 'Selected roster' : 'Open audience'}</span></div>
              <div className="hidden xl:block"><span className="inline-flex rounded-md border border-slate-200 px-1.5 py-1 text-[10px] font-medium text-slate-600 dark:border-gray-700 dark:text-gray-300">{restricted ? 'Selected students' : 'All eligible'}</span></div>
              <div className="col-start-2 row-start-2 justify-self-end md:col-start-3 md:row-start-1 xl:col-auto xl:row-auto xl:justify-self-start"><span className={'inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold capitalize ' + color}>{status === 'live' ? 'Active' : status}</span></div>
              <div className="col-start-2 row-start-1 justify-self-end md:col-start-4 xl:col-auto xl:row-auto"><InterviewActionMenu name={event.name} actions={actions} /></div>
            </article>
          </div>;
        })}
      </div>
    </> : <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center dark:border-gray-700 dark:bg-gray-900"><CalendarDays className="h-6 w-6 text-slate-300" /><h2 className="mt-3 text-sm font-semibold text-slate-700 dark:text-gray-200">{search ? 'No matching interviews' : 'No interviews in this view'}</h2><p className="mt-1 text-xs text-slate-500">Try another search or clear the filters.</p><button type="button" className={control + ' mt-3'} onClick={() => { onSearchChange(''); onViewChange('all'); onTypeChange?.('all'); onLifecycleChange?.('all'); }}>Clear filters</button></div>}
    {!error && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
      <span aria-live="polite">{loading ? 'Loading…' : total ? ((page - 1) * limit + 1) + '–' + Math.min(page * limit, total) + ' of ' + total + ' interviews' : '0 interviews'}</span>
      {pagination && <div className="flex items-center gap-2"><select aria-label="Interviews per page" value={limit} disabled={loading} onChange={(e) => onPageSizeChange(Number(e.target.value))} className={control}><option value={25}>25 / page</option><option value={50}>50 / page</option><option value={100}>100 / page</option></select><button type="button" aria-label="Previous page" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)} className={control + ' disabled:opacity-40'}><ChevronLeft className="h-4 w-4" /></button><span>{page} / {pages}</span><button type="button" aria-label="Next page" disabled={loading || page >= pages} onClick={() => onPageChange(page + 1)} className={control + ' disabled:opacity-40'}><ChevronRight className="h-4 w-4" /></button></div>}
    </div>}
  </section>;
}
