import { ArrowRight, CalendarDays, Search, X } from 'lucide-react';

function interviewDate(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return '—';
  return new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function InterviewBrowser({ events, search, onSearchChange, view, onViewChange, onSelect }) {
  const now = new Date();
  const filtered = events.filter((event) => {
    if (!(event.name || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (view === 'active') return new Date(event.startDate) <= now && new Date(event.endDate) >= now;
    if (view === 'upcoming') return new Date(event.startDate) > now;
    if (view === 'previous') return new Date(event.endDate) < now;
    return true;
  });

  return (
    <section aria-label="Interview list">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-4 dark:border-gray-800">
        <div className="relative min-w-0 basis-full sm:flex-1 sm:basis-auto">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input aria-label="Search interviews" placeholder="Search interviews" value={search} onChange={(e) => onSearchChange(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:ring-sky-900" />
          {search && <button type="button" aria-label="Clear search" onClick={() => onSearchChange('')} className="absolute right-1 top-1 rounded-md p-2 text-slate-400 hover:text-slate-800 dark:hover:text-white"><X className="h-4 w-4" /></button>}
        </div>
        <select aria-label="Interview period" value={view} onChange={(e) => onViewChange(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:ring-2 focus:ring-sky-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
          <option value="all">All interviews</option><option value="active">Active</option><option value="upcoming">Scheduled</option><option value="previous">Past interviews</option>
        </select>
        <span className="text-xs tabular-nums text-slate-500 dark:text-gray-400">{filtered.length} interview{filtered.length === 1 ? '' : 's'}</span>
      </div>
      {filtered.length ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400"><tr><th className="px-4 py-3 font-medium">Interview</th><th className="px-4 py-3 font-medium">Status</th><th className="hidden px-4 py-3 font-medium md:table-cell">Starts</th><th className="hidden px-4 py-3 font-medium xl:table-cell">Ends</th><th className="px-4 py-3"><span className="sr-only">Open interview</span></th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {filtered.map((event) => (
                <tr key={event._id} className="group hover:bg-sky-50/40 dark:hover:bg-sky-950/20">
                  <td className="px-4 py-4"><button type="button" onClick={() => onSelect(event._id)} className="text-left font-semibold text-slate-900 hover:text-sky-600 focus-visible:outline-sky-500 dark:text-white dark:hover:text-sky-400">{event.name}</button><div className="mt-1 text-xs text-slate-500 dark:text-gray-400">{event.isSpecial ? 'Special interview' : 'General interview'}{event.coordinatorName ? ` · ${event.coordinatorName}` : ''}</div></td>
                  <td className="px-4 py-4"><span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-medium capitalize text-slate-600 dark:bg-gray-800 dark:text-gray-300">{event.status || 'published'}</span></td>
                  <td className="hidden whitespace-nowrap px-4 py-4 text-xs text-slate-500 dark:text-gray-400 md:table-cell">{interviewDate(event.startDate)}</td>
                  <td className="hidden whitespace-nowrap px-4 py-4 text-xs text-slate-500 dark:text-gray-400 xl:table-cell">{interviewDate(event.endDate)}</td>
                  <td className="px-4 py-4 text-right"><button type="button" aria-label={`Open ${event.name}`} onClick={() => onSelect(event._id)} className="rounded-lg p-2 text-slate-400 hover:bg-sky-50 hover:text-sky-600 focus-visible:outline-sky-500 dark:hover:bg-gray-800"><ArrowRight className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center dark:border-gray-700 dark:bg-gray-900">
          <CalendarDays className="h-7 w-7 text-slate-300 dark:text-gray-600" />
          <h2 className="mt-3 text-sm font-semibold text-slate-800 dark:text-gray-200">{search ? 'No matching interviews' : view === 'all' ? 'No interviews yet' : `No ${view === 'upcoming' ? 'scheduled' : view === 'previous' ? 'past' : 'active'} interviews`}</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{search ? 'Try a different search or period.' : 'Interviews will appear here when available.'}</p>
          {(search || view !== 'all') && <button type="button" onClick={() => { onSearchChange(''); onViewChange('all'); }} className="mt-3 rounded-lg px-3 py-2 text-xs font-semibold text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-gray-800">Clear filters</button>}
        </div>
      )}
    </section>
  );
}
