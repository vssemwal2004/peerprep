import { Gauge } from 'lucide-react';
import { formatScore } from '../../student/prepScore/formatScore';

const LEVELS = [
  { key: 'Easy', tone: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'Medium', tone: 'text-amber-600 dark:text-amber-400' },
  { key: 'Hard', tone: 'text-rose-600 dark:text-rose-400' },
];

/**
 * Staff view of a student's Prep Score (= the Prep Coding score) and the counted solves behind it.
 * Reads the same stored score that ranks and Prep Analysis use. Hidden when it could not be read.
 */
export default function PrepScoreCard({ prepScore }) {
  if (!prepScore) return null;
  const counts = prepScore.features?.coding?.counts || null;

  return (
    <section
      aria-labelledby="admin-prep-score-title"
      className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-zinc-800 dark:bg-[#242424]"
    >
      <div className="grid sm:grid-cols-[220px_minmax(0,1fr)]">
        <div className="relative flex flex-col justify-between gap-3 bg-gradient-to-br from-sky-500 to-sky-700 p-4 text-white">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 ring-1 ring-inset ring-white/25">
              <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <h2 id="admin-prep-score-title" className="text-[13px] font-semibold tracking-tight">Prep Score</h2>
          </div>
          <div>
            <p className="text-[38px] font-bold leading-none tracking-[-0.04em] tabular-nums" aria-label={`Prep Score ${formatScore(prepScore.total)}`}>
              {formatScore(prepScore.total)}
            </p>
            <p className="mt-1.5 text-[11.5px] text-sky-100">
              {prepScore.hasProgress ? 'From practice coding solves' : 'No coding solves yet'}
            </p>
          </div>
        </div>

        <div className="p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Solves counted in the score</p>
          {counts ? (
            <ul className="grid grid-cols-3 gap-2">
              {LEVELS.map(({ key, tone }) => (
                <li key={key} className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-white/[0.04]">
                  <span className="block text-[11.5px] font-medium text-slate-500 dark:text-zinc-400">{key}</span>
                  <span className={`text-[17px] font-bold tabular-nums ${tone}`}>{Number(counts[key] || 0)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-slate-500 dark:text-zinc-400">Appears once the student solves a practice problem.</p>
          )}
          <p className="mt-2 text-[11px] text-slate-400 dark:text-zinc-500">Solves over the daily per-topic limit are not counted.</p>
        </div>
      </div>
    </section>
  );
}
