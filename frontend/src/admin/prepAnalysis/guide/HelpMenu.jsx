import { useRef, useState } from "react";
import { BookOpen, Check, Compass, ListChecks, Map as MapIcon, Sigma } from "lucide-react";
import { Button, Popover, focusRing } from "../components/ui";
import { CHECKLIST } from "./checklist";
import { PAGE_TOUR_ID, buildPageTour } from "./content/page";
import { ChecklistItems } from "./GettingStarted";
import { chartGuideId, hasWhatsNew, whatsNewId } from "./buildGuide";
import { useTour } from "./tourContext";

/** Scrolls a chart into view and opens its ⓘ guide menu. */
function openChartGuide(chartId) {
  const card = document.querySelector(`[data-chart-id="${CSS.escape(chartId)}"]`);
  if (!card) return;
  card.scrollIntoView({ block: "center", behavior: "smooth" });
  setTimeout(() => card.querySelector('[aria-label^="Guide:"]')?.click(), 450);
}

/**
 * The header's Guide button: the page tour, the getting-started checklist, how Prep Score works,
 * and every chart's guide on this page (✓ done, "New" when it changed).
 */
export default function HelpMenu({ charts = [], onScoreHelp, onOpenFilters }) {
  const tour = useTour();
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  if (!tour) return null;
  const done = new Set(tour.progress.milestones);
  const count = CHECKLIST.filter((item) => done.has(item.key)).length;
  const close = (then) => () => { setOpen(false); if (then) setTimeout(then, 80); };
  const row = `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/[0.06] ${focusRing}`;
  return (
    <>
      <span ref={anchorRef} className="inline-flex" data-tour="help">
        <Button onClick={() => setOpen(true)} title="Guides and help" aria-label="Guides and help">
          <Compass className="h-3.5 w-3.5" /><span className="hidden xl:inline">Guide</span>
          {count < CHECKLIST.length && <span className="rounded-full bg-sky-100 px-1.5 text-[10px] font-bold tabular-nums text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">{count}/{CHECKLIST.length}</span>}
        </Button>
      </span>
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} minWidth={340} maxHeight={560} label="Guides and help">
        <div className="w-[340px] p-2">
          <button type="button" className={row} onClick={close(() => tour.start(buildPageTour()))}>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"><MapIcon className="h-4 w-4" /></span>
            <span className="flex-1">Page tour<span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">2 minutes: where everything is</span></span>
            {tour.isDone(PAGE_TOUR_ID) && <Check className="h-4 w-4 text-emerald-500" />}
          </button>
          {onScoreHelp && (
            <button type="button" className={row} onClick={close(onScoreHelp)}>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><Sigma className="h-4 w-4" /></span>
              <span className="flex-1">How Prep Score works<span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">The formula behind every score</span></span>
            </button>
          )}
          <div className="mt-1.5 rounded-xl border border-slate-100 dark:border-gray-800">
            <div className="flex items-center gap-2 px-3 pt-2.5">
              <ListChecks className="h-4 w-4 text-emerald-600" />
              <p className="flex-1 text-[12px] font-bold text-slate-900 dark:text-white">Getting started · {count} of {CHECKLIST.length}</p>
              {tour.progress.checklistDismissed && count < CHECKLIST.length && (
                <button type="button" onClick={() => tour.dismissChecklist(false)} className="text-[11px] font-semibold text-sky-700 hover:underline dark:text-sky-300">Show on page</button>
              )}
            </div>
            <ChecklistItems done={done} actions={{ pageTour: close(() => tour.start(buildPageTour())), filter: onOpenFilters ? close(onOpenFilters) : undefined }} />
          </div>
          {charts.length > 0 && (
            <div className="mt-1.5">
              <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400"><BookOpen className="h-3.5 w-3.5" />Chart guides on this page</p>
              <ul>
                {charts.map((chart) => {
                  const fresh = hasWhatsNew(chart.id) && !tour.isDone(whatsNewId(chart.id));
                  const finished = tour.isDone(chartGuideId(chart.id));
                  return (
                    <li key={chart.id}>
                      <button type="button" className={`${row} py-1.5 font-medium`} onClick={close(() => openChartGuide(chart.id))}>
                        <span className="min-w-0 flex-1 truncate">{chart.title}</span>
                        {fresh && <span className="rounded-full bg-amber-500 px-1.5 text-[9px] font-black uppercase text-white">New</span>}
                        {finished ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label="Done" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-label="Not taken yet" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </Popover>
    </>
  );
}
