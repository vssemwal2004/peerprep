import { ChevronLeft, ChevronRight } from 'lucide-react';
import { focusRing, PAGE_SIZE_OPTIONS } from './problemsUi';

/** Footer of the question list: the visible range, rows per page and the page links. limit is the size the rows were loaded with. */
export default function PracticePager({ busy = false, page, pages, total, limit, pageSize, shown, solvedOnPage, onPage, onPageSize }) {
  const current = Math.min(Math.max(1, page || 1), Math.max(1, pages || 1));
  const last = Math.max(1, pages || 1);
  const first = total ? ((current - 1) * (limit || pageSize)) + 1 : 0;
  const end = total ? Math.min(total, first + Math.max(0, shown - 1)) : 0;
  const visible = Array.from(new Set([1, current - 1, current, current + 1, last])).filter((value) => value >= 1 && value <= last);
  const pageButton = `flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[12.5px] tabular-nums disabled:opacity-30 ${focusRing}`;
  return <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-[12.5px] text-slate-500 dark:text-zinc-400">
    <p aria-live="polite">
      Showing <strong className="font-semibold tabular-nums text-slate-800 dark:text-zinc-100">{first.toLocaleString()}–{end.toLocaleString()}</strong> of <strong className="font-semibold tabular-nums text-slate-800 dark:text-zinc-100">{Number(total || 0).toLocaleString()}</strong>
      <span className="text-slate-400 dark:text-zinc-500"> · </span>{solvedOnPage} of {shown} solved on this page
    </p>
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2">
        <span>Rows</span>
        <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}
          className={`h-8 rounded-lg border border-[#e4e7ec] bg-white px-2 text-[12.5px] text-slate-700 dark:border-white/10 dark:bg-[#1f1f21] dark:text-zinc-200 ${focusRing}`}>
          {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button type="button" onClick={() => onPage(current - 1)} disabled={busy || current <= 1} className={`${pageButton} hover:bg-[#f3f4f6] dark:hover:bg-white/[0.06]`} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
        {visible.map((value, index) => <span key={value} className="flex items-center gap-1">
          {index > 0 && value - visible[index - 1] > 1 && <span aria-hidden="true">…</span>}
          <button type="button" onClick={() => onPage(value)} disabled={busy || value === current} aria-current={value === current ? 'page' : undefined}
            aria-label={`Page ${value}`}
            className={`${pageButton} ${value === current ? 'bg-slate-900 font-semibold text-white disabled:opacity-100 dark:bg-white dark:text-slate-900' : 'hover:bg-[#f3f4f6] dark:hover:bg-white/[0.06]'}`}>{value}</button>
        </span>)}
        <button type="button" onClick={() => onPage(current + 1)} disabled={busy || current >= last} className={`${pageButton} hover:bg-[#f3f4f6] dark:hover:bg-white/[0.06]`} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
      </nav>
    </div>
  </div>;
}
