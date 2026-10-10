import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpenCheck, Check, ChevronDown, ClipboardCheck, Code2, Layers3, Loader2, RotateCcw, Search, SlidersHorizontal, TrendingDown, Trophy, Users, UserRoundCheck, X } from "lucide-react";
import { adminAnalyticsApi } from "../api";
import { buildDependencies, createDefaultAnalyticsQuery } from "../analyticsQuery";
import { useAnalyticsOptions } from "../hooks/useAnalyticsOptions";
import AnalysisModeSelector from "./AnalysisModeSelector";

const MODE_SOURCES = {
  overview: ["coding", "assessments", "learning"],
  coding: ["coding"],
  assessments: ["assessments"],
  learning: ["learning"],
  students: ["coding", "assessments", "learning"],
};

function SearchMultiSelect({ type, label, value, onChange, query, placeholder = "Search and select…" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dependencies = useMemo(() => buildDependencies(query, type), [query, type]);
  const { items, loading, error, cursor } = useAnalyticsOptions(type, search, dependencies, open);
  const normalized = items.map((item) => ({ value: item.value ?? item.id ?? item._id, label: item.label ?? item.name ?? item.value }));
  const toggle = (option) => {
    const exists = value.some((entry) => String(entry) === String(option.value));
    onChange(exists ? value.filter((entry) => String(entry) !== String(option.value)) : [...value, option.value]);
  };
  return (
    <div className="relative" onKeyDown={(event) => { if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); } }}>
      <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">{label}</label>
      <button type="button" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((current) => !current)} className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 text-left text-xs transition hover:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-white/10 dark:bg-slate-900">
        <span className={value.length ? "font-semibold text-slate-800 dark:text-white" : "text-slate-400"}>{value.length ? `${value.length} selected` : placeholder}</span>
        <span className="flex items-center gap-2">{value.length > 0 && <span className="text-[10px] font-bold text-sky-700">Selected</span>}<ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-180" : ""}`} /></span>
      </button>
      {open && (
        <div className="absolute inset-x-0 z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
          <div className="relative border-b border-slate-100 p-2 dark:border-white/10"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${label.toLowerCase()}`} className="h-9 w-full rounded-lg bg-slate-100 pl-9 pr-3 text-xs outline-none ring-sky-200 focus:ring-2 dark:bg-white/5" /></div>
          <div role="listbox" aria-multiselectable="true" className="max-h-52 overflow-y-auto p-1.5">
            {value.length > 0 && <button type="button" onClick={() => onChange([])} className="mb-1 w-full rounded-lg px-2.5 py-2 text-left text-xs font-bold text-sky-700 hover:bg-sky-50">Clear selection</button>}
            {loading && <div className="flex items-center justify-center gap-2 py-7 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Searching…</div>}
            {!loading && error && <p className="p-4 text-center text-xs text-rose-600">Options could not be loaded.</p>}
            {!loading && !error && normalized.map((option) => {
              const selected = value.some((entry) => String(entry) === String(option.value));
              return <button key={option.value} type="button" role="option" aria-selected={selected} onClick={() => toggle(option)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs ${selected ? "bg-sky-50 font-bold text-sky-800 dark:bg-sky-400/10 dark:text-sky-200" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"}`}><span className={`flex h-4 w-4 items-center justify-center rounded border ${selected ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300"}`}>{selected && <Check className="h-3 w-3" />}</span><span className="truncate">{option.label}</span></button>;
            })}
            {!loading && !error && !normalized.length && <p className="p-5 text-center text-xs text-slate-400">No matching options</p>}
          </div>
          {cursor && <p className="border-t border-slate-100 px-3 py-2 text-[10px] text-slate-400 dark:border-white/10">Type to narrow thousands of available options.</p>}
        </div>
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function SectionTitle({ children, helper }) {
  return <div className="col-span-full border-b border-slate-100 pb-2 pt-2 dark:border-white/10"><h3 className="text-sm font-black text-slate-900 dark:text-white">{children}</h3>{helper && <p className="mt-1 text-xs leading-5 text-slate-400">{helper}</p>}</div>;
}

function Toggle({ label, helper, checked, onChange }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="col-span-full flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3 text-left dark:border-white/10"><span><span className="block text-xs font-bold text-slate-700 dark:text-slate-200">{label}</span>{helper && <span className="mt-0.5 block text-[11px] leading-4 text-slate-400">{helper}</span>}</span><span aria-hidden="true" className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-sky-600" : "bg-slate-200 dark:bg-slate-700"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${checked ? "left-6" : "left-1"}`} /></span></button>;
}

