import { motion, useReducedMotion } from "framer-motion";
import { CalendarRange, LayoutGrid, Sigma } from "lucide-react";
import { RANGE_PRESETS } from "../filterModel";
import { AREA_ICONS } from "./sectionStyles";
import { focusRing } from "./ui";

/**
 * The page header: feature tabs (Prep Coding, Learning…), the period, and the page actions
 * (`children`). Changing a tab or the period applies at once.
 */
export default function AnalysisHeader({ areas, area, onArea, period, onPeriod, children }) {
  const reduced = useReducedMotion();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/90">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-sky-700 text-white shadow-sm shadow-sky-600/30"><Sigma className="h-[18px] w-[18px]" /></span>
          <h1 className="text-[16px] font-bold tracking-tight text-slate-950 dark:text-white">Prep Analysis</h1>
        </div>
        <nav aria-label="Feature" className="flex max-w-full overflow-x-auto rounded-xl bg-slate-100 p-1 [scrollbar-width:none] dark:bg-white/[0.06]">
          {areas.map((entry) => {
            const Icon = AREA_ICONS[entry.key] || LayoutGrid;
            const active = entry.key === area;
            return (
              <button key={entry.key} type="button" aria-current={active ? "page" : undefined} onClick={() => onArea(entry.key)}
                className={`relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${active ? "text-sky-700 dark:text-sky-300" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"} ${focusRing}`}>
                {active && <motion.span layoutId="analysis-area" className="absolute inset-0 rounded-lg bg-white shadow-sm dark:bg-gray-800" transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38 }} />}
                {/* "Prep Coding" reads as "Coding" here: every tab is part of Prep. */}
                <Icon className="relative h-3.5 w-3.5" /><span className="relative">{entry.label.replace(/^Prep /, "")}</span>
              </button>
            );
          })}
        </nav>
        <label className="relative inline-flex items-center">
          <span className="sr-only">Period</span>
          <CalendarRange className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
          <select value={period} onChange={(event) => onPeriod(event.target.value)}
            className={`h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-[12.5px] font-semibold text-slate-700 hover:border-slate-300 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-200 ${focusRing}`}>
            {RANGE_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
          </select>
          <span className="pointer-events-none absolute right-2.5 text-[10px] text-slate-400" aria-hidden="true">▼</span>
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </header>
  );
}
