import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Layers3 } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function QuickPrepMembership({ quickPreps = [] }) {
  const sheets = Array.isArray(quickPreps) ? quickPreps.filter((sheet) => sheet?.slug && sheet?.title) : [];
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

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

  const chipClass = 'inline-flex max-w-full items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-900/50';

  if (sheets.length === 1) {
    const sheet = sheets[0];
    return (
      <Link to={sheet.href || `/student/quickprep/${sheet.slug}`} className={chipClass} title={`Open ${sheet.title}`}>
        <Layers3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="max-w-48 truncate">{sheet.title}</span>
      </Link>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="quickprep-membership-menu"
        className={chipClass}
      >
        <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
        QuickPrep Sheets ({sheets.length})
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div
          id="quickprep-membership-menu"
          role="menu"
          aria-label="QuickPrep sheets containing this question"
          className="absolute left-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        >
          <p className="px-3 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">This question appears in</p>
          {sheets.map((sheet) => (
            <Link
              key={sheet.id || sheet.slug}
              to={sheet.href || `/student/quickprep/${sheet.slug}`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-sky-50 hover:text-sky-700 focus:bg-sky-50 focus:text-sky-700 focus:outline-none dark:text-zinc-100 dark:hover:bg-sky-950/50 dark:hover:text-sky-200 dark:focus:bg-sky-950/50 dark:focus:text-sky-200"
            >
              <Layers3 className="h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
              <span className="min-w-0 truncate">{sheet.title}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
