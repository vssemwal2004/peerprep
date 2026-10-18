import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PrepScoreBreakdown, ScoreRing, ScoreValue } from './PrepScore';
import { rankingSnapshot, subscribeRanking } from './rankingStore';

/**
 * The student's Prep Score in the top bar of the dashboard and profile: the
 * overall score out of 100 and rank, opening into each feature's score. It shows
 * the ranking the page has already loaded (the same numbers as the page's cards)
 * and makes no requests of its own.
 */
export default function HeaderPrepScore({ userId }) {
  const snapshot = useSyncExternalStore(subscribeRanking, rankingSnapshot);
  const ranking = snapshot.userId && snapshot.userId === String(userId) ? snapshot.ranking : null;
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!ranking) return null;
  const score = Math.min(100, Math.max(0, Number(ranking.score) || 0));
  const rank = Number(ranking.rank) > 0 ? Number(ranking.rank) : null;
  const total = Number(ranking.totalStudents) || 0;
  const shown = score.toLocaleString(undefined, { maximumFractionDigits: 1 });

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={panelId}
        aria-label={`Prep Score ${shown} out of 100${rank ? `, rank ${rank} of ${total}` : ''}`} title="Your Prep Score"
        className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white pl-1 pr-2.5 text-[13px] font-bold tabular-nums text-slate-800 transition hover:border-sky-300 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-sky-950/40">
        <ScoreRing value={score} size={28} stroke={3.5} />
        <span className="hidden sm:inline">Prep Score</span>
        {rank && <span className="hidden rounded-md bg-sky-50 px-1.5 text-[11px] font-semibold leading-5 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300 md:inline">#{rank}</span>}
      </button>
      {open && (
        <div id={panelId} role="dialog" aria-label="Prep Score"
          className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[19rem] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)] dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ScoreRing value={score} size={52} stroke={5} />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Prep Score</p>
                <ScoreValue value={score} />
              </div>
            </div>
            <p className="text-right text-[12px] leading-tight text-slate-600 dark:text-slate-300">
              {rank ? <><b className="text-[16px] text-slate-950 dark:text-white">#{rank.toLocaleString()}</b><br />of {total.toLocaleString()} students</> : 'Not ranked yet'}
            </p>
          </div>
          <PrepScoreBreakdown prepScore={ranking.prepScore} className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800" />
          {!score && <p className="mt-3 text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">Solve a problem, finish a lesson or take a test to start your Prep Score.</p>}
          {ranking.methodology && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600 dark:bg-white/[0.04] dark:text-slate-400">{ranking.methodology}</p>}
          <Link to="/student/rankings" onClick={() => setOpen(false)} className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-sky-700 hover:underline dark:text-sky-300">
            See rankings<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
