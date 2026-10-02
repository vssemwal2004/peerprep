import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Download, FileSpreadsheet, FileText, Filter, Loader2, X } from "lucide-react";
import { adminAnalyticsApi } from "../api";
import { getScopeChips } from "../analyticsQuery";

const REPORTS = [
  { value: "executive", label: "Executive summary", helper: "Key outcomes and decisions for leadership" },
  { value: "students", label: "Student performance", helper: "Rank, scores and students needing support" },
  { value: "topics", label: "Topic performance", helper: "Strong and weak topics across the selected scope" },
  { value: "assessments", label: "Assessment analysis", helper: "Scores, participation and assessment evidence" },
  { value: "learning", label: "Learning progress", helper: "Completion and engagement evidence" },
  { value: "coding", label: "Coding performance", helper: "Practice, solving and acceptance evidence" },
  { value: "full", label: "Full analysis", helper: "All available sections; creates the largest report" },
];
const COLUMN_GROUPS = {
  Identity: [["studentName", "Student name"], ["studentId", "Student ID"], ["email", "Email"]],
  Cohort: [["semester", "Semester"], ["group", "Group"], ["branch", "Branch"], ["course", "Course"], ["college", "Campus"]],
  Coding: [["codingScore", "Coding score"], ["attempts", "Attempts"], ["solved", "Problems solved"], ["acceptance", "Acceptance rate"]],
  Assessment: [["assessmentScore", "Assessment score"], ["assessmentParticipation", "Participation"]],
  Learning: [["learningCompletion", "Completion"], ["learningEngagement", "Engagement"]],
  Overall: [["overallScore", "Overall score"], ["consistency", "Consistency"], ["rank", "Rank"]],
  Evidence: [["evidenceCoverage", "Evidence coverage"], ["eligibility", "Eligibility"], ["warnings", "Warnings"]],
};
const DEFAULT_COLUMNS = ["studentName", "studentId", "semester", "branch", "overallScore", "evidenceCoverage"];

