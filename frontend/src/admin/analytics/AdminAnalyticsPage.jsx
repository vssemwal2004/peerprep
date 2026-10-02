import { useCallback, useMemo, useState } from "react";
import { AlertCircle, BarChart3, Filter, Info, Loader2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { createDefaultAnalyticsQuery, countActiveFilters, removeScopeFilter } from "./analyticsQuery";
import { getVisibleGraphs } from "./graphRegistry";
import { useAdminAnalytics } from "./hooks/useAdminAnalytics";
import ActiveScopeBar from "./components/ActiveScopeBar";
import AnalyticsHeader from "./components/AnalyticsHeader";
import ExportBuilder from "./components/ExportBuilder";
import FilterDrawer from "./components/FilterDrawer";
import GraphCard from "./components/GraphCard";
import SummaryCards from "./components/SummaryCards";

function buildInitialQuery() {
  const query = createDefaultAnalyticsQuery();
  if (typeof window === "undefined") return query;
  const params = new URLSearchParams(window.location.search);
  const assessmentIds = params.get("assessmentIds")?.split(",").filter(Boolean) || [];
  if (assessmentIds.length) { query.activity.assessmentIds = assessmentIds; query.activity.sources = ["assessments"]; }
  if (params.get("source") === "coding") query.activity.sources = ["coding"];
  return query;
}

function LoadingCanvas() {
  return <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900" />)}</div><div className="grid gap-3 xl:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className={`h-80 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900 ${item === 0 ? "xl:col-span-2" : ""}`} />)}</div></div>;
}

function EmptyCanvas({ onFilters }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center dark:border-gray-700 dark:bg-gray-900"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-900/30"><BarChart3 className="h-5 w-5" /></div><h2 className="mt-3 text-sm font-bold text-slate-900 dark:text-white">No eligible graph evidence</h2><p className="mx-auto mt-1.5 max-w-md text-xs leading-5 text-slate-500 dark:text-gray-400">Broaden the date range or choose a source with qualifying evidence. Missing signals are intentionally not shown as zero.</p><button type="button" onClick={onFilters} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-sky-600 px-3.5 text-xs font-semibold text-white"><Filter className="h-3.5 w-3.5" /> Adjust filters</button></div>;
}

export default function AdminAnalyticsPage() {
  const initialQuery = useMemo(buildInitialQuery, []);
  const { query, data, loading, refreshing, error, apply, refresh } = useAdminAnalytics(initialQuery);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const visibleGraphs = useMemo(() => getVisibleGraphs({ mode: query.graphs.mode, selectedIds: query.graphs.selectedIds, graphs: data?.graphs || [] }), [data?.graphs, query.graphs.mode, query.graphs.selectedIds]);
  const activeCount = countActiveFilters(query);
  const applyAndClose = useCallback((next) => { setFiltersOpen(false); apply(next); }, [apply]);
  const removeFilter = (key) => apply(removeScopeFilter(query, key));
  return <main className="min-h-full bg-slate-50 text-slate-900 dark:bg-gray-950 dark:text-white">
    <AnalyticsHeader meta={data?.meta} activeFilterCount={activeCount} refreshing={refreshing} onRefresh={refresh} onFilters={() => setFiltersOpen(true)} onExport={() => setExportOpen(true)} />
    <div className="space-y-3 px-3 py-3 sm:px-4 lg:px-5">
      <ActiveScopeBar query={query} meta={data?.meta} onRemove={removeFilter} onClear={() => apply(createDefaultAnalyticsQuery())} />
      {loading && !data ? <LoadingCanvas /> : error && !data ? <section className="rounded-xl border border-rose-200 bg-white p-6 text-center dark:border-rose-900/50 dark:bg-gray-900"><AlertCircle className="mx-auto h-6 w-6 text-rose-500" /><h2 className="mt-2 text-sm font-bold">Analysis could not be loaded</h2><p className="mx-auto mt-1.5 max-w-xl text-xs leading-5 text-slate-500">{error.status === 404 ? "The analytics service is not available on this server yet. Restart the backend after deploying the V2 API." : error.message}</p><button type="button" onClick={refresh} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3.5 text-xs font-semibold text-white dark:bg-sky-500 dark:text-slate-950"><RefreshCw className="h-3.5 w-3.5" /> Try again</button></section> : <>
        {(data?.summary || []).length > 0 && <section aria-labelledby="analysis-summary-title"><div className="mb-2 px-0.5"><h2 id="analysis-summary-title" className="text-xs font-bold text-slate-900 dark:text-white">Executive snapshot</h2><p className="mt-0.5 text-[10px] text-slate-400">The most important outcomes for the currently selected students and evidence.</p></div><SummaryCards items={data.summary} /></section>}
        {(error || data?.meta?.warnings?.length > 0) && <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-4 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><div><strong className="block text-xs">Evidence notes</strong>{[error ? `Refresh failed; showing the last successful result. ${error.message}` : null, ...(data?.meta?.warnings || [])].filter(Boolean).join(" · ")}</div></div>}
        {visibleGraphs.length ? <section aria-label="Analytics graphs"><div className="mb-2 flex flex-wrap items-end justify-between gap-2 px-0.5"><div><h2 className="text-xs font-bold text-slate-900 dark:text-white">Evidence visualizations</h2><p className="mt-0.5 text-[10px] text-slate-400">Each card explains its question, axes and unit. Open a graph for detailed inspection.</p></div><span className="rounded-md bg-white px-2 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200 dark:bg-gray-900 dark:ring-gray-800">{visibleGraphs.length} relevant graphs</span></div><div className="grid items-start gap-3 xl:grid-cols-2 2xl:grid-cols-3">{visibleGraphs.map((item, index) => <GraphCard key={item.definition.id} item={item} index={index} />)}</div></section> : <EmptyCanvas onFilters={() => setFiltersOpen(true)} />}
        <section className="grid gap-3 lg:grid-cols-3"><div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" /><div><h3 className="text-xs font-bold">Evidence protected</h3><p className="mt-0.5 text-[11px] leading-4 text-slate-400">Minimum-evidence rules keep small samples from appearing authoritative.</p></div></div><div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"><Sparkles className="h-4 w-4 shrink-0 text-violet-600" /><div><h3 className="text-xs font-bold">Dynamic recommendations</h3><p className="mt-0.5 text-[11px] leading-4 text-slate-400">Only visualizations valid for the current source and taxonomy are shown.</p></div></div><div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"><Info className="h-4 w-4 shrink-0 text-sky-600" /><div><h3 className="text-xs font-bold">Methodology attached</h3><p className="mt-0.5 text-[11px] leading-4 text-slate-400">{data?.meta?.formulaVersion ? `Calculated with ${data.meta.formulaVersion}.` : "Formula version appears after evidence is loaded."}</p></div></div></section>
      </>}
    </div>
    {(loading || refreshing) && data && <div className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white shadow-xl dark:bg-sky-500 dark:text-slate-950"><Loader2 className="h-4 w-4 animate-spin" /> Refreshing evidence</div>}
    <FilterDrawer open={filtersOpen} query={query} serverGraphs={data?.graphs || []} onClose={() => setFiltersOpen(false)} onApply={applyAndClose} />
    <ExportBuilder open={exportOpen} onClose={() => setExportOpen(false)} query={query} meta={data?.meta} visibleGraphs={visibleGraphs} />
  </main>;
}
