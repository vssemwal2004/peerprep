import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, FileSpreadsheet, Filter, Loader2, Maximize2, Search, Sheet, UserRound, X,
} from "lucide-react";
import { formatScore } from "../../../student/prepScore/formatScore";
import { drillChart, useChartDownload } from "../chartActions";
import { AnimatedNumber } from "./Motion";
import { sectionStyle } from "./sectionStyles";
import { Button, IconButton, focusRing } from "./ui";

const PAGE_SIZE = 50;

function cellText(value, kind) {
  if (value === null || value === undefined || value === "") return "—";
  if (kind === "percent") return `${Number(value).toLocaleString()}%`;
  if (kind === "decimal") return formatScore(value);
  if (typeof value === "number") return value.toLocaleString();
  return value;
}

function Tile({ label, children, hint }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 dark:border-gray-800 dark:bg-white/[0.02]" title={hint}>
      <p className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-[19px] font-extrabold leading-7 tracking-tight text-slate-900 dark:text-white">{children}</p>
    </div>
  );
}

/** The students (or problems…) behind one part, searched, sorted and paged on the server. */
function useDrill(analysis, chartId, key, view, group) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "", direction: "" });
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, error: "", result: null });
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  // Students and problems have different columns, so a new tab starts on its own order.
  useEffect(() => { setSort({ key: "", direction: "" }); setPage(1); }, [view]);
  const requestKey = JSON.stringify({ filters: analysis.state, focus: analysis.focus, compare: analysis.compareRequest, entry: analysis.entryById?.get(chartId), chartId, key, view, group, query, sort, page });
  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: "" }));
    drillChart(analysis, chartId, { key, view, group, search: query, sort: sort.key, direction: sort.direction, page, limit: PAGE_SIZE }, controller.signal)
      .then((result) => setState({ loading: false, error: "", result }))
      .catch((error) => { if (error.name !== "AbortError") setState((current) => ({ ...current, loading: false, error: error.message })); });
    return () => controller.abort();
    // requestKey stands for every input of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);
  const sortBy = (columnKey) => {
    const current = sort.key ? sort : { key: state.result?.sort, direction: state.result?.direction };
    setSort({ key: columnKey, direction: current.key === columnKey && current.direction === "desc" ? "asc" : "desc" });
    setPage(1);
  };
  return { ...state, search, setSearch, query, sortBy, setPage };
}

