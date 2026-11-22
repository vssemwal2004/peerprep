import { Link } from 'react-router-dom';
import { ChevronRight, Trophy } from 'lucide-react';
import { focusRing } from './format';

const finite = (value) => (Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0);

/**
 * University rank, compact, under the profile photo (same data as the Rankings page's University
 * standing card). The bar runs from the last place to Rank #1.
 */
export default function SidebarRankCard({ ranking, loading = false }) {
  const total = Math.floor(finite(ranking?.totalStudents));
  const rawRank = Math.floor(finite(ranking?.rank));
  const rank = rawRank > 0 && total > 0 ? Math.min(total, rawRank) : null;
  const topPercent = rank && total > 1 ? Math.max(1, Math.ceil((rank / total) * 100)) : null;
  const standing = rank && total > 1 ? ((total - rank) / (total - 1)) * 100 : rank ? 100 : 0;
  const hint = !ranking ? 'Rank unavailable right now'
    : rank ? ranking.universityName || 'Your university'
      : ranking.hasProgress ? 'Appears after the next ranking update' : 'Solve a problem to get ranked';

  return (
    <Link to="/student/rankings" data-guide="pf-rank" aria-label={rank ? `University rank ${rank} of ${total}. Open rankings` : 'Not ranked yet. Open rankings'}
      className={`group mt-3 block w-full rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-white px-3 py-2.5 text-left transition hover:border-sky-200 hover:shadow-sm dark:border-sky-500/15 dark:from-sky-500/[0.08] dark:via-transparent dark:to-transparent dark:hover:border-sky-500/30 ${focusRing}`}>
      <span className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white shadow-[0_6px_14px_-8px_rgba(2,132,199,0.9)]"><Trophy className="h-4 w-4" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-sky-700/80 dark:text-sky-300/80">University rank</span>
          <span className="flex items-baseline gap-1.5 tabular-nums">
            {loading ? <span className="inline-block h-5 w-16 animate-pulse rounded bg-sky-100 dark:bg-white/10" />
              : <><span className="text-[17px] font-bold leading-tight text-slate-950 dark:text-white">{rank ? `#${rank.toLocaleString()}` : 'Not ranked'}</span>
                {rank ? <span className="text-[11.5px] text-slate-500 dark:text-zinc-400">of {total.toLocaleString()}{ranking?.tied ? ' · tied' : ''}</span> : null}</>}
          </span>
        </span>
        {topPercent ? <span className="shrink-0 rounded-full bg-sky-600 px-2 py-0.5 text-[10.5px] font-bold text-white">Top {topPercent}%</span> : null}
        <ChevronRight className="h-4 w-4 shrink-0 text-sky-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
      {rank ? (
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-sky-100 dark:bg-white/[0.08]" aria-hidden="true">
          <span className="block h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600" style={{ width: `${Math.max(4, standing)}%` }} />
        </span>
      ) : null}
      {!loading ? <span className="mt-1 block truncate text-[11px] text-slate-500 dark:text-zinc-400">{hint}</span> : null}
    </Link>
  );
}
