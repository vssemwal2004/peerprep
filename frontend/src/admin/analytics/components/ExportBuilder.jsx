import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Download, FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import { adminAnalyticsApi } from "../api";

const REPORTS = [
  ["executive", "Executive summary"], ["students", "Student performance"], ["topics", "Topic performance"],
  ["assessments", "Assessment analysis"], ["learning", "Learning progress"], ["coding", "Coding performance"], ["full", "Full analysis"],
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
  const [status, setStatus] = useState({ state: "idle", message: "" });
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  useEffect(() => { if (!open) setStatus({ state: "idle", message: "" }); }, [open]);
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
    <header className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-white/10 sm:px-6"><div><h2 id="export-title" className="text-xl font-black text-slate-950 dark:text-white">Build a report</h2><p className="mt-1 text-sm text-slate-400">Server-generated, access-checked, and methodology attached.</p></div><button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button></header>
    <div className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
      <section><h3 className="mb-3 text-xs font-black uppercase tracking-[.16em] text-slate-400">Format</h3><div className="grid grid-cols-2 gap-3">{[["xlsx", "Excel (.xlsx)", FileSpreadsheet, "Data sheets + methodology"], ["pdf", "PDF report", FileText, "Paginated executive report"]].map(([value, label, Icon, helper]) => <button key={value} type="button" onClick={() => setFormat(value)} className={`flex items-center gap-3 rounded-xl border p-3 text-left ${format === value ? "border-sky-300 bg-sky-50 dark:bg-sky-400/10" : "border-slate-200 dark:border-white/10"}`}><Icon className={`h-5 w-5 ${format === value ? "text-sky-600" : "text-slate-400"}`} /><span><span className="block text-sm font-black text-slate-800 dark:text-white">{label}</span><span className="text-[11px] text-slate-400">{helper}</span></span></button>)}</div></section>
      <section><h3 className="mb-3 text-xs font-black uppercase tracking-[.16em] text-slate-400">Report</h3><div className="grid gap-2 sm:grid-cols-2">{REPORTS.map(([value, label]) => <button key={value} type="button" onClick={() => setReport(value)} className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-xs font-bold ${report === value ? "border-sky-300 bg-sky-50 text-sky-800 dark:bg-sky-400/10 dark:text-sky-200" : "border-slate-200 text-slate-600 dark:border-white/10 dark:text-slate-300"}`}>{label}{report === value && <Check className="h-4 w-4" />}</button>)}</div></section>
      <section><div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-[.16em] text-slate-400">Columns</h3><button type="button" onClick={() => setColumns(Object.values(COLUMN_GROUPS).flat().map(([key]) => key))} className="text-xs font-bold text-sky-700">Select all</button></div><div className="space-y-4">{Object.entries(COLUMN_GROUPS).map(([group, items]) => <div key={group}><h4 className="mb-2 text-[11px] font-black text-slate-600 dark:text-slate-300">{group}</h4><div className="flex flex-wrap gap-2">{items.map(([key, label]) => <button key={key} type="button" onClick={() => toggle(key)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold ${columns.includes(key) ? "border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200" : "border-slate-200 text-slate-400 dark:border-white/10"}`}>{columns.includes(key) && <Check className="h-3 w-3" />}{label}</button>)}</div></div>)}</div></section>
      <section className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Sort by</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-900"><option value="overallScore">Overall score</option><option value="codingScore">Coding score</option><option value="assessmentScore">Assessment score</option><option value="learningCompletion">Learning completion</option><option value="studentName">Student name</option></select></label><div className="flex flex-col justify-center gap-2">{[[includeSummary, setIncludeSummary, "Include summary page"], [includeCharts, setIncludeCharts, "Include selected charts"]].map(([checked, setter, label]) => <label key={label} className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300"><input type="checkbox" checked={checked} onChange={(event) => setter(event.target.checked)} className="h-4 w-4 rounded accent-sky-600" />{label}</label>)}</div></section>
      {status.message && <p className={`rounded-xl border p-3 text-xs font-semibold ${status.state === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{status.message}</p>}
    </div>
    <footer className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-white/10 dark:bg-white/[.03] sm:px-6"><div><p className="text-xs font-bold text-slate-700 dark:text-slate-200">{summary}</p><p className="mt-0.5 text-[10px] text-slate-400">Filters and formula version will be included.</p></div><button type="button" disabled={!columns.length || status.state === "loading"} onClick={generate} className="inline-flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-black text-white shadow-lg shadow-sky-600/20 disabled:opacity-50">{status.state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Generate</button></footer>
  </motion.section></div>}</AnimatePresence>, document.body);
}
