import { AnviTile } from "./ui";

/** A small authoring identity, shared by topic editors and interview summaries. */
// Shows the ANVI mark and wordmark as on the student ANVI pages; the AnnuBrand name is kept for existing imports.
export function AnnuBrand({ compact = false, icon = true, className = "" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap align-middle ${className}`}
    >
      {icon && <AnviTile size={compact ? "sm" : "md"} />}
      <span
        className={`inline-flex items-center gap-1.5 font-bold ${compact ? "text-xs" : "text-sm"}`}
      >
        <span className="bg-gradient-to-r from-violet-700 to-fuchsia-600 bg-clip-text tracking-[0.12em] text-transparent dark:from-violet-300 dark:to-fuchsia-300 forced-colors:text-[CanvasText]">
          ANVI
        </span>{" "}
        <span className="rounded border border-violet-200 bg-violet-50 px-1 py-0.5 text-[9px] font-bold leading-none tracking-wide text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
          AI
        </span>
      </span>
    </span>
  );
}
export { AnnuBrand as AnviBrand };
