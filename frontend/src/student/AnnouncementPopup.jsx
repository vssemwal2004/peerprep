import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Megaphone, X } from 'lucide-react';
import { api } from '../utils/api';
import { useOptionalAuth } from '../context/AuthContext';
import { popupAllowedOn, popupQueue, readSeen, writeSeen } from './announcementPopupModel';

const TONE = {
  alert: { label: 'Important', icon: 'bg-rose-500', chip: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200' },
  info: { label: 'Update', icon: 'bg-sky-500', chip: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200' },
  motivation: { label: 'Announcement', icon: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200' },
};

/**
 * Shows the announcements marked "show as popup" once after a student logs in.
 * Several popups are one dialog with Previous / Next; closing it marks all of them as seen.
 */
export default function AnnouncementPopup() {
  const auth = useOptionalAuth();
  const user = auth?.user;
  const { pathname } = useLocation();
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const closeRef = useRef(null);
  const userId = user?.role === 'student' ? String(user._id || user.id || '') : '';
  const allowed = popupAllowedOn(pathname);

  useEffect(() => {
    if (!userId || !allowed) return undefined;
    let cancelled = false;
    api.listStudentAnnouncements()
      .then((data) => {
        if (cancelled) return;
        const next = popupQueue(data?.announcements, readSeen(window.localStorage, userId));
        setQueue(next);
        setIndex(0);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // Only once per student per page area: a fresh login or a full page load checks again.
  }, [userId, allowed]);

  const close = useCallback(() => {
    const seen = readSeen(window.localStorage, userId);
    queue.forEach((item) => seen.add(String(item._id)));
    writeSeen(window.localStorage, userId, seen);
    setQueue([]);
  }, [queue, userId]);

  const open = Boolean(userId && allowed && queue.length);
  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowRight') setIndex((current) => Math.min(queue.length - 1, current + 1));
      if (event.key === 'ArrowLeft') setIndex((current) => Math.max(0, current - 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, open, queue.length]);

  if (!open) return null;
  const item = queue[Math.min(index, queue.length - 1)];
  const tone = TONE[item.type] || TONE.motivation;
  const last = index >= queue.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="announcement-popup-title" aria-describedby="announcement-popup-message"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1c1c1f]">
        <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/[0.06]">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${tone.icon}`} aria-hidden="true"><Megaphone className="h-[18px] w-[18px]" /></span>
          <div className="min-w-0 flex-1">
            <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${tone.chip}`}>{tone.label}</span>
            <h2 id="announcement-popup-title" className="mt-1 text-[16px] font-semibold leading-snug text-slate-900 dark:text-zinc-50">{item.title}</h2>
          </div>
          <button ref={closeRef} type="button" onClick={close} aria-label="Close announcements"
            className="rounded-lg p-1.5 text-slate-400 outline-none hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-sky-500/60 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </header>
        <p id="announcement-popup-message" className="max-h-[50vh] overflow-y-auto whitespace-pre-line px-5 py-4 text-[14px] leading-relaxed text-slate-700 dark:text-zinc-300">{item.message}</p>
        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 dark:border-white/[0.06]">
          <span className="text-[12px] tabular-nums text-slate-400 dark:text-zinc-500">{queue.length > 1 ? `${index + 1} of ${queue.length}` : ''}</span>
          <div className="flex items-center gap-2">
            {queue.length > 1 ? (
              <button type="button" onClick={() => setIndex((current) => Math.max(0, current - 1))} disabled={index === 0}
                className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-[13px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-white/[0.06]">
                <ChevronLeft className="h-4 w-4" />Previous
              </button>
            ) : null}
            <button type="button" onClick={last ? close : () => setIndex((current) => current + 1)}
              className="inline-flex h-9 items-center gap-1 rounded-lg bg-sky-600 px-4 text-[13px] font-semibold text-white hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60">
              {last ? 'Got it' : <>Next<ChevronRight className="h-4 w-4" /></>}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
