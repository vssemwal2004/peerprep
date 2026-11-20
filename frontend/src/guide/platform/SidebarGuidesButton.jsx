import { Compass } from "lucide-react";
import { usePlatformGuide } from "./context";

/**
 * "Guides" in the sidebar footer (every role): opens the Guides list. Shows how many pages were
 * explored; a dot when the current page's tour has not been taken yet.
 */
export default function SidebarGuidesButton({ isExpanded, compact = false }) {
  const guide = usePlatformGuide();
  if (!guide?.ready || !guide.modules.length) return null;
  const listed = guide.modules.filter((module) => !module.hidden);
  const explored = listed.filter((module) => guide.isExplored(module.id)).length;
  const fresh = guide.current && !guide.isExplored(guide.current.id);
  return (
    <button type="button" onClick={guide.openCenter} data-guide="app-guides"
      aria-label={`Guides: step-by-step tours, ${explored} of ${listed.length} pages explored`}
      title={isExpanded ? undefined : "Guides"}
      className={`relative mb-1 flex h-10 w-full items-center overflow-hidden rounded-xl text-left transition hover:bg-sky-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-sky-950/40 ${compact ? "" : ""}`}>
      <span className="absolute left-2 flex h-9 w-9 items-center justify-center rounded-xl text-sky-700 dark:text-sky-300">
        <Compass className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />
        {fresh && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-sky-500 ring-2 ring-white dark:ring-gray-900" aria-hidden="true" />}
      </span>
      <span className={`ml-14 flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap pr-3 transition-[opacity,transform] duration-200 ${isExpanded ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-1 opacity-0"}`}>
        <span className="flex-1 truncate text-[13px] font-semibold text-slate-700 dark:text-gray-200">Guides</span>
        <span className="rounded-full bg-sky-50 px-1.5 py-px text-[10.5px] font-bold tabular-nums text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">{explored}/{listed.length}</span>
      </span>
    </button>
  );
}
