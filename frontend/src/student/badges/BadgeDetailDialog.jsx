import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CalendarCheck2, ChevronLeft, ChevronRight, Lock, X } from 'lucide-react';
import BadgeMedal from './BadgeMedal';
import { FAMILY_LABELS, TIER_METALS } from './badgeModel';

const shortDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
};

/**
 * One badge, large: the medal in 3D, what it is for, when it was earned (or progress to it).
 * Arrows / ← → move through `list`. onAll opens the full gallery.
 */
export default function BadgeDetailDialog({ list = [], index = -1, onIndex, onClose, onAll }) {
  const reduce = useReducedMotion();
  const badge = index >= 0 ? list[index] : null;
  const closeRef = useRef(null);
  const state = useRef({ onClose, onIndex, index, count: list.length });
  state.current = { onClose, onIndex, index, count: list.length };
  const open = Boolean(badge);

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event) => {
      const { onClose: close, onIndex: move, index: at, count } = state.current;
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowRight' && count > 1) move((at + 1) % count);
      if (event.key === 'ArrowLeft' && count > 1) move((at - 1 + count) % count);
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); if (opener && document.contains(opener)) opener.focus?.(); };
  }, [open]);

  const metal = TIER_METALS[badge?.tier] || TIER_METALS.Bronze;
  const earnedText = badge?.earnedLabel || shortDate(badge?.earnedAt);
  const step = (delta) => onIndex((index + delta + list.length) % list.length);

  const content = (
    <AnimatePresence>
      {open ? (
        <motion.div key="badge-detail" role="presentation" className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="badge-detail-title"
            className="relative w-full max-w-[360px] overflow-hidden rounded-3xl border border-slate-200 bg-white text-center shadow-[0_30px_80px_-24px_rgba(0,0,0,0.6)] dark:border-white/10 dark:bg-[#1f1f22]"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 16 }} animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close"
              className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-white/10 dark:hover:text-white">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="relative flex h-[200px] items-center justify-center"
              style={{ background: badge.earned ? `radial-gradient(circle at 50% 58%, ${badge.look.from}40 0%, transparent 60%)` : 'radial-gradient(circle at 50% 58%, rgba(148,163,184,0.18) 0%, transparent 60%)' }}>
              {list.length > 1 ? (
                <>
                  <button type="button" onClick={() => step(-1)} aria-label="Previous badge" className="absolute left-3 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-white/10 dark:hover:text-white"><ChevronLeft className="h-5 w-5" /></button>
                  <button type="button" onClick={() => step(1)} aria-label="Next badge" className="absolute right-3 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-white/10 dark:hover:text-white"><ChevronRight className="h-5 w-5" /></button>
                </>
              ) : null}
              <AnimatePresence mode="wait">
                <motion.div key={badge.uid} style={{ transformPerspective: 800 }}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, rotateY: 180, scale: 0.6 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, rotateY: 0, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, rotateY: -90, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 120, damping: 15 }}>
                  <motion.div animate={reduce || !badge.earned ? undefined : { y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
                    <BadgeMedal badge={badge} size={118} interactive shine={badge.earned} />
                  </motion.div>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="px-6 pb-6">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500">{FAMILY_LABELS[badge.family] || 'Badge'}</p>
              <h2 id="badge-detail-title" className="mt-1 text-[19px] font-bold tracking-tight text-slate-900 dark:text-white">{badge.title}</h2>
              {badge.description ? <p className="mt-1 text-[13px] text-slate-500 dark:text-zinc-400">{badge.description}</p> : null}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[11.5px] font-bold">
                <span className="rounded-full px-2.5 py-1 text-white" style={{ background: badge.earned ? `linear-gradient(135deg, ${metal[0]}, ${metal[1]})` : '#94a3b8', textShadow: '0 1px 1px rgba(0,0,0,0.3)' }}>{badge.tier}</span>
                {badge.earned
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20"><CalendarCheck2 className="h-3.5 w-3.5" aria-hidden="true" />{earnedText ? `Earned ${badge.earnedLabel ? 'in' : 'on'} ${earnedText}` : 'Earned'}</span>
                  : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:ring-white/10"><Lock className="h-3.5 w-3.5" aria-hidden="true" />Locked</span>}
              </div>
              {!badge.earned ? (
                <div className="mt-4 text-left">
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span className="text-slate-500 dark:text-zinc-400">{badge.hint}</span>
                    <span className="font-semibold tabular-nums text-slate-700 dark:text-zinc-200">{badge.valueText}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.07]" role="progressbar" aria-label={`${badge.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(badge.progress)}>
                    <div className="h-full rounded-full" style={{ width: `${badge.progress}%`, background: `linear-gradient(90deg, ${badge.look.from}, ${badge.look.to})` }} />
                  </div>
                </div>
              ) : null}
              {list.length > 1 ? <p className="mt-4 text-[11px] tabular-nums text-slate-400 dark:text-zinc-500">{index + 1} of {list.length}</p> : null}
              {onAll ? (
                <button type="button" onClick={onAll}
                  className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus-visible:ring-offset-[#1f1f22]">
                  View all badges
                </button>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
