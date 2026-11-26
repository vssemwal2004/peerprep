import { DIFFICULTY_THEME } from '../../utils/difficultyTheme';
import { RefreshCw } from 'lucide-react';

// Shared surfaces for the student dashboard. Colours stay neutral; PeerPrep sky is reserved for
// actions and progress, and the difficulty palette matches the profile's coding gauge.
export const card = 'rounded-2xl border border-[#e9eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-[color:var(--student-dash-border,rgba(255,255,255,0.07))] dark:bg-[var(--student-dash-card,#242424)] dark:shadow-none';
export const interactiveCard = `${card} transition-[background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[#dcdee4] hover:shadow-[0_12px_32px_-20px_rgba(16,24,40,0.28)] motion-reduce:transform-none dark:hover:border-[color:var(--student-dash-border,rgba(255,255,255,0.14))] dark:hover:bg-[var(--student-dash-hover,#242424)]`;
export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[color:var(--student-dash-canvas,#1a1a1a)]';
export const textLink = `inline-flex items-center gap-1 rounded text-[12px] font-semibold text-sky-700 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300 ${focusRing}`;

const DIFFICULTY_TAGS = Object.fromEntries(Object.entries(DIFFICULTY_THEME).map(([key, theme]) => [key.toLowerCase(), theme.pill]));

export function DifficultyTag({ difficulty, className = '' }) {
  const key = String(difficulty || '').toLowerCase();
  if (!DIFFICULTY_TAGS[key]) return null;
  return <span className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${DIFFICULTY_TAGS[key]} ${className}`}>{difficulty}</span>;
}

/** Dark square glyph tile, the dashboard's single recurring visual motif. */
export function IconTile({ icon: Icon, tone = 'ink', size = 'md' }) {
  const tones = {
    ink: 'bg-slate-900 text-white dark:bg-[var(--student-dash-fg,#f4f4f5)] dark:text-[color:var(--student-dash-canvas,#18181b)]',
    sky: 'bg-sky-600 text-white',
    soft: 'bg-slate-100 text-slate-600 dark:bg-[var(--student-dash-hover,#27272a)] dark:text-[color:var(--student-dash-muted,#d4d4d8)]',
  };
  const sizes = { sm: 'h-8 w-8 rounded-lg', md: 'h-11 w-11 rounded-xl' };
  return <span className={`flex shrink-0 items-center justify-center shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)] ${sizes[size]} ${tones[tone]}`} aria-hidden="true">
    <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={1.75} />
  </span>;
}

/** Section title with a trailing hairline, as on large learning platforms. */
export function SectionHeader({ id, title, action, info = null }) {
  return <header className="mb-4 flex items-center gap-4">
    <h2 id={id} className="flex shrink-0 items-center gap-1.5 text-[17px] font-medium tracking-[-0.015em] text-slate-900 dark:text-[color:var(--student-dash-fg,#f4f4f5)]">{title}{info}</h2>
    <span className="h-px flex-1 bg-[#e6e7eb] dark:bg-[var(--student-dash-border,rgba(255,255,255,0.08))]" aria-hidden="true" />
    {action}
  </header>;
}

// Each rail card gets its own soft accent so the column scans at a glance.
const TITLE_TONES = {
  sky: 'bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/25',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/25',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25',
  rose: 'bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25',
};

export function TitleIcon({ icon: Icon, tone = 'sky' }) {
  return <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ring-1 ring-inset ${TITLE_TONES[tone]}`} aria-hidden="true">
    <Icon className="h-4 w-4" strokeWidth={2} />
  </span>;
}

/** Card heading used inside the rail cards. */
export function CardTitle({ id, title, icon, tone, action, info = null }) {
  return <header className="flex items-center justify-between gap-3">
    <h2 id={id} className="flex min-w-0 items-center gap-2.5 text-[15.5px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-[color:var(--student-dash-fg,#fafafa)]">
      {icon && <TitleIcon icon={icon} tone={tone} />}
      <span className="truncate">{title}</span>
      {info}
    </h2>
    {action}
  </header>;
}

export function ProgressBar({ value, label, className = '', tone = 'bg-sky-500' }) {
  const percent = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return <div className={`h-1.5 overflow-hidden rounded-full bg-[#eef0f3] dark:bg-[var(--student-dash-border,rgba(255,255,255,0.08))] ${className}`} role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
    <span className={`block h-full rounded-full ${tone} transition-[width] duration-500 motion-reduce:transition-none`} style={{ width: `${percent}%` }} />
  </div>;
}

export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none dark:bg-[var(--student-dash-hover,#27272a)] ${className}`} />;
}

export function Unavailable({ message, onRetry, className = '' }) {
  return <div role="status" className={`flex items-center justify-between gap-3 rounded-xl bg-[#f6f7f9] px-3.5 py-3 text-[12.5px] text-slate-500 dark:bg-[var(--student-dash-hover,rgba(255,255,255,0.04))] dark:text-[color:var(--student-dash-muted,#a1a1aa)] ${className}`}>
    <p>{message}</p>
    {onRetry && <button type="button" onClick={onRetry} className={`inline-flex shrink-0 items-center gap-1 font-semibold text-sky-700 dark:text-sky-400 ${focusRing}`}><RefreshCw className="h-3 w-3" aria-hidden="true" />Retry</button>}
  </div>;
}
