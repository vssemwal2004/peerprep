import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, ChevronsLeftRight, MinusCircle, Search } from 'lucide-react';
import { focusRing, percent, TRACK_META } from './readinessModel';

const SORTS = [
  { id: 'priority', label: 'Priority' },
  { id: 'gap', label: 'Remaining gap' },
  { id: 'contribution', label: 'Contribution' },
  { id: 'name', label: 'A–Z' },
];
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'progress', label: 'In progress' },
  { id: 'todo', label: 'Not started' },
  { id: 'complete', label: 'Target met' },
  { id: 'excluded', label: 'Excluded' },
];

function Priority({ value }) {
  if (!value) return <span className="text-slate-300 dark:text-zinc-600">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Priority ${value} of 5`} title={`Priority ${value} of 5`}>
      {Array.from({ length: 5 }, (_, index) => <span key={index} className={`h-1.5 w-1.5 rounded-full ${index < value ? 'bg-violet-500' : 'bg-slate-200 dark:bg-white/10'}`} />)}
    </span>
  );
}

/**
 * Every canonical topic for the selected track: priority, weight and target, accepted
 * Easy/Medium/Hard, earned points, progress, contribution, today's Prep Score quota and a practice
 * link. Search, sort and filter; scrolls inside its own box on narrow screens.
 */
export default function ReadinessTopicTable({ topics = [], track = 'pbc', quota = { limit: 0 }, readOnly = false }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('priority');
  const [filter, setFilter] = useState('all');
  const meta = TRACK_META[track];

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = topics.filter((topic) => {
      const row = topic[track];
      const solved = topic.counts.Easy + topic.counts.Medium + topic.counts.Hard;
      if (needle && !`${topic.label} ${topic.categoryLabel}`.toLowerCase().includes(needle)) return false;
      if (filter === 'excluded') return row.excluded;
      if (filter === 'complete') return !row.excluded && row.complete;
      if (filter === 'progress') return !row.excluded && !row.complete && solved > 0;
      if (filter === 'todo') return !row.excluded && solved === 0;
      return true;
    });
    const gap = (topic) => (topic[track].excluded ? -1 : topic[track].maxContribution - topic[track].contribution);
    const compare = {
      priority: (a, b) => (Number(b[track].excluded === false) - Number(a[track].excluded === false)) || (b[track].priority - a[track].priority) || (gap(b) - gap(a)) || a.label.localeCompare(b.label),
      gap: (a, b) => (gap(b) - gap(a)) || (b[track].priority - a[track].priority) || a.label.localeCompare(b.label),
      contribution: (a, b) => (b[track].contribution - a[track].contribution) || a.label.localeCompare(b.label),
      name: (a, b) => a.label.localeCompare(b.label),
    }[sort];
    return [...list].sort(compare);
  }, [topics, track, query, sort, filter]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[180px] flex-1">
          <span className="sr-only">Search topics</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search topics"
            className={`h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[12.5px] text-slate-800 placeholder:text-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 ${focusRing}`} />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-zinc-400">
          Sort
          <select value={sort} onChange={(event) => setSort(event.target.value)} className={`h-9 rounded-lg border border-slate-200 bg-white px-2 text-[12.5px] text-slate-800 dark:border-white/10 dark:bg-[#1f1f22] dark:text-zinc-100 ${focusRing}`}>
            {SORTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Filter topics">
        {FILTERS.map((item) => (
          <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}
            className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${focusRing} ${filter === item.id ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/10'}`}>
            {item.label}
          </button>
        ))}
      </div>

      <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400 md:hidden"><ChevronsLeftRight className="h-3.5 w-3.5" aria-hidden="true" />Swipe sideways to see every column</p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200/80 dark:border-white/[0.08]" tabIndex={0} role="region" aria-label={`${meta.full} topic breakdown`}>
        <table className="w-full min-w-[920px] text-left text-[12px]" data-no-serial>
          <thead className="bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500 dark:bg-white/[0.03] dark:text-zinc-400">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Topic</th>
              <th scope="col" className="px-2 py-2 font-semibold">Priority</th>
              <th scope="col" className="px-2 py-2 font-semibold">Weight · target</th>
              <th scope="col" className="px-2 py-2 font-semibold" title="Accepted Easy / Medium / Hard (first solves)">E · M · H</th>
              <th scope="col" className="px-2 py-2 font-semibold">Points</th>
              <th scope="col" className="px-2 py-2 font-semibold">Progress</th>
              <th scope="col" className="px-2 py-2 font-semibold">Contribution</th>
              <th scope="col" className="px-2 py-2 font-semibold" title="Credited first solves today for this topic (resets 12:00 AM IST)">Quota today</th>
              {!readOnly ? <th scope="col" className="px-3 py-2 font-semibold"><span className="sr-only">Practice</span></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
            {rows.map((topic) => {
              const row = topic[track];
              const full = quota.limit && topic.quota?.remaining === 0;
              return (
                <tr key={topic.key} className={row.excluded ? 'bg-slate-50/60 text-slate-400 dark:bg-white/[0.015] dark:text-zinc-500' : row.complete ? 'bg-emerald-50/40 dark:bg-emerald-500/[0.04]' : ''}>
                  <th scope="row" className="px-3 py-2 font-normal">
                    <span className={`flex items-center gap-1.5 font-semibold ${row.excluded ? '' : 'text-slate-800 dark:text-zinc-100'}`}>
                      {row.complete ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-label="Target met" /> : row.excluded ? <MinusCircle className="h-3.5 w-3.5" aria-label="Excluded" /> : null}
                      {topic.label}
                    </span>
                    <span className="block text-[10.5px] text-slate-400 dark:text-zinc-500">{topic.categoryLabel}</span>
                  </th>
                  <td className="px-2 py-2"><Priority value={row.excluded ? 0 : row.priority} /></td>
                  <td className="px-2 py-2 tabular-nums">{row.excluded ? <span className="text-[11px]">Not counted for {meta.label}</span> : `${row.weight} · ${row.target}`}</td>
                  <td className="px-2 py-2 tabular-nums text-slate-600 dark:text-zinc-300">{topic.counts.Easy} · {topic.counts.Medium} · {topic.counts.Hard}</td>
                  <td className="px-2 py-2 tabular-nums">{row.excluded ? '—' : `${row.points.toFixed(1)} / ${row.target}`}</td>
                  <td className="px-2 py-2">
                    {row.excluded ? '—' : (
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.07]" role="progressbar" aria-label={`${topic.label} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(row.progress * 100)}>
                          <span className={`block h-full rounded-full ${row.complete ? 'bg-emerald-500' : `bg-gradient-to-r ${meta.bar}`}`} style={{ width: `${row.progress * 100}%` }} />
                        </span>
                        <span className="tabular-nums">{percent(row.progress)}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 tabular-nums">{row.excluded ? '—' : <><b className="text-slate-800 dark:text-zinc-100">+{row.contribution.toFixed(2)}</b><span className="text-slate-400"> / {row.maxContribution.toFixed(2)}</span></>}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {quota.limit ? <span className={full ? 'font-semibold text-amber-700 dark:text-amber-300' : ''}>{topic.quota.used}/{quota.limit}{full ? ' · full' : ''}</span> : <span className="text-slate-400">No limit</span>}
                  </td>
                  {!readOnly ? (
                    <td className="px-3 py-2 text-right">
                      {!row.excluded && !row.complete ? (
                        <Link to={`/problems?topic=${encodeURIComponent(topic.label)}`} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-500/10 ${focusRing}`}>
                          Practice<ArrowRight className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {!rows.length ? <tr><td colSpan={readOnly ? 8 : 9} className="px-3 py-8 text-center text-slate-500 dark:text-zinc-400">No topics match.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
