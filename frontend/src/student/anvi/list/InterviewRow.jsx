const NOTE_TONE = {
  default: "text-slate-600 dark:text-zinc-400",
  rose: "text-rose-700 dark:text-rose-300",
  amber: "text-amber-800 dark:text-amber-200",
};

const CAPTION_TONE = {
  default: "text-slate-500 dark:text-zinc-400",
  emerald: "font-semibold text-emerald-700 dark:text-emerald-300",
};

/**
 * One interview as a row inside a divided list (see `listSurface`). Every row has the same anatomy:
 *   48 px date tile | line 1 title + status chip (+ score), line 2 "role · company", line 3 when, then
 *   the facts (mode · language · duration · questions) | a fixed 140 px CTA column (+ an optional
 *   countdown caption under it) and a menu slot.
 * `extra` (resume consent, a note, the cancel confirmation) sits under the text, inside the same row.
 * On phones the CTA drops below the text at full width.
 */
export default function InterviewRow({
  tile, title, chip, badge, subtitle, meta, facts, primary, caption, captionTone = "default", menu, extra, extraTone = "default", ...rest
}) {
  const factItems = (facts || []).filter(Boolean);
  const hasActions = Boolean(primary || menu);
  return <li {...rest} className="relative px-4 py-4 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-slate-50/70 dark:hover:bg-white/[0.02] sm:px-5 sm:py-5">
    <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-3.5 sm:grid-cols-[48px_minmax(0,1fr)_176px] sm:gap-x-5">
      <div className="col-start-1 row-start-1 sm:self-center">{tile}</div>
      <div className="col-start-2 row-start-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="min-w-0 text-[15px] font-semibold leading-6 text-slate-900 dark:text-zinc-50">{title}</h3>
          {chip}
          {badge}
        </div>
        {subtitle && <p className="truncate text-[13px] leading-5 text-slate-500 dark:text-zinc-400">{subtitle}</p>}
        {meta && <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] leading-5">
          {meta && <span className="inline-flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 font-medium text-slate-700 dark:text-zinc-200">{meta}</span>}
        </div>}
        {factItems.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Interview details">
          {factItems.map((fact, index) => <span key={`${fact}-${index}`} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300">{fact}</span>)}
        </div>}
      </div>
      <div className={`col-span-2 col-start-1 row-start-3 mt-3 items-start gap-2 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:justify-end sm:self-center ${hasActions ? "flex" : "hidden sm:flex"}`}>
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:w-[140px] sm:flex-none">
          <div className="flex [&>*]:w-full">{primary}</div>
          {caption && <p className={`text-center text-xs leading-4 tabular-nums ${CAPTION_TONE[captionTone] || CAPTION_TONE.default}`}>{caption}</p>}
        </div>
        {menu || <span className="hidden h-9 w-9 shrink-0 sm:block" aria-hidden="true" />}
      </div>
      {extra && <div className={`col-span-2 col-start-1 row-start-2 mt-3 border-t border-slate-100 pt-3 text-[13px] leading-5 dark:border-white/[0.06] sm:col-start-2 ${NOTE_TONE[extraTone] || NOTE_TONE.default}`}>{extra}</div>}
    </div>
  </li>;
}
