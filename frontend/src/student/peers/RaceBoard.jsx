import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Search, Trophy } from 'lucide-react';
import PeerAvatar from './PeerAvatar';
import { PingButton, PracticeMeta, Pager, RankBadge } from './circleParts';
import { card, CardTitle, focusRing, Skeleton, Unavailable } from '../dashboard/ui';

const PERIODS = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
];
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Student';

function RaceRow({ row, max, onPinged }) {
  return <li className={`flex items-center gap-3 px-4 py-2.5 ${row.isYou ? 'bg-sky-50/70 dark:bg-sky-500/[0.07]' : ''}`}>
    <RankBadge rank={row.rank} />
    <PeerAvatar name={row.name} url={row.avatarUrl} size="sm" />
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        {row.isYou ? <span className="truncate text-[13.5px] font-semibold text-slate-900 dark:text-zinc-50">{row.name}</span>
          : <Link to={`/student/peers/${row.id}`} className="truncate text-[13.5px] font-semibold text-slate-900 hover:text-sky-700 dark:text-zinc-50 dark:hover:text-sky-300">{row.name}</Link>}
        {row.isYou && <span className="shrink-0 rounded-full bg-sky-600 px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-white">You</span>}
      </div>
      <div className="mt-1 flex items-center gap-2.5">
        <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 sm:block dark:bg-white/[0.07]" aria-hidden="true">
          <span className={`block h-full rounded-full ${row.isYou ? 'bg-sky-600' : 'bg-slate-400 dark:bg-zinc-500'}`} style={{ width: `${(row.solved / Math.max(1, max)) * 100}%` }} />
        </span>
        <PracticeMeta streak={row.streak} practisedToday={row.practisedToday} />
      </div>
    </div>
    {!row.isYou && <div className="flex shrink-0 items-center gap-1.5">
      <PingButton row={row} onPinged={onPinged} compact />
      <Link to={`/student/peers/${row.id}/compare`} title={`Compare with ${firstName(row.name)}`} aria-label={`Compare with ${row.name}`}
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg bg-sky-600 px-2.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-sky-700 ${focusRing}`}><BarChart3 className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden sm:inline">Compare</span></Link>
    </div>}
    <span className="w-9 text-right text-[16px] font-bold tabular-nums text-slate-900 dark:text-white">{row.solved}</span>
  </li>;
}

/**
 * You and all your Prep Mates ranked by problems solved: a searchable, paged list (ranks are across
 * everyone) with Compare on every row and your own row pinned when it is not on the page.
 */
export default function RaceBoard({ circle, period, onPeriod, onPage, query, onQuery, onPinged }) {
  const [draft, setDraft] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => { if (draft !== query) onQuery(draft); }, 300);
    return () => clearTimeout(timer);
  }, [draft, query, onQuery]);
  const data = circle.data;
  const searching = Boolean(query);
  const rows = data?.rows || [];
  const youShown = data?.you && rows.some((row) => row.isYou);
  // Bars are scaled to the leader (the top of the podium list from the server).
  const max = Math.max(1, ...(data?.podium || []).map((row) => row.solved));
  const periodLabel = PERIODS.find((item) => item.key === period)?.label.toLowerCase();

  return <section className={card} aria-labelledby="race-title">
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <CardTitle id="race-title" title="Ranking" icon={Trophy} tone="amber" />
      <div className="flex shrink-0 rounded-xl bg-slate-100 p-0.5 dark:bg-white/[0.06]" role="tablist" aria-label="Race period">
        {PERIODS.map((item) => <button key={item.key} type="button" role="tab" aria-selected={period === item.key} onClick={() => onPeriod(item.key)}
          className={`rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition ${focusRing} ${period === item.key ? 'bg-white text-slate-900 shadow-sm dark:bg-white/[0.12] dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}>{item.label}</button>)}
      </div>
    </div>

    {circle.loading && !data ? <div className="space-y-3 px-4 pb-4"><Skeleton className="h-40" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
      : circle.error && !data ? <div className="px-4 pb-4"><Unavailable message={circle.error} onRetry={circle.reload} /></div>
        : <>
          {data.total < 2 ? <p className="px-4 pb-6 text-center text-[13px] text-slate-500 dark:text-zinc-400">Add Prep Mates to compare your practice. Use “Find classmates” above.</p> : <>
            <div className="flex items-center justify-between gap-3 border-t border-[#eef0f3] px-4 py-3 dark:border-white/[0.06]">
              <p className="text-[12px] text-slate-500 dark:text-zinc-400">{data.total} in your circle · solved {periodLabel}</p>
              <label className="relative w-44 sm:w-56">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input type="search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Find in the race" aria-label="Find a Prep Mate in the race"
                  className="h-8 w-full rounded-lg border border-[#e6e7eb] bg-white pl-8 pr-2 text-[12.5px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-sky-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-100" />
              </label>
            </div>
            {rows.length ? <ol className="divide-y divide-[#eef0f3] dark:divide-white/[0.06]">{rows.map((row) => <RaceRow key={row.id} row={row} max={max} onPinged={onPinged} />)}</ol>
              : <p className="px-4 pb-4 text-[13px] text-slate-500 dark:text-zinc-400">No Prep Mate matches that name.</p>}
            {!youShown && data.you && !searching && <div className="border-t border-dashed border-[#e6e7eb] dark:border-white/[0.08]" aria-label="Your position"><ol><RaceRow row={data.you} max={max} /></ol></div>}
            {data.pages > 1 && <div className="border-t border-[#eef0f3] px-4 py-3 dark:border-white/[0.06]"><Pager page={data.page} pages={data.pages} onPage={onPage} label="Race pages" /></div>}
          </>}
        </>}
  </section>;
}
