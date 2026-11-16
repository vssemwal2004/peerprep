import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, BookOpen, Info, ListTree, Loader2, RefreshCw, Search, Table2, X } from "lucide-react";
import { adminAnalyticsApi } from "../api";
import { SortHeader, TablePager, nextSort } from "../../../components/table";

const AnalyticsChart = lazy(() => import("../charts/AnalyticsChart"));
const rowsOf = (payload) => Array.isArray(payload?.data) ? payload.data : payload?.data?.rows || payload?.data?.items || [];
const rowLabel = (row) => row?.name ?? row?.title ?? row?.topic ?? row?.subject ?? row?.group ?? row?.band ?? row?.bucket ?? row?.date ?? "Item";
const TABS = [["chart", "Chart", BarChart3], ["breakdown", "Breakdown", ListTree], ["data", "Detailed data", Table2], ["methodology", "Methodology", BookOpen]];
const SORT_FIELDS = {
  "activity-trend": ["bucket", "codingSolved", "learningCompleted", "assessmentsAttempted"], "student-ranking": ["name", "studentCode", "value"], "topic-student-heatmap": ["name", "studentId"],
  "topic-performance": ["topic", "source", "attempts", "participants", "completed", "rate"], "difficulty-analysis": ["topic", "Easy", "Medium", "Hard"], "assessment-topic-analysis": ["topic", "participants", "score"],
  "skill-radar": ["label", "score", "students"], "mastery-funnel": ["stage", "value", "rate"], "performance-distribution": ["label", "count"], "cohort-comparison": ["label", "students", "value"],
  "assessment-score-trend": ["title", "average", "median", "participants", "participationRate"], "learning-hierarchy": ["label", "topics", "eligiblePairs", "completedPairs", "engagedPairs", "completionRate", "engagementRate"],
  "question-conversion": ["title", "attempts", "attemptedStudents", "solvedStudents", "conversionRate"], "engagement-calendar": ["date", "activeStudents"], "score-effort-scatter": ["name", "score", "effort"], "source-mix": ["label", "value"],
};
// The details endpoint also sorts list graphs by any other plain row field (adminAnalytics.details.js);
// the student × topic heatmap only by its named fields.
const ROW_SORT_FIELD = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const serverSortable = (graphId, key) => Boolean(SORT_FIELDS[graphId]?.includes(key) || (graphId !== "topic-student-heatmap" && ROW_SORT_FIELD.test(key)));

function Breakdown({ payload }) {
  const rows = rowsOf(payload);
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row || {}).filter((key) => Number.isFinite(row[key]))))].filter((key) => !/id/i.test(key)).slice(0, 4);
  if (!rows.length || !keys.length) return <p className="p-6 text-sm text-slate-500">No row-level breakdown is available for this graph.</p>;
  return <div className="grid gap-3 p-5 lg:grid-cols-2">{rows.slice(0, 12).map((row, index) => <div key={row.id || row.studentId || row.date || index} className="rounded-lg border border-slate-200 p-3 dark:border-gray-800"><p className="truncate text-xs font-bold text-slate-900 dark:text-white">{rowLabel(row)}</p><div className="mt-2 grid grid-cols-2 gap-2">{keys.map((key) => <div key={key} className="rounded-md bg-slate-50 px-2 py-1.5 dark:bg-gray-800"><span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">{key.replace(/([A-Z])/g, " $1")}</span><span className="text-sm font-bold text-slate-800 dark:text-white">{Number(row[key]).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span></div>)}</div></div>)}</div>;
}

function inferColumns(rows, provided) {
  if (Array.isArray(provided) && provided.length) {
    if (rows.some((row) => Array.isArray(row?.cells))) return [{ key: "name", label: "Student", sortable: true }, { key: "studentId", label: "Student ID", sortable: true }, ...provided.map((column) => ({ key: `topic:${typeof column === "string" ? column : column.key || column.label}`, label: typeof column === "string" ? column : column.label || column.key, sortable: false }))];
    return provided.map((column) => typeof column === "string" ? { key: column, label: column.replace(/([A-Z])/g, " $1"), sortable: true } : { key: column.key || column.field, label: column.label || (column.key || column.field || "").replace(/([A-Z])/g, " $1"), sortable: column.sortable !== false }).filter((column) => column.key);
  }
  return [...new Set(rows.flatMap((row) => Object.keys(row || {}).filter((key) => ["string", "number", "boolean"].includes(typeof row[key]))))].slice(0, 16).map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1"), sortable: true }));
}

function normalizeDetails(result, requestedPage, requestedLimit) {
  const body = result?.data && !Array.isArray(result.data) ? result.data : result || {};
  const rows = body.rows || body.items || (Array.isArray(result?.data) ? result.data : []);
  const pagination = body.pagination || result?.meta?.pagination || {};
  const total = Number(body.total ?? pagination.totalRows ?? pagination.total ?? result?.meta?.total ?? rows.length);
  const page = Number(body.page ?? pagination.page ?? requestedPage);
  const limit = Number(body.limit ?? pagination.limit ?? requestedLimit);
  return { rows, columns: inferColumns(rows, body.columns || result?.graph?.columns || result?.columns), total, page, limit, totalPages: Math.max(1, Number(body.totalPages ?? pagination.totalPages ?? Math.ceil(total / limit))) };
}

function fallbackDetails(payload, { search, sort, page, limit }) {
  let rows = rowsOf(payload).filter((row) => row && typeof row === "object");
  if (search) { const needle = search.toLowerCase(); rows = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(needle)); }
  if (sort?.by) rows = [...rows].sort((left, right) => { const a = left[sort.by]; const b = right[sort.by]; if (a == null) return 1; if (b == null) return -1; const comparison = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true }); return sort.direction === "desc" ? -comparison : comparison; });
  const total = rows.length; const totalPages = Math.max(1, Math.ceil(total / limit)); const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * limit, safePage * limit);
  return { rows: pageRows, columns: inferColumns(rows, payload?.data?.columns || payload?.config?.topics), total, page: safePage, limit, totalPages };
}

