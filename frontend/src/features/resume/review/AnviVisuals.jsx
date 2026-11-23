// Shared ANVI visuals for Prep Resume (hub card, Your resume page, check panel).
// ANVI looks like a calm, structured assistant: an avatar with an online dot,
// message bubbles and result cards. Motion is kept for meaning only.
import { useEffect, useId, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AnviMark } from '../../../components/AnviApproach';
import { verdictFor } from './reviewModel';
import './anvi.css';

/** Static gradient hairline around a themed surface. */
export function AnviAura({ children, className = '', innerClassName = '', radius = '1.25rem' }) {
  return (
    <div className={`anvi-aura ${className}`} style={{ '--anvi-radius': radius }}>
      <div className={`anvi-aura-inner relative overflow-hidden bg-white dark:bg-[#242424] ${innerClassName}`}>{children}</div>
    </div>
  );
}

/** "ANVI" in its gradient. */
export function AnviWord({ className = '' }) {
  return <span className={`anvi-text font-bold tracking-[-0.01em] ${className}`}>ANVI</span>;
}

/** Kept for callers: a soft, static wash of colour in one corner (no moving shapes). */
export function AnviGlowBackdrop({ className = '' }) {
  return <div className={`pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_100%_0%,rgba(139,92,246,0.07),transparent_70%)] dark:bg-[radial-gradient(70%_60%_at_100%_0%,rgba(139,92,246,0.08),transparent_70%)] ${className}`} aria-hidden="true" />;
}

/**
 * ANVI's avatar: the mark in a gradient ring. `online` adds a status dot;
 * `busy` turns the ring into a thin spinner while a check runs.
 */
export function AnviOrb({ size = 56, busy = false, online = false, className = '' }) {
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className="absolute inset-0 rounded-full bg-gradient-to-br from-sky-400 via-violet-500 to-fuchsia-500" />
      {busy ? <span className="anvi-spin absolute -inset-[3px] rounded-full border-2 border-transparent border-t-violet-500 border-r-sky-400" /> : null}
      <span className="absolute inset-[2px] rounded-full bg-white dark:bg-[#1f1f1f]" />
      <AnviMark className="relative h-[60%] w-[60%]" />
      {online ? <span className="absolute bottom-0 right-0 block rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#242424]" style={{ width: Math.max(8, size * 0.24), height: Math.max(8, size * 0.24) }} /> : null}
    </span>
  );
}

/** Large gradient score gauge. */
export function AnviGauge({ score, size = 132, stroke = 11, label = 'ATS readiness' }) {
  const id = useId().replace(/:/g, '');
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  const verdict = verdictFor(score);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label} ${score} out of 100, ${verdict.label}`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#38bdf8" /><stop offset="0.55" stopColor="#8b5cf6" /><stop offset="1" stopColor="#d946ef" /></linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-slate-100 dark:stroke-white/[0.07]" />
        <motion.circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} stroke={`url(#g${id})`} strokeLinecap="round" strokeDasharray={length} initial={{ strokeDashoffset: length }} animate={{ strokeDashoffset: length * (1 - value / 100) }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className={`font-bold leading-none tabular-nums tracking-[-0.04em] text-slate-950 dark:text-white ${size >= 120 ? 'text-[40px]' : size >= 90 ? 'text-[30px]' : 'text-[22px]'}`}>{score ?? '–'}</span>
        <span className={`mt-1 font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-zinc-500 ${size >= 90 ? 'text-[10px]' : 'text-[8.5px]'}`}>of 100</span>
      </div>
    </div>
  );
}

const VERDICT_PILL = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200/70 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:ring-white/10',
};

export function VerdictPill({ score, className = '' }) {
  const verdict = verdictFor(score);
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ring-inset ${VERDICT_PILL[verdict.tone] || VERDICT_PILL.slate} ${className}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{verdict.label}</span>;
}

/* ───────────── assistant conversation parts ───────────── */

/** Three dots for a moment, then the message. Shown once; skipped with reduced motion. */
export function useTyping(delay = 650) {
  const reduce = useReducedMotion();
  const [typing, setTyping] = useState(!reduce);
  useEffect(() => {
    if (reduce) return undefined;
    const timer = setTimeout(() => setTyping(false), delay);
    return () => clearTimeout(timer);
  }, [delay, reduce]);
  return typing;
}

