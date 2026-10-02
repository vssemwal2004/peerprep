import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ChevronRight, Lightbulb, ShieldAlert, X } from "lucide-react";

function confidenceLabel(value) {
  if (value && typeof value === "object") return confidenceLabel(value.label ?? value.level ?? value.score ?? value.value);
  if (typeof value === "string") return value.replace(/_/g, " ");
  const score = Number(value);
  if (!Number.isFinite(score)) return "Evidence checked";
  const normalized = score > 1 ? score / 100 : score;
  return normalized >= .75 ? "High confidence" : normalized >= .5 ? "Moderate confidence" : "Early signal";
}

function evidenceLabel(item) {
  if (typeof item?.evidenceLabel === "string") return item.evidenceLabel;
  if (typeof item?.evidence === "string") return item.evidence;
  if (item?.evidence && typeof item.evidence === "object") {
    if (item.evidence.label || item.evidence.summary) return item.evidence.label || item.evidence.summary;
  }
  const count = Number(item?.evidenceCount ?? item?.evidence?.count ?? item?.sampleSize ?? item?.students);
  return Number.isFinite(count) ? `${count.toLocaleString()} evidence points` : "Available evidence";
}

function normalizeItem(item, index, risk = false) {
  if (typeof item === "string") return { id: `${risk ? "risk" : "insight"}-${index}`, title: item, detail: "", confidence: "Evidence checked", evidence: "Available evidence", severity: risk ? "Attention" : null };
  return {
    id: item?.id || `${risk ? "risk" : "insight"}-${index}`,
    title: item?.title || item?.headline || item?.label || item?.message || (risk ? "Area needing attention" : "Evidence insight"),
    detail: item?.summary || item?.description || item?.message || item?.action || item?.recommendation || "",
    confidence: confidenceLabel(item?.confidenceLabel ?? item?.confidence ?? item?.confidenceScore),
    evidence: evidenceLabel(item),
    severity: risk ? (item?.severityLabel || item?.severity || item?.level || "Attention") : null,
  };
}

function normalizeMetrics(metrics) {
  if (Array.isArray(metrics)) return metrics.slice(0, 6).map((metric, index) => typeof metric === "object" ? { label: metric.label || metric.name || `Measure ${index + 1}`, value: metric.value ?? metric.formattedValue ?? "—" } : { label: `Measure ${index + 1}`, value: metric });
  if (!metrics || typeof metrics !== "object") return [];
  return Object.entries(metrics).slice(0, 6).map(([key, value]) => ({ label: key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()), value: typeof value === "object" ? value?.formattedValue ?? value?.value ?? "—" : value }));
}

function InsightMeta({ item }) {
  return <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-semibold text-slate-500"><span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-gray-800">{item.evidence}</span><span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">{item.confidence}</span></div>;
}

