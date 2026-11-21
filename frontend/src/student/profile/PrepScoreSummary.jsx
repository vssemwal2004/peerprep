import { useState } from 'react';
import { Gauge, LineChart } from 'lucide-react';
import { formatScore } from '../prepScore/formatScore';
import { ChangeChip, PrepScoreHistoryDialog, ScoreSparkline, usePrepScoreHistory } from '../prepScore/PrepScoreHistory';
import GuideInfo from '../../guide/platform/GuideInfo';

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

/**
 * The signed-in student's own Prep Score (activity points): the number, its 30-day change and
 * trend. The trend opens the full history. Sits beside the Prep Readiness card at the same
 * height; the university rank lives in the profile sidebar.
 */
export default function PrepScoreSummary({ ranking, loading = false, className = '' }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const trend = usePrepScoreHistory('30d', Boolean(ranking));
  const score = finite(ranking?.score);

  return (
    <section
      aria-labelledby="profile-prep-score-title"
      aria-busy={loading}
      className={`relative flex h-full flex-col overflow-hidden rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-sky-800 text-white shadow-[0_10px_30px_-18px_rgba(2,132,199,0.8)] ${className}`}
    >
      <span className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />
      <span className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" aria-hidden="true" />
      <header className="relative flex items-center gap-2.5 px-4 pt-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-inset ring-white/25"><Gauge className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="profile-prep-score-title" className="flex items-center gap-1.5 text-[14px] font-semibold">Your Prep Score<GuideInfo step="pf-score" /></h2>
          <p className="truncate text-[11px] text-sky-100">Activity points from practice</p>
        </div>
      </header>
      <div className="relative flex flex-1 flex-wrap items-end justify-between gap-3 px-4 pt-3">
        <p className="flex flex-col gap-1.5">
          <span className="text-[40px] font-bold leading-none tracking-[-0.04em] tabular-nums" aria-label={`Prep Score ${loading || !ranking ? 'loading' : formatScore(score)}`}>
            {loading ? <span className="inline-block h-9 w-24 animate-pulse rounded-md bg-white/20 align-middle" /> : ranking ? formatScore(score) : '—'}
          </span>
          {trend.history ? <span><ChangeChip change={trend.history.change} label="30 days" inverse /></span> : <span className="h-5" />}
        </p>
        {ranking && trend.history ? <ScoreSparkline history={trend.history} width={150} height={48} /> : null}
      </div>
      <footer className="relative mt-auto flex flex-wrap items-center justify-between gap-2 px-4 pb-3.5 pt-3">
        <p className="text-[11px] text-sky-100/90">{ranking ? 'From solves, challenges, sheets and badges' : 'Your Prep Score is unavailable right now.'}</p>
        {ranking ? (
          <button type="button" onClick={() => setHistoryOpen(true)} data-guide="pf-score-history"
            className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-semibold ring-1 ring-inset ring-white/25 transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            aria-label="Open your Prep Score history">
            <LineChart className="h-3.5 w-3.5" aria-hidden="true" />History
          </button>
        ) : null}
      </footer>
      <PrepScoreHistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </section>
  );
}
