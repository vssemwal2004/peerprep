import { RefreshCw } from 'lucide-react';

// Shared surfaces for the student dashboard. Colours stay neutral; PeerPrep sky is reserved for
// actions and progress, and the difficulty palette matches the profile's coding gauge.
export const card = 'rounded-xl border border-slate-200/80 bg-white dark:border-zinc-800 dark:bg-[#242424]';
export const interactiveCard = `${card} transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-slate-300 hover:shadow-[0_10px_28px_-18px_rgba(15,23,42,0.35)] motion-reduce:transform-none dark:hover:border-zinc-700`;
export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#1a1a1a]';
export const softButton = 'inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition-colors group-hover:bg-slate-900 group-hover:text-white dark:bg-zinc-800 dark:text-zinc-200 dark:group-hover:bg-zinc-100 dark:group-hover:text-zinc-900';
export const textLink = `inline-flex items-center gap-1 rounded text-[12px] font-semibold text-sky-700 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300 ${focusRing}`;

const DIFFICULTY_TAGS = {
  easy: 'bg-[#43866a]/10 text-[#326f55] dark:bg-[#43866a]/20 dark:text-[#83bd9e]',
  medium: 'bg-[#b08c3e]/10 text-[#8e6e2a] dark:bg-[#b08c3e]/20 dark:text-[#d5b977]',
  hard: 'bg-[#88465b]/10 text-[#88465b] dark:bg-[#88465b]/25 dark:text-[#cf91a6]',
};

export function DifficultyTag({ difficulty, className = '' }) {
  const key = String(difficulty || '').toLowerCase();
  if (!DIFFICULTY_TAGS[key]) return null;
  return <span className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${DIFFICULTY_TAGS[key]} ${className}`}>{difficulty}</span>;
}

/** Dark square glyph tile, the dashboard's single recurring visual motif. */
export function IconTile({ icon: Icon, tone = 'ink', size = 'md' }) {
  const tones = {
    ink: 'bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
    sky: 'bg-sky-600 text-white',
    soft: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300',
  };
  const sizes = { sm: 'h-8 w-8 rounded-lg', md: 'h-10 w-10 rounded-[10px]' };
  return <span className={`flex shrink-0 items-center justify-center ${sizes[size]} ${tones[tone]}`} aria-hidden="true">
    <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]'} strokeWidth={1.8} />
  </span>;
}

/** Section title with a trailing hairline, as on large learning platforms. */
export function SectionHeader({ id, title, action }) {
  return <header className="mb-3 flex items-center gap-3">
    <h2 id={id} className="shrink-0 text-[15px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-zinc-100">{title}</h2>
    <span className="h-px flex-1 bg-slate-200/80 dark:bg-zinc-800" aria-hidden="true" />
    {action}
  </header>;
}

/** Card heading used inside the rail cards. */
export function CardTitle({ id, title, icon: Icon, action }) {
  return <header className="flex items-center justify-between gap-3">
    <h2 id={id} className="flex min-w-0 items-center gap-2 text-[14px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-zinc-100">
      {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400 dark:text-zinc-500" aria-hidden="true" />}
      <span className="truncate">{title}</span>
    </h2>
    {action}
  </header>;
}

export function ProgressBar({ value, label, className = '', tone = 'bg-sky-500' }) {
  const percent = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return <div className={`h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800 ${className}`} role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
    <span className={`block h-full rounded-full ${tone} transition-[width] duration-500 motion-reduce:transition-none`} style={{ width: `${percent}%` }} />
  </div>;
}

export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none dark:bg-zinc-800 ${className}`} />;
}

export function Unavailable({ message, onRetry, className = '' }) {
  return <div role="status" className={`flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-[12px] text-slate-500 dark:bg-zinc-800/60 dark:text-zinc-400 ${className}`}>
    <p>{message}</p>
    {onRetry && <button type="button" onClick={onRetry} className={`inline-flex shrink-0 items-center gap-1 font-semibold text-sky-700 dark:text-sky-400 ${focusRing}`}><RefreshCw className="h-3 w-3" aria-hidden="true" />Retry</button>}
  </div>;
}
