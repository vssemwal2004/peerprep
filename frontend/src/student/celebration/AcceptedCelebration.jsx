import { useEffect, useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CircleCheckBig, CodeXml, MemoryStick, Timer, X } from 'lucide-react';
import PeerPrepCoin from './PeerPrepCoin';
import InterviewReportPanel from './InterviewReportPanel';
import './acceptedCelebration.css';

const MotionDiv = motion.div;
const PALETTE = ['#fbbf24', '#f59e0b', '#fde68a', '#0ea5e9', '#38bdf8', '#6366f1', '#ffffff'];
const BURST = ['#fbbf24', '#f59e0b', '#fde68a', '#0ea5e9', '#38bdf8'];
const WAVES = [0, 420, 900];
const LAND_MS = 920, PANEL_MS = 1800;
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const formatMemory = (kb) => (kb >= 1024 ? `${(kb / 1024).toFixed(kb >= 10240 ? 0 : 1)} MB` : `${Math.round(kb)} KB`);
const known = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

function statChips(stats) {
  if (!stats) return [];
  return [
    known(stats.runtimeMs) && { Icon: Timer, label: 'Runtime', value: `${Math.round(Number(stats.runtimeMs))} ms` },
    known(stats.memoryKb) && Number(stats.memoryKb) > 0 && { Icon: MemoryStick, label: 'Memory', value: formatMemory(Number(stats.memoryKb)) },
    stats.language && { Icon: CodeXml, label: 'Language', value: stats.language },
  ].filter(Boolean);
}

function canDraw(canvas) {
  try { return Boolean(canvas?.getContext && canvas.getContext('2d')); } catch { return false; }
}

/** Side cannons over ~1.2s, then a gold/blue burst where the coin lands. Skipped for reduced motion and canvas-less DOMs. */
function useConfetti(canvasRef, coinRef, enabled) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled || !canDraw(canvas)) return undefined;
    let cancelled = false, fire = null;
    const timers = [];
    import('canvas-confetti').then(({ default: confetti }) => {
      if (cancelled) return;
      fire = confetti.create(canvas, { resize: true, useWorker: false });
      const cannon = (x, angle, count) => fire({ origin: { x, y: 0.85 }, angle, spread: 58, startVelocity: 64, particleCount: count, ticks: 260, gravity: 1.05, drift: x ? -0.4 : 0.4, colors: PALETTE });
      WAVES.forEach((delay, wave) => timers.push(setTimeout(() => { const count = 70 - wave * 18; cannon(0, 60, count); cannon(1, 120, count); }, delay)));
      timers.push(setTimeout(() => {
        const rect = coinRef.current?.getBoundingClientRect();
        const origin = rect && window.innerWidth ? { x: (rect.left + rect.width / 2) / window.innerWidth, y: (rect.top + rect.height / 2) / window.innerHeight } : { x: 0.5, y: 0.35 };
        fire({ origin, spread: 360, startVelocity: 24, particleCount: 46, ticks: 160, gravity: 0.8, scalar: 0.9, shapes: ['star', 'circle'], colors: BURST });
      }, LAND_MS));
    }).catch(() => {});
    return () => { cancelled = true; timers.forEach(clearTimeout); fire?.reset(); };
  }, [canvasRef, coinRef, enabled]);
}

