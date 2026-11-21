import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PartyPopper, X } from 'lucide-react';
import PrepCoinIcon from '../../components/prepCoin/PrepCoinIcon';
import BadgeMedal from './BadgeMedal';
import { FAMILY_LABELS, TIER_METALS } from './badgeModel';

const COLORS = ['#f59e0b', '#fbbf24', '#f43f5e', '#38bdf8', '#22d3ee', '#a78bfa', '#34d399', '#fb7185', '#ffffff'];
// Deterministic "random" so renders are stable (no Math.random during render).
const pick = (index, salt, mod) => ((index * 9301 + salt * 49297) % 233280) / 233280 * mod;

const BURSTS = [
  { left: '18%', top: '26%', delay: 0.15 }, { left: '82%', top: '22%', delay: 0.45 },
  { left: '28%', top: '72%', delay: 0.8 }, { left: '74%', top: '68%', delay: 1.1 }, { left: '50%', top: '14%', delay: 1.45 },
];

function Fireworks() {
  const sparks = useMemo(() => Array.from({ length: 18 }, (_, index) => {
    const angle = (index / 18) * Math.PI * 2;
    const distance = 70 + pick(index, 3, 60);
    return { index, x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, color: COLORS[index % COLORS.length], size: 4 + (index % 3) * 1.5 };
  }), []);
  return BURSTS.map((burst, burstIndex) => (
    <span key={burstIndex} className="absolute" style={{ left: burst.left, top: burst.top }}>
      {/* the flash */}
      <motion.span className="absolute -left-10 -top-10 h-20 w-20 rounded-full bg-white/70 blur-xl"
        initial={{ opacity: 0, scale: 0.2 }} animate={{ opacity: [0, 0.9, 0], scale: [0.2, 1.4, 1.8] }}
        transition={{ duration: 0.9, delay: burst.delay, repeat: 2, repeatDelay: 2.1 }} />
      {sparks.map((spark) => (
        <motion.span key={spark.index} className="absolute rounded-full" style={{ width: spark.size, height: spark.size, backgroundColor: spark.color, boxShadow: `0 0 8px ${spark.color}` }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
          animate={{ x: [0, spark.x, spark.x * 1.08], y: [0, spark.y, spark.y + 46], opacity: [0, 1, 0], scale: [0.3, 1, 0.5] }}
          transition={{ duration: 1.35, delay: burst.delay, ease: 'easeOut', times: [0, 0.45, 1], repeat: 2, repeatDelay: 1.65 }} />
      ))}
    </span>
  ));
}

function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 56 }, (_, index) => ({
    index, left: pick(index, 7, 100), color: COLORS[index % COLORS.length], delay: pick(index, 11, 1.6),
    duration: 3 + pick(index, 13, 2.5), sway: (index % 2 ? 1 : -1) * (14 + pick(index, 17, 34)), spin: 360 + pick(index, 19, 540),
    width: 6 + (index % 3) * 2, round: index % 4 === 0,
  })), []);
  return pieces.map((piece) => (
    <motion.span key={piece.index} className={`absolute top-0 ${piece.round ? 'rounded-full' : 'rounded-[2px]'}`}
      style={{ left: `${piece.left}%`, width: piece.width, height: piece.round ? piece.width : piece.width * 0.45, backgroundColor: piece.color }}
      initial={{ y: -30, x: 0, rotate: 0, opacity: 0 }}
      animate={{ y: '105vh', x: [0, piece.sway, -piece.sway, 0], rotate: piece.spin, opacity: [0, 1, 1, 0.9, 0] }}
      transition={{ duration: piece.duration, delay: piece.delay, ease: 'linear', repeat: 1 }} />
  ));
}

function Bubbles() {
  const bubbles = useMemo(() => Array.from({ length: 18 }, (_, index) => ({
    index, left: 4 + pick(index, 23, 92), size: 10 + pick(index, 29, 26), delay: pick(index, 31, 3), duration: 4.5 + pick(index, 37, 3.5),
  })), []);
  return bubbles.map((bubble) => (
    <motion.span key={bubble.index} className="absolute bottom-0 rounded-full border border-white/50 bg-white/10 shadow-[inset_-3px_-4px_8px_rgba(255,255,255,0.35)]"
      style={{ left: `${bubble.left}%`, width: bubble.size, height: bubble.size }}
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: '-100vh', opacity: [0, 0.9, 0.9, 0], x: [0, 12, -10, 6] }}
      transition={{ duration: bubble.duration, delay: bubble.delay, ease: 'easeOut', repeat: Infinity }} />
  ));
}

/**
 * Full-screen "you earned a badge" moment: fireworks, confetti, rising bubbles, light rays and the
 * medal spinning in 3D. items: badgeModel items (earned). hero: optional node shown instead of the
 * medal (e.g. a level medallion). Several items: the small row switches the featured one.
 */
