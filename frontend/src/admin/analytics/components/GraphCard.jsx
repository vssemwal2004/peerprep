import { lazy, Suspense } from "react";
import { CircleAlert, Info, Maximize2 } from "lucide-react";

const AnalyticsChart = lazy(() => import("../charts/AnalyticsChart"));

const rowsOf = (payload) => Array.isArray(payload?.data) ? payload.data : payload?.data?.rows || payload?.data?.items || [];
const labelOf = (row) => row?.name ?? row?.title ?? row?.topic ?? row?.subject ?? row?.group ?? row?.band ?? row?.bucket ?? row?.date ?? "Item";

function insightFor(payload, definition) {
  const rows = rowsOf(payload);
  if (!rows.length) return "Evidence is available for this view.";
  const preferred = { "student-ranking": "value", "topic-performance": "rate", "difficulty-analysis": "successRate", "performance-distribution": "count", "cohort-comparison": "value", "learning-hierarchy": "completionRate", "question-conversion": "conversionRate", "score-effort-scatter": "score" }[definition.id];
  const keys = Object.keys(rows[0] || {}).filter((key) => rows.some((row) => Number.isFinite(row[key])));
  const key = preferred || keys.find((item) => !/id|attempt|participant|eligible/i.test(item)) || keys[0];
  const valid = key ? rows.filter((row) => Number.isFinite(row[key])) : [];
  if (!valid.length) return `${rows.length.toLocaleString()} evidence points are visible in this view.`;
  const strongest = [...valid].sort((a, b) => b[key] - a[key])[0];
  const suffix = definition.unit === "%" || /rate|score|value/i.test(key) ? "%" : "";
  return `${labelOf(strongest)} is highest in the visible data at ${Number(strongest[key]).toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}.`;
}

export default function GraphCard({ item, onExpand }) {
  const { definition, payload, status } = item;
  const Icon = definition.icon;
  const sampleSize = payload?.config?.sampleSize ?? payload?.sampleSize ?? rowsOf(payload).length;
  return <article className={`min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)] dark:border-gray-800 dark:bg-gray-900 ${definition.layout === "wide" ? "xl:col-span-2" : ""}`}>
    <header className="flex items-start gap-3 border-b border-slate-100 px-4 py-3 dark:border-gray-800">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"><Icon className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-bold text-slate-950 dark:text-white">{definition.title}</h2>{status === "partial" && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"><CircleAlert className="h-2.5 w-2.5" /> Partial</span>}</div><p className="mt-0.5 text-[11px] font-medium leading-4 text-slate-600 dark:text-slate-300">{definition.question}</p></div>
      <div className="flex shrink-0 gap-1"><button type="button" aria-label={`How to read ${definition.title}`} title={definition.read} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-sky-700 dark:hover:bg-gray-800"><Info className="h-3.5 w-3.5" /></button><button type="button" onClick={onExpand} aria-label={`Expand ${definition.title}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-gray-700 dark:hover:bg-sky-950/30"><Maximize2 className="h-3.5 w-3.5" /></button></div>
    </header>
    <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs leading-5 text-slate-600 dark:border-gray-800 dark:bg-white/[.02] dark:text-slate-300"><span className="font-bold text-sky-700 dark:text-sky-300">Insight:</span> {insightFor(payload, definition)}</div>
    <div role="img" aria-label={`${definition.title}. ${definition.description}`} className="px-2 pb-1 pt-2"><Suspense fallback={<div className="h-[276px] animate-pulse rounded-lg bg-slate-50 dark:bg-gray-800" aria-label="Loading chart" />}><AnalyticsChart definition={definition} payload={payload} /></Suspense></div>
    <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-4 py-2 text-[11px] font-semibold text-slate-500 dark:border-gray-800"><span>X · {definition.xAxis}</span><span>Y · {definition.yAxis}</span><span>Unit · {definition.unit}</span><span>Visible sample · {sampleSize.toLocaleString()}</span></footer>
  </article>;
}
