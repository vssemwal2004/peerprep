import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import AnnouncementView, { panelWidth } from './AnnouncementView';

/**
 * A dialog showing one or more announcements in their own designs, with Previous / Next.
 * Used by the student login popup, the dashboard reader and the admin "Preview as student".
 * `onClose` runs on ×, Esc, a click outside, or "Got it" on the last one.
 */
export default function AnnouncementDialog({ items = [], startIndex = 0, onClose, zIndex = 'z-[130]', doneLabel = 'Got it', preview = false }) {
  const [index, setIndex] = useState(startIndex);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const count = items.length;

  useEffect(() => { setIndex(Math.min(startIndex, Math.max(0, count - 1))); }, [startIndex, count]);
  useEffect(() => {
    if (!count) return undefined;
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') onCloseRef.current?.();
      if (event.key === 'ArrowRight') setIndex((current) => Math.min(count - 1, current + 1));
      if (event.key === 'ArrowLeft') setIndex((current) => Math.max(0, current - 1));
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (opener && document.contains(opener)) opener.focus?.();
    };
  }, [count]);

  if (!count) return null;
  const item = items[Math.min(index, count - 1)];
  const last = index >= count - 1;
  const footer = (
    <>
      <span className="text-[12px] tabular-nums opacity-70">{count > 1 ? `${index + 1} of ${count}` : ''}</span>
      <div className="flex items-center gap-2">
        {count > 1 ? (
          <button type="button" onClick={() => setIndex((current) => Math.max(0, current - 1))} disabled={index === 0}
            className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-[13px] font-medium hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/[0.06]">
            <ChevronLeft className="h-4 w-4" />Previous
          </button>
        ) : null}
        <button type="button" onClick={last ? onClose : () => setIndex((current) => current + 1)}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-slate-900 px-4 text-[13px] font-semibold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 dark:bg-white dark:text-slate-900 dark:hover:bg-zinc-200">
          {last ? doneLabel : <>Next<ChevronRight className="h-4 w-4" /></>}
        </button>
      </div>
    </>
  );

  return createPortal(
    <div className={`fixed inset-0 ${zIndex} flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-[2px]`}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="announcement-dialog-title" aria-describedby="announcement-dialog-body"
        className={`my-auto w-full ${panelWidth(item)} text-slate-700 dark:text-zinc-200`}>
        <AnnouncementView key={item._id || index} announcement={item} onClose={onClose} closeRef={closeRef} footer={footer} onAction={onClose} preview={preview}
          titleId="announcement-dialog-title" bodyId="announcement-dialog-body" />
      </div>
    </div>,
    document.body,
  );
}
