import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChartNoAxesCombined, CircleAlert, Info, Lightbulb, Maximize2, X } from "lucide-react";

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

function GraphGuide({ definition, sampleSize, onClose, onOpenDetails }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    window.setTimeout(() => dialogRef.current?.focus(), 0);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = ""; previous?.focus?.(); };
  }, [onClose]);
  return createPortal(<div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center sm:p-5"><button type="button" aria-label="Close chart guide" onClick={onClose} className="absolute inset-0 bg-slate-950/55" /><section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={`guide-${definition.id}`} className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl outline-none dark:bg-slate-950 sm:rounded-2xl"><header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/10"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"><ChartNoAxesCombined className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.14em] text-sky-700 dark:text-sky-300">How this chart works</p><h2 id={`guide-${definition.id}`} className="mt-0.5 text-base font-black text-slate-950 dark:text-white">{definition.title}</h2></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button></header><div className="space-y-4 p-5"><section><h3 className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Question it answers</h3><p className="mt-1.5 text-sm font-bold leading-5 text-slate-900 dark:text-white">{definition.question}</p><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{definition.description}</p></section><section className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[.03]"><h3 className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-white"><Lightbulb className="h-3.5 w-3.5 text-amber-500" /> How to read it</h3><p className="mt-1.5 text-xs leading-5 text-slate-600 dark:text-slate-300">{definition.read}</p></section><section className="grid grid-cols-2 gap-2"><div className="rounded-lg border border-slate-200 p-3 dark:border-white/10"><p className="text-[9px] font-black uppercase tracking-[.12em] text-slate-400">Horizontal / X</p><p className="mt-1 text-xs font-bold text-slate-700 dark:text-slate-200">{definition.xAxis}</p></div><div className="rounded-lg border border-slate-200 p-3 dark:border-white/10"><p className="text-[9px] font-black uppercase tracking-[.12em] text-slate-400">Vertical / Y</p><p className="mt-1 text-xs font-bold text-slate-700 dark:text-slate-200">{definition.yAxis}</p></div><div className="rounded-lg border border-slate-200 p-3 dark:border-white/10"><p className="text-[9px] font-black uppercase tracking-[.12em] text-slate-400">Measurement</p><p className="mt-1 text-xs font-bold text-slate-700 dark:text-slate-200">{definition.unit}</p></div><div className="rounded-lg border border-slate-200 p-3 dark:border-white/10"><p className="text-[9px] font-black uppercase tracking-[.12em] text-slate-400">Visible sample</p><p className="mt-1 text-xs font-bold text-slate-700 dark:text-slate-200">{sampleSize.toLocaleString()} records</p></div></section></div><footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-white/10 dark:bg-white/[.03]"><button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-xs font-bold text-slate-500">Close</button><button type="button" onClick={() => { onClose(); onOpenDetails(); }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-sky-600 px-4 text-xs font-bold text-white"><Maximize2 className="h-3.5 w-3.5" /> View chart and data</button></footer></section></div>, document.body);
}

export default function GraphCard({ item, onExpand }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const { definition, payload, status } = item;
  const Icon = definition.icon;
  const sampleSize = payload?.config?.sampleSize ?? payload?.sampleSize ?? rowsOf(payload).length;
  return <article className={`min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)] dark:border-gray-800 dark:bg-gray-900 ${definition.layout === "wide" ? "xl:col-span-2" : ""}`}>
    <header className="flex items-start gap-3 border-b border-slate-100 px-4 py-3 dark:border-gray-800">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"><Icon className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-bold text-slate-950 dark:text-white">{definition.title}</h2>{status === "partial" && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"><CircleAlert className="h-2.5 w-2.5" /> Partial</span>}</div><p className="mt-0.5 text-[11px] font-medium leading-4 text-slate-600 dark:text-slate-300">{definition.question}</p></div>
      <div className="flex shrink-0 gap-1"><button type="button" onClick={() => setGuideOpen(true)} aria-label={`Explain ${definition.title}`} title="Explain this chart" className="flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-slate-400 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-gray-800"><Info className="h-3.5 w-3.5" /></button><button type="button" onClick={onExpand} aria-label={`Expand ${definition.title}`} title="View chart and underlying data" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-gray-700 dark:hover:bg-sky-950/30"><Maximize2 className="h-3.5 w-3.5" /></button></div>
    </header>
    <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs leading-5 text-slate-600 dark:border-gray-800 dark:bg-white/[.02] dark:text-slate-300"><span className="font-bold text-sky-700 dark:text-sky-300">Insight:</span> {insightFor(payload, definition)}</div>
    <div role="img" aria-label={`${definition.title}. ${definition.description}`} className="px-2 pb-1 pt-2"><Suspense fallback={<div className="h-[276px] animate-pulse rounded-lg bg-slate-50 dark:bg-gray-800" aria-label="Loading chart" />}><AnalyticsChart definition={definition} payload={payload} /></Suspense></div>
    <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-4 py-2 text-[11px] font-semibold text-slate-500 dark:border-gray-800"><span>X · {definition.xAxis}</span><span>Y · {definition.yAxis}</span><span>Unit · {definition.unit}</span><span>Visible sample · {sampleSize.toLocaleString()}</span></footer>
    {guideOpen && <GraphGuide definition={definition} sampleSize={sampleSize} onClose={() => setGuideOpen(false)} onOpenDetails={onExpand} />}
  </article>;
}