function CelebrationDialog({ onClose, kind, title, stats, report, onReported }) {
  const reduce = useReducedMotion();
  const id = useId();
  const dialogRef = useRef(null), closeButtonRef = useRef(null), canvasRef = useRef(null), coinRef = useRef(null);
  const onCloseRef = useRef(onClose), pressedBackdrop = useRef(false);
  const [panelReady, setPanelReady] = useState(false);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useConfetti(canvasRef, coinRef, !reduce);

  useEffect(() => {
    if (reduce) return undefined;
    const timer = setTimeout(() => setPanelReady(true), PANEL_MS);
    return () => clearTimeout(timer);
  }, [reduce]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    const close = () => onCloseRef.current?.();
    const locks = [document.body, ...document.querySelectorAll('[data-app-scroll-container]')].filter((node) => node.style.overflow !== 'hidden').map((node) => [node, node.style.overflow]);
    locks.forEach(([node]) => { node.style.overflow = 'hidden'; });
    if (dialog.showModal) { try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); } }
    else dialog.setAttribute('open', ''); // DOM-only test environments.
    closeButtonRef.current?.focus({ preventScroll: true });
    const onKey = (event) => {
      if (event.key === 'Escape') {
        if (event.target?.getAttribute?.('aria-expanded') === 'true' && dialog.contains(event.target)) return; // An open listbox closes first.
        event.preventDefault(); event.stopPropagation(); close();
      }
      if (event.key === 'Tab') {
        const controls = [...dialog.querySelectorAll(FOCUSABLE)].filter((node) => !node.closest('[hidden]'));
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      dialog.close?.();
      locks.forEach(([node, overflow]) => { node.style.overflow = overflow; });
      if (opener?.isConnected && opener !== document.body) opener.focus?.({ preventScroll: true });
    };
  }, []);

  const total = Number(stats?.total) || 0;
  const line = kind === 'practice' ? 'Correct answer — nicely done'
    : total > 0 ? `All ${total} hidden test case${total === 1 ? '' : 's'} passed` : 'All hidden test cases passed';
  const chips = statChips(stats);
  // Close only when both press and release land on the backdrop itself, never on its scrollbar
  // (Chromium targets the scroll container for scrollbar presses), so a half-filled report is not lost.
  const onBackdropDown = (event) => {
    const node = event.currentTarget;
    const rect = node.getBoundingClientRect();
    const onScrollbar = event.clientX >= rect.left + node.clientWidth || event.clientY >= rect.top + node.clientHeight;
    pressedBackdrop.current = event.target === node && !onScrollbar;
  };
  const onBackdropClick = (event) => {
    const pressed = pressedBackdrop.current;
    pressedBackdrop.current = false;
    if (pressed && event.target === event.currentTarget) onCloseRef.current?.();
  };
  const reveal = (delay) => (reduce ? { initial: false } : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.45, ease: 'easeOut' } });

  return <dialog ref={dialogRef} data-accepted-celebration data-platform-popup-root className="accepted-celebration" aria-modal="true"
    aria-labelledby={`${id}-title`} aria-describedby={`${id}-line`} onCancel={(event) => { event.preventDefault(); onCloseRef.current?.(); }}>
    <canvas ref={canvasRef} className="accepted-celebration__confetti" aria-hidden="true" />
    <div className="accepted-celebration__viewport" onMouseDown={onBackdropDown} onClick={onBackdropClick}>
      <div className="accepted-celebration__card">
        <button ref={closeButtonRef} type="button" onClick={() => onCloseRef.current?.()} aria-label="Close celebration"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:bg-zinc-800/80 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-white">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="accepted-celebration__scene"><div ref={coinRef}><PeerPrepCoin still={reduce} /></div></div>
        <div className="space-y-5 px-5 pb-6 pt-2 text-center sm:px-8 sm:pb-8">
          <MotionDiv {...reveal(1.0)} aria-live="polite">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
              <CircleCheckBig className="h-3.5 w-3.5" aria-hidden="true" />Accepted
            </span>
            <h2 id={`${id}-title`} className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-[32px]">Congratulations!</h2>
            <p id={`${id}-line`} className="mt-1.5 text-[15px] font-medium text-slate-600 dark:text-zinc-300">{line}</p>
            {title && <p className="mx-auto mt-1 line-clamp-2 max-w-sm text-[13px] text-slate-400 dark:text-zinc-500">{title}</p>}
            {chips.length > 0 && <ul className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Submission stats">
              {chips.map(({ Icon, label, value }) => <li key={label} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
                <Icon className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" /><span className="sr-only">{label}: </span><span className="font-semibold text-slate-800 dark:text-zinc-100">{value}</span>
              </li>)}
            </ul>}
          </MotionDiv>
          {report?.source && report?.questionId && (reduce || panelReady) && <InterviewReportPanel source={report.source} questionId={report.questionId} delay={reduce ? 0 : 1} onReported={onReported} />}
          <MotionDiv {...reveal(1.2)}>
            <button type="button" onClick={() => onCloseRef.current?.()}
              className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">Continue</button>
          </MotionDiv>
        </div>
      </div>
    </div>
  </dialog>;
}

/**
 * Accepted-submission celebration with an optional "asked in an interview?" report.
 * @param {{ open: boolean, onClose: () => void, kind?: 'coding'|'practice', title?: string,
 *   stats?: { passed?: number, total?: number, runtimeMs?: number, memoryKb?: number, language?: string } | null,
 *   report?: { source: string, questionId: string } | null, onReported?: () => void }} props
 */
export default function AcceptedCelebration({ open, kind = 'coding', ...props }) {
  return open ? <CelebrationDialog kind={kind} {...props} /> : null;
}
