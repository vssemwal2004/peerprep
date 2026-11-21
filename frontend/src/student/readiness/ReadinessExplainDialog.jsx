import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Calculator, Clock3, Gauge, Layers, Lightbulb, X } from 'lucide-react';
import { TRACK_META } from './readinessModel';

const DEFAULT_TRACKS = {
  sbc: { cutoff: 70, multipliers: { Easy: 1.5, Medium: 2.5, Hard: 2.5 } },
  pbc: { cutoff: 75, multipliers: { Easy: 0.5, Medium: 2, Hard: 4 } },
};
const fmt = (value) => (Math.round(value * 100) / 100).toString();

function Block({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 p-4 dark:border-white/[0.08]">
      <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-900 dark:text-white"><Icon className="h-4 w-4 text-violet-600 dark:text-violet-300" aria-hidden="true" />{title}</h3>
      <div className="mt-2 space-y-2 text-[12.5px] leading-relaxed text-slate-600 dark:text-zinc-300">{children}</div>
    </section>
  );
}

/**
 * "How can I improve my score?": the three numbers, the formula with a worked solve, a topic
 * target example, base points vs the displayed Prep Score change, and how full quotas work.
 * Uses the live policy values (multipliers, cutoffs, quota) when given.
 */
export default function ReadinessExplainDialog({ open, onClose, tracks = DEFAULT_TRACKS, quotaLimit = 3, totals = { sbc: 128, pbc: 215 } }) {
  const reduce = useReducedMotion();
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); if (opener && document.contains(opener)) opener.focus?.(); };
  }, [open]);

  const sbc = tracks?.sbc || DEFAULT_TRACKS.sbc;
  const pbc = tracks?.pbc || DEFAULT_TRACKS.pbc;
  // Worked solve: Dynamic Programming, 2 Easy + 8 Medium + 4 Hard (PBC weight 5, target 40; SBC weight 2, target 10).
  const pbcPoints = 2 * pbc.multipliers.Easy + 8 * pbc.multipliers.Medium + 4 * pbc.multipliers.Hard;
  const sbcPoints = 2 * sbc.multipliers.Easy + 8 * sbc.multipliers.Medium + 4 * sbc.multipliers.Hard;
  const pbcProgress = Math.min(1, pbcPoints / 40);
  const sbcProgress = Math.min(1, sbcPoints / 10);

  const content = (
    <AnimatePresence>
      {open ? (
        <motion.div key="readiness-explain" className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="readiness-explain-title"
            className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1f1f22] sm:rounded-3xl"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }} animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}>
            <header className="flex items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-4 text-white dark:border-white/10">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-100">Prep Readiness</p>
                <h2 id="readiness-explain-title" className="text-[17px] font-bold">How your readiness is calculated</h2>
              </div>
              <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-white/85 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><X className="h-4 w-4" /></button>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
              <Block icon={Gauge} title="Three different numbers">
                <p><b>Prep Score</b> is your activity score in points: solving, the daily challenge, sheets and badges add to it.</p>
                <p><b>{TRACK_META.sbc.full}</b> (SBC, such as IT services firms) and <b>{TRACK_META.pbc.full}</b> (PBC, such as product and tech firms) readiness, each 0–100, show how close your accepted practice is to that type&apos;s practice target: {sbc.cutoff} for Service-Based, {pbc.cutoff} for Product-Based. Service-Based targets reward strong fundamentals; Product-Based targets reward depth in Medium and Hard topics. They are not a prediction of selection by any company.</p>
              </Block>
              <Block icon={Calculator} title="A worked solve">
                <p>Each canonical topic has a weight and a target per track. Your first accepted solve of a problem counts once, for its one primary topic:</p>
                <p className="rounded-xl bg-slate-50 px-3 py-2 font-mono text-[11.5px] text-slate-700 dark:bg-white/[0.04] dark:text-zinc-200">topic points = Easy × {fmt(pbc.multipliers.Easy)}/{fmt(sbc.multipliers.Easy)} + Medium × {fmt(pbc.multipliers.Medium)}/{fmt(sbc.multipliers.Medium)} + Hard × {fmt(pbc.multipliers.Hard)}/{fmt(sbc.multipliers.Hard)}  (Product-Based / Service-Based)<br />progress = min(1, points ÷ target) · contribution = 100 × weight × progress ÷ total weight</p>
                <p>Dynamic Programming with 2 Easy, 8 Medium and 4 Hard: Product-Based points {fmt(pbcPoints)} of 40 = {Math.round(pbcProgress * 100)}% → +{fmt((100 * 5 * pbcProgress) / totals.pbc)} Product-Based readiness. Service-Based points {fmt(sbcPoints)} of 10 = {Math.round(sbcProgress * 100)}% (capped) → +{fmt((100 * 2 * sbcProgress) / totals.sbc)} Service-Based readiness.</p>
              </Block>
              <Block icon={Layers} title="Topic targets">
                <p>A topic stops adding once it reaches its target. Array&apos;s Product-Based target is 30: 15 Medium Array solves give 30 points, so a 16th Array solve adds nothing there. Breadth across topics raises the score faster than depth in one.</p>
                <p>Some topics do not count for one type (for example, Segment Tree does not count for Service-Based).</p>
              </Block>
              <Block icon={Lightbulb} title="Base points and your Prep Score change">
                <p>A first solve is worth base activity points (Easy 4, Medium 8, Hard 14 by default). Your Prep Score shows the change on its growth curve, so +8 base points can appear as a small change such as +0.29. Readiness does not use these points; it uses the topic formula above.</p>
              </Block>
              <Block icon={Clock3} title="Daily topic quota">
                <p>Each tag can earn Prep Score from {quotaLimit || 'any number of'} credited first solve{quotaLimit === 1 ? '' : 's'} per day. The base points split across the tags that still have room; a full tag&apos;s share moves to them. If every tag is full, the solve earns 0 base points but still counts toward readiness.</p>
                <p>Quotas reset at 12:00 AM IST. The daily challenge changes at 2:00 AM IST. When a topic is full, ANVI Practice Next leads with a problem that still has room.</p>
              </Block>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
