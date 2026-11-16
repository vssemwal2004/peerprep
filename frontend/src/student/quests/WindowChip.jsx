import { CalendarClock, CircleDot, Lock } from 'lucide-react';
import { WINDOW_LABELS, hasWindow, questWindowStatus, windowText } from './questWindow';

const TONES = {
  upcoming: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  open: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20',
  ended: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700',
};
const ICONS = { upcoming: CalendarClock, open: CircleDot, ended: Lock };

/** Upcoming / Open / Ended chip for a QuickPrep's attempt window; the full window is in its tooltip. */
export default function WindowChip({ quest, now, className = '' }) {
  const status = questWindowStatus(quest, now);
  const Icon = ICONS[status];
  const label = status === 'open' && !hasWindow(quest) ? 'Always open' : WINDOW_LABELS[status];
  return <span title={windowText(quest)} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset ${TONES[status]} ${className}`}>
    <Icon className="h-3 w-3" aria-hidden="true" />{label}
  </span>;
}
