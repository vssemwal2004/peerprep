import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Compass, X } from "lucide-react";
import { guideIcon } from "./icons";
import { minutesFor, tourLengths } from "./buildPageGuide";

/**
 * The one-time "new here?" tip in the corner of a page whose tour has not been taken. Never
 * blocks the page; Not now (or the ×) hides it for this page, "Turn off these tips" for all pages.
 */
export default function GuideNudge({ module, onStart, onLater, onTurnOff }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(frame); }, []);
  const Icon = guideIcon(module.icon);
  const steps = tourLengths(module).quick;
  return createPortal(
    <aside role="status" aria-label={`Tour of ${module.title}`}
      className={`fixed bottom-4 right-4 z-[8500] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.22)] transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:border-gray-700 dark:bg-gray-900 dark:shadow-black/50 ${shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}>
      <div className="h-1 bg-gradient-to-r from-sky-500 to-indigo-500" aria-hidden="true" />
      <div className="flex gap-3 px-4 pb-3 pt-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm"><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-sky-700 dark:text-sky-300">New here?</p>
          <p className="text-[14px] font-bold leading-snug text-slate-950 dark:text-white">Take a quick tour of {module.title}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">{steps} short steps · about {minutesFor(steps)} min. See what each part does.</p>
        </div>
        <button type="button" onClick={onLater} aria-label="Not now" className="-mr-1.5 -mt-1 h-7 w-7 shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-white/[0.06]"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5 dark:border-gray-800">
        <button type="button" onClick={onTurnOff} className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:underline dark:hover:text-slate-200">Turn off these tips</button>
        <div className="ml-auto flex gap-1.5">
          <button type="button" onClick={onLater} className="h-8 rounded-lg border border-slate-200 px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-gray-700 dark:text-slate-200 dark:hover:bg-white/[0.05]">Not now</button>
          <button type="button" onClick={onStart} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-[12px] font-bold text-white shadow-sm hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"><Compass className="h-3.5 w-3.5" aria-hidden="true" />Start tour</button>
        </div>
      </div>
    </aside>,
    document.body,
  );
}
