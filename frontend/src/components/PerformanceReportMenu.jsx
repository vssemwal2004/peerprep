import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2, Table2 } from 'lucide-react';
import { api } from '../utils/api';

const FORMATS = [
  ['pdf', 'PDF', FileText],
  ['xlsx', 'Excel', FileSpreadsheet],
  ['csv', 'CSV', Table2],
];
const MENU_WIDTH = 192;

/**
 * "Performance report" download menu (PDF / Excel / CSV) for an assessment or a Quick Prep sheet.
 * The server builds the file: totals, status and marks-band charts, averages and the student table.
 * The menu is portalled, so it also works inside overflow-hidden headers.
 */
export default function PerformanceReportMenu({ kind, id, className = '', compact = false }) {
  const [position, setPosition] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const button = useRef(null);
  const menu = useRef(null);
  const open = Boolean(position);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!button.current?.contains(event.target) && !menu.current?.contains(event.target)) setPosition(null); };
    const onKey = (event) => { if (event.key === 'Escape') { setPosition(null); button.current?.focus(); } };
    const dismiss = () => setPosition(null);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open]);

  const toggle = () => {
    setError('');
    if (open) { setPosition(null); return; }
    const rect = button.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)) });
  };

  const download = async (format) => {
    setBusy(format);
    setError('');
    try {
      await api.downloadPerformanceReport(kind, id, format);
      setPosition(null);
    } catch (cause) {
      setError(cause.message || 'The report could not be downloaded.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button ref={button} type="button" aria-haspopup="menu" aria-expanded={open} disabled={!id} onClick={toggle}
        title="Download performance report (PDF, Excel, CSV)"
        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
        <span className={compact ? 'sr-only sm:not-sr-only' : ''}>Performance report</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && createPortal(
        <div ref={menu} role="menu" aria-label="Performance report format" style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
          className="fixed z-[1000] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          {FORMATS.map(([format, label, Icon]) => (
            <button key={format} type="button" role="menuitem" disabled={Boolean(busy)} onClick={() => download(format)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px] font-medium text-slate-700 hover:bg-sky-50 hover:text-sky-700 focus:outline-none focus-visible:bg-sky-50 disabled:opacity-60 dark:text-zinc-200 dark:hover:bg-sky-500/10 dark:hover:text-sky-300">
              {busy === format ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />}
              {label}
            </button>
          ))}
          {error && <p role="alert" className="border-t border-slate-100 px-3 py-2 text-[11.5px] text-red-600 dark:border-zinc-800 dark:text-red-400">{error}</p>}
        </div>,
        document.body,
      )}
    </div>
  );
}
