import { createElement } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

// Glass surfaces on a soft PeerPrep gradient. Sky is the primary accent; module colours come from MODULE_META.

export function OverviewShell({ children }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-white">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_80%_at_15%_0%,rgba(14,165,233,0.16),transparent_70%),radial-gradient(45%_70%_at_90%_10%,rgba(16,185,129,0.10),transparent_70%)] dark:bg-[radial-gradient(60%_80%_at_15%_0%,rgba(14,165,233,0.18),transparent_70%),radial-gradient(45%_70%_at_90%_10%,rgba(16,185,129,0.08),transparent_70%)]" />
      <div className="relative mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6">{children}</div>
    </div>
  );
}

export function Glass({ as = 'section', className = '', children, ...props }) {
  return createElement(as, {
    className: `rounded-2xl border border-white/70 bg-white/75 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-18px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60 dark:shadow-none ${className}`,
    ...props,
  }, children);
}

export function CardHeader({ title, subtitle, Icon, action }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900/[0.04] text-slate-600 dark:bg-white/[0.06] dark:text-slate-300"><Icon className="h-4 w-4" /></span> : null}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
          {subtitle ? <p className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function CardLink({ to, children = 'View all' }) {
  if (!to) return null;
  return (
    <Link to={to} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-400/10">
      {children}<ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

export function Delta({ value, suffix = 'vs last week' }) {
  if (value === null || value === undefined) return <span className="text-[11px] text-slate-400">New this week</span>;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  const tone = value > 0 ? 'text-emerald-600 dark:text-emerald-300' : value < 0 ? 'text-rose-600 dark:text-rose-300' : 'text-slate-400';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${tone}`}>
      <Icon className="h-3.5 w-3.5" />{Math.abs(value)}%<span className="ml-1 font-normal text-slate-400">{suffix}</span>
    </span>
  );
}

export function Sparkline({ values = [], color = '#0284c7', id }) {
  const data = values.map((value, index) => ({ index, value }));
  return (
    <div className="h-10 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#spark-${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function KpiTile({ label, value, helper, Icon, color = '#0284c7', trend, delta, to, loading, footer }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          {loading
            ? <div className="mt-2 h-7 w-20 animate-pulse rounded-lg bg-slate-200/80 dark:bg-white/10" />
            : <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</p>}
        </div>
        {Icon ? <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}14`, color }}><Icon className="h-[18px] w-[18px]" /></span> : null}
      </div>
      <div className="mt-auto pt-2">
        {trend ? <Sparkline values={trend} color={color} id={label.replace(/\W/g, '')} /> : null}
        {footer && !loading ? <div className="mb-1">{footer}</div> : null}
        <div className="mt-1 flex min-h-[18px] flex-wrap items-center justify-between gap-x-2">
          {helper ? <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">{helper}</span> : <span />}
          {delta !== undefined && !loading ? <Delta value={delta} /> : null}
        </div>
      </div>
    </>
  );
  const className = 'group flex h-full flex-col p-4 transition';
  return to
    ? <Glass as={Link} to={to} className={`${className} hover:-translate-y-0.5 hover:border-sky-200 dark:hover:border-sky-400/30`}>{body}</Glass>
    : <Glass as="div" className={className}>{body}</Glass>;
}

export function MiniStat({ label, value, tone = 'text-slate-950 dark:text-white' }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-900/[0.03] px-3 py-2.5 dark:bg-white/[0.04]">
      <p className={`text-lg font-semibold leading-6 ${tone}`}>{value}</p>
      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

export function ProgressBar({ value = 0, color = '#0284c7', label }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-900/[0.06] dark:bg-white/10" role="progressbar" aria-valuenow={Math.round(width)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${width}%`, backgroundColor: color }} />
    </div>
  );
}

export function EmptyHint({ children, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
      <p>{children}</p>
      {action}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }) {
  return <div className="space-y-2">{Array.from({ length: rows }, (_, index) => <div key={index} className="h-10 animate-pulse rounded-xl bg-slate-200/70 dark:bg-white/[0.06]" />)}</div>;
}

const TONES = {
  rose: 'bg-rose-500',
  amber: 'bg-amber-500',
  sky: 'bg-sky-500',
  emerald: 'bg-emerald-500',
  slate: 'bg-slate-400',
};

export function ToneDot({ tone = 'slate' }) {
  return <span className={`h-2 w-2 shrink-0 rounded-full ${TONES[tone] || TONES.slate}`} />;
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-slate-900/[0.05] p-0.5 dark:bg-white/[0.06]">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-[10px] px-2.5 py-1 text-[11px] font-semibold transition ${value === option.value ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
