import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { pageWindow } from './rosterModel';

const buttonBase = 'inline-flex h-8 items-center justify-center rounded-lg border text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';
const idle = 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700';

/**
 * Page numbers like  Prev 1 2 3 4 5 … 42 Next  plus a "Go to page" box, so an admin can jump
 * straight to any page of a long table.
 */
export default function PageNav({ page, totalPages, onPage }) {
  const [jump, setJump] = useState('');
  useEffect(() => { setJump(''); }, [page, totalPages]);

  const go = (value) => {
    const target = Math.min(totalPages, Math.max(1, Math.trunc(Number(value))));
    if (Number.isFinite(target) && target !== page) onPage(target);
    setJump('');
  };

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-end gap-1.5">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={`${buttonBase} ${idle} gap-1 px-2.5`}>
        <ArrowLeft className="h-3 w-3" />Prev
      </button>
      {pageWindow(page, totalPages).map((entry) => (typeof entry === 'string' ? (
        <span key={entry} aria-hidden="true" className="px-1 text-xs text-slate-400">…</span>
      ) : (
        <button
          key={entry}
          type="button"
          aria-current={entry === page ? 'page' : undefined}
          aria-label={`Page ${entry}`}
          onClick={() => onPage(entry)}
          className={`${buttonBase} min-w-8 px-2 tabular-nums ${entry === page ? 'border-sky-600 bg-sky-600 text-white shadow-sm' : idle}`}
        >
          {entry}
        </button>
      )))}
      <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} className={`${buttonBase} ${idle} gap-1 px-2.5`}>
        Next<ArrowRight className="h-3 w-3" />
      </button>
      {totalPages > 7 && (
        <form
          className="ml-1 flex items-center gap-1.5 border-l border-slate-200 pl-2.5 dark:border-gray-700"
          onSubmit={(event) => { event.preventDefault(); if (jump !== '') go(jump); }}
        >
          <label htmlFor="roster-page-jump" className="text-[11px] text-slate-500 dark:text-gray-400">Go to</label>
          <input
            id="roster-page-jump"
            type="number"
            min={1}
            max={totalPages}
            inputMode="numeric"
            value={jump}
            onChange={(event) => setJump(event.target.value)}
            placeholder={`1–${totalPages}`}
            className="h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-xs tabular-nums text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          />
          <button type="submit" disabled={jump === ''} className={`${buttonBase} ${idle} px-2.5`}>Go</button>
        </form>
      )}
    </nav>
  );
}
