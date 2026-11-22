import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { api } from '../../utils/api';
import ReadinessSummaryCard from '../../student/readiness/ReadinessSummaryCard';
import ReadinessView from '../../student/readiness/ReadinessView';
import { useReadiness } from '../../student/readiness/useReadiness';

/** The full read-only readiness view for staff (same versioned data the student sees). */
function StaffReadinessDialog({ studentId, studentName, open, onClose }) {
  const [range, setRange] = useState('30d');
  const fetcher = useCallback(() => api.getStudentPrepReadinessByAdmin(studentId, { range }), [studentId, range]);
  const state = useReadiness(fetcher, [studentId, range], { enabled: open });
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; if (opener && document.contains(opener)) opener.focus?.(); };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-stretch justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:p-4" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="staff-readiness-title" className="flex w-full max-w-6xl flex-col overflow-hidden bg-[#f6f7f9] shadow-2xl dark:bg-[#1a1a1a] sm:rounded-2xl">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#232325]">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-300">Prep Readiness · read only</p>
            <h2 id="staff-readiness-title" className="truncate text-[15px] font-semibold text-slate-900 dark:text-white">{studentName || 'Student'}</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <ReadinessView {...state} range={range} onRange={setRange} mode="staff" />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Staff (admin / coordinator with profile access) view of a student's Prep Readiness: the compact
 * card beside the Prep Score, opening the full breakdown. Access is checked on the server
 * (assignment scope, licence, university).
 */
export default function StaffReadiness({ studentId, studentName }) {
  const [open, setOpen] = useState(false);
  const fetcher = useCallback(() => api.getStudentPrepReadinessByAdmin(studentId, { view: 'summary' }), [studentId]);
  const summary = useReadiness(fetcher, [studentId], { enabled: Boolean(studentId) });
  if (summary.error?.response?.status === 404 || summary.error?.response?.status === 403) return null;
  return (
    <>
      {/* The card renders data-guide="sp-readiness" (admin and coordinator profile tours). */}
      <ReadinessSummaryCard summary={summary.data} loading={summary.loading} error={summary.error} onRetry={summary.reload}
        onView={() => setOpen(true)} viewTo={null} readOnly guide="sp-readiness" />
      <StaffReadinessDialog studentId={studentId} studentName={studentName} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