function InsightsDialog({ intelligence, insights, risks, metrics, onClose }) {
  const panelRef = useRef(null); const previousFocus = useRef(null);
  useEffect(() => {
    previousFocus.current = document.activeElement; const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const onKey = (event) => { if (event.key === "Escape") onClose(); if (event.key === "Tab" && panelRef.current) { const nodes = [...panelRef.current.querySelectorAll('button,[href],[tabindex]:not([tabindex="-1"])')].filter((node) => !node.disabled); const first = nodes[0]; const last = nodes[nodes.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } };
    document.addEventListener("keydown", onKey); panelRef.current?.querySelector("button")?.focus();
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKey); previousFocus.current?.focus?.(); };
  }, [onClose]);
  return createPortal(<div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/50 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="insights-dialog-title" className="flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"><header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-gray-800"><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-sky-700 dark:text-sky-300">Decision support</p><h2 id="insights-dialog-title" className="mt-1 text-lg font-bold text-slate-950 dark:text-white">Actionable insights</h2><p className="mt-1 text-xs text-slate-500">Findings are limited to evidence in the current filters.</p></div><button type="button" onClick={onClose} aria-label="Close actionable insights" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-gray-800"><X className="h-4 w-4" /></button></header><div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
    {metrics.length > 0 && <section><h3 className="text-xs font-bold text-slate-900 dark:text-white">Supporting measures</h3><div className="mt-2 flex flex-wrap gap-2">{metrics.map((metric) => <span key={metric.label} className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-gray-700"><span className="text-slate-500">{metric.label}</span> <strong className="ml-1 text-slate-900 dark:text-white">{String(metric.value)}</strong></span>)}</div></section>}
    {insights.length > 0 && <section><h3 className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white"><Lightbulb className="h-4 w-4 text-sky-600" />What the evidence suggests</h3><ol className="mt-2 space-y-2">{insights.map((item, index) => <li key={item.id} className="rounded-xl border border-slate-200 p-3 dark:border-gray-800"><div className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[10px] font-bold text-sky-700 dark:bg-sky-950/40">{index + 1}</span><div><p className="text-xs font-bold text-slate-900 dark:text-white">{item.title}</p>{item.detail && item.detail !== item.title && <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{item.detail}</p>}<InsightMeta item={item} /></div></div></li>)}</ol></section>}
    {risks.length > 0 && <section><h3 className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white"><ShieldAlert className="h-4 w-4 text-amber-600" />Areas needing attention</h3><ul className="mt-2 space-y-2">{risks.map((item) => <li key={item.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/60 dark:bg-amber-950/20"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><div><p className="text-xs font-bold text-slate-900 dark:text-white">{item.title}</p>{item.detail && item.detail !== item.title && <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{item.detail}</p>}<InsightMeta item={item} /></div></div></li>)}</ul></section>}
  </div>{intelligence?.formulaVersion && <footer className="border-t border-slate-200 px-5 py-2 text-[9px] text-slate-400 dark:border-gray-800">Calculation method {intelligence.formulaVersion}</footer>}</section></div>, document.body);
}

export default function ActionableInsightsPanel({ intelligence }) {
  const [open, setOpen] = useState(false);
  const normalized = useMemo(() => ({ insights: (Array.isArray(intelligence?.insights) ? intelligence.insights : []).map((item, index) => normalizeItem(item, index)), risks: (Array.isArray(intelligence?.riskSignals) ? intelligence.riskSignals : []).map((item, index) => normalizeItem(item, index, true)), metrics: normalizeMetrics(intelligence?.metrics) }), [intelligence]);
  if (!intelligence || intelligence.status === "disabled" || (!normalized.insights.length && !normalized.risks.length)) return null;
  const limited = intelligence.status === "fallback";
  return <><section aria-labelledby="actionable-insights-title" className="rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900"><header className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 ${normalized.insights.length ? "border-b border-slate-100 dark:border-gray-800" : ""}`}><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"><Lightbulb className="h-3.5 w-3.5" /></span><div><h2 id="actionable-insights-title" className="text-xs font-bold text-slate-950 dark:text-white">Actionable insights</h2><p className="text-[9px] text-slate-400">{limited ? "Early guidance from available evidence" : "Evidence-backed priorities for this scope"}</p></div></div><div className="flex items-center gap-2">{normalized.risks.length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"><AlertTriangle className="h-3 w-3" />{normalized.risks.length} {normalized.risks.length === 1 ? "risk" : "risks"}</span>}<button type="button" onClick={() => setOpen(true)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[10px] font-bold text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-gray-700 dark:text-slate-300">View all <ChevronRight className="h-3 w-3" /></button></div></header>{normalized.insights.length > 0 && <ol className="grid divide-y divide-slate-100 dark:divide-gray-800 lg:grid-cols-3 lg:divide-x lg:divide-y-0">{normalized.insights.slice(0, 3).map((item, index) => <li key={item.id} className="min-w-0 px-4 py-3"><div className="flex gap-2.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-600 dark:bg-gray-800 dark:text-slate-300">{index + 1}</span><div className="min-w-0"><p className="text-[11px] font-bold leading-4 text-slate-900 dark:text-white">{item.title}</p>{item.detail && item.detail !== item.title && <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-slate-500 dark:text-slate-400">{item.detail}</p>}<InsightMeta item={item} /></div></div></li>)}</ol>}</section>{open && <InsightsDialog intelligence={intelligence} insights={normalized.insights} risks={normalized.risks} metrics={normalized.metrics} onClose={() => setOpen(false)} />}</>;
}