export default function ExportBuilder({ open, onClose, query, meta, visibleGraphs }) {
  const [format, setFormat] = useState("xlsx");
  const [report, setReport] = useState("executive");
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeCharts, setIncludeCharts] = useState(true);
  const [sortBy, setSortBy] = useState("overallScore");
  const [showColumns, setShowColumns] = useState(false);
  const [status, setStatus] = useState({ state: "idle", message: "" });
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  useEffect(() => {
    if (!open) { setStatus({ state: "idle", message: "" }); return; }
    const suggested = { coding: "coding", assessments: "assessments", assessment: "assessments", learning: "learning", students: "students" }[query.analysisType] || "executive";
    setReport(suggested);
    setShowColumns(false);
  }, [open, query.analysisType]);
  useEffect(() => {
    if (!open) return undefined;
    triggerRef.current = document.activeElement;
    document.body.style.overflow = "hidden";
    const onKey = (event) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.offsetParent !== null);
      if (!focusable.length) { event.preventDefault(); panelRef.current.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    window.setTimeout(() => panelRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      triggerRef.current?.focus?.();
    };
  }, [open, onClose]);
  const estimatedRows = meta?.cohortSize;
  const scopeChips = useMemo(() => getScopeChips(query), [query]);
  const sourceLabel = (query.activity.sources || []).map((source) => source === "assessments" ? "Assessments" : source[0].toUpperCase() + source.slice(1)).join(", ");
  const toggle = (key) => setColumns((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const summary = useMemo(() => `${columns.length} columns${estimatedRows != null ? ` · about ${Number(estimatedRows).toLocaleString()} rows` : ""}`, [columns.length, estimatedRows]);
  const generate = async () => {
    setStatus({ state: "loading", message: "Creating secure report…" });
    try {
      const result = await adminAnalyticsApi.createExport({ format, reportType: report, columns, sort: { by: sortBy, direction: query.population.rankSegment === "bottom" ? "asc" : "desc" }, includeSummary, includeCharts, graphIds: visibleGraphs.map((item) => item.definition.id), query });
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus({ state: "success", message: `Report ready${result.rowCount != null ? ` · ${result.rowCount.toLocaleString()} rows` : ""}.` });
    } catch (error) { setStatus({ state: "error", message: error.message }); }
  };
  return createPortal(<AnimatePresence>{open && <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-5"><motion.button type="button" aria-label="Close export builder" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} /><motion.section ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="export-title" initial={{ opacity: 0, y: 30, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }} className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[26px] bg-white shadow-2xl outline-none dark:bg-slate-950 sm:rounded-[26px]">
    <header className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-white/10 sm:px-6"><div><h2 id="export-title" className="text-xl font-black text-slate-950 dark:text-white">Download this analysis</h2><p className="mt-1 text-sm text-slate-400">The report uses the same filters currently applied to the dashboard.</p></div><button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button></header>
    <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
      <section className="rounded-xl border border-sky-100 bg-sky-50/70 p-4 dark:border-sky-900/60 dark:bg-sky-950/30"><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white"><Filter className="h-4 w-4" /></span><div className="min-w-0"><h3 className="text-xs font-black text-sky-950 dark:text-sky-100">Applied dashboard scope</h3><p className="mt-0.5 text-[10px] leading-4 text-sky-800/80 dark:text-sky-200/80">{Number.isFinite(estimatedRows) ? `${Number(estimatedRows).toLocaleString()} students · ` : ""}{sourceLabel || "Selected evidence"}. Change the dashboard filters first if this is not the audience you want.</p><div className="mt-2 flex flex-wrap gap-1.5">{scopeChips.slice(0, 5).map((chip) => <span key={chip.key} className="rounded-md bg-white/80 px-2 py-1 text-[9px] font-bold text-sky-800 ring-1 ring-sky-100 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-900">{chip.label}: {chip.value}</span>)}{scopeChips.length > 5 && <span className="rounded-md px-2 py-1 text-[9px] font-bold text-sky-700">+{scopeChips.length - 5} filters</span>}</div></div></div></section>
      <section><div className="mb-3"><h3 className="text-xs font-black uppercase tracking-[.16em] text-slate-400">1 · Choose report purpose</h3><p className="mt-1 text-[10px] text-slate-500">Pick the report that matches who will use it.</p></div><div className="grid gap-2 sm:grid-cols-2">{REPORTS.map((option) => <button key={option.value} type="button" onClick={() => setReport(option.value)} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left ${report === option.value ? "border-sky-300 bg-sky-50 text-sky-900 dark:bg-sky-400/10 dark:text-sky-100" : "border-slate-200 text-slate-600 dark:border-white/10 dark:text-slate-300"}`}><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${report === option.value ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300"}`}>{report === option.value && <Check className="h-2.5 w-2.5" />}</span><span><span className="block text-xs font-black">{option.label}</span><span className="mt-0.5 block text-[10px] leading-4 text-slate-400">{option.helper}</span></span></button>)}</div></section>
      <section><div className="mb-3"><h3 className="text-xs font-black uppercase tracking-[.16em] text-slate-400">2 · Choose file format</h3><p className="mt-1 text-[10px] text-slate-500">Excel is best for further analysis; PDF is best for sharing and review.</p></div><div className="grid grid-cols-2 gap-3">{[["xlsx", "Excel (.xlsx)", FileSpreadsheet, "Editable data sheets"], ["pdf", "PDF report", FileText, "Presentation-ready document"]].map(([value, label, Icon, helper]) => <button key={value} type="button" onClick={() => setFormat(value)} className={`flex items-center gap-3 rounded-xl border p-3 text-left ${format === value ? "border-sky-300 bg-sky-50 dark:bg-sky-400/10" : "border-slate-200 dark:border-white/10"}`}><Icon className={`h-5 w-5 ${format === value ? "text-sky-600" : "text-slate-400"}`} /><span><span className="block text-sm font-black text-slate-800 dark:text-white">{label}</span><span className="text-[11px] text-slate-400">{helper}</span></span></button>)}</div></section>
      <section className="rounded-xl border border-slate-200 dark:border-white/10"><button type="button" aria-expanded={showColumns} onClick={() => setShowColumns((current) => !current)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"><span><span className="block text-xs font-black text-slate-800 dark:text-white">3 · Customize table fields</span><span className="mt-0.5 block text-[10px] text-slate-400">Optional · {columns.length} columns currently selected</span></span><ChevronDown className={`h-4 w-4 text-slate-400 transition ${showColumns ? "rotate-180" : ""}`} /></button>{showColumns && <div className="border-t border-slate-100 p-4 dark:border-white/10"><div className="mb-3 flex justify-end"><button type="button" onClick={() => setColumns(Object.values(COLUMN_GROUPS).flat().map(([key]) => key))} className="text-xs font-bold text-sky-700">Select all</button></div><div className="space-y-4">{Object.entries(COLUMN_GROUPS).map(([group, items]) => <div key={group}><h4 className="mb-2 text-[11px] font-black text-slate-600 dark:text-slate-300">{group}</h4><div className="flex flex-wrap gap-2">{items.map(([key, label]) => <button key={key} type="button" onClick={() => toggle(key)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold ${columns.includes(key) ? "border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200" : "border-slate-200 text-slate-400 dark:border-white/10"}`}>{columns.includes(key) && <Check className="h-3 w-3" />}{label}</button>)}</div></div>)}</div></div>}</section>
      <section className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Sort by</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-900"><option value="overallScore">Overall score</option><option value="codingScore">Coding score</option><option value="assessmentScore">Assessment score</option><option value="learningCompletion">Learning completion</option><option value="studentName">Student name</option></select></label><div className="flex flex-col justify-center gap-2">{[[includeSummary, setIncludeSummary, "Include summary page"], [includeCharts, setIncludeCharts, "Include selected charts"]].map(([checked, setter, label]) => <label key={label} className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300"><input type="checkbox" checked={checked} onChange={(event) => setter(event.target.checked)} className="h-4 w-4 rounded accent-sky-600" />{label}</label>)}</div></section>
      {status.message && <p className={`rounded-xl border p-3 text-xs font-semibold ${status.state === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{status.message}</p>}
    </div>
    <footer className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-white/10 dark:bg-white/[.03] sm:px-6"><div><p className="text-xs font-bold text-slate-700 dark:text-slate-200">{summary}</p><p className="mt-0.5 text-[10px] text-slate-400">Current filters, charts and calculation method are included.</p></div><button type="button" disabled={!columns.length || status.state === "loading"} onClick={generate} className="inline-flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-black text-white shadow-lg shadow-sky-600/20 disabled:opacity-50">{status.state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download report</button></footer>
  </motion.section></div>}</AnimatePresence>, document.body);
}
