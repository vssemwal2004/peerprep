import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, FileSpreadsheet, Info, Loader2, Search, Sheet, SlidersHorizontal, Sparkles } from "lucide-react";
import { prepAnalysisApi } from "../api";
import { chartRequest, useChartDownload } from "../chartActions";
import { chartInsight } from "../charts/chartInsights";
import { viewsFor } from "../charts/chartOptions";
import { fullPageHeight } from "../charts/chartParts";
import { ChartBody, ChartTable, CompareBodies, ViewToggle } from "./ChartCard";
import { FilterToolbar } from "./FilterDrawer";
import { AnimatedNumber } from "./Motion";
import { sectionStyle } from "./sectionStyles";
import { Button, IconButton, focusRing } from "./ui";

/** Every item of one chart for the current filters, a page at a time where the list is long. */
function useFullChart(analysis, chartId, page, refreshTick) {
  const [result, setResult] = useState({ chart: null, loading: true, error: null });
  const body = useMemo(() => chartRequest(analysis, chartId, { full: true, page }), [analysis, chartId, page]);
  const requestKey = JSON.stringify(body);
  useEffect(() => {
    const controller = new AbortController();
    setResult((current) => ({ ...current, loading: true, error: null }));
    prepAnalysisApi.query({ ...JSON.parse(requestKey), table: { page: 1, limit: 1 } }, { signal: controller.signal })
      .then((data) => setResult({ chart: data.charts?.[0] || null, compare: data.compare || null, meta: data.meta, loading: false, error: null }))
      .catch((error) => { if (error.name !== "AbortError") setResult((current) => ({ ...current, loading: false, error })); });
    return () => controller.abort();
  }, [requestKey, refreshTick]);
  return result;
}

function Figure({ label, value, format, suffix }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
      <p className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400" title={label}>{label}</p>
      <p className="mt-0.5 text-[22px] font-extrabold leading-7 tracking-tight text-slate-900 dark:text-white"><AnimatedNumber value={value} format={format} />{suffix}</p>
    </div>
  );
}

/**
 * One chart on its own page: the same filters, every item (not just the card's top few), its
 * figures, and a breakdown table. Any part, in the chart or the table, opens the part popup.
 */
