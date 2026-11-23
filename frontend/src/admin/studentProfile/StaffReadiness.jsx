import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crosshair, X } from 'lucide-react';
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
        <header className="relative flex items-center gap-3 overflow-hidden bg-gradient-to-r from-sky-700 via-sky-800 to-slate-900 px-4 py-3.5 text-white sm:px-5">
          <span className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-sky-300/20 blur-2xl" aria-hidden="true" />
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/25"><Crosshair className="h-5 w-5" aria-hidden="true" /></span>
          <div className="relative min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-sky-100">
              Prep Readiness<span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] normal-case tracking-normal ring-1 ring-inset ring-white/25">Read only</span>
            </p>
            <h2 id="staff-readiness-title" className="truncate text-[16px] font-semibold">{studentName || 'Student'}</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="relative rounded-lg p-1.5 text-sky-100 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"><X className="h-4 w-4" /></button>
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
  // No Prep Coding for this student (licence or their own access): no readiness targets at all.
  if (summary.data?.available === false) return null;
  return (
    <>
      {/* The card renders data-guide="sp-readiness" (admin and coordinator profile tours). */}
      <ReadinessSummaryCard summary={summary.data} loading={summary.loading} error={summary.error} onRetry={summary.reload}
        onView={() => setOpen(true)} viewTo={null} readOnly guide="sp-readiness" />
      <StaffReadinessDialog studentId={studentId} studentName={studentName} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
