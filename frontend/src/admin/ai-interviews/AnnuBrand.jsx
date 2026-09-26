import { Sparkles } from "lucide-react";

/** A small authoring identity, shared by topic editors and interview summaries. */
export function AnnuBrand({ compact = false, icon = true, className = "" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap align-middle ${className}`}
    >
      {icon && (
        <span
          aria-hidden="true"
          className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm ${compact ? "h-6 w-6" : "h-8 w-8"}`}
        >
          <Sparkles size={compact ? 13 : 17} strokeWidth={1.8} />
        </span>
      )}
      <span
        className={`inline-flex items-center gap-1.5 font-semibold ${compact ? "text-xs" : "text-sm"}`}
      >
        <span className="bg-gradient-to-r from-sky-700 to-indigo-700 bg-clip-text tracking-[0.12em] text-transparent dark:from-sky-300 dark:to-indigo-300 forced-colors:text-[CanvasText]">
          ANNU
        </span>{" "}
        <span className="rounded border border-indigo-100 bg-indigo-50 px-1 py-0.5 text-[9px] font-bold leading-none tracking-wide text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
          AI
        </span>
      </span>
    </span>
  );
}
