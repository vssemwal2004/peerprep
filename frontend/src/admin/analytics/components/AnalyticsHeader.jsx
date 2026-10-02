import { BarChart3, ChevronRight, Download, Filter, RefreshCw } from "lucide-react";

function formatTimestamp(value) {
  if (!value) return "Not refreshed yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return `Updated ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

const MODE_LABELS = { overview: "Overview", coding: "Coding", assessments: "Assessments", learning: "Learning", students: "Students" };

export default function AnalyticsHeader({ meta, analysisMode = "overview", activeFilterCount, refreshing, onRefresh, onFilters, onExport }) {
  const modeLabel = MODE_LABELS[analysisMode] || "Overview";
  return (
    <header data-page-header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900 sm:px-5 lg:px-6">
      <div className="mx-auto flex min-h-16 w-full max-w-[1680px] items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400"><BarChart3 className="h-3.5 w-3.5" /> Admin <ChevronRight className="h-3 w-3" /> <span className="text-slate-600 dark:text-gray-300">Analysis</span><ChevronRight className="h-3 w-3" /><span className="font-semibold text-sky-700 dark:text-sky-300">{modeLabel}</span><span className="hidden sm:inline">· {formatTimestamp(meta?.generatedAt)}</span>{Number.isFinite(meta?.cohortSize) && <span className="hidden lg:inline">· {meta.cohortSize.toLocaleString()} students</span>}</div>
          <h1 className="mt-0.5 truncate text-lg font-bold leading-tight text-slate-950 dark:text-white">{modeLabel} analysis</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onRefresh} disabled={refreshing} className="hidden h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 sm:inline-flex">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button type="button" onClick={onFilters} className="relative inline-flex h-9 items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
            <Filter className="h-3.5 w-3.5" /> Filters
            {activeFilterCount > 0 && <span className="rounded-full bg-sky-700 px-1.5 py-0.5 text-[10px] text-white">{activeFilterCount}</span>}
          </button>
          <button type="button" onClick={onExport} className="inline-flex h-9 items-center gap-2 rounded-lg bg-sky-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-500">
            <Download className="h-3.5 w-3.5" /> Download
          </button>
        </div>
      </div>
    </header>
  );
}
