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
      className={`group relative flex h-9 w-full items-center overflow-hidden rounded-xl text-left transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-white/[0.06] ${compact ? "" : ""}`}>
      <span className="absolute left-2 flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors group-hover:text-sky-700 dark:text-zinc-400 dark:group-hover:text-sky-300">
        <Compass className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />
        {fresh && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-sky-500 ring-2 ring-white dark:ring-[#202020]" aria-hidden="true" />}
      </span>
      <span className={`ml-14 flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap pr-3 transition-[opacity,transform] duration-200 ${isExpanded ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-1 opacity-0"}`}>
        <span className="flex-1 truncate text-[13px] font-medium text-slate-600 dark:text-zinc-300">Guides</span>
        <span className="rounded-full bg-sky-50 px-1.5 py-px text-[10.5px] font-bold tabular-nums text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">{explored}/{listed.length}</span>
      </span>
    </button>
  );
}
