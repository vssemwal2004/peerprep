import { RefreshCw } from 'lucide-react';

// Shared surfaces for the student dashboard. Colours stay neutral; PeerPrep sky is reserved for
// actions and progress, and the difficulty palette matches the profile's coding gauge.
export const card = 'rounded-2xl border border-[#e9eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#242424] dark:shadow-none';
export const interactiveCard = `${card} transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[#dcdee4] hover:shadow-[0_12px_32px_-20px_rgba(16,24,40,0.28)] motion-reduce:transform-none dark:hover:border-white/[0.14]`;
export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#1a1a1a]';
export const softButton = 'inline-flex shrink-0 items-center gap-1.5 rounded-[10px] bg-[#f1f2f5] px-3 py-[7px] text-[12.5px] font-medium text-slate-700 transition-colors group-hover:bg-slate-900 group-hover:text-white dark:bg-white/[0.07] dark:text-zinc-200 dark:group-hover:bg-zinc-100 dark:group-hover:text-zinc-900';
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
  const sizes = { sm: 'h-8 w-8 rounded-lg', md: 'h-11 w-11 rounded-xl' };
  return <span className={`flex shrink-0 items-center justify-center shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)] ${sizes[size]} ${tones[tone]}`} aria-hidden="true">
    <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={1.75} />
  </span>;
}

/** Section title with a trailing hairline, as on large learning platforms. */
export function SectionHeader({ id, title, action }) {
  return <header className="mb-4 flex items-center gap-4">
    <h2 id={id} className="shrink-0 text-[17px] font-medium tracking-[-0.015em] text-slate-900 dark:text-zinc-100">{title}</h2>
    <span className="h-px flex-1 bg-[#e6e7eb] dark:bg-white/[0.08]" aria-hidden="true" />
    {action}
  </header>;
}

// Each rail card gets its own soft accent so the column scans at a glance.
const TITLE_TONES = {
  sky: 'bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/15',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/15',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/15',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/15',
  rose: 'bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/15',
};

export function TitleIcon({ icon: Icon, tone = 'sky' }) {
  return <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ring-1 ring-inset ${TITLE_TONES[tone]}`} aria-hidden="true">
    <Icon className="h-4 w-4" strokeWidth={2} />
  </span>;
}

/** Card heading used inside the rail cards. */
export function CardTitle({ id, title, icon, tone, action }) {
  return <header className="flex items-center justify-between gap-3">
    <h2 id={id} className="flex min-w-0 items-center gap-2.5 text-[15.5px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-zinc-50">
      {icon && <TitleIcon icon={icon} tone={tone} />}
      <span className="truncate">{title}</span>
    </h2>
    {action}
  </header>;
}

export function ProgressBar({ value, label, className = '', tone = 'bg-sky-500' }) {
  const percent = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return <div className={`h-1.5 overflow-hidden rounded-full bg-[#eef0f3] dark:bg-white/[0.08] ${className}`} role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
    <span className={`block h-full rounded-full ${tone} transition-[width] duration-500 motion-reduce:transition-none`} style={{ width: `${percent}%` }} />
  </div>;
}

export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none dark:bg-zinc-800 ${className}`} />;
}

export function Unavailable({ message, onRetry, className = '' }) {
  return <div role="status" className={`flex items-center justify-between gap-3 rounded-xl bg-[#f6f7f9] px-3.5 py-3 text-[12.5px] text-slate-500 dark:bg-white/[0.04] dark:text-zinc-400 ${className}`}>
    <p>{message}</p>
    {onRetry && <button type="button" onClick={onRetry} className={`inline-flex shrink-0 items-center gap-1 font-semibold text-sky-700 dark:text-sky-400 ${focusRing}`}><RefreshCw className="h-3 w-3" aria-hidden="true" />Retry</button>}
  </div>;
}
