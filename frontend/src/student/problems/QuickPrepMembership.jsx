import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Layers3 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const progressLabel = (sheet) => {
  const total = Number(sheet.total) || 0;
  if (sheet.completed) return 'Completed';
  if (sheet.started) return `${Number(sheet.solved) || 0}/${total} solved`;
  return total ? `Not started · ${total} question${total === 1 ? '' : 's'}` : 'Not started';
};

/** "In N QuickPrep sheets": which sheets hold this question, the student's progress in each, and a way to solve it inside one. */
export default function QuickPrepMembership({ quickPreps = [] }) {
  const sheets = Array.isArray(quickPreps) ? quickPreps.filter((sheet) => sheet?.slug && sheet?.title) : [];
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const panelId = useId();
  const currentSheet = new URLSearchParams(location.search).get('quest') || '';

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  if (!sheets.length) return null;
  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        title="QuickPrep sheets containing this question"
        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-900/50"
      >
        <Layers3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        In {sheets.length} QuickPrep sheet{sheets.length === 1 ? '' : 's'}
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="QuickPrep sheets containing this question"
          className="absolute left-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        >
          <p className="px-3 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">This question appears in</p>
          <ul className="max-h-80 space-y-0.5 overflow-y-auto">
            {sheets.map((sheet) => {
              const total = Number(sheet.total) || 0;
              const percent = sheet.completed ? 100 : total ? Math.min(100, Math.round(((Number(sheet.solved) || 0) / total) * 100)) : 0;
              const current = sheet.slug === currentSheet;
              return (
                <li key={sheet.id || sheet.slug} className="rounded-lg px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-white/[0.04]">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      to={sheet.href || `/student/quickprep/${sheet.slug}`}
                      onClick={close}
                      className="min-w-0 truncate rounded text-sm font-semibold text-zinc-900 hover:text-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-zinc-100 dark:hover:text-sky-300"
                    >
                      {sheet.title}
                    </Link>
                    {current ? <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10.5px] font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">Current sheet</span> : null}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.07]" aria-hidden="true">
                      <span className={`block h-full rounded-full ${sheet.completed ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${percent}%` }} />
                    </span>
                    <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums ${sheet.completed ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-zinc-400'}`}>
                      {sheet.completed ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" /> : null}
                      {progressLabel(sheet)}
                    </span>
                  </div>
                  {current ? null : (
                    <Link
                      to={`${location.pathname}?quest=${encodeURIComponent(sheet.slug)}`}
                      onClick={close}
                      aria-label={`Solve this question in ${sheet.title}`}
                      className="mt-1.5 inline-flex items-center gap-1 rounded text-xs font-medium text-sky-700 hover:text-sky-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-300 dark:hover:text-sky-200"
                    >
                      Solve in this sheet<ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