export default function ChartFullPage({
  chartId, cardChart, entry, analysis, meta, refreshTick, onBack, onStudent, onPart, onOpenFilters, onFilterChange, onSettings, onView, filterExtra,
}) {
  const reduced = useReducedMotion();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const full = useFullChart(analysis, chartId, page, refreshTick);
  const chart = full.chart || cardChart;
  const download = useChartDownload(analysis, chartId);
  const insight = useMemo(() => (chart ? chartInsight(chart) : null), [chart]);
  const filterKey = JSON.stringify(analysis.state);
  // Filters change the list, so go back to its first page.
  useEffect(() => { setPage(1); }, [filterKey]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [chartId]);

  if (!chart) {
    return (
      <div className="flex h-64 items-center justify-center text-[12px] text-slate-500">
        {full.error ? <><AlertCircle className="mr-2 h-4 w-4 text-rose-500" />{full.error.message}</> : <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</>}
      </div>
    );
  }
  const views = viewsFor(chart.type);
  const view = views.some((option) => option.value === entry?.view) ? entry.view : "chart";
  const pagination = chart.data?.pagination;
  const summary = chart.summary;
  const style = sectionStyle(chart.section);
  const SectionIcon = style.Icon;
  const part = (next) => onPart(chart, next);
  // With compare: this chart for each group, from the same full-page request.
  const sides = full.compare?.map((side) => {
    const own = side.charts.find((entry) => entry.id === chart.id);
    return own ? { label: side.label, chart: { ...chart, data: own.data, summary: own.summary, studentCount: own.studentCount } } : null;
  }).filter(Boolean);
  const searchBox = (
    <label className="relative ml-auto w-full max-w-xs">
      <span className="sr-only">Search the table</span>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search"
        className={`h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2.5 text-[12px] outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-white/[0.03] ${focusRing}`} />
    </label>
  );

  return (
    <motion.div className="space-y-4" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="flex flex-wrap items-center gap-3">
        <IconButton label="Back to every chart" onClick={onBack} className="h-9 w-9 border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900"><ArrowLeft className="h-4 w-4" /></IconButton>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.chip}`}><SectionIcon className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 truncate text-[17px] font-bold text-slate-950 dark:text-white">
            {chart.title}<span className="text-slate-300 dark:text-slate-600" title={chart.question}><Info className="h-4 w-4" /></span>
          </h2>
        </div>
        <ViewToggle type={chart.type} view={view} onChange={onView} size="md" />
        <Button onClick={onSettings}><SlidersHorizontal className="h-3.5 w-3.5" />Settings</Button>
        <Button disabled={download.busy} onClick={() => download.run("csv", "", chart.title)}><Sheet className="h-3.5 w-3.5" />CSV</Button>
        <Button tone="primary" disabled={download.busy} onClick={() => download.run("xlsx", "", chart.title)}>
          {download.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}Download Excel
        </Button>
      </div>

      <FilterToolbar state={analysis.state} catalog={analysis.catalog} fieldMap={analysis.fieldMap} meta={full.meta || meta} loading={full.loading} onOpen={onOpenFilters} onChange={onFilterChange} extra={filterExtra} />

      {full.error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{full.error.message}</span>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Figure label={`Students who ${summary.studentsLabel}`} value={summary.students} suffix={<span className="text-[13px] font-semibold text-slate-400"> / {summary.cohort.toLocaleString()}</span>} />
          <Figure label="Of students in view" value={summary.pct} format={(number) => `${number.toFixed(1)}%`} />
          {summary.total !== undefined && <Figure label={summary.totalLabel[0].toUpperCase() + summary.totalLabel.slice(1)} value={summary.total} />}
          {summary.average !== undefined && <Figure label={summary.averageLabel[0].toUpperCase() + summary.averageLabel.slice(1)} value={summary.average} format={(number) => number.toFixed(2)} />}
        </div>
      )}

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        {insight && (
          <p className={`flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] leading-[1.45] ${style.note}`}>
            <Sparkles className={`mt-[2px] h-3 w-3 shrink-0 ${style.spark}`} aria-hidden="true" /><span>{insight}</span>
          </p>
        )}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between gap-2 text-[12px] text-slate-600 dark:text-slate-300">
            <span className="tabular-nums">{(pagination.offset + 1).toLocaleString()}–{Math.min(pagination.total, pagination.offset + pagination.pageSize).toLocaleString()} of {pagination.total.toLocaleString()}</span>
            <span className="flex items-center gap-1">
              <IconButton label="Previous page" disabled={pagination.page <= 1 || full.loading} onClick={() => setPage(pagination.page - 1)}><ChevronLeft className="h-4 w-4" /></IconButton>
              <span className="tabular-nums">{pagination.page} / {pagination.pages}</span>
              <IconButton label="Next page" disabled={pagination.page >= pagination.pages || full.loading} onClick={() => setPage(pagination.page + 1)}><ChevronRight className="h-4 w-4" /></IconButton>
            </span>
          </div>
        )}
        {view === "table" && <div className="flex">{searchBox}</div>}
        <div className={`max-h-[calc(100vh-14rem)] overflow-y-auto pr-1 transition-opacity ${full.loading ? "opacity-60" : ""}`}>
          {sides?.length
            ? <CompareBodies sides={sides} view={view} height={view === "table" ? 600 : fullPageHeight(chart)} stacked={false} onStudent={onStudent} onPart={onPart} />
            : view === "table"
              ? <ChartTable chart={chart} height={100000} onStudent={onStudent} onPart={chart.drillable ? part : undefined} search={search} />
              : <ChartBody chart={chart} view={view} height={fullPageHeight(chart)} onStudent={onStudent} onPart={part} />}
        </div>
      </section>

      {view !== "table" && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13.5px] font-bold text-slate-900 dark:text-white">Breakdown</h3>
            {searchBox}
          </div>
          <ChartTable chart={chart} height={560} onStudent={onStudent} onPart={chart.drillable ? part : undefined} search={search} />
        </section>
      )}
    </motion.div>
  );
}
