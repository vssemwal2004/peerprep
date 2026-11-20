import { CalendarClock, CheckCircle2, Infinity as InfinityIcon, Lock, PlayCircle } from 'lucide-react';

/** A small pulsing dot for "open now" (the ping is skipped under reduced motion). */
export function LiveDot({ className = '' }) {
  return (
    <span className={`relative flex h-2 w-2 ${className}`} aria-hidden="true">
      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 motion-safe:animate-ping" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
    </span>
  );
}

const pill = 'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none';

export function OpenNowBadge({ count, className = '' }) {
  if (!count) return null;
  return (
    <span className={`${pill} bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20 ${className}`}>
      <LiveDot />{count} open now
    </span>
  );
}

const STATUS = {
  live: { label: 'Live', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20', live: true },
  in_progress: { label: 'In progress', tone: 'bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20', icon: PlayCircle },
  upcoming: { label: 'Upcoming', tone: 'bg-sky-50 text-sky-700 ring-sky-200/70 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20', icon: CalendarClock },
  completed: { label: 'Completed', tone: 'bg-indigo-50 text-indigo-700 ring-indigo-200/70 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20', icon: CheckCircle2 },
  closed: { label: 'Closed', tone: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/[0.06] dark:text-zinc-400 dark:ring-white/10', icon: Lock },
};

export function StatusBadge({ state }) {
  const spec = STATUS[state] || STATUS.closed;
  const Icon = spec.icon;
  return (
    <span className={`${pill} ring-1 ring-inset ${spec.tone}`}>
      {spec.live ? <LiveDot /> : <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      {spec.label}
    </span>
  );
}

/** A small completion ring: done of total (indigo when all done). */
export function CompletionRing({ done = 0, total = 0, size = 28, label, className = '' }) {
  const radius = 15;
  const ring = 2 * Math.PI * radius;
  const share = total ? Math.min(1, done / total) : 0;
  const complete = total > 0 && done >= total;
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} className={`shrink-0 -rotate-90 ${className}`} role="img" aria-label={label || `${done} of ${total} completed`}>
      <circle cx="18" cy="18" r={radius} fill="none" strokeWidth="4.5" className="stroke-slate-100 dark:stroke-white/[0.08]" />
      {share > 0 && <circle cx="18" cy="18" r={radius} fill="none" strokeWidth="4.5" strokeLinecap="round" strokeDasharray={`${share * ring} ${ring}`}
        className={complete ? 'stroke-indigo-500' : 'stroke-violet-500 dark:stroke-violet-400'} />}
    </svg>
  );
}

/** Text with the search match marked. `parts` comes from highlightParts(). */
export function Highlight({ parts }) {
  // Parts are positional and never reorder, so the index is a stable key.
  return parts.map((part, index) => (part.match
    ? <mark key={index} className="rounded-[3px] bg-amber-200/70 px-px text-inherit dark:bg-amber-400/25">{part.text}</mark>
    : <span key={index}>{part.text}</span>));
}

export function AlwaysOpenBadge() {
  return (
    <span className={`${pill} bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:ring-white/10`} title="No closing date: start any time">
      <InfinityIcon className="h-3.5 w-3.5" aria-hidden="true" />Always open
    </span>
  );
}
