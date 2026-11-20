import { useCallback, useRef, useState } from "react";
import { BookOpenCheck, Check, ChevronRight, Compass, Info, Lightbulb, X, Zap } from "lucide-react";
import HoverCard from "../engine/HoverCard";
import FloatingPanel from "./FloatingPanel";
import { usePlatformGuide } from "./context";
import { guideIcon } from "./icons";
import { minutesFor, tourLengths } from "./buildPageGuide";

function TourChoice({ icon: Icon, title, detail, done, onClick, primary }) {
  return (
    <button type="button" onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${primary
        ? "border-sky-200 bg-sky-50/70 hover:border-sky-400 hover:bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40 dark:hover:border-sky-700"
        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-white/[0.04]"}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${primary ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300"}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-slate-900 dark:text-white">
          {title}
          {done && <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-px text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><Check className="h-3 w-3" />Done</span>}
        </span>
        <span className="block text-[11.5px] text-slate-500 dark:text-slate-400">{detail}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-sky-600" aria-hidden="true" />
    </button>
  );
}

/** The page panel: what the page is for, the quick / full tour, tips and words, and all guides. */
export function PageGuidePanel({ module, onClose }) {
  const guide = usePlatformGuide();
  const Icon = guideIcon(module.icon);
  const lengths = tourLengths(module);
  const explored = guide.modules.filter((entry) => guide.isExplored(entry.id)).length;
  const go = (mode) => { onClose(); guide.startModule(module.id, { mode }); };
  return (
    <>
      <div className="relative bg-gradient-to-br from-sky-50 via-white to-indigo-50/60 px-4 pb-3 pt-4 dark:from-sky-950/40 dark:via-gray-900 dark:to-indigo-950/30">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-2.5 top-2.5 rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-white/[0.06] dark:hover:text-slate-200"><X className="h-4 w-4" /></button>
        <div className="flex items-center gap-3 pr-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm"><Icon className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-sky-700 dark:text-sky-300">{module.area}</p>
            <h2 className="truncate text-[15px] font-bold text-slate-950 dark:text-white">{module.title}</h2>
          </div>
        </div>
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300">{module.summary}</p>
      </div>
      <div className="space-y-2 px-4 py-3">
        {module.delegate ? (
          <TourChoice icon={Compass} primary title="Start the page tour" detail="This page has its own guides, on every chart's ⓘ too" onClick={() => go("full")} />
        ) : (
          <>
            <TourChoice icon={Zap} primary title="Quick look" detail={`${lengths.quick} steps · about ${minutesFor(lengths.quick)} min`} done={guide.progress.completed.includes(`${module.id}:quick`)} onClick={() => go("quick")} />
            <TourChoice icon={Compass} title="Full tour" detail={`${lengths.full} steps · about ${minutesFor(lengths.full)} min · every part of the page`} done={guide.progress.completed.includes(module.id)} onClick={() => go("full")} />
          </>
        )}
      </div>
      {(module.tips?.length > 0 || module.terms?.length > 0) && (
        <div className="border-t border-slate-100 px-4 py-3 dark:border-gray-800">
          {module.tips?.length > 0 && (
            <>
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400"><Lightbulb className="h-3.5 w-3.5 text-amber-500" />Good to know</p>
              <ul className="mt-1.5 space-y-1">
                {module.tips.map((tip) => <li key={tip} className="flex gap-2 text-[12px] leading-relaxed text-slate-600 dark:text-slate-300"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />{tip}</li>)}
              </ul>
            </>
          )}
          {module.terms?.length > 0 && (
            <div className={module.tips?.length ? "mt-2.5" : ""}>
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">Words on this page</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {module.terms.map((entry) => (
                  <HoverCard key={entry.term} title={entry.term} body={entry.text}
                    className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11.5px] font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-700 dark:border-gray-600 dark:text-slate-200">
                    {entry.term}
                  </HoverCard>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <button type="button" onClick={() => { onClose(); guide.openCenter(); }}
        className="flex w-full items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-left text-[12px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 dark:border-gray-800 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:bg-white/[0.05]">
        <BookOpenCheck className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
        <span className="flex-1">All guides</span>
        <span className="tabular-nums text-slate-400">{explored}/{guide.modules.length} explored</span>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </>
  );
}

/**
 * The ⓘ next to a page title: opens the page panel (what the page is for, quick and full tours,
 * tips, words). A blue dot means this page's tour has not been taken yet. Shows nothing when the
 * page has no guide (or outside the platform guide provider).
 */
export default function PageGuideButton({ module: moduleId, className = "", size = "md" }) {
  const guide = usePlatformGuide();
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const module = moduleId ? guide?.modules.find((entry) => entry.id === moduleId) : guide?.current;
  if (!guide?.ready || !module) return null;
  const fresh = !guide.isExplored(module.id);
  const box = size === "sm" ? "h-6 w-6" : "h-7 w-7";
  return (
    <>
      <button ref={ref} type="button" onClick={() => { guide.hideNudge(); setOpen((value) => !value); }} data-guide="page-guide"
        aria-label={`About ${module.title} and its guided tour`} aria-expanded={open} aria-haspopup="dialog"
        title={`About ${module.title} · guided tour`}
        className={`relative inline-flex ${box} shrink-0 items-center justify-center rounded-full border align-middle transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${open
          ? "border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-600 dark:bg-sky-950/60 dark:text-sky-300"
          : "border-slate-200 bg-white text-slate-500 hover:border-sky-300 hover:text-sky-700 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-400 dark:hover:border-sky-700 dark:hover:text-sky-300"} ${className}`}>
        <Info className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
        {fresh && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-sky-500 dark:border-gray-900" aria-hidden="true" />}
      </button>
      {open && <FloatingPanel anchor={ref.current} onClose={close} label={`About ${module.title}`}><PageGuidePanel module={module} onClose={close} /></FloatingPanel>}
    </>
  );
}
