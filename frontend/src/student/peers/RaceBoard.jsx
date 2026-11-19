import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LocateFixed, Search } from 'lucide-react';
import { peerSubtitle, compactCount } from './peerNetwork';
import { PingButton, PracticeMeta, Pager, RankBadge, StatusAvatar } from './circleParts';
import { DuelGlyph, LadderGlyph, PanelTitle } from './peerGlyphs';
import { PERIODS } from './circleMath';
import { card, focusRing, Skeleton, Unavailable } from '../dashboard/ui';

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Student';

function RaceRow({ row, max, onPinged }) {
  const share = (row.solved / Math.max(1, max)) * 100;
  return <li className={`grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[32px_minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:px-5 ${row.isYou ? 'bg-gradient-to-r from-sky-50 via-sky-50/60 to-transparent dark:from-sky-500/[0.12] dark:via-sky-500/[0.05]' : 'transition hover:bg-slate-50/70 dark:hover:bg-white/[0.02]'}`}>
    <RankBadge rank={row.rank} />
    <div className="flex min-w-0 items-center gap-3">
      <StatusAvatar name={row.name} url={row.avatarUrl} practisedToday={row.practisedToday} size="sm" />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {row.isYou ? <span className="truncate text-[13.5px] font-semibold text-slate-900 dark:text-zinc-50">{row.name}</span>
            : <Link to={`/student/peers/${row.id}`} className="truncate text-[13.5px] font-semibold text-slate-900 hover:text-sky-700 dark:text-zinc-50 dark:hover:text-sky-300">{row.name}</Link>}
          {row.isYou && <span className="shrink-0 rounded-full bg-sky-600 px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-white">You</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-2"><span className="hidden truncate text-[11.5px] text-slate-400 md:inline dark:text-zinc-500">{peerSubtitle(row)}</span><PracticeMeta streak={row.streak} practisedToday={row.practisedToday} /></div>
      </div>
    </div>
    <div className="hidden items-center gap-3 sm:flex">
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]" aria-hidden="true">
        <span className={`block h-full rounded-full ${row.isYou ? 'bg-gradient-to-r from-sky-400 to-sky-600' : 'bg-gradient-to-r from-amber-300 to-orange-500'}`} style={{ width: `${share}%`, minWidth: row.solved ? 6 : 0 }} />
      </span>
      <span className="w-9 text-right text-[15px] font-bold tabular-nums text-slate-900 dark:text-white">{row.solved}</span>
    </div>
    <div className="flex shrink-0 items-center justify-end gap-1.5 sm:w-[196px]">
      <span className="text-[15px] font-bold tabular-nums text-slate-900 sm:hidden dark:text-white">{row.solved}</span>
      {!row.isYou && <>
        <PingButton row={row} onPinged={onPinged} compact />
        <Link to={`/student/peers/${row.id}/compare`} title={`Compare with ${firstName(row.name)}`} aria-label={`Compare with ${row.name}`}
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-slate-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 ${focusRing}`}><DuelGlyph className="h-3.5 w-3.5" /><span className="hidden sm:inline">Compare</span></Link>
      </>}
    </div>
  </li>;
}

/**
 * Everyone in your circle ranked by problems solved for the period chosen above: searchable, paged
 * (ranks stay global), "Jump to me", and your own row pinned when it is not on the page.
 */
export default function RaceBoard({ circle, onPinged }) {
  const { query, setQuery: onQuery, setPage: onPage } = circle;
  const [draft, setDraft] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => { if (draft !== query) onQuery(draft); }, 300);
    return () => clearTimeout(timer);
  }, [draft, query, onQuery]);
  const data = circle.data;
  const searching = Boolean(query);
  const rows = data?.rows || [];
  const youShown = data?.you && rows.some((row) => row.isYou);
  const max = Math.max(1, ...(data?.podium || []).map((row) => row.solved));
  const period = PERIODS.find((item) => item.key === circle.period) || PERIODS[0];

  return <section className={card} aria-labelledby="race-title">
    <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <PanelTitle id="race-title" glyph={LadderGlyph} tone="amber" title="Leaderboard" subtitle={data ? `${compactCount(data.total)} people · problems solved ${period.phrase}` : `Problems solved ${period.phrase}`} />
      {data?.total > 1 && <div className="flex items-center gap-2">
        <label className="relative flex-1 sm:w-60 sm:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Find a Prep Mate" aria-label="Find a Prep Mate in the leaderboard"
            className="h-9 w-full rounded-xl border border-[#e6e7eb] bg-white pl-8 pr-2 text-[12.5px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-100" />
        </label>
        {!searching && data.youPage && data.youPage !== data.page && <button type="button" onClick={() => onPage(data.youPage)}
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-sky-50 px-3 text-[12.5px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-200 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/25 ${focusRing}`}><LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />Jump to me</button>}
      </div>}
    </div>

    {circle.loading && !data ? <div className="space-y-3 px-5 pb-5"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      : circle.error && !data ? <div className="px-5 pb-5"><Unavailable message={circle.error} onRetry={circle.reload} /></div>
        : data.total < 2 ? <p className="px-5 pb-6 text-center text-[13px] text-slate-500 dark:text-zinc-400">Add Prep Mates to see the leaderboard.</p> : <>
          <div className="hidden grid-cols-[32px_minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-3 border-y border-[#eef0f3] bg-slate-50/70 px-5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400 sm:grid sm:px-6 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-500" aria-hidden="true">
            <span>Rank</span><span>Student</span><span>Solved {period.phrase}</span><span className="w-[196px] text-right">Actions</span>
          </div>
          {rows.length ? <ol className="divide-y divide-[#eef0f3] dark:divide-white/[0.06]">{rows.map((row) => <RaceRow key={row.id} row={row} max={max} onPinged={onPinged} />)}</ol>
            : <p className="px-5 py-6 text-center text-[13px] text-slate-500 dark:text-zinc-400">No Prep Mate matches “{query}”.</p>}
          {!youShown && data.you && !searching && <div className="border-t border-dashed border-sky-200 dark:border-sky-400/20" aria-label="Your position"><ol><RaceRow row={data.you} max={max} /></ol></div>}
          {data.pages > 1 && <div className="border-t border-[#eef0f3] px-5 py-3 sm:px-6 dark:border-white/[0.06]">
            <Pager page={data.page} pages={data.pages} onPage={onPage} label="Leaderboard pages"
              summary={<>Showing <b className="text-slate-800 dark:text-zinc-100">{(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, searching ? (data.page - 1) * data.limit + rows.length : data.total)}</b>{searching ? '' : ` of ${compactCount(data.total)}`}</>} />
          </div>}
        </>}
  </section>;
}
