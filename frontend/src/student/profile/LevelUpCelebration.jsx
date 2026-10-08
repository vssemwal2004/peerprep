import { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PartyPopper, X } from 'lucide-react';
import LevelMedallion from './LevelMedallion';
import { focusRing } from './format';

const MotionDiv = motion.div;
const MotionSpan = motion.span;

const CONFETTI_COLORS = ['#0ea5e9', '#22d3ee', '#6366f1', '#f59e0b', '#10b981', '#f43f5e', '#a855f7'];

/** Deterministic confetti burst ("firecrackers") from two points; no Math.random so renders are stable. */
function useConfetti(count = 56) {
  return useMemo(() => Array.from({ length: count }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const spread = ((index * 37) % 100) / 100; // 0..1 pseudo-random
    const angle = (-90 + side * (20 + spread * 60)) * (Math.PI / 180);
    const distance = 160 + ((index * 53) % 140);
    return {
      id: index,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      originX: side * 120,
      x: Math.cos(angle) * distance * side * -1,
      y: Math.sin(angle) * distance,
      rotate: ((index * 71) % 360) * side,
      delay: (index % 8) * 0.03,
      shape: index % 3 === 0 ? 'rounded-full' : 'rounded-[2px]',
      size: 6 + (index % 3) * 2,
    };
  }), [count]);
}

/**
 * Celebration popup for a new learner level and/or newly earned awards.
 * @param {{ open: boolean, level?: {level:number,title:string,helper:string}|null, awards: Array, onClose: () => void }} props
 */
export default function LevelUpCelebration({ open, level, awards = [], onClose }) {
  const reduceMotion = useReducedMotion();
  const confetti = useConfetti();
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeButtonRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  const heading = level
    ? `You reached Level ${level.level}!`
    : awards.length === 1 ? 'New award unlocked!' : `${awards.length} new awards unlocked!`;

  return (
    <AnimatePresence>
      {open ? (
        <MotionDiv
          key="level-up"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
          role="presentation"
        >
          {/* Confetti bursts */}
          {!reduceMotion ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden" aria-hidden="true">
              {confetti.map((piece) => (
                <MotionSpan
                  key={piece.id}
                  className={`absolute ${piece.shape}`}
                  style={{ width: piece.size, height: piece.size * (piece.shape === 'rounded-full' ? 1 : 0.5), backgroundColor: piece.color }}
                  initial={{ x: piece.originX, y: 40, opacity: 0, rotate: 0, scale: 0.6 }}
                  animate={{ x: piece.originX + piece.x, y: [40, piece.y, piece.y + 260], opacity: [0, 1, 1, 0], rotate: piece.rotate * 3, scale: 1 }}
                  transition={{ duration: 2.4, delay: piece.delay, ease: 'easeOut', times: [0, 0.35, 1] }}
                />
              ))}
            </div>
          ) : null}

          <MotionDiv
            role="dialog"
            aria-modal="true"
            aria-labelledby="level-up-title"
            aria-describedby="level-up-description"
            className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/20 bg-white text-center shadow-2xl dark:border-zinc-700 dark:bg-[#1f1f22]"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 24 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 12 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            <div className="relative bg-gradient-to-br from-sky-500 via-sky-400 to-cyan-400 px-6 pb-14 pt-6 dark:from-sky-700 dark:via-sky-600 dark:to-cyan-700">
              <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:14px_14px]" aria-hidden="true" />
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Close celebration"
                className={`absolute right-3 top-3 rounded-lg p-1.5 text-white/90 hover:bg-white/15 ${focusRing}`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
              <p className="relative flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/90">
                <PartyPopper className="h-4 w-4" aria-hidden="true" />
                Congratulations from PeerPrep
              </p>
            </div>

            <div className="-mt-12 flex justify-center">
              {level ? (
                <MotionDiv
                  initial={reduceMotion ? false : { scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.15 }}
                >
                  <LevelMedallion level={level.level} size="lg" />
                </MotionDiv>
              ) : (
                <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-lg ring-4 ring-white dark:bg-[#1f1f22] dark:ring-[#1f1f22]">
                  <PartyPopper className="h-10 w-10 text-amber-500" aria-hidden="true" />
                </span>
              )}
            </div>

            <div className="px-6 pb-6 pt-4">
              <h2 id="level-up-title" className="text-xl font-semibold tracking-tight text-slate-900 dark:text-zinc-50">{heading}</h2>
              <p id="level-up-description" className="mt-1 text-[13px] text-slate-500 dark:text-zinc-400">
                {level ? (
                  <>You are now a <span className="font-semibold text-sky-600 dark:text-sky-400">{level.title}</span>. {level.helper}</>
                ) : 'Your hard work is paying off. Keep going!'}
              </p>

              {awards.length > 0 ? (
                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-left dark:bg-zinc-900/60">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                    {awards.length === 1 ? 'Award earned' : 'Awards earned'}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {awards.map((award) => (
                      <li key={award.id} className="flex items-center gap-2 text-[13px]">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden="true" />
                        <span className="font-semibold text-slate-800 dark:text-zinc-200">{award.title}</span>
                        <span className="truncate text-slate-500 dark:text-zinc-400">· {award.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <button
                type="button"
                onClick={onClose}
                className={`mt-5 w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-600/30 transition-colors hover:bg-sky-700 ${focusRing}`}
              >
                Keep going
              </button>
            </div>
          </MotionDiv>
        </MotionDiv>
      ) : null}
    </AnimatePresence>
  );
}