function DetailTable({ definition, payload, query }) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  // Header sort in the shared table shape ({ key, direction }); the API takes { by, direction }.
  const [tableSort, setTableSort] = useState(null);
  const sort = useMemo(() => (tableSort ? { by: tableSort.key, direction: tableSort.direction } : null), [tableSort]);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ status: "idle", result: null, error: null });
  const unavailableKeyRef = useRef("");
  const queryKey = useMemo(() => JSON.stringify(query), [query]);
  const requestKey = `${definition.id}:${queryKey}`;

  useEffect(() => { const timer = setTimeout(() => { setPage(1); setSearch(searchInput.trim()); }, 320); return () => clearTimeout(timer); }, [searchInput]);
  useEffect(() => {
    if (unavailableKeyRef.current === requestKey) { setState({ status: "fallback", result: null, error: null }); return undefined; }
    const controller = new AbortController();
    setState((current) => ({ ...current, status: "loading", error: null }));
    adminAnalyticsApi.graphDetails(definition.id, { query, page, limit, search, sort, signal: controller.signal })
      .then((result) => setState({ status: "ready", result: normalizeDetails(result, page, limit), error: null }))
      .catch((error) => {
        if (error.name === "AbortError") return;
        if (error.status === 404 || error.status === 501) { unavailableKeyRef.current = requestKey; setState({ status: "fallback", result: null, error: null }); }
        else setState({ status: "error", result: null, error });
      });
    return () => controller.abort();
  }, [definition.id, limit, page, query, queryKey, requestKey, retry, search, sort]);

  const result = state.status === "fallback" ? fallbackDetails(payload, { search, sort, page, limit }) : state.result;
  const changeSort = (key) => { setPage(1); setTableSort((current) => nextSort(current, key)); };
  const changeLimit = (size) => { setLimit(size); setPage(1); };
  const valueFor = (row, key) => key.startsWith("topic:") ? row.cells?.find((cell) => cell.topic === key.slice(6))?.value : row[key];
  return <div className="flex h-full min-h-[420px] flex-col">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3 dark:border-gray-800"><div><p className="text-xs font-bold text-slate-900 dark:text-white">Detailed evidence</p><p className="mt-0.5 text-[10px] text-slate-400">{state.status === "fallback" ? "Interactive chart rows · detailed endpoint unavailable" : result ? `${result.total.toLocaleString()} matching rows` : "Fetched only when this tab opens"}</p></div><div className="flex flex-wrap items-center gap-2"><label className="relative"><span className="sr-only">Search detailed data</span><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search rows…" className="h-9 w-56 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900" /></label></div></div>
    {state.status === "loading" && <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500" role="status"><Loader2 className="h-5 w-5 animate-spin text-sky-600" />Loading detailed rows…</div>}
    {state.status === "error" && <div className="flex flex-1 flex-col items-center justify-center p-6 text-center"><Info className="h-7 w-7 text-rose-500" /><p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">Detailed data could not be loaded</p><p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{state.error?.message || "Please retry the request."}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-sky-600 px-3 text-xs font-bold text-white"><RefreshCw className="h-3.5 w-3.5" />Retry</button></div>}
    {result && <><div className="min-h-0 flex-1 overflow-auto"><table className="min-w-full text-left text-xs" style={{ "--serial-start": (Math.max(1, result.page) - 1) * result.limit }}><caption className="sr-only">Detailed data for {definition.title}</caption><thead className="sticky top-0 z-10 bg-white dark:bg-gray-900"><tr>{result.columns.map((column) => { const sortable = Boolean(column.sortable) && (state.status === "fallback" ? !column.key.startsWith("topic:") : serverSortable(definition.id, column.key)); return <SortHeader key={column.key} sortKey={column.key} sort={tableSort} onSort={changeSort} sortable={sortable} className="whitespace-nowrap border-b border-slate-200 px-3 py-2 capitalize dark:border-gray-700">{column.label}</SortHeader>; })}</tr></thead><tbody>{result.rows.map((row, index) => <tr key={row.id || row.studentId || row.date || index}>{result.columns.map((column) => { const value = valueFor(row, column.key); return <td key={column.key} className="max-w-xs truncate border-b border-slate-100 px-3 py-2 text-slate-700 dark:border-gray-800 dark:text-slate-300" title={value == null ? undefined : String(value)}>{value == null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}</td>; })}</tr>)}</tbody></table>{!result.rows.length && <p className="p-8 text-center text-sm text-slate-500">No detailed rows match this search.</p>}</div><TablePager page={result.page} pageSize={limit} total={result.total} onPage={setPage} onPageSize={changeLimit} busy={state.status === "loading"} className="dark:border-gray-800" /></>}
  </div>;
}

