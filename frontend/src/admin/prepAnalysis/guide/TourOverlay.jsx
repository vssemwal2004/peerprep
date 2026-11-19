import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, MousePointerClick, Sparkles, X } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import GlossaryText from "./GlossaryText";
import { CHAPTERS } from "./tourContext";
import { findElement, placeCard, scrollElement, targetRect } from "./targets";

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const textOf = (value, ctx) => (typeof value === "function" ? value(ctx) : value);
const CARD_WIDTH = 368;

function inView(element) {
  const rect = element.getBoundingClientRect();
  return rect.top >= 70 && rect.bottom <= window.innerHeight - 20;
}

/**
 * A running guide: the page dims, the step's part is lit up (the spotlight glides from part to
 * part), and a card beside it explains it, with chapters, progress, Back / Next and Skip. A "try
 * it" step waits for the admin to click the lit part; a step's action button (e.g. "Show these
 * students") ends the guide and does it. Steps' `before` changes (a view switch) are undone at
 * the end. guide: { id, title, steps, ctx }.
 */
export default function TourOverlay({ guide, onFinish }) {
  const reduced = useReducedMotion();
  const titleId = useId();
  const steps = guide.steps;
  const ctx = guide.ctx;
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [ready, setReady] = useState(false);
  const [tried, setTried] = useState(false);
  const [cardSize, setCardSize] = useState({ width: CARD_WIDTH, height: 240 });
  const cardRef = useRef(null);
  const nextRef = useRef(null);
  const restores = useRef([]);
  const step = steps[index];
  const last = index === steps.length - 1;
  const phone = typeof window !== "undefined" && window.innerWidth < 640;

  const finish = useCallback((completed, then) => {
    // Undo every "show me" change, newest first, then report.
    for (const restore of restores.current.reverse()) { try { restore(); } catch { /* the chart may be gone */ } }
    restores.current = [];
    onFinish(completed);
    if (then) setTimeout(then, 60);
  }, [onFinish]);
  const go = useCallback((next) => {
    if (next >= steps.length) { finish(true); return; }
    setIndex(Math.max(0, next));
  }, [finish, steps.length]);

  // Enter a step: run its "show me" change, bring its part into view, then measure it.
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setTried(false);
    (async () => {
      if (step.before) {
        const restore = step.before(ctx);
        if (typeof restore === "function") restores.current.push(restore);
        await wait(320);
      }
      const element = scrollElement(step, ctx);
      if (element && !inView(element)) {
        element.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
        await wait(reduced ? 60 : 420);
      }
      if (cancelled) return;
      setRect(targetRect(step, ctx));
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [step, ctx, reduced]);

  // Keep the spotlight on its part while the page scrolls or resizes.
  useEffect(() => {
    if (!ready) return undefined;
    let frame = 0;
    const measure = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setRect(targetRect(step, ctx))); };
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", measure, true); window.removeEventListener("resize", measure); };
  }, [ready, step, ctx]);

  // "Try it": the lit part takes the click; the step ticks itself off and moves on.
  useEffect(() => {
    if (!ready || !step.tryIt) return undefined;
    const element = findElement(step.target, ctx);
    if (!element) return undefined;
    const done = () => { setTried(true); setTimeout(() => go(index + 1), 650); };
    element.addEventListener("click", done, { once: true });
    return () => element.removeEventListener("click", done);
  }, [ready, step, ctx, go, index]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); }
      else if (event.key === "ArrowRight" && !step.tryIt) go(index + 1);
      else if (event.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [finish, go, index, step]);

  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    const size = { width: node.offsetWidth, height: node.offsetHeight };
    setCardSize((current) => (current.width === size.width && current.height === size.height ? current : size));
  }, [index, ready, tried]);
  // Keys (Enter, Space) work at once: focus sits on Next, a real control.
  useEffect(() => { if (ready) nextRef.current?.focus({ preventScroll: true }); }, [ready, index]);

  const chapters = useMemo(() => {
    const seen = [];
    steps.forEach((entry, at) => { if (!seen.some((chapter) => chapter.key === entry.chapter)) seen.push({ key: entry.chapter, at }); });
    return seen;
  }, [steps]);
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const place = phone ? null : placeCard(rect, cardSize, viewport);
  const title = textOf(step.title, ctx);
  const body = textOf(step.body, ctx);
  const action = step.action ? step.action(ctx) : null;
  const hole = rect && { x: Math.max(0, rect.left), y: Math.max(0, rect.top), w: rect.width, h: rect.height };

  return createPortal(
    <div className="fixed inset-0 z-[9000]" aria-hidden={false}>
      {/* Dim everything except the lit part. */}
      <svg className="pointer-events-none fixed inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <mask id={`${titleId}-hole`}>
            <rect width="100%" height="100%" fill="white" />
            {hole && <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx="14" fill="black" style={{ transition: reduced ? "none" : "all 320ms cubic-bezier(.22,1,.36,1)" }} />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(15,23,42,0.58)" mask={`url(#${titleId}-hole)`} />
      </svg>
      {/* Clicks: blocked outside the lit part; inside it only on a "try it" step. */}
      {hole ? <>
        <div className="fixed left-0 right-0 top-0" style={{ height: hole.y }} />
        <div className="fixed left-0 right-0 bottom-0" style={{ top: hole.y + hole.h }} />
        <div className="fixed left-0" style={{ top: hole.y, height: hole.h, width: hole.x }} />
        <div className="fixed right-0" style={{ top: hole.y, height: hole.h, left: hole.x + hole.w }} />
        {!step.tryIt && <div className="fixed" style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }} />}
        <div className={`pointer-events-none fixed rounded-[14px] ring-2 ${step.tryIt && !tried ? "animate-pulse ring-amber-400" : "ring-sky-400"} shadow-[0_0_0_6px_rgba(56,189,248,0.18)]`}
          style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h, transition: reduced ? "none" : "all 320ms cubic-bezier(.22,1,.36,1)" }} />
      </> : <div className="fixed inset-0" />}

      <section ref={cardRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`fixed flex flex-col overflow-hidden border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.35)] outline-none dark:border-gray-700 dark:bg-gray-900 ${phone ? "inset-x-0 bottom-0 max-h-[70vh] rounded-t-2xl" : "rounded-2xl"} ${ready ? "opacity-100" : "opacity-0"}`}
        style={phone ? undefined : { width: CARD_WIDTH, left: place.left, top: place.top, transition: reduced ? "opacity 120ms" : "left 320ms cubic-bezier(.22,1,.36,1), top 320ms cubic-bezier(.22,1,.36,1), opacity 160ms" }}>
        <div className="h-1 bg-slate-100 dark:bg-white/[0.06]"><div className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-[width] duration-300" style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div>
        <div className="flex items-start gap-2 px-4 pt-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10.5px] font-bold uppercase tracking-[0.1em] text-sky-700 dark:text-sky-300">{guide.title}</p>
            {chapters.length > 1 && (
              <div className="mt-1.5 flex flex-wrap gap-1" role="tablist" aria-label="Chapters">
                {chapters.map((chapter) => {
                  const current = step.chapter === chapter.key;
                  return (
                    <button key={chapter.key} type="button" role="tab" aria-selected={current} onClick={() => go(chapter.at)}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${current ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-slate-300"}`}>
                      {CHAPTERS[chapter.key] || chapter.key}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button type="button" onClick={() => finish(false)} aria-label="Close the guide" className="-mr-1 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-white/[0.06]"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 overflow-y-auto px-4 pb-1 pt-2.5">
          <h2 id={titleId} className="text-[15px] font-bold leading-snug text-slate-950 dark:text-white">{title}</h2>
          <div className="mt-1.5 space-y-1.5 text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300" aria-live="polite">
            {String(body || "").split("\n").filter(Boolean).map((line, at) => <p key={at}><GlossaryText text={line} /></p>)}
          </div>
          {step.tryIt && (
            <p className={`mt-2.5 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold ${tried ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"}`}>
              {tried ? <Check className="h-3.5 w-3.5" /> : <MousePointerClick className="h-3.5 w-3.5" />}{tried ? "Nice, that's it!" : textOf(step.tryIt, ctx)}
            </p>
          )}
          {action && (
            <button type="button" onClick={() => finish(true, () => action.run(ctx))}
              className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-3 py-2 text-[12.5px] font-bold text-white shadow-sm hover:from-sky-700 hover:to-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2">
              <Sparkles className="h-3.5 w-3.5" />{action.label}
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2 border-t border-slate-100 px-4 py-2.5 dark:border-gray-800">
          <span className="text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">Step {index + 1} of {steps.length}</span>
          {!last && <button type="button" onClick={() => finish(false)} className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:underline dark:hover:text-slate-200">Skip</button>}
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-gray-700 dark:text-slate-200 dark:hover:bg-white/[0.05]">
              <ArrowLeft className="h-3.5 w-3.5" />Back
            </button>
            <button ref={nextRef} type="button" onClick={() => go(index + 1)}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-sky-600 px-3 text-[12px] font-bold text-white shadow-sm hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900">
              {last ? <>Finish<Check className="h-3.5 w-3.5" /></> : step.tryIt && !tried ? <>Skip this<ArrowRight className="h-3.5 w-3.5" /></> : <>Next<ArrowRight className="h-3.5 w-3.5" /></>}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
