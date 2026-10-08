import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { focusRing } from './format';

export function AnimatedMetric({ value, suffix = '', decimals = 0, className = '' }) {
  const [displayValue, setDisplayValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const numericValue = Number(value || 0);
    const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
    const duration = 600;
    // Tween from the last rendered value; depending on displayValue here would restart the tween every frame.
    const startValue = fromRef.current;
    const startedAt = performance.now();
    let frameId = 0;

    const tick = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - ((1 - progress) ** 3);
      const nextValue = startValue + ((safeValue - startValue) * eased);
      fromRef.current = nextValue;
      setDisplayValue(nextValue);
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [value]);

  return (
    <span className={`tabular-nums ${className}`}>
      {Number(displayValue).toFixed(decimals)}
      {suffix}
    </span>
  );
}

/** Standard profile card: white surface, 1px border, compact header. */
export function Card({ title, description, icon, action, children, className = '', bodyClassName = 'px-4 pb-4 pt-2.5', id }) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-zinc-800 dark:bg-[#242424] ${className}`}
    >
      {title ? (
        <header className="flex items-center justify-between gap-3 px-4 pt-3.5">
          <div className="flex min-w-0 items-center gap-2">
            {icon ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sky-600 dark:text-sky-400" aria-hidden="true">
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              <h2 id={headingId} className="truncate text-[15px] font-semibold tracking-tight text-slate-900 dark:text-zinc-100">{title}</h2>
              {description ? <p className="truncate text-xs text-slate-500 dark:text-zinc-400">{description}</p> : null}
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={title ? bodyClassName : 'p-4'}>{children}</div>
    </section>
  );
}

export function CardLink({ to, children }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-1 rounded-md text-xs font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 ${focusRing}`}
    >
      {children}
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

/** One-line empty state with an optional call to action. */
export function EmptyRow({ icon, message, ctaLabel, ctaTo }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/40">
      <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
        {icon ? <span className="shrink-0 text-slate-400 dark:text-zinc-500" aria-hidden="true">{icon}</span> : null}
        <span>{message}</span>
      </div>
      {ctaLabel && ctaTo ? <CardLink to={ctaTo}>{ctaLabel}</CardLink> : null}
    </div>
  );
}

export function ProgressBar({ value = 0, max = 100, colorClass = 'bg-sky-500', label, className = 'h-1.5' }) {
  const safeMax = Math.max(Number(max) || 0, 1);
  const percent = Math.max(0, Math.min(100, ((Number(value) || 0) / safeMax) * 100));
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800 ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax)}
      aria-valuenow={Math.round(Number(value) || 0)}
    >
      <div className={`h-full rounded-full ${colorClass} transition-[width] duration-500`} style={{ width: `${percent}%` }} />
    </div>
  );
}

/**
 * Radial progress gauge (single value). The arc is decorative; the accessible value is exposed
 * through role="img" + aria-label, and the visible center text carries the number.
 */
export function RingGauge({ value = 0, max = 100, size = 64, stroke = 6, color = '#0ea5e9', label, children }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeMax = Math.max(Number(max) || 0, 1);
  const ratio = Math.max(0, Math.min(1, (Number(value) || 0) / safeMax));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-slate-100 dark:stroke-zinc-800" />
        {ratio > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference * ratio} ${circumference}`}
            className="transition-[stroke-dasharray] duration-700 ease-out"
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function Pill({ className = '', children, title }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${className}`}>
      {children}
    </span>
  );
}

/** Small labelled number used inside cards (no card chrome of its own). */
export function MiniStat({ label, value, helper, accent = 'text-slate-900 dark:text-zinc-100' }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-zinc-900/60">
      <p className="truncate text-[11px] font-medium text-slate-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold leading-tight tabular-nums ${accent}`}>{value}</p>
      {helper ? <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-zinc-500" title={typeof helper === 'string' ? helper : undefined}>{helper}</p> : null}
    </div>
  );
}
