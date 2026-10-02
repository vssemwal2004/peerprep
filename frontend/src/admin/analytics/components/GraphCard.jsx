import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ArrowRight, BarChart3, Check, CircleAlert, Info, Maximize2, Search, Table2, X } from "lucide-react";
import AnalyticsChart from "../charts/AnalyticsChart";

function payloadRows(payload) {
  return Array.isArray(payload?.data) ? payload.data : payload?.data?.rows || payload?.data?.items || [];
}

function limitPayload(payload, rowLimit, hiddenSeries) {
  const next = { ...payload, config: { ...payload?.config } };
  if (Array.isArray(payload?.config?.series)) next.config.series = payload.config.series.filter((item) => !hiddenSeries.has(typeof item === "string" ? item : item.key));
  if (rowLimit === "all") return next;
  const limit = Number(rowLimit);
  if (Array.isArray(payload?.data)) next.data = payload.data.slice(0, limit);
  else if (Array.isArray(payload?.data?.rows)) next.data = { ...payload.data, rows: payload.data.rows.slice(0, limit) };
  else if (Array.isArray(payload?.data?.items)) next.data = { ...payload.data, items: payload.data.items.slice(0, limit) };
  return next;
}

function DataTable({ payload, title, standalone = false }) {
  const [search, setSearch] = useState("");
  const allRows = payloadRows(payload);
  const rows = standalone && search ? allRows.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())) : allRows;
  const matrixRows = rows.filter((row) => Array.isArray(row?.cells)).slice(0, standalone ? 100 : 25);
  let table = null;
  if (matrixRows.length) {
    const matrixColumns = (payload?.data?.columns || [...new Set(matrixRows.flatMap((row) => row.cells.map((cell) => cell.topic))) ]).slice(0, 12);
    table = <table className="min-w-full text-left text-xs"><caption className="sr-only">Data for {title}</caption><thead className="sticky top-0 bg-white dark:bg-gray-900"><tr><th scope="col" className="border-b border-slate-200 px-2 py-2 font-black text-slate-500 dark:border-white/10">Student</th>{matrixColumns.map((column) => <th key={column} scope="col" className="border-b border-slate-200 px-2 py-2 font-black text-slate-500 dark:border-white/10">{column}</th>)}</tr></thead><tbody>{matrixRows.map((row) => <tr key={row.studentId || row.name}>{<th scope="row" className="border-b border-slate-100 px-2 py-2 font-bold text-slate-700 dark:border-white/5 dark:text-slate-200">{row.name}</th>}{matrixColumns.map((column) => { const cell = row.cells.find((item) => item.topic === column); return <td key={column} className="border-b border-slate-100 px-2 py-2 text-slate-600 dark:border-white/5 dark:text-slate-300">{cell?.value == null ? "No evidence" : `${cell.value}%`}</td>; })}</tr>)}</tbody></table>;
  }
  if (!table) {
    const simpleRows = rows.filter((row) => row && typeof row === "object" && !Array.isArray(row.values) && !Array.isArray(row.cells)).slice(0, standalone ? 250 : 25);
    const columns = [...new Set(simpleRows.flatMap((row) => Object.keys(row).filter((key) => ["string", "number"].includes(typeof row[key]))))].slice(0, standalone ? 12 : 8);
    if (!simpleRows.length || !columns.length) return null;
    table = <table className="min-w-full text-left text-xs"><caption className="sr-only">Data for {title}</caption><thead className="sticky top-0 bg-white dark:bg-gray-900"><tr>{columns.map((column) => <th key={column} scope="col" className="border-b border-slate-200 px-2 py-2 font-black capitalize text-slate-500 dark:border-white/10">{column.replace(/([A-Z])/g, " $1")}</th>)}</tr></thead><tbody>{simpleRows.map((row, index) => <tr key={row.id || row.studentId || row.date || index}>{columns.map((column) => <td key={column} className="border-b border-slate-100 px-2 py-2 text-slate-600 dark:border-white/5 dark:text-slate-300">{row[column] == null ? "—" : String(row[column])}</td>)}</tr>)}</tbody></table>;
  }
  const body = <div className={standalone ? "flex min-h-0 flex-1 flex-col" : ""}>{standalone && <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-3 dark:border-gray-800"><div><p className="text-xs font-bold text-slate-800 dark:text-white">Detailed evidence rows</p><p className="text-[10px] text-slate-400">{rows.length.toLocaleString()} of {allRows.length.toLocaleString()} rows</p></div><label className="relative w-64 max-w-full"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search visible data…" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-sky-200 dark:border-gray-700 dark:bg-gray-900" /></label></div>}<div className={`overflow-auto ${standalone ? "min-h-0 flex-1 px-3 pb-3" : "px-5 pb-4"}`}>{table}{rows.length > (standalone ? 250 : 25) && <p className="mt-2 text-[10px] text-slate-400">Showing a safe interactive preview. Export for the complete dataset.</p>}</div></div>;
  if (standalone) return body;
  return <details className="border-t border-slate-100 dark:border-white/10"><summary className="cursor-pointer px-3.5 py-2 text-[10px] font-bold text-sky-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-300 dark:text-sky-300">View data table</summary>{body}</details>;
}