function FlowSection({ number, title, helper, children }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[.02]"><header className="mb-4 flex items-start gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[10px] font-black text-white dark:bg-sky-600">{number}</span><div><h3 className="text-sm font-black text-slate-950 dark:text-white">{title}</h3><p className="mt-0.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400">{helper}</p></div></header>{children}</section>;
}

function AnalysisTab({ draft, setDraft, allowedSources }) {
  const changeMode = (analysisType) => setDraft((current) => ({
    ...current,
    analysisType,
    activity: { ...current.activity, sources: (MODE_SOURCES[analysisType] || MODE_SOURCES.overview).filter((source) => !allowedSources || allowedSources.includes(source)) },
    graphs: { mode: "recommended", selectedIds: [] },
  }));
  const allowedModes = allowedSources && ['overview', 'students',
    ...(allowedSources.includes('coding') ? ['coding'] : []),
    ...(allowedSources.includes('assessments') ? ['assessments'] : []),
    ...(allowedSources.includes('learning') ? ['learning'] : [])];
  return <AnalysisModeSelector value={draft.analysisType || "overview"} onChange={changeMode} showIntro={false} allowedModes={allowedModes} />;
}

function PopulationTab({ draft, setDraft }) {
  const update = (key, value) => setDraft((current) => ({ ...current, population: { ...current.population, [key]: value } }));
  const chooseMode = (selectionMode) => setDraft((current) => {
    const requiredSource = { "coding-active": "coding", "assessment-active": "assessments", "learning-active": "learning" }[selectionMode];
    const sources = requiredSource && !current.activity.sources.includes(requiredSource)
      ? [...current.activity.sources, requiredSource]
      : selectionMode === "multi-source" && current.activity.sources.length < 2
        ? ["coding", "assessments", "learning"]
        : current.activity.sources;
    return { ...current, activity: { ...current.activity, sources }, population: { ...current.population, selectionMode, ...(selectionMode === "top" || selectionMode === "bottom" ? { rankSegment: selectionMode } : {}) } };
  });
  const setStudents = (studentIds) => setDraft((current) => ({ ...current, population: { ...current.population, studentIds, selectionMode: studentIds.length ? "selected" : current.population.selectionMode === "selected" ? "all" : current.population.selectionMode } }));
  const audienceModes = [
    ["all", "All eligible", "Every student matching cohort filters", Users],
    ["selected", "Selected students", "Search individual students", UserRoundCheck],
    ["top", "Top performers", "Analyze only the strongest N", Trophy],
    ["bottom", "Needs support", "Analyze only the lowest N", TrendingDown],
  ];
  const activityModes = [
    ["coding-active", "Coding active", Code2],
    ["assessment-active", "Assessment participants", ClipboardCheck],
    ["learning-active", "Learning active", BookOpenCheck],
    ["multi-source", "Active in 2+ sources", Layers3],
  ];
  return <div className="grid gap-3 sm:grid-cols-2">
    <div className="col-span-full grid gap-2 sm:grid-cols-2">{audienceModes.map(([value, label, helper, Icon]) => { const selected = draft.population.selectionMode === value; return <button key={value} type="button" onClick={() => chooseMode(value)} className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition ${selected ? "border-sky-300 bg-sky-50 ring-1 ring-sky-100 dark:bg-sky-400/10" : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/[.02]"}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${selected ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}><Icon className="h-3.5 w-3.5" /></span><span><span className="block text-xs font-bold text-slate-800 dark:text-white">{label}</span><span className="mt-0.5 block text-[10px] leading-4 text-slate-400">{helper}</span></span></button>; })}</div>
    {draft.population.selectionMode === "selected" && <div className="col-span-full"><SearchMultiSelect type="studentIds" label="Find students" value={draft.population.studentIds} onChange={setStudents} query={draft} placeholder="Search by name, ID or email…" /></div>}
    {(draft.population.selectionMode === "top" || draft.population.selectionMode === "bottom") && <><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">How many students?</span><input type="number" min="1" max="250" value={draft.population.rankN} onChange={(event) => update("rankN", Math.min(250, Math.max(1, Number(event.target.value) || 1)))} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-sky-100 dark:border-white/10 dark:bg-slate-900" /></label><SelectField label="Measure performance by" value={draft.population.rankMetric} onChange={(value) => update("rankMetric", value)} options={[{ value: "overall", label: "Overall evidence score" }, { value: "coding", label: "Coding / DSA" }, { value: "assessment", label: "Assessment score" }, { value: "learning", label: "Learning completion" }, { value: "consistency", label: "Activity consistency" }]} /></>}
    <details className="col-span-full rounded-lg border border-slate-200 bg-slate-50/70 dark:border-white/10 dark:bg-white/[.02]"><summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200">More student filters <span className="ml-1 text-[10px] font-medium text-slate-400">Optional · semester, group, batch, activity</span></summary><div className="grid gap-3 border-t border-slate-200 p-3 dark:border-white/10 sm:grid-cols-2"><div className="col-span-full"><p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Students with recorded activity</p><div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">{activityModes.map(([value, label, Icon]) => { const selected = draft.population.selectionMode === value; return <button key={value} type="button" onClick={() => chooseMode(value)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center text-[10px] font-bold transition ${selected ? "border-violet-300 bg-violet-50 text-violet-800 dark:bg-violet-400/10 dark:text-violet-200" : "border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-white/[.02]"}`}><Icon className="h-3.5 w-3.5" />{label}</button>; })}</div></div><SearchMultiSelect type="uploadBatchIds" label="Excel upload batches" value={draft.population.uploadBatchIds} onChange={(value) => update("uploadBatchIds", value)} query={draft} /><SearchMultiSelect type="semesters" label="Semesters" value={draft.population.semesters} onChange={(value) => update("semesters", value)} query={draft} /><SearchMultiSelect type="groups" label="Groups / sections" value={draft.population.groups} onChange={(value) => update("groups", value)} query={draft} /><SearchMultiSelect type="branches" label="Branches" value={draft.population.branches} onChange={(value) => update("branches", value)} query={draft} /><SearchMultiSelect type="courses" label="Courses" value={draft.population.courses} onChange={(value) => update("courses", value)} query={draft} /><SearchMultiSelect type="colleges" label="Campus / college" value={draft.population.colleges} onChange={(value) => update("colleges", value)} query={draft} /><SearchMultiSelect type="status" label="Student status" value={draft.population.status} onChange={(value) => update("status", value)} query={draft} />{!['top', 'bottom'].includes(draft.population.selectionMode) && <><SelectField label="Ranking direction" value={draft.population.rankSegment} onChange={(value) => update("rankSegment", value)} options={[{ value: "top", label: "Top performers" }, { value: "bottom", label: "Lowest performers" }]} /><SelectField label="Ranking metric" value={draft.population.rankMetric} onChange={(value) => update("rankMetric", value)} options={["overall", "coding", "assessment", "learning", "consistency"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} /></>}</div><div className="border-t border-slate-200 p-3 dark:border-white/10"><Toggle label="Require minimum evidence" helper="Prevents one lucky attempt from being treated as strong performance." checked={draft.population.minimumEvidence} onChange={(value) => update("minimumEvidence", value)} /></div></details>
  </div>;
}

function ActivityTab({ draft, setDraft, allowedSources }) {
  const update = (key, value) => setDraft((current) => ({ ...current, activity: { ...current.activity, [key]: value } }));
  const toggleSource = (source) => {
    const required = { "coding-active": "coding", "assessment-active": "assessments", "learning-active": "learning" }[draft.population.selectionMode];
    const minimum = draft.population.selectionMode === "multi-source" ? 2 : 1;
    if (draft.activity.sources.includes(source) && (draft.activity.sources.length === minimum || source === required)) return;
    update("sources", draft.activity.sources.includes(source) ? draft.activity.sources.filter((item) => item !== source) : [...draft.activity.sources, source]);
  };
  const sourcesEditable = ["overview", "students"].includes(draft.analysisType);
  return <div className="grid gap-3 sm:grid-cols-2">
    {sourcesEditable ? <div className="col-span-full grid grid-cols-3 gap-2">{["coding", "assessments", "learning"].filter((source) => !allowedSources || allowedSources.includes(source)).map((source) => <button type="button" aria-pressed={draft.activity.sources.includes(source)} key={source} onClick={() => toggleSource(source)} className={`rounded-lg border px-2 py-2.5 text-xs font-bold capitalize transition ${draft.activity.sources.includes(source) ? "border-sky-300 bg-sky-50 text-sky-800 dark:bg-sky-400/10 dark:text-sky-200" : "border-slate-200 text-slate-400 dark:border-white/10"}`}>{source}</button>)}</div> : <div className="col-span-full rounded-lg bg-slate-50 px-3 py-2.5 text-[11px] text-slate-600 dark:bg-white/[.04] dark:text-slate-300"><strong className="capitalize">{draft.activity.sources.join(" + ")}</strong> evidence is selected automatically for this analysis.</div>}
    <SelectField label="Date window" value={draft.activity.datePreset} onChange={(value) => update("datePreset", value)} options={["7d", "30d", "90d", "180d", "365d", "custom"].map((value) => ({ value, label: value === "custom" ? "Custom dates" : `Last ${value.slice(0, -1)} days` }))} />
    {draft.activity.datePreset === "custom" && <><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">From</span><input type="date" value={draft.activity.dateFrom} onChange={(event) => update("dateFrom", event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-900" /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">To</span><input type="date" value={draft.activity.dateTo} onChange={(event) => update("dateTo", event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-900" /></label></>}
    <details className="col-span-full rounded-lg border border-slate-200 bg-slate-50/70 dark:border-white/10 dark:bg-white/[.02]"><summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200">More evidence filters <span className="ml-1 text-[10px] font-medium text-slate-400">Optional · topics, assessment, language, difficulty</span></summary><div className="grid gap-3 border-t border-slate-200 p-3 dark:border-white/10 sm:grid-cols-2">{draft.activity.sources.includes("coding") && <><SectionTitle>Coding details</SectionTitle><SelectField label="Submission source" value={draft.activity.codingMode} onChange={(value) => update("codingMode", value)} options={[{ value: "both", label: "Practice + assessment" }, { value: "practice", label: "Practice only" }, { value: "assessment", label: "Assessment only" }]} /><SearchMultiSelect type="codingTopics" label="Topics / tags" value={draft.activity.codingTopics} onChange={(value) => update("codingTopics", value)} query={draft} /><SearchMultiSelect type="difficulties" label="Difficulty" value={draft.activity.difficulties} onChange={(value) => update("difficulties", value)} query={draft} /><SearchMultiSelect type="languages" label="Languages" value={draft.activity.languages} onChange={(value) => update("languages", value)} query={draft} /><SearchMultiSelect type="verdicts" label="Verdicts" value={draft.activity.verdicts} onChange={(value) => update("verdicts", value)} query={draft} /><SearchMultiSelect type="problemIds" label="Problems" value={draft.activity.problemIds} onChange={(value) => update("problemIds", value)} query={draft} /></>}{draft.activity.sources.includes("assessments") && <><SectionTitle>Assessment details</SectionTitle><SearchMultiSelect type="assessmentIds" label="Completed assessments" value={draft.activity.assessmentIds} onChange={(value) => update("assessmentIds", value)} query={draft} /><SearchMultiSelect type="assessmentTypes" label="Assessment type" value={draft.activity.assessmentTypes} onChange={(value) => update("assessmentTypes", value)} query={draft} /><SearchMultiSelect type="questionTypes" label="Contains question type" value={draft.activity.questionTypes} onChange={(value) => update("questionTypes", value)} query={draft} /><SearchMultiSelect type="sections" label="Contains section" value={draft.activity.sections} onChange={(value) => update("sections", value)} query={draft} /><SearchMultiSelect type="assessmentTopics" label="Question topic" value={draft.activity.assessmentTopics} onChange={(value) => update("assessmentTopics", value)} query={draft} /></>}{draft.activity.sources.includes("learning") && <><SectionTitle>Learning details</SectionTitle><SearchMultiSelect type="subjectIds" label="Subjects" value={draft.activity.subjectIds} onChange={(value) => update("subjectIds", value)} query={draft} /><SearchMultiSelect type="chapterIds" label="Chapters" value={draft.activity.chapterIds} onChange={(value) => update("chapterIds", value)} query={draft} /><SearchMultiSelect type="learningTopicIds" label="Topics" value={draft.activity.learningTopicIds} onChange={(value) => update("learningTopicIds", value)} query={draft} /></>}</div></details>
  </div>;
}

function ComparisonTab({ draft, setDraft }) {
  const update = (key, value) => setDraft((current) => ({ ...current, comparison: { ...current.comparison, [key]: value } }));
  return <div className="grid gap-3 sm:grid-cols-2"><SelectField label="Compare students by" value={draft.comparison.compareBy} onChange={(value) => update("compareBy", value)} options={["none", "semester", "branch", "course", "group", "college", "uploadBatch", "assessment", "learningSubject", "topic"].map((value) => ({ value, label: value === "none" ? "Do not compare groups" : value.replace(/([A-Z])/g, " $1") }))} />{draft.comparison.compareBy !== "none" && <SelectField label="Trend grouping" value={draft.comparison.timeGrain} onChange={(value) => update("timeGrain", value)} options={["auto", "day", "week", "month"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} />}</div>;
}

export default function FilterDrawer({ open, query, onClose, onApply, allowedSources }) {
  const [draft, setDraft] = useState(query);
  const [estimate, setEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  useEffect(() => { if (open) { setDraft(structuredClone(query)); triggerRef.current = document.activeElement; } }, [open, query]);
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
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
    document.addEventListener("keydown", onKeyDown); document.body.style.overflow = "hidden";
    setTimeout(() => panelRef.current?.focus(), 0);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = ""; triggerRef.current?.focus?.(); };
  }, [open, onClose]);
  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => { setEstimating(true); try { setEstimate(await adminAnalyticsApi.estimate(draft, controller.signal)); } catch { setEstimate(null); } finally { setEstimating(false); } }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [draft, open]);
  const reset = () => {
    const next = createDefaultAnalyticsQuery();
    if (allowedSources) next.activity.sources = allowedSources;
    setDraft(next);
  };
  return createPortal(<AnimatePresence>{open && <div className="fixed inset-0 z-[100]">
    <motion.button type="button" aria-label="Close filters" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" />
    <motion.aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="analytics-filter-title" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className="absolute inset-y-0 right-0 flex w-full flex-col bg-slate-50 shadow-2xl outline-none dark:bg-slate-950 sm:max-w-[720px]">
      <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-950 sm:px-5"><div className="flex items-center justify-between gap-4"><div><div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-sky-600" /><h2 id="analytics-filter-title" className="text-base font-bold text-slate-950 dark:text-white">Filters</h2></div><p className="mt-0.5 text-[11px] text-slate-400">Choose the goal, students and evidence. Optional controls stay collapsed.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button></div></div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4"><FlowSection number="1" title="Choose the analysis" helper="This decides which charts and insights appear."><AnalysisTab draft={draft} setDraft={setDraft} allowedSources={allowedSources} /></FlowSection><FlowSection number="2" title="Choose students" helper="Start broad; use optional cohort filters only when needed."><PopulationTab draft={draft} setDraft={setDraft} /></FlowSection><FlowSection number="3" title="Choose evidence" helper="Select the time window. Detailed source filters are optional."><ActivityTab draft={draft} setDraft={setDraft} allowedSources={allowedSources} /></FlowSection><FlowSection number="4" title="Compare groups (optional)" helper="Leave this off unless you need a side-by-side cohort comparison."><ComparisonTab draft={draft} setDraft={setDraft} /></FlowSection></div>
      <footer className="border-t border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-slate-950 sm:px-5"><div className="mb-2.5 flex items-center justify-between gap-3 text-[11px]"><span className="text-slate-500">{estimating ? "Checking filters…" : estimate ? <><strong className="text-slate-800 dark:text-slate-200">{Number(estimate.cohortSize).toLocaleString()} students will be analyzed</strong>{estimate.baseCohortSize !== estimate.cohortSize ? ` · from ${Number(estimate.baseCohortSize).toLocaleString()} eligible` : ""}</> : "Student count will appear here"}</span>{(estimate?.warnings?.[0] || estimate?.warning) && <span className="font-bold text-amber-600">{estimate.warnings?.[0] || estimate.warning}</span>}</div><div className="flex items-center justify-between gap-3"><button type="button" onClick={reset} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><RotateCcw className="h-3.5 w-3.5" /> Reset</button><div className="flex gap-2"><button type="button" onClick={onClose} className="h-10 rounded-lg border border-slate-200 px-4 text-xs font-bold text-slate-600 dark:border-white/10 dark:text-slate-300">Cancel</button><button type="button" onClick={() => onApply(draft)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-sky-600 px-5 text-xs font-bold text-white shadow-md shadow-sky-600/20 hover:bg-sky-500"><Check className="h-3.5 w-3.5" /> Apply filters</button></div></div></footer>
    </motion.aside>
  </div>}</AnimatePresence>, document.body);
}