export default function BadgeCelebration({ open, items = [], hero = null, heading = 'Congratulations!', subheading, onClose, onView, viewLabel = 'View my badges', closeLabel = 'Keep going' }) {
  const reduce = useReducedMotion();
  // -1 = the hero (level medallion) is featured; otherwise the index of the featured badge.
  const hasHero = Boolean(hero);
  const [active, setActive] = useState(hasHero ? -1 : 0);
  const dialogRef = useRef(null);
  const primaryRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const featured = active >= 0 ? items[Math.min(active, items.length - 1)] || null : null;

  useEffect(() => { if (open) setActive(hasHero ? -1 : 0); }, [open, items.length, hasHero]);

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const focusTimer = setTimeout(() => primaryRef.current?.focus(), 60);
    const onKey = (event) => {
      if (event.key === 'Escape') closeRef.current?.();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button, a[href]')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(focusTimer); window.removeEventListener('keydown', onKey); if (opener && document.contains(opener)) opener.focus?.(); };
  }, [open]);

  const metal = TIER_METALS[featured?.tier] || TIER_METALS.Gold;
  const glow = featured?.look?.from || '#f59e0b';
  const sub = subheading || (items.length > 1 ? `You earned ${items.length} new badges` : 'You earned a new badge');

  const content = (
    <AnimatePresence>
      {open ? (
        <motion.div key="badge-celebration" role="presentation"
          className="fixed inset-0 z-[220] flex items-center justify-center overflow-hidden bg-slate-950/75 p-4 backdrop-blur-[3px]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
          {!reduce ? (
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              <Bubbles />
              <Fireworks />
              <Confetti />
            </div>
          ) : null}

          <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="badge-celebration-title" aria-describedby="badge-celebration-desc"
            className="relative w-full max-w-[400px] overflow-hidden rounded-[28px] border border-white/15 bg-white text-center shadow-[0_40px_120px_-30px_rgba(0,0,0,0.75)] dark:bg-[#1c1c1e]"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7, y: 40 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 240, damping: 22 }}>
            <button type="button" onClick={onClose} aria-label="Close"
              className="absolute right-3 top-3 z-20 rounded-full p-1.5 text-white/85 transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            {/* Stage: rays + glow behind the medal */}
            <div className="relative flex h-[230px] items-center justify-center overflow-hidden"
              style={{ background: `radial-gradient(circle at 50% 55%, ${glow}55 0%, transparent 55%), linear-gradient(160deg, #1f1d1b 0%, #111111 60%, #1c1c20 100%)` }}>
              {!reduce ? (
                <motion.div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 opacity-80" aria-hidden="true"
                  style={{ background: `repeating-conic-gradient(from 0deg, ${metal[0]}55 0deg 7deg, transparent 7deg 20deg)`, maskImage: 'radial-gradient(circle, black 12%, transparent 48%)', WebkitMaskImage: 'radial-gradient(circle, black 12%, transparent 48%)' }}
                  animate={{ rotate: 360 }} transition={{ duration: 18, ease: 'linear', repeat: Infinity }} />
              ) : null}
              <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(255,255,255,0.55)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:radial-gradient(circle,black,transparent_70%)]" aria-hidden="true" />
              <p className="absolute left-0 right-0 top-4 flex items-center justify-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.22em] text-amber-200/90">
                <PartyPopper className="h-3.5 w-3.5" aria-hidden="true" />
                {featured ? `${FAMILY_LABELS[featured.family] || 'Badge'} unlocked` : 'Level up'}
              </p>
              <AnimatePresence mode="wait">
                <motion.div key={featured?.uid || 'hero'} className="relative mt-4"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.2, rotateY: 540 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, rotateY: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, rotateY: -120 }}
                  transition={{ type: 'spring', stiffness: 70, damping: 13, mass: 1.1 }}
                  style={{ transformPerspective: 800 }}>
                  <motion.div animate={reduce ? undefined : { y: [0, -9, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}>
                    {featured ? <BadgeMedal badge={{ ...featured, earned: true }} size={136} interactive shine /> : hero}
                  </motion.div>
                  <span className="absolute -bottom-3 left-1/2 h-4 w-24 -translate-x-1/2 rounded-[50%] bg-black/45 blur-md" aria-hidden="true" />
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="relative px-6 pb-6 pt-5">
              <motion.h2 id="badge-celebration-title"
                initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                className="bg-gradient-to-r from-amber-500 via-rose-500 to-violet-600 bg-clip-text text-[28px] font-extrabold tracking-tight text-transparent">
                {heading}
              </motion.h2>
              <p id="badge-celebration-desc" className="mt-0.5 text-[13px] text-slate-500 dark:text-zinc-400">{sub}</p>

              {featured ? (
                <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-3">
                  <p className="text-[17px] font-bold text-slate-900 dark:text-white">{featured.title}</p>
                  {featured.description ? <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-zinc-400">{featured.description}</p> : null}
                  <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5 text-[11.5px] font-bold">
                    <span className="rounded-full px-2.5 py-1 text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${metal[0]}, ${metal[1]})`, textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}>{featured.tier}</span>
                    {featured.coins > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20"><PrepCoinIcon size={14} />+{featured.coins} Prep Coins</span> : null}
                  </div>
                </motion.div>
              ) : null}

              {items.length > 1 || (hasHero && items.length) ? (
                <ul className="mt-4 flex flex-wrap justify-center gap-1.5" aria-label="Badges earned">
                  {items.map((item, index) => (
                    <li key={item.uid}>
                      <button type="button" onClick={() => setActive(index)} aria-pressed={index === active} title={item.title}
                        className={`rounded-xl p-1 transition ${index === active ? 'bg-amber-50 ring-2 ring-amber-300 dark:bg-amber-500/10' : 'opacity-75 hover:opacity-100'}`}>
                        <BadgeMedal badge={{ ...item, earned: true }} size={36} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-5 grid gap-2">
                {onView ? (
                  <button ref={primaryRef} type="button" onClick={onView}
                    className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-[13.5px] font-bold text-white shadow-[0_12px_24px_-12px_rgba(234,88,12,0.8)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#1c1c1e]">
                    {viewLabel}
                  </button>
                ) : null}
                <button ref={onView ? undefined : primaryRef} type="button" onClick={onClose}
                  className="rounded-xl px-4 py-2 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-zinc-300 dark:hover:bg-white/[0.06]">
                  {closeLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