function Methodology({ definition, payload, meta }) {
  return <div className="mx-auto max-w-3xl space-y-4 p-6"><section className="rounded-xl border border-slate-200 p-4 dark:border-gray-800"><h3 className="text-sm font-bold text-slate-900 dark:text-white">How to read this graph</h3><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{definition.read}</p></section><section className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-4 dark:bg-gray-800"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Axes</p><p className="mt-2 text-xs leading-5 text-slate-700 dark:text-slate-200">X: {definition.xAxis}<br />Y: {definition.yAxis}<br />Unit: {definition.unit}</p></div><div className="rounded-xl bg-slate-50 p-4 dark:bg-gray-800"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Calculation contract</p><p className="mt-2 text-xs leading-5 text-slate-700 dark:text-slate-200">Formula version: {meta?.formulaVersion || "Not reported"}<br />Graph status: {payload?.status || "Ready"}</p></div></section>{(payload?.reason || payload?.note || payload?.evidence) && <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><Info className="mt-0.5 h-4 w-4 shrink-0" />{payload.reason || payload.note || payload.evidence}</div>}</div>;
}

export default function GraphDetailModal({ item, meta, query, onClose }) {
  const [tab, setTab] = useState("chart"); const panelRef = useRef(null); const previousFocus = useRef(null); const { definition, payload } = item || {};
  useEffect(() => { if (!item) return undefined; previousFocus.current = document.activeElement; const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; const onKey = (event) => { if (event.key === "Escape") onClose(); if (event.key === "Tab" && panelRef.current) { const nodes = [...panelRef.current.querySelectorAll('button,[href],input,select,[tabindex]:not([tabindex="-1"])')].filter((node) => !node.disabled); const first = nodes[0]; const last = nodes[nodes.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }; document.addEventListener("keydown", onKey); setTimeout(() => panelRef.current?.querySelector("button")?.focus(), 0); return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKey); previousFocus.current?.focus?.(); }; }, [item, onClose]);
  if (!item) return null;
  return createPortal(<div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="graph-detail-title" className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"><header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-gray-800"><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-sky-700 dark:text-sky-300">{definition.group} · {definition.chartType}</p><h2 id="graph-detail-title" className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{definition.title}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{definition.question} · {rowsOf(payload).length.toLocaleString()} visible chart rows</p></div><button type="button" onClick={onClose} aria-label="Close graph detail" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-gray-800"><X className="h-4 w-4" /></button></header><nav role="tablist" aria-label="Graph detail sections" className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 py-2 dark:border-gray-800">{TABS.map(([id, label, Icon]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold ${tab === id ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-gray-800"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</nav><div className="min-h-0 flex-1 overflow-auto">{tab === "chart" && <div className="h-full min-h-[480px] p-5" role="img" aria-label={`${definition.title}. ${definition.description}`}><Suspense fallback={<div className="h-full min-h-[440px] animate-pulse rounded-xl bg-slate-50 dark:bg-gray-800" aria-label="Loading detailed chart" />}><AnalyticsChart definition={definition} payload={payload} expanded /></Suspense></div>}{tab === "breakdown" && <Breakdown payload={payload} />}{tab === "data" && <DetailTable definition={definition} payload={payload} query={query} />}{tab === "methodology" && <Methodology definition={definition} payload={payload} meta={meta} />}</div></section></div>, document.body);
}
