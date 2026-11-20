import { Link } from 'react-router-dom';
import { ArrowRight, Gauge, Medal } from 'lucide-react';
import { formatScore } from '../prepScore/formatScore';
import GuideInfo from '../../guide/platform/GuideInfo';

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

/**
 * The signed-in student's own Prep Score, shown prominently on their profile. Students see only the
 * Prep Coding score and their university rank, never how the score is calculated.
 */
export default function PrepScoreSummary({ ranking, loading = false, className = '' }) {
  const total = Math.floor(finite(ranking?.totalStudents));
  const rawRank = Math.floor(finite(ranking?.rank));
  const rank = rawRank > 0 && total > 0 ? Math.min(total, rawRank) : null;
  const topPercent = rank && total > 1 ? Math.max(1, Math.ceil((rank / total) * 100)) : null;
  const score = finite(ranking?.score);
  const hint = !ranking ? 'Your Prep Score is unavailable right now.'
    : rank ? `${ranking.universityName || 'Your university'}`
      : ranking.hasProgress ? 'Your rank appears once your university ranking updates.'
        : 'Solve coding problems to grow your Prep Score.';

  return (
    <section
      aria-labelledby="profile-prep-score-title"
      aria-busy={loading}
      className={`overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.02)] dark:border-zinc-800 dark:bg-[#242424] ${className}`}
    >
      <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex items-center gap-4 bg-gradient-to-br from-sky-500 to-sky-700 px-5 py-4 text-white">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/25">
            <Gauge className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="profile-prep-score-title" className="flex items-center gap-1.5 text-[12.5px] font-medium text-sky-100">Your Prep Score<GuideInfo step="pf-score" /></h2>
            <p className="mt-1 text-[34px] font-bold leading-none tracking-[-0.04em] tabular-nums" aria-label={`Prep Score ${loading || !ranking ? 'loading' : formatScore(score)}`}>
              {loading ? <span className="inline-block h-8 w-20 animate-pulse rounded-md bg-white/20 align-middle" /> : ranking ? formatScore(score) : '—'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <Medal className="h-5 w-5 shrink-0 text-sky-500" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">University rank</p>
              <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 tabular-nums">
                <span className="text-[20px] font-bold leading-none tracking-[-0.03em] text-slate-950 dark:text-zinc-50">
                  {loading ? '…' : rank ? `#${rank.toLocaleString()}` : 'Not ranked yet'}
                </span>
                {!loading && rank ? <span className="text-[12px] text-slate-500 dark:text-zinc-400">of {total.toLocaleString()}{ranking?.tied ? ' · tied' : ''}</span> : null}
                {!loading && topPercent ? <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">Top {topPercent}%</span> : null}
              </p>
              {!loading && <p className="mt-1 truncate text-[11.5px] text-slate-500 dark:text-zinc-400">{hint}</p>}
            </div>
          </div>
          <Link
            to="/student/rankings"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-sky-700 transition-colors hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 dark:text-sky-300 dark:hover:bg-sky-500/10"
          >
            View rankings<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