function DrillTable({ drill, onStudent }) {
  const { result } = drill;
  const columns = result?.columns || [];
  if (drill.error) return <p className="p-6 text-[12.5px] text-rose-600">{drill.error}</p>;
  if (!result) return <div className="flex h-48 items-center justify-center text-[12px] text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</div>;
  if (!result.rows.length) return <p className="p-10 text-center text-[12.5px] text-slate-500">{drill.query ? `Nothing matches “${drill.query}”.` : "No students here."}</p>;
  return (
    <table data-no-serial className="min-w-full text-[12px]">
      <thead className="sticky top-0 z-10 bg-white text-[11px] text-slate-500 shadow-[0_1px_0_rgba(15,23,42,0.06)] dark:bg-gray-900 dark:text-slate-400">
        <tr>
          {columns.map((column) => {
            const active = result.sort === column.key;
            return (
              <th key={column.key} scope="col" aria-sort={active ? (result.direction === "asc" ? "ascending" : "descending") : "none"} className={`whitespace-nowrap px-3 py-2 font-semibold ${column.kind === "text" ? "text-left" : "text-right"}`}>
                <button type="button" onClick={() => drill.sortBy(column.key)} className={`inline-flex items-center gap-0.5 rounded hover:text-slate-900 dark:hover:text-white ${active ? "text-slate-900 dark:text-white" : ""} ${focusRing}`}>
                  {column.label}{active && (result.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
        {result.rows.map((row, rowIndex) => (
          <tr key={`${row.id}-${rowIndex}`} tabIndex={0} onClick={() => onStudent?.(row.id)} onKeyDown={(event) => { if (event.key === "Enter") onStudent?.(row.id); }}
            className={`cursor-pointer transition-colors hover:bg-sky-50/70 focus:bg-sky-50 focus:outline-none dark:hover:bg-sky-500/10 ${drill.loading ? "opacity-60" : ""}`}>
            {row.cells.map((cell, index) => {
              const column = columns[index];
              return (
                <td key={column?.key || index} title={typeof cell === "string" ? cell : undefined}
                  className={`px-3 py-2 ${index === 0 ? "font-semibold text-slate-900 dark:text-white" : column?.kind !== "text" ? "text-right tabular-nums text-slate-800 dark:text-slate-100" : "max-w-[260px] truncate text-slate-600 dark:text-slate-300"}`}>
                  {cellText(cell, column?.kind)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * What is behind one part of a chart (a difficulty, a topic, a week, a student's Hard
 * problems…): its figures, the students (and their problems), and its downloads.
 * `layered`: the student drawer is open on top, so Escape belongs to it.
 */
function PartDialogBody({ analysis, chart, part, layered, onClose, onStudent, onOpenFull, onFocus }) {
  const reduced = useReducedMotion();
  const titleId = useId();
  const [tab, setTab] = useState("students");
  const group = part.group ?? null;
  const drill = useDrill(analysis, chart.id, part.key, tab, group);
  const download = useChartDownload(analysis, chart.id);
  const result = drill.result;
  const style = sectionStyle(chart.section);
  const students = result?.students ?? part.students;
  const cohort = result?.cohort ?? chart.summary?.cohort;
  const value = Number.isFinite(part.value) ? part.value : null;
  const showValue = value !== null && value !== students;
  const average = showValue && students > 1 ? value / students : null;
  const label = [chart.title, part.groupLabel, part.label].filter(Boolean).join(" · ");

  useEffect(() => {
    if (layered) return undefined;
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [layered, onClose]);

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-3 sm:p-6" data-platform-popup-root>
      <motion.button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={onClose}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
      <motion.section role="dialog" aria-modal="true" aria-labelledby={titleId}
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.24)] dark:border-gray-700 dark:bg-gray-900">
        <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 dark:border-gray-800">
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.chip}`}>
            {part.color ? <span className="h-3.5 w-3.5 rounded-[4px]" style={{ backgroundColor: part.color }} /> : <style.Icon className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-[16px] font-bold text-slate-950 dark:text-white">{result?.label || part.label}</h2>
            <p className="truncate text-[12px] text-slate-500 dark:text-slate-400">{chart.title}{part.groupLabel ? ` · ${part.groupLabel}` : ""}</p>
          </div>
          <IconButton label="Close" onClick={onClose}><X className="h-4 w-4" /></IconButton>
        </header>

        <div className="grid grid-cols-2 gap-2.5 px-5 pt-4 sm:grid-cols-4">
          <Tile label="Students" hint="Students behind this part, of the students in view">
            {students !== undefined ? <><AnimatedNumber value={students} /><span className="text-[12px] font-semibold text-slate-400"> / {Number(cohort || 0).toLocaleString()}</span></> : "—"}
          </Tile>
          <Tile label="Of students in view">{students !== undefined && cohort ? <AnimatedNumber value={(students / cohort) * 100} format={(number) => `${number.toFixed(1)}%`} /> : "—"}</Tile>
          {showValue && <Tile label={part.unit ? part.unit[0].toUpperCase() + part.unit.slice(1) : "Value"}><AnimatedNumber value={value} /></Tile>}
          {average !== null && <Tile label="Per student" hint="The value above divided by these students"><AnimatedNumber value={average} format={(number) => number.toFixed(1)} /></Tile>}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 pb-2 pt-4">
          {result?.detail && (
            <div role="tablist" aria-label="Show" className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-white/[0.06]">
              {[["students", "Students"], ["detail", result.detail.title || "Details"]].map(([value, text]) => (
                <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}
                  className={`h-7 rounded-md px-3 text-[12px] font-semibold transition-colors ${tab === value ? "bg-white text-slate-900 shadow-sm dark:bg-gray-800 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400"} ${focusRing}`}>
                  {text}
                </button>
              ))}
            </div>
          )}
          <label className="relative ml-auto w-full max-w-xs">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input type="search" value={drill.search} onChange={(event) => drill.setSearch(event.target.value)} placeholder={tab === "students" ? "Search students" : "Search"}
              className={`h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2.5 text-[12px] outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-white/[0.03] ${focusRing}`} />
          </label>
        </div>

        <div className="mx-5 min-h-[220px] flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-gray-800">
          <DrillTable drill={drill} onStudent={onStudent} />
        </div>

        <footer className="flex flex-wrap items-center gap-2 px-5 py-3.5">
          {result && result.pages > 1 ? (
            <span className="flex items-center gap-1 text-[12px] text-slate-500">
              <IconButton label="Previous page" disabled={result.page <= 1} onClick={() => drill.setPage(result.page - 1)}><ChevronLeft className="h-4 w-4" /></IconButton>
              <span className="tabular-nums">{((result.page - 1) * result.limit + 1).toLocaleString()}–{Math.min(result.total, result.page * result.limit).toLocaleString()} of {result.total.toLocaleString()}</span>
              <IconButton label="Next page" disabled={result.page >= result.pages} onClick={() => drill.setPage(result.page + 1)}><ChevronRight className="h-4 w-4" /></IconButton>
            </span>
          ) : <span className="text-[12px] text-slate-400">{result ? `${result.total.toLocaleString()} ${result.total === 1 ? "row" : "rows"}` : ""}</span>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {part.studentId && <Button onClick={() => onStudent(part.studentId)}><UserRound className="h-3.5 w-3.5" />Full profile</Button>}
            {onFocus && group === null && <Button onClick={() => onFocus(part)} title="Show the whole page for just these students"><Filter className="h-3.5 w-3.5" />Filter page to these</Button>}
            {onOpenFull && <Button onClick={onOpenFull}><Maximize2 className="h-3.5 w-3.5" />Full chart</Button>}
            <Button disabled={download.busy} onClick={() => download.run("csv", part.key, label, group)}><Sheet className="h-3.5 w-3.5" />CSV</Button>
            <Button tone="primary" disabled={download.busy} onClick={() => download.run("xlsx", part.key, label, group)}>
              {download.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}Download Excel
            </Button>
          </div>
        </footer>
      </motion.section>
    </div>
  );
}

/** The popup for a clicked part: `open` is { chart, part } or null. */
export default function PartDialog({ open, ...props }) {
  return createPortal(
    <AnimatePresence>
      {open && <PartDialogBody key={`${open.chart.id}:${open.part.key}:${open.part.group ?? ""}`} chart={open.chart} part={open.part} {...props} />}
    </AnimatePresence>,
    document.body,
  );
}
