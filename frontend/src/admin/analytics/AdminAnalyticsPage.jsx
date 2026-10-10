import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, Filter, Loader2, RefreshCw } from "lucide-react";
import { createDefaultAnalyticsQuery, countActiveFilters, removeScopeFilter } from "./analyticsQuery";
import { getVisibleGraphs } from "./graphRegistry";
import { useAdminAnalytics } from "./hooks/useAdminAnalytics";
import ActiveScopeBar from "./components/ActiveScopeBar";
import AnalyticsHeader from "./components/AnalyticsHeader";
import ExportBuilder from "./components/ExportBuilder";
import FilterDrawer from "./components/FilterDrawer";
import GraphCard from "./components/GraphCard";
import SummaryCards from "./components/SummaryCards";
import ActionableInsightsPanel from "./components/ActionableInsightsPanel";
import { useUniversityPolicy } from '../../platform/UniversityPolicyContext';

const GraphDetailModal = lazy(() => import("./components/GraphDetailModal"));

function buildInitialQuery() {
  const query = createDefaultAnalyticsQuery();
  if (typeof window === "undefined") return query;
  const params = new URLSearchParams(window.location.search);
  const assessmentIds = params.get("assessmentIds")?.split(",").filter(Boolean) || [];
  if (assessmentIds.length) { query.activity.assessmentIds = assessmentIds; query.activity.sources = ["assessments"]; query.analysisType = "assessments"; }
  if (params.get("source") === "coding") { query.activity.sources = ["coding"]; query.analysisType = "coding"; }
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
  const { permissions: platformPermissions } = useUniversityPolicy();
  const allowedSources = useMemo(() => platformPermissions && [
    ...(platformPermissions.questions ? ['coding'] : []),
    ...(platformPermissions.assessments ? ['assessments'] : []),
    ...(platformPermissions.learning ? ['learning'] : []),
  ], [platformPermissions]);
  useEffect(() => {
    if (!allowedSources?.length) return;
    const sources = (query.activity.sources || []).filter((source) => allowedSources.includes(source));
    const type = query.analysisType;
    if (sources.length !== query.activity.sources.length ||
      (['coding', 'assessments', 'learning'].includes(type) && !allowedSources.includes(type))) {
      apply({ ...query, analysisType: allowedSources.includes(type) ? type : 'overview',
        activity: { ...query.activity, sources: sources.length ? sources : allowedSources } });
    }
  }, [allowedSources, apply, query]);
  const applyScoped = useCallback((next) => {
    if (!allowedSources?.length) return apply(next);
    const sources = next.activity.sources.filter((source) => allowedSources.includes(source));
    return apply({ ...next, analysisType: ['coding', 'assessments', 'learning'].includes(next.analysisType) && !allowedSources.includes(next.analysisType)
      ? 'overview' : next.analysisType, activity: { ...next.activity, sources: sources.length ? sources : allowedSources } });
  }, [allowedSources, apply]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [detailGraph, setDetailGraph] = useState(null);
  const serverMode = data?.meta?.analysisType === "assessment" ? "assessments" : data?.meta?.analysisType;
  const queryMode = query.analysisType === "assessment" ? "assessments" : query.analysisType;
  const analysisMode = serverMode || queryMode || "overview";
  const visibleGraphs = useMemo(() => getVisibleGraphs({ mode: query.graphs.mode, selectedIds: query.graphs.selectedIds, graphs: data?.graphs || [], analysisMode, limit: 4 }), [analysisMode, data?.graphs, query.graphs.mode, query.graphs.selectedIds]);
  const activeCount = countActiveFilters(query);
  const applyAndClose = useCallback((next) => { setFiltersOpen(false); applyScoped(next); }, [applyScoped]);
  const removeFilter = (key) => applyScoped(removeScopeFilter(query, key));
  return <main className="min-h-full bg-white font-['Manrope',ui-sans-serif,system-ui,sans-serif] text-slate-900 dark:bg-gray-950 dark:text-white">
    <AnalyticsHeader meta={data?.meta} analysisMode={analysisMode} activeFilterCount={activeCount} refreshing={refreshing} onRefresh={refresh} onFilters={() => setFiltersOpen(true)} onExport={() => setExportOpen(true)} />
    <div className="mx-auto w-full max-w-[1680px] space-y-3 px-3 py-3 sm:px-4 lg:px-5">
      <ActiveScopeBar query={query} meta={data?.meta} analysisMode={analysisMode} onRemove={removeFilter} onClear={() => { const next = createDefaultAnalyticsQuery(); next.analysisType = analysisMode; next.activity.sources = { overview: ["coding", "assessments", "learning"], coding: ["coding"], assessments: ["assessments"], learning: ["learning"], students: ["coding", "assessments", "learning"] }[analysisMode] || ["coding", "assessments", "learning"]; applyScoped(next); }} />
      {loading && !data ? <LoadingCanvas /> : error && !data ? <section className="rounded-xl border border-rose-200 bg-white p-6 text-center dark:border-rose-900/50 dark:bg-gray-900"><AlertCircle className="mx-auto h-6 w-6 text-rose-500" /><h2 className="mt-2 text-sm font-bold">Analysis could not be loaded</h2><p className="mx-auto mt-1.5 max-w-xl text-xs leading-5 text-slate-500">{error.status === 404 ? "The analytics service is not available on this server yet. Restart the backend after deploying the V2 API." : error.message}</p><button type="button" onClick={refresh} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3.5 text-xs font-semibold text-white dark:bg-sky-500 dark:text-slate-950"><RefreshCw className="h-3.5 w-3.5" /> Try again</button></section> : <>
        {(data?.summary || []).length > 0 && <section aria-labelledby="analysis-summary-title"><div className="mb-2 px-0.5"><h2 id="analysis-summary-title" className="text-sm font-bold text-slate-900 dark:text-white">Executive snapshot</h2><p className="mt-0.5 text-xs text-slate-500">The most important outcomes for the currently selected students and evidence.</p></div><SummaryCards items={data.summary} /></section>}
        {(error || data?.meta?.warnings?.length > 0) && <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-4 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><div><strong className="block text-xs">Evidence notes</strong>{[error ? `Refresh failed; showing the last successful result. ${error.message}` : null, ...(data?.meta?.warnings || [])].filter(Boolean).join(" · ")}</div></div>}
        <ActionableInsightsPanel intelligence={data?.intelligence} />
        {visibleGraphs.length ? <section aria-label="Analytics graphs"><div className="mb-2 flex flex-wrap items-end justify-between gap-2 px-0.5"><div><h2 className="text-sm font-bold text-slate-900 dark:text-white">Recommended for {analysisMode}</h2><p className="mt-0.5 text-xs text-slate-500">Up to four evidence-valid questions, selected automatically for this mode and filter scope.</p></div><span className="rounded-md bg-white px-2 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200 dark:bg-gray-900 dark:ring-gray-800">{visibleGraphs.length} relevant charts</span></div><div className="grid items-start gap-3 xl:grid-cols-2">{visibleGraphs.map((item) => <GraphCard key={item.definition.id} item={item} onExpand={() => setDetailGraph(item)} />)}</div></section> : <EmptyCanvas onFilters={() => setFiltersOpen(true)} />}
      </>}
    </div>
    {(loading || refreshing) && data && <div className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white shadow-xl dark:bg-sky-500 dark:text-slate-950"><Loader2 className="h-4 w-4 animate-spin" /> Refreshing evidence</div>}
    <FilterDrawer open={filtersOpen} query={query} onClose={() => setFiltersOpen(false)} onApply={applyAndClose} allowedSources={allowedSources} />
    <ExportBuilder open={exportOpen} onClose={() => setExportOpen(false)} query={query} meta={data?.meta} visibleGraphs={visibleGraphs} />
    {detailGraph && <Suspense fallback={<div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}><GraphDetailModal item={detailGraph} meta={data?.meta} query={query} onClose={() => setDetailGraph(null)} /></Suspense>}
  </main>;
}
