import { useLayoutEffect, useRef } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import EChart from "../../../admin/prepAnalysis/charts/EChart";
import { changeText, changeTone } from "../insightModel";

export const focusRing = "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#1a1a1a]";
export const cardClass = "min-w-0 rounded-2xl border border-[#e9eaee] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/[0.07] dark:bg-[#232325] dark:shadow-none";

export function Card({ as: Tag = "div", className = "", children, ...props }) {
  return <Tag className={`${cardClass} ${className}`} {...props}>{children}</Tag>;
}

/** A page section: anchor id, icon tile, title, one-line subtitle and optional actions. */
export function Section({ id, icon: Icon, title, subtitle, actions, "data-guide": guide, info, children }) {
  return (
    <section id={`analysis-${id}`} aria-labelledby={`analysis-${id}-title`} data-section={id} data-guide={guide} className="scroll-mt-36 space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/10 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/15" aria-hidden="true"><Icon className="h-[18px] w-[18px]" /></span>}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5"><h2 id={`analysis-${id}-title`} className="text-[17px] font-semibold tracking-[-0.01em] text-slate-950 dark:text-zinc-50">{title}</h2>{info}</div>
            {subtitle && <p className="truncate text-[12.5px] text-slate-500 dark:text-zinc-400">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function CardTitle({ title, hint, right }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-zinc-100">{title}</h3>
        {hint && <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-zinc-400">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

/** "+3 vs last 30 days" with an arrow; nothing when there is no comparison. */
export function Delta({ kpi, label, invert = false, className = "" }) {
  const text = changeText(kpi);
  if (!text) return null;
  const tone = changeTone(kpi.change);
  const good = invert ? tone === "down" : tone === "up";
  const bad = invert ? tone === "up" : tone === "down";
  const Icon = tone === "up" ? ArrowUpRight : tone === "down" ? ArrowDownRight : Minus;
  const color = good ? "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10" : bad ? "text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-500/10" : "text-slate-600 bg-slate-100 dark:text-zinc-300 dark:bg-white/[0.06]";
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${color} ${className}`} title={label}>
      <Icon className="h-3 w-3" aria-hidden="true" />{text}
      {label && <span className="sr-only"> {label}</span>}
    </span>
  );
}

export function ProgressBar({ value, max = 100, color = "#0284c7", track = "bg-slate-100 dark:bg-white/[0.06]", height = "h-1.5", label }) {
  const percent = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`w-full overflow-hidden rounded-full ${track} ${height}`} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${percent}%`, backgroundColor: color }} />
    </div>
  );
}

export function Pill({ className = "", children }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${className}`}>{children}</span>;
}

export function Empty({ icon: Icon, title, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      {Icon && <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-white/[0.05] dark:text-zinc-500" aria-hidden="true"><Icon className="h-5 w-5" /></span>}
      <p className="text-[13px] text-slate-500 dark:text-zinc-400">{title}</p>
      {action}
    </div>
  );
}

/** A labelled figure for small stat rows. */
export function Figure({ label, value, sub, children }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11.5px] font-medium text-slate-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-2 text-[20px] font-semibold leading-tight tracking-[-0.02em] text-slate-950 tabular-nums dark:text-zinc-50">{value}{children}</p>
      {sub && <p className="mt-0.5 truncate text-[11.5px] text-slate-500 dark:text-zinc-400">{sub}</p>}
    </div>
  );
}

export function Chart({ option, height = 240, label, onClick }) {
  return <EChart buildOption={option} height={height} ariaLabel={label} onClick={onClick} />;
}

/**
 * A chart wider than its card (a 12-month calendar), scrolled sideways inside the card. Opens
 * scrolled to the right end so the latest months show first: scrollbars are hidden app-wide, so on
 * a phone, tablet or small laptop window the recent days were otherwise off-screen with no hint.
 */
export function LatestFirstScroll({ minWidth = "min-w-[720px]", children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth;
  }, []);
  return (
    <div ref={ref} className="-mx-1 overflow-x-auto px-1">
      <div className={minWidth}>{children}</div>
    </div>
  );
}

/** A segmented control (period, views). */
export function Segmented({ options, value, onChange, label, size = "md" }) {
  const pad = size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[12.5px]";
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-xl border border-[#e4e7ec] bg-[#f6f7f9] p-0.5 dark:border-white/10 dark:bg-white/[0.03]">
      {options.map((option) => {
        const active = option.id === value;
        const Icon = option.icon;
        return (
          <button key={option.id} type="button" role="radio" aria-checked={active} onClick={() => onChange(option.id)} title={option.title || option.label}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-[10px] font-semibold transition ${pad} ${focusRing} ${active ? "bg-white text-sky-700 shadow-sm ring-1 ring-black/[0.04] dark:bg-[#2c2c2f] dark:text-sky-300 dark:ring-white/10" : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100"}`}>
            {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}{option.short || option.label}
          </button>
        );
      })}
    </div>
  );
}

export const buttonClass = `inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#e4e7ec] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 transition hover:bg-[#f6f7f9] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-transparent dark:text-zinc-200 dark:hover:bg-white/[0.05] ${focusRing}`;
export const primaryButtonClass = `inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60 ${focusRing}`;
