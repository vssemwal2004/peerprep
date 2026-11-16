import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { PAGE_SIZE_OPTIONS, pageCount, pageRange, pageWindow } from './tableModel';

const BUTTON = 'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[12.5px] tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-500/60 disabled:cursor-not-allowed disabled:opacity-35';
const IDLE = 'text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/[0.07]';

/**
 * The one footer used under every PeerPrep data table:
 *   left  — "Showing 1–25 of 1,240"
 *   right — Rows per page · First · Prev · 1 … 4 5 6 … 50 · Next · Last
 * Works for client-paged (useClientTable().pager) and server-paged tables alike.
 */
export default function TablePager({
  page = 1, pageSize = 25, total = 0, onPage, onPageSize,
  pageSizeOptions = PAGE_SIZE_OPTIONS, busy = false, noun = 'rows', className = '', hideWhenEmpty = false,
}) {
  const pages = pageCount(total, pageSize);
  const current = Math.min(Math.max(1, page), pages);
  const { first, last } = pageRange(current, pageSize, total);
  if (hideWhenEmpty && !total) return null;
  const sizes = pageSizeOptions.includes(pageSize) ? pageSizeOptions : [...pageSizeOptions, pageSize].sort((a, b) => a - b);
  const go = (value) => { if (onPage && value >= 1 && value <= pages && value !== current) onPage(value); };

  return (
    <div className={`flex flex-col gap-2 border-t border-slate-200 px-3 py-2.5 text-[12.5px] text-slate-500 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:text-zinc-400 ${className}`} data-table-pager="">
      <p aria-live="polite" className="tabular-nums">
        {total ? <>Showing <strong className="font-semibold text-slate-800 dark:text-zinc-100">{first.toLocaleString()}–{last.toLocaleString()}</strong> of <strong className="font-semibold text-slate-800 dark:text-zinc-100">{Number(total).toLocaleString()}</strong> {noun}</> : `No ${noun}`}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {onPageSize ? (
          <label className="flex items-center gap-1.5">
            <span>Rows per page</span>
            <select
              value={pageSize}
              disabled={busy}
              onChange={(event) => onPageSize(Number(event.target.value))}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12.5px] text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              {sizes.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        ) : null}
        <nav className="flex items-center gap-0.5" aria-label="Pagination">
          <button type="button" className={`${BUTTON} ${IDLE}`} onClick={() => go(1)} disabled={busy || current <= 1} aria-label="First page" title="First page"><ChevronsLeft className="h-4 w-4" /></button>
          <button type="button" className={`${BUTTON} ${IDLE}`} onClick={() => go(current - 1)} disabled={busy || current <= 1} aria-label="Previous page" title="Previous page"><ChevronLeft className="h-4 w-4" /></button>
          {pageWindow(current, pages).map((value, index) => (value === null
            ? <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-slate-400">…</span>
            : (
              <button
                key={value}
                type="button"
                onClick={() => go(value)}
                disabled={busy}
                aria-label={`Page ${value}`}
                aria-current={value === current ? 'page' : undefined}
                className={`${BUTTON} ${value === current ? 'bg-sky-600 font-semibold text-white hover:bg-sky-600 disabled:opacity-100 dark:bg-sky-500 dark:text-white' : IDLE}`}
              >{value}</button>
            )))}
          <button type="button" className={`${BUTTON} ${IDLE}`} onClick={() => go(current + 1)} disabled={busy || current >= pages} aria-label="Next page" title="Next page"><ChevronRight className="h-4 w-4" /></button>
          <button type="button" className={`${BUTTON} ${IDLE}`} onClick={() => go(pages)} disabled={busy || current >= pages} aria-label="Last page" title="Last page"><ChevronsRight className="h-4 w-4" /></button>
        </nav>
      </div>
    </div>
  );
}
