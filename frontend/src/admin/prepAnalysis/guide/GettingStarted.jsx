import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, ChevronUp, Compass, PartyPopper, X } from "lucide-react";
import { CHECKLIST } from "./checklist";
import { PAGE_TOUR_ID, buildPageTour } from "./content/page";
import { useTour } from "./tourContext";

const openFirstChartGuide = () => document.querySelector('[data-chart-id] [aria-label^="Guide:"]')?.click();

/**
 * Bottom-right corner: on an admin's first visit, a welcome card offering the page tour; after
 * that, the getting-started checklist until every step is done or the admin closes it.
 */
export default function GettingStarted({ onOpenFilters }) {
  const tour = useTour();
  const reduced = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  if (!tour?.progress.loaded || tour.running) return null;
  const { progress } = tour;
  const done = new Set(progress.milestones);
  const count = CHECKLIST.filter((item) => done.has(item.key)).length;
  const showWelcome = !progress.welcomeDismissed && !progress.completed.includes(PAGE_TOUR_ID);
  const showChecklist = !showWelcome && !progress.checklistDismissed && count < CHECKLIST.length;
  const startTour = () => { tour.dismissWelcome(); tour.start(buildPageTour()); };
  const actions = { pageTour: () => tour.start(buildPageTour()), filter: onOpenFilters, chartGuide: openFirstChartGuide };
  const motionProps = reduced ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 16 } };

  return (
    <AnimatePresence>
      {showWelcome && (
        <motion.aside key="welcome" {...motionProps} className="fixed bottom-5 right-5 z-[60] w-[330px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.22)] dark:border-gray-700 dark:bg-gray-900" aria-label="Welcome to Prep Analysis">
          <div className="bg-gradient-to-br from-sky-500 to-indigo-600 px-4 py-3.5 text-white">
            <div className="flex items-start justify-between gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20"><Compass className="h-5 w-5" /></span>
              <button type="button" onClick={tour.dismissWelcome} aria-label="Close" className="rounded-lg p-1 text-white/80 hover:bg-white/15 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-2 text-[15px] font-bold">New to Prep Analysis?</p>
            <p className="text-[12px] text-white/85">A 2-minute tour shows where everything is and how to find the students who need you.</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-3">
            <button type="button" onClick={startTour} className="flex-1 rounded-xl bg-sky-600 px-3 py-2 text-[12.5px] font-bold text-white shadow-sm hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2">Take the tour</button>
            <button type="button" onClick={tour.dismissWelcome} className="rounded-xl px-3 py-2 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]">Not now</button>
          </div>
        </motion.aside>
      )}
      {showChecklist && (
        <motion.aside key="checklist" {...motionProps} className="fixed bottom-5 right-5 z-[60] w-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.2)] dark:border-gray-700 dark:bg-gray-900" aria-label="Getting started">
          <div className="flex items-center gap-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-slate-900 dark:text-white">Getting started</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{count} of {CHECKLIST.length} done</p>
            </div>
            <button type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Show the checklist" : "Hide the checklist"} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.06]">{collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
            <button type="button" onClick={() => tour.dismissChecklist(true)} aria-label="Close the checklist" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.06]"><X className="h-4 w-4" /></button>
          </div>
          <div className="h-1 bg-slate-100 dark:bg-white/[0.06]"><div className="h-full bg-gradient-to-r from-emerald-400 to-sky-500 transition-[width] duration-500" style={{ width: `${(count / CHECKLIST.length) * 100}%` }} /></div>
          {!collapsed && <ChecklistItems done={done} actions={actions} />}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export function ChecklistItems({ done, actions = {} }) {
  const allDone = CHECKLIST.every((item) => done.has(item.key));
  return (
    <ul className="space-y-0.5 p-2">
      {CHECKLIST.map((item) => {
        const ticked = done.has(item.key);
        const action = actions[item.key];
        const row = (
          <>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${ticked ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 dark:border-gray-600"}`}>{ticked && <Check className="h-3 w-3" strokeWidth={3} />}</span>
            <span className="min-w-0 flex-1">
              <span className={`block text-[12.5px] font-semibold ${ticked ? "text-slate-400 line-through dark:text-slate-500" : "text-slate-800 dark:text-slate-100"}`}>{item.title}</span>
              {!ticked && <span className="block text-[11px] text-slate-500 dark:text-slate-400">{item.hint}</span>}
            </span>
          </>
        );
        return (
          <li key={item.key}>
            {action && !ticked
              ? <button type="button" onClick={action} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-white/[0.04]">{row}</button>
              : <div className="flex items-start gap-2.5 px-2 py-1.5">{row}</div>}
          </li>
        );
      })}
      {allDone && <li className="flex items-center gap-2 px-2 py-1.5 text-[12px] font-semibold text-emerald-700 dark:text-emerald-300"><PartyPopper className="h-4 w-4" />All set: you know Prep Analysis.</li>}
    </ul>
  );
}
