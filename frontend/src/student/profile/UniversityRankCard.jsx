import { useId } from 'react';
import { Medal, Trophy } from 'lucide-react';

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : fallback;
}

/** Shows only the signed-in student's standing, using the same verified rank on both pages. */
export default function UniversityRankCard({ ranking, loading = false, className = '', variant = 'default' }) {
  const headingId = useId();
  const wide = variant === 'wide';
  const totalStudents = Math.floor(finiteNumber(ranking?.totalStudents));
  const rawRank = ranking?.rank === null || ranking?.rank === undefined ? null : finiteNumber(ranking.rank);
  const rank = rawRank > 0 && totalStudents > 0 ? Math.min(totalStudents, Math.floor(rawRank)) : null;
  const score = finiteNumber(ranking?.score);
  const badges = Array.isArray(ranking?.earnedBadges) ? ranking.earnedBadges.length : Math.floor(finiteNumber(ranking?.earnedBadges));
  const position = rank ? totalStudents === 1 ? 100 : ((totalStudents - rank) / (totalStudents - 1)) * 100 : 0;
  const name = ranking?.universityName || 'Your university';
  const topPercent = rank && totalStudents > 1 ? Math.max(1, Math.ceil((rank / totalStudents) * 100)) : null;
  const level = ranking?.level?.title;
  const cardClass = `rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.02)] dark:border-zinc-800 dark:bg-[#242424] ${className}`;
  const firstProgress = ranking && !rank && !ranking.hasProgress && !loading;
  const emptyMessage = !ranking
    ? 'Your university standing is unavailable right now.'
    : !ranking.universityName
      ? 'Ask your coordinator to add your university details to see your standing.'
      : totalStudents === 0
        ? 'Your university ranking will appear as students start making progress.'
        : 'Complete a question, lesson or assessment to earn your first ranking points.';

  if (firstProgress) {
    return (
      <section aria-labelledby={headingId} className={cardClass}>
        <h2 id={headingId} className="sr-only">University standing</h2>
        <div className="flex items-center gap-3.5">
          <Trophy className="h-8 w-8 shrink-0 text-sky-600 dark:text-sky-400" strokeWidth={1.4} aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold tracking-tight text-slate-900 dark:text-zinc-100">Not ranked yet</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">{ranking.universityName
              ? 'Complete a question or lesson to enter your university ranking.'
              : 'Ask your coordinator to add your university details.'}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby={headingId} aria-busy={loading} className={cardClass}>
      <div className={wide ? 'grid gap-x-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(150px,0.65fr)] lg:items-center' : ''}>
      <div>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={headingId} className="text-[14px] font-semibold tracking-tight text-slate-950 dark:text-zinc-50">University standing</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400">{loading ? 'Loading your university rank…' : name}</p>
        </div>
        <Medal className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
      </header>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="flex items-baseline gap-2 tabular-nums">
            <span className="text-[28px] font-semibold leading-none tracking-[-0.055em] text-slate-950 dark:text-zinc-50">{loading || !rank ? '—' : `#${rank}`}</span>
            {!loading && rank ? <span className="text-[11px] text-slate-500 dark:text-zinc-400">of {totalStudents.toLocaleString()} students{ranking?.tied ? ' · tied' : ''}</span> : null}
          </p>
          <p className={wide ? 'sr-only' : 'mt-1 text-[11px] text-slate-500 dark:text-zinc-400'}>Your current rank</p>
        </div>
        {!loading && topPercent ? <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">Top {topPercent}%</span> : null}
      </div>

      </div>

      <div className={wide ? 'mt-4 lg:mt-0' : 'mt-4'}>
      {rank && !loading ? (
        <div>
          {wide ? <p className="mb-2 text-[11px] font-medium text-slate-600 dark:text-zinc-400">Your university position</p> : null}
          <div className="relative h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800" role="progressbar" aria-label="University rank position" aria-valuemin={1} aria-valuemax={totalStudents} aria-valuenow={rank} aria-valuetext={`Rank ${rank} of ${totalStudents} students`}>
            <div className="h-full rounded-full bg-sky-500 transition-[width] duration-500 motion-reduce:transition-none dark:bg-sky-500" style={{ width: `${position}%` }} />
            <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-600 ring-1 ring-sky-200 dark:border-zinc-900 dark:ring-sky-700" style={{ left: `clamp(5px, ${position}%, calc(100% - 5px))` }} aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 dark:text-zinc-500"><span>Starting point</span><span>Rank #1</span></div>
        </div>
      ) : loading ? (
        <div className="h-2 animate-pulse rounded-full bg-slate-100 dark:bg-zinc-800" aria-hidden="true" />
      ) : <p className="text-xs leading-relaxed text-slate-500 dark:text-zinc-400">{emptyMessage}</p>}
      </div>

      <div className={wide ? 'mt-4 border-t border-slate-100 pt-3 dark:border-zinc-800 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0' : 'mt-4 border-t border-slate-100 pt-3 dark:border-zinc-800'}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-medium text-slate-500 dark:text-zinc-500">Progress points</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-800 dark:text-zinc-100">{loading || !ranking ? '—' : score.toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-slate-500 dark:text-zinc-500">Earned badges</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-800 dark:text-zinc-100">{loading || !ranking ? '—' : badges}</p>
        </div>
      </div>
      {!loading && level ? <p className="mt-2 text-[10px] text-slate-500 dark:text-zinc-400">{level}</p> : null}
      </div>
      </div>
      <details className={`text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400 ${wide ? 'mt-3 border-t border-slate-100 pt-2.5 dark:border-zinc-800' : 'mt-3'}`}>
        <summary className="w-fit cursor-pointer rounded text-sky-600 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-400 dark:hover:text-sky-300">How ranking works</summary>
        <p className="mt-2">{ranking?.methodology || 'Based on completed coding, learning, assessments and earned badges. Equal points share the same rank.'}</p>
      </details>
    </section>
  );
}
