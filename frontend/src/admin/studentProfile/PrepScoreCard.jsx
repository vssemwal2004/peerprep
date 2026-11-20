import { BookOpen, ClipboardCheck, Code2, Gauge, MessagesSquare } from 'lucide-react';
import { formatScore } from '../../student/prepScore/formatScore';

// Module key in the stored score -> university module that must be enabled to show it.
const MODULES = [
  { key: 'coding', module: 'questions', label: 'Prep Coding', Icon: Code2 },
  { key: 'assessment', module: 'assessments', label: 'Prep Assessment', Icon: ClipboardCheck },
  { key: 'interview', module: 'interviews', label: 'Prep Interview', Icon: MessagesSquare },
  { key: 'learning', module: 'learning', label: 'Prep Learning', Icon: BookOpen },
];

/**
 * Staff view of a student's Prep Score: the overall number plus the module scores behind it.
 * Reads the same stored score that ranks and Prep Analysis use. Hidden when it could not be read.
 */
export default function PrepScoreCard({ prepScore, visible = {} }) {
  if (!prepScore) return null;
  const modules = MODULES
    .filter((item) => visible[item.module] !== false && prepScore.features?.[item.key])
    .map((item) => ({ ...item, score: prepScore.features[item.key].score }));

  return (
    <section
      aria-labelledby="admin-prep-score-title"
      data-guide="sp-prep-score"
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
              {prepScore.hasProgress ? 'Overall · from verified activity' : 'No scored activity yet'}
            </p>
          </div>
        </div>

        <div className="p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Module scores</p>
          {modules.length ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {modules.map(({ key, label, Icon, score }) => (
                <li key={key} className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-white/[0.04]">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-slate-700 dark:text-zinc-200">{label}</span>
                  <span className="text-[15px] font-bold tabular-nums text-slate-950 dark:text-zinc-50" aria-label={`${label} ${formatScore(score)}`}>
                    {formatScore(score)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-slate-500 dark:text-zinc-400">Module scores appear once the student is active in an enabled module.</p>
          )}
        </div>
      </div>
    </section>
  );
}
