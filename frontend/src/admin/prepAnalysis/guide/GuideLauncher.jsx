import { useRef, useState } from "react";
import { Check, Compass, Info, Rocket, Sparkles, Zap } from "lucide-react";
import { Popover, focusRing } from "../components/ui";
import GlossaryText from "./GlossaryText";
import { buildChartGuide, buildWhatsNewGuide, chartGuideId, countedText, guideLengths, hasWhatsNew, whatsNewId } from "./buildGuide";
import { useTour } from "./tourContext";

const minutes = (steps) => Math.max(1, Math.round(steps * 0.2));

/**
 * The chart's ⓘ button: what the chart answers, how it is counted, and its guides (Quick look,
 * Deep dive, What's new). A dot marks a guide not taken yet; "New" marks unseen what's-new notes.
 * Without the guide controller (an embedded report) it is the plain hover hint it used to be.
 */
export default function GuideLauncher({ chart, ctx }) {
  const tour = useTour();
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  if (!tour) {
    return <span className="shrink-0 text-slate-300 hover:text-slate-500 dark:text-slate-600" title={chart.question} aria-label={chart.question} data-own-clicks><Info className="h-3.5 w-3.5" /></span>;
  }
  const done = tour.isDone(chartGuideId(chart.id));
  const fresh = hasWhatsNew(chart.id) && !tour.isDone(whatsNewId(chart.id));
  const context = ctx();
  const lengths = open ? guideLengths(chart, context) : null;
  const counted = countedText(chart.id);
  const run = (build) => { setOpen(false); const guide = build(ctx()); if (guide) setTimeout(() => tour.start(guide), 60); };
  const option = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04] " + focusRing;
  return (
    <>
      <span ref={anchorRef} className="relative inline-flex shrink-0" data-own-clicks>
        <button type="button" onClick={() => setOpen(true)} aria-label={`Guide: ${chart.title}`} title="How to read this chart"
          className={`flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:text-slate-500 dark:hover:bg-sky-500/10 dark:hover:text-sky-300 ${focusRing}`}>
          <Info className="h-3.5 w-3.5" />
        </button>
        {fresh ? <span className="pointer-events-none absolute -right-2.5 -top-2 rounded-full bg-amber-500 px-1 text-[8.5px] font-black uppercase leading-[13px] text-white shadow-sm">New</span>
          : !done && <span className="pointer-events-none absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-sky-500 ring-2 ring-white dark:ring-gray-900" aria-hidden="true" />}
      </span>
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} minWidth={320} maxHeight={520} label={`${chart.title} guide`}>
        <div className="w-[320px] p-3">
          <p className="text-[13px] font-bold text-slate-900 dark:text-white">{chart.title}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-600 dark:text-slate-300"><GlossaryText text={chart.question} /></p>
          {counted && (
            <div className="mt-2.5 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">How it is counted</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-700 dark:text-slate-200"><GlossaryText text={counted} /></p>
            </div>
          )}
          <div className="mt-2.5 space-y-1">
            {fresh && (
              <button type="button" className={option} onClick={() => run((current) => buildWhatsNewGuide(chart, current))}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"><Sparkles className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block text-[12.5px] font-semibold text-slate-900 dark:text-white">What's new</span><span className="block text-[11px] text-slate-500 dark:text-slate-400">What changed in this chart</span></span>
                <span className="rounded-full bg-amber-500 px-1.5 text-[9.5px] font-black uppercase text-white">New</span>
              </button>
            )}
            <button type="button" className={option} onClick={() => run((current) => buildChartGuide(chart, "quick", current))}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"><Zap className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-[12.5px] font-semibold text-slate-900 dark:text-white">Quick look</span><span className="block text-[11px] text-slate-500 dark:text-slate-400">{lengths ? `${lengths.quick} steps · about ${minutes(lengths.quick)} min` : ""} · the essentials</span></span>
            </button>
            <button type="button" className={option} onClick={() => run((current) => buildChartGuide(chart, "deep", current))}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><Compass className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-[12.5px] font-semibold text-slate-900 dark:text-white">Deep dive</span><span className="block text-[11px] text-slate-500 dark:text-slate-400">{lengths ? `${lengths.deep} steps · about ${minutes(lengths.deep)} min` : ""} · every part, step by step</span></span>
              {done && <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Done" />}
            </button>
          </div>
          {!context.root && <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500"><Rocket className="h-3.5 w-3.5" />Open the chart on the page to take its guide.</p>}
        </div>
      </Popover>
    </>
  );
}
