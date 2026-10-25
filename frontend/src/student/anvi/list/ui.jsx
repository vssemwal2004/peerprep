// Shared pieces of the student AI Interviews page: status chips, the date tile, section headers,
// banners and empty states (class strings live in ./styles).
import { istDateParts } from "./listModel";
import { cardSurface } from "./styles";

const TONE = {
  violet: "bg-violet-50 text-violet-700 ring-violet-200/80 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-400/25",
  amber: "bg-amber-50 text-amber-800 ring-amber-200/80 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/25",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25",
  sky: "bg-sky-50 text-sky-700 ring-sky-200/80 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/25",
  rose: "bg-rose-50 text-rose-700 ring-rose-200/80 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/25",
  slate: "bg-slate-100 text-slate-600 ring-slate-200/80 dark:bg-white/[0.06] dark:text-zinc-300 dark:ring-white/10",
};
const DOT = { violet: "bg-violet-500", amber: "bg-amber-500", emerald: "bg-emerald-500", sky: "bg-sky-500", rose: "bg-rose-500", slate: "bg-slate-400 dark:bg-zinc-500" };

/** A small status pill with a coloured dot; `pulse` animates the dot for live states. */
export function StatusChip({ tone = "slate", pulse = false, children }) {
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5 ring-1 ring-inset ${TONE[tone] || TONE.slate}`}>
    <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
      {pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${DOT[tone]}`} />}
      <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${DOT[tone] || DOT.slate}`} />
    </span>
    {children}
  </span>;
}

/** A score pill: "82 · Strong". */
export function ScoreBadge({ score }) {
  if (!score) return null;
  return <span className={`inline-flex items-baseline gap-1 rounded-lg px-2 py-1 text-xs font-semibold ring-1 ring-inset ${TONE[score.tone] || TONE.slate}`} aria-label={`Score ${score.score} out of 100, ${score.band}`}>
    <span className="text-sm font-bold tabular-nums">{score.score}</span><span className="opacity-60">/100</span><span className="ml-1">{score.band}</span>
  </span>;
}

const TILE = {
  violet: "border-violet-200/80 bg-violet-50/70 text-violet-700 dark:border-violet-400/20 dark:bg-violet-500/10 dark:text-violet-200",
  amber: "border-amber-200/80 bg-amber-50/80 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200",
  emerald: "border-emerald-200/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  rose: "border-rose-200/80 bg-rose-50/70 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300",
  slate: "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300",
};

/**
 * The left tile of every row: a 48 px calendar leaf (month + day in IST). `pulse` adds a live dot.
 * Without a usable date it shows a dash, never a generic icon, so every row keeps the same anatomy.
 * Decorative; the row states the full date in words.
 */
export function DateTile({ value, tone = "slate", pulse = false }) {
  const parts = value ? istDateParts(value) : null;
  return <span className={`relative flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border ${TILE[tone] || TILE.slate}`} aria-hidden="true">
    {pulse && <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#242424]" /></span>}
    {parts ? <>
      <span className="text-[10px] font-bold uppercase leading-none tracking-[0.12em] opacity-80">{parts.month}</span>
      <span className="mt-1 text-lg font-bold leading-none tabular-nums text-slate-900 dark:text-white">{parts.day}</span>
    </> : <span className="text-lg font-semibold leading-none opacity-60">–</span>}
  </span>;
}

/** A neutral, non-interactive status in the action column (e.g. "Opens in 1 d 2 h"). */
export function ActionNote({ icon: Icon, title, children }) {
  return <span title={title} className="inline-flex h-9 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] font-medium tabular-nums text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
    {Icon && <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />}{children}
  </span>;
}

/** An icon + text fact in a row's meta line. */
export function Meta({ icon: Icon, tone, children }) {
  const color = tone === "emerald" ? "text-emerald-700 dark:text-emerald-300 font-semibold" : tone === "amber" ? "text-amber-700 dark:text-amber-300 font-medium" : "";
  return <span className={`inline-flex min-w-0 items-center gap-1.5 ${color}`}>
    {Icon && <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />}
    <span className="min-w-0">{children}</span>
  </span>;
}

/** A section heading inside a tab, with a count and an optional one-line note. */
export function SectionHeader({ id, title, count, note, action }) {
  return <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
    <div className="min-w-0">
      <h2 id={id} className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-slate-900 dark:text-zinc-50">
        {title}
        {Number.isFinite(count) && count > 0 && <span className="rounded-md bg-slate-200/70 px-1.5 text-xs font-semibold tabular-nums text-slate-600 dark:bg-white/10 dark:text-zinc-300">{count}</span>}
      </h2>
      {note && <p className="mt-0.5 text-[13px] text-slate-500 dark:text-zinc-400">{note}</p>}
    </div>
    {action}
  </div>;
}

const BANNER = {
  rose: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200",
};
export function Banner({ tone = "rose", role, icon: Icon, children, action, onDismiss }) {
  return <div role={role} className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${BANNER[tone] || BANNER.rose}`}>
    {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
    <p className="min-w-0 flex-1">{children}</p>
    {action}
    {onDismiss && <button type="button" onClick={onDismiss} className="-my-1 rounded-md px-1.5 py-1 text-xs font-semibold opacity-70 hover:opacity-100">Dismiss</button>}
  </div>;
}

/** A tab's empty state: a quiet illustration, one sentence of guidance and an optional next step. */
export function EmptyState({ icon: Icon, title, body, action }) {
  return <div className={`${cardSurface} flex flex-col items-center px-6 py-14 text-center sm:py-16`}>
    <div className="relative mb-5 h-20 w-28" aria-hidden="true">
      <span className="absolute left-0 top-3 h-14 w-20 -rotate-6 rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]" />
      <span className="absolute right-0 top-1 h-14 w-20 rotate-6 rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]" />
      <span className="absolute left-1/2 top-0 flex h-16 w-20 -translate-x-1/2 flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm dark:border-white/10 dark:bg-[#2c2c2c]">
        <span className="flex items-center gap-1.5"><span className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">{Icon && <Icon className="h-3 w-3" />}</span><span className="h-1.5 w-8 rounded-full bg-slate-200 dark:bg-white/15" /></span>
        <span className="h-1.5 w-12 rounded-full bg-slate-100 dark:bg-white/10" />
        <span className="h-1.5 w-9 rounded-full bg-slate-100 dark:bg-white/10" />
      </span>
    </div>
    <p className="text-base font-semibold text-slate-900 dark:text-zinc-50">{title}</p>
    <p className="mt-1.5 max-w-sm text-sm leading-6 text-slate-500 dark:text-zinc-400">{body}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>;
}

/** Placeholder rows while a list loads. */
export function RowSkeleton({ rows = 2 }) {
  return <div className={`${cardSurface} divide-y divide-slate-100 dark:divide-white/[0.06]`} aria-busy="true" aria-label="Loading interviews">
    {Array.from({ length: rows }, (_, index) => <div key={index} className="flex animate-pulse items-center gap-4 px-4 py-4 sm:px-5" aria-hidden="true">
      <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-white/[0.06]" />
      <div className="flex-1 space-y-2.5"><div className="h-4 w-1/3 rounded bg-slate-200 dark:bg-white/10" /><div className="h-3 w-1/2 rounded bg-slate-100 dark:bg-white/[0.06]" /></div>
      <div className="hidden h-9 w-28 rounded-lg bg-slate-100 dark:bg-white/[0.06] sm:block" />
    </div>)}
  </div>;
}