export function TypingDots() {
  return <span className="anvi-typing inline-flex items-center gap-1 rounded-2xl rounded-tl-md bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.06)] ring-1 ring-black/[0.05] dark:bg-[#2a2a2a] dark:ring-white/[0.06]" role="status" aria-label="ANVI is typing">{[0, 1, 2].map((key) => <span key={key} className="h-1.5 w-1.5 rounded-full bg-violet-400" />)}</span>;
}

/** One ANVI message: small avatar on the first bubble of a run, then the bubble. */
export function AnviMessage({ children, avatar = true, delay = 0, className = '' }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay }} className={`flex items-end gap-2 ${className}`}>
      <span className="w-7 shrink-0">{avatar ? <AnviOrb size={28} /> : null}</span>
      <div className="min-w-0 max-w-full rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[13px] leading-[1.55] text-slate-700 shadow-[0_1px_2px_rgba(16,24,40,0.06)] ring-1 ring-black/[0.05] dark:bg-[#2a2a2a] dark:text-zinc-200 dark:ring-white/[0.06]">{children}</div>
    </motion.div>
  );
}

/** Suggested replies, like an assistant's quick actions. */
export function QuickReplies({ items, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay }} className="flex flex-wrap justify-end gap-2 pl-9">
      {items.map(({ label, icon: Icon, onClick, primary }) => (
        <button key={label} type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${primary ? 'anvi-button text-white' : 'bg-white text-violet-700 ring-1 ring-inset ring-violet-200 hover:bg-violet-50 hover:ring-violet-300 dark:bg-white/[0.04] dark:text-violet-200 dark:ring-violet-400/25 dark:hover:bg-violet-500/10'}`}>
          {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}{label}
        </button>
      ))}
    </motion.div>
  );
}

/**
 * A mini resume sheet. With `scanning`, a light beam sweeps down and marks
 * appear on a few lines; otherwise it is still. Purely decorative.
 */
export function AnviScanSheet({ width = 150, scanning = false, headings = [], className = '' }) {
  const height = Math.round(width * 1.414);
  const lines = [
    { y: 0.08, w: 0.5, bold: true }, { y: 0.13, w: 0.72 },
    { y: 0.22, w: 0.3, bold: true, label: headings[0] }, { y: 0.27, w: 0.86 }, { y: 0.31, w: 0.78, hit: 'rose' }, { y: 0.35, w: 0.64 },
    { y: 0.44, w: 0.34, bold: true, label: headings[1] }, { y: 0.49, w: 0.9 }, { y: 0.53, w: 0.7 }, { y: 0.57, w: 0.82, hit: 'amber' },
    { y: 0.66, w: 0.28, bold: true, label: headings[2] }, { y: 0.71, w: 0.88, hit: 'emerald' }, { y: 0.75, w: 0.6 },
    { y: 0.84, w: 0.32, bold: true }, { y: 0.89, w: 0.76 },
  ];
  const hitTone = { rose: 'bg-rose-400/30 ring-rose-400/50', amber: 'bg-amber-300/35 ring-amber-400/50', emerald: 'bg-emerald-300/35 ring-emerald-400/50' };
  return (
    <div className={`relative overflow-hidden rounded-md bg-white shadow-[0_18px_40px_-22px_rgba(15,23,42,0.45)] ring-1 ring-black/[0.06] dark:bg-zinc-100 ${scanning ? 'anvi-scanning' : ''} ${className}`} style={{ width, height }} aria-hidden="true">
      {lines.map((line, index) => (
        <span key={index} className="absolute left-[9%] block" style={{ top: `${line.y * 100}%`, width: `${line.w * 82}%`, height: line.bold ? 4 : 3 }}>
          {line.label ? <span className="absolute -top-0.5 left-0 whitespace-nowrap text-[5px] font-bold uppercase leading-none tracking-wide text-slate-800">{line.label}</span> : <span className={`block h-full rounded-full ${line.bold ? 'bg-slate-700' : 'bg-slate-300'}`} />}
          {line.hit ? <span className={`anvi-mark-hit absolute -inset-x-1 -inset-y-[3px] rounded-sm ring-1 ${hitTone[line.hit]}`} style={{ '--anvi-delay': `${line.y * 2}s` }} /> : null}
        </span>
      ))}
      {scanning ? (
        <span className="anvi-beam absolute inset-x-0 top-0 block h-10" style={{ '--anvi-scan-to': `${height}px` }}>
          <span className="block h-full bg-gradient-to-b from-transparent via-violet-400/20 to-transparent" />
          <span className="absolute inset-x-0 top-1/2 block h-px bg-gradient-to-r from-sky-400 via-violet-500 to-fuchsia-500" />
        </span>
      ) : null}
    </div>
  );
}