function GraphHeader({ definition, status, onExpand, expanded = false }) {
  const Icon = definition.icon;
  return <header className={`border-b border-slate-200/80 px-3.5 py-3 dark:border-gray-800 ${expanded ? "pr-16" : ""}`}>
    <div className="flex items-start gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-sky-100 dark:bg-sky-900/30 dark:text-sky-300 dark:ring-sky-800"><Icon className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">{definition.group}</span>
          <span className="text-slate-300">•</span>
          <span className="text-[10px] font-semibold text-slate-400">{definition.chartType}</span>
          {status === "partial" && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"><CircleAlert className="h-2.5 w-2.5" /> Partial</span>}
        </div>
        <h2 className="mt-0.5 text-sm font-bold leading-5 text-slate-950 dark:text-white">{definition.title}</h2>
        <p className="mt-0.5 text-[11px] font-medium leading-4 text-slate-600 dark:text-slate-300">{definition.question}</p>
      </div>
      {!expanded && <button type="button" onClick={onExpand} aria-label={`Expand ${definition.title}`} title="Open detailed view" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300 dark:border-gray-700 dark:hover:bg-sky-900/20"><Maximize2 className="h-3.5 w-3.5" /></button>}
    </div>
  </header>;
}

function ReadingGuide({ definition, expanded = false }) {
  const axisless = ["donut", "radar", "funnel"].includes(definition.renderer);
  return <div className={`border-b border-slate-100 bg-slate-50/70 dark:border-gray-800 dark:bg-white/[.02] ${expanded ? "px-5 py-3" : "px-3.5 py-2.5"}`}>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px]">
      <span className="font-bold uppercase tracking-[0.12em] text-slate-400">{axisless ? "Dimensions" : "Axes"}</span>
      <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300"><b className="text-sky-700 dark:text-sky-300">{axisless ? "Category" : "X"}</b> {definition.xAxis}</span>
      <ArrowRight className="h-3 w-3 text-slate-300" />
      <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300"><b className="text-violet-700 dark:text-violet-300">{axisless ? "Measure" : "Y"}</b> {definition.yAxis}</span>
      <span className="rounded-md bg-white px-1.5 py-0.5 font-bold text-slate-500 ring-1 ring-slate-200 dark:bg-gray-900 dark:ring-gray-700">Unit: {definition.unit}</span>
    </div>
    {expanded && <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" /><span><strong className="text-slate-700 dark:text-slate-200">How to read:</strong> {definition.read}</span></p>}
  </div>;
}

function ExpandedGraph({ definition, payload, status, onClose }) {
  const [view, setView] = useState("chart");
  const [rowLimit, setRowLimit] = useState(() => ["trend", "assessmentTrend", "calendar", "donut", "radar", "funnel"].includes(definition.renderer) ? "all" : "25");
  const [hiddenSeries, setHiddenSeries] = useState(() => new Set());
  const series = Array.isArray(payload?.config?.series) ? payload.config.series.map((item) => ({ key: typeof item === "string" ? item : item.key, label: typeof item === "string" ? item : item.label || item.key })) : [];
  const displayPayload = useMemo(() => limitPayload(payload, rowLimit, hiddenSeries), [hiddenSeries, payload, rowLimit]);
  const toggleSeries = (key) => setHiddenSeries((current) => {
    const visibleCount = series.filter((item) => !current.has(item.key)).length;
    if (!current.has(key) && visibleCount <= 1) return current;
    const next = new Set(current);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  useEffect(() => {
    const handleKey = (event) => { if (event.key === "Escape") onClose(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", handleKey); };
  }, [onClose]);

  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={`${definition.title} detailed view`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl dark:bg-gray-900">
      <div className="relative">
        <GraphHeader definition={definition} status={status} expanded />
        <button type="button" onClick={onClose} aria-label="Close detailed graph" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300 dark:border-gray-700 dark:bg-gray-900"><X className="h-4 w-4" /></button>
      </div>
      <ReadingGuide definition={definition} expanded />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">{[["chart", "Chart", BarChart3], ["data", "Detailed data", Table2]].map(([value, label, Icon]) => <button key={value} type="button" onClick={() => setView(value)} className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[11px] font-bold transition ${view === value ? "bg-white text-sky-700 shadow-sm dark:bg-gray-700 dark:text-sky-300" : "text-slate-500"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</div>
        {view === "chart" && <div className="flex flex-wrap items-center gap-2"><label className="inline-flex items-center gap-2 text-[10px] font-bold text-slate-500">Rows<select value={rowLimit} onChange={(event) => setRowLimit(event.target.value)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-bold outline-none dark:border-gray-700 dark:bg-gray-900"><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="all">All</option></select></label>{series.length > 1 && <div className="flex flex-wrap gap-1">{series.map((item) => { const active = !hiddenSeries.has(item.key); return <button key={item.key} type="button" aria-pressed={active} onClick={() => toggleSeries(item.key)} className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 text-[10px] font-bold ${active ? "border-sky-200 bg-sky-50 text-sky-700 dark:bg-sky-400/10" : "border-slate-200 text-slate-400 dark:border-gray-700"}`}>{active && <Check className="h-3 w-3" />}{item.label}</button>; })}</div>}</div>}
      </div>
      {view === "chart" ? <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5" role="img" aria-label={`${definition.title}. ${definition.description}`}><AnalyticsChart definition={definition} payload={displayPayload} expanded /></div> : <div className="flex min-h-0 flex-1"><DataTable payload={payload} title={definition.title} standalone /></div>}
    </section>
  </div>, document.body);
}

export default function GraphCard({ item, index = 0 }) {
  const { definition, payload, status } = item;
  const [expanded, setExpanded] = useState(false);
  return <>
    <motion.article initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: Math.min(index * 0.025, 0.15) }} className={`min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-gray-800 dark:bg-gray-900 ${definition.layout === "wide" ? "xl:col-span-2" : ""}`}>
      <GraphHeader definition={definition} status={status} onExpand={() => setExpanded(true)} />
      <ReadingGuide definition={definition} />
      <div role="img" aria-label={`${definition.title}. ${definition.description}`} className="px-2 pb-1 pt-2"><AnalyticsChart definition={definition} payload={payload} /></div>
      <details className="group border-t border-slate-100 dark:border-gray-800">
        <summary className="cursor-pointer list-none px-3.5 py-2 text-[10px] font-bold text-slate-500 hover:bg-slate-50 hover:text-sky-700 dark:hover:bg-white/[.02]">How to interpret this graph</summary>
        <p className="border-t border-slate-100 bg-slate-50/60 px-3.5 py-2.5 text-[11px] leading-4 text-slate-600 dark:border-gray-800 dark:bg-white/[.02] dark:text-slate-300">{definition.read}</p>
      </details>
      <DataTable payload={payload} title={definition.title} />
      {(payload?.note || payload?.evidence) && <footer className="flex items-start gap-2 border-t border-slate-100 bg-amber-50/50 px-3.5 py-2.5 text-[10px] leading-4 text-slate-600 dark:border-white/10 dark:bg-amber-950/10 dark:text-slate-400"><Info className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />{payload.note || payload.evidence}</footer>}
    </motion.article>
    {expanded && <ExpandedGraph definition={definition} payload={payload} status={status} onClose={() => setExpanded(false)} />}
  </>;
}
