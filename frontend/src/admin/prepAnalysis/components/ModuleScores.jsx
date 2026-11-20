import { BookOpen, ClipboardCheck, Code2, MessagesSquare } from 'lucide-react';
import { ScoreValue } from '../../../student/prepScore/PrepScore';

const FEATURES = [
  { key: 'coding', label: 'Prep Coding', Icon: Code2 },
  { key: 'assessment', label: 'Prep Assessment', Icon: ClipboardCheck },
  { key: 'interview', label: 'Prep Interview', Icon: MessagesSquare },
  { key: 'learning', label: 'Prep Learning', Icon: BookOpen },
];

/** Admin-only: the module scores behind a student's Prep Score. Students never see this breakdown. */
export default function ModuleScores({ prepScore, className = '' }) {
  const features = FEATURES
    .map((feature) => ({ ...feature, score: prepScore?.features?.[feature.key]?.score }))
    .filter((feature) => Number.isFinite(Number(feature.score)));
  if (!features.length) return null;

  return (
    <div className={className}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Module scores</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {features.map(({ key, label, Icon, score }) => (
          <div key={key} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 text-[12px] font-semibold text-slate-700 dark:text-zinc-200">{label}</span>
            <ScoreValue value={score} size="sm" label={label} />
          </div>
        ))}
      </div>
    </div>
  );
}
