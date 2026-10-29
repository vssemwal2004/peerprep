import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCheck, Filter, ListChecks, Loader2, Search, UserPlus, Undo2, Upload, Users, X } from "lucide-react";
import { api } from "../../../utils/api";
import InterviewStudentEditor from "../../../components/interviews/InterviewStudentEditor";
import { useDebounced } from "../useRemote";
import { Drawer, FilterField, Notice, Pagination, Select, ToneChip, ghostClass, inputClass, primaryClass, secondaryClass, surfaceClass, tableHeadClass } from "../ui";
import { CheckBox, ConfirmDialog, Initials, OutcomePill, Segmented } from "./scheduleUi";
import { BOOKING_META, MAX_COHORT, departmentLabel, formatIst, hasFilter, isRemovableTarget, yearLabel } from "./scheduleModel";

/*
 * Step 2 of the schedule wizard (and the "Add students" dialog): build the cohort by batch filters, by
 * picking students in a searchable table, or from a CSV roster. A sticky bar shows the selection and
 * opens the list, where single students can be removed.
 *   mode "create": filters schedule everyone who matches (resolved when scheduling).
 *   mode "edit":   `assigned` students start selected and are labelled "Already assigned"; unticking one
 *                  asks first, and the removal happens on save (their booking is then cancelled).
 *   mode "add":    `assigned` students are shown ticked and locked; only new students can be chosen.
 */
const FILTER_FIELDS = [
  ["semester", "Semester", "semesters"],
  ["branch", "Department", "branches"],
  ["course", "Course", "courses"],
  ["college", "College", "colleges"],
  ["group", "Batch / group", "groups"],
];
const EMPTY_FILTERS = Object.freeze({ semester: "", branch: "", course: "", college: "", group: "" });
const PAGE_SIZE = 25;
const sid = (student) => String(student?._id ?? "");
const plural = (count, word) => `${Number(count).toLocaleString("en-IN")} ${word}${count === 1 ? "" : "s"}`;
const facetOptions = (facets, facet, value, emptyLabel) => {
  const options = (facets[facet] || []).map((option) => ({ value: String(option.value), label: option.count !== undefined ? `${option.label || option.value} (${option.count})` : String(option.label || option.value) }));
  if (value && !options.some((option) => option.value === String(value))) options.unshift({ value: String(value), label: String(value) });
  return [{ value: "", label: emptyLabel }, ...options];
};

/** "Already added · Booked 4 Nov, 10:00 am" for a student on this schedule or in another active one. */
function AssignedTag({ row }) {
  const booking = row?.booking?.active ? BOOKING_META[row.booking.status] : null;
  return <span className="inline-flex flex-wrap items-center gap-1">
    <ToneChip tone="indigo" dot={false} className="text-[11px]">Already added</ToneChip>
    {row?.schedule?.title ? <span className="text-[11px] text-slate-500 dark:text-gray-400">· {row.schedule.title}</span> : null}
    {booking ? <ToneChip tone={booking.tone} className="text-[11px]" title={row.booking.startsAt ? formatIst(row.booking.startsAt) : undefined}>{booking.label}{row.booking.startsAt ? ` · ${formatIst(row.booking.startsAt, { suffix: false })}` : ""}</ToneChip>
      : row?.outcome && row.outcome !== "pending" ? <OutcomePill outcome={row.outcome} /> : null}
  </span>;
}

function useStudentPage({ search, semester, branch, page, limit }) {
  const [state, setState] = useState({ students: [], pagination: { page: 1, pages: 1, total: 0, limit }, facets: {}, loading: true, error: "" });
  const ticket = useRef(0);
  useEffect(() => {
    const mine = ++ticket.current;
    setState((current) => ({ ...current, loading: true, error: "" }));
    api.listAllStudents({ search, semester, branch, page, limit, sortOrder: "asc" })
      .then((data) => {
        if (mine !== ticket.current) return;
        const students = Array.isArray(data?.students) ? data.students : [];
        const total = Number(data?.pagination?.total ?? data?.total ?? students.length) || 0;
        setState((current) => ({
          students, loading: false, error: "",
          pagination: { page: Number(data?.pagination?.page) || page, limit, total, pages: Math.max(1, Number(data?.pagination?.pages) || Math.ceil(total / limit)) },
          facets: data?.facets && Object.keys(data.facets).length ? data.facets : current.facets,
        }));
      })
      .catch((cause) => { if (mine === ticket.current) setState((current) => ({ ...current, students: [], loading: false, error: cause.message || "Students could not be loaded." })); });
  }, [search, semester, branch, page, limit]);
  return state;
}

/** The searchable, paginated student table with row checkboxes. */
function PickTable({ mode, selectedIds, assigned, onToggle, onAddMany, onRemoveMany, onBusyChange }) {
  const [search, setSearch] = useState("");
  const [semester, setSemester] = useState("");
  const [branch, setBranch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [bulk, setBulk] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const settled = useDebounced(search.trim(), 300);
  const { students, pagination, facets, loading, error } = useStudentPage({ search: settled, semester, branch, page, limit });
  useEffect(() => { onBusyChange?.(bulk); }, [bulk, onBusyChange]);
  const narrowed = Boolean(settled || semester || branch);
  const locked = (student) => {
    const row = assigned.get(sid(student));
    return Boolean(row) && (mode !== "edit" || !isRemovableTarget(row));
  };
  const selectable = students.filter((student) => !locked(student));
  const onPage = selectable.filter((student) => selectedIds.has(sid(student))).length;
  const allOnPage = selectable.length > 0 && onPage === selectable.length;
  const togglePage = () => (allOnPage ? onRemoveMany(selectable) : onAddMany(selectable.filter((student) => !selectedIds.has(sid(student)))));
  const selectMatching = async () => {
    setBulk(true); setBulkError("");
    try {
      const data = await api.listAllStudents({ search: settled, semester, branch, page: 1, limit: MAX_COHORT, sortOrder: "asc" });
      onAddMany((Array.isArray(data?.students) ? data.students : []).filter((student) => !locked(student)));
    } catch (cause) { setBulkError(cause.message || "The matching students could not be selected."); }
    finally { setBulk(false); }
  };
  const reset = (setter) => (value) => { setter(value); setPage(1); };
  return <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-gray-800">
    <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-3 dark:border-gray-800 dark:bg-gray-950/40 md:grid-cols-[minmax(0,1fr)_10.5rem_10.5rem_auto]">
      <label className="relative block">
        <span className="sr-only">Search students</span>
        <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
        <input type="search" className={`${inputClass} pl-9`} value={search} onChange={(event) => reset(setSearch)(event.target.value)} placeholder="Search by name, roll number or email" />
      </label>
      <Select aria-label="Filter by semester" value={semester} onChange={(event) => reset(setSemester)(event.target.value)} options={facetOptions(facets, "semesters", semester, "All semesters")} />
      <Select aria-label="Filter by department" value={branch} onChange={(event) => reset(setBranch)(event.target.value)} options={facetOptions(facets, "branches", branch, "All departments")} />
      <button type="button" className={secondaryClass} disabled={!narrowed || bulk || loading || !pagination.total || pagination.total > MAX_COHORT} onClick={selectMatching}
        title={pagination.total > MAX_COHORT ? `Narrow the search to ${MAX_COHORT.toLocaleString("en-IN")} or fewer students` : "Select every student matching the search and filters"}>
        {bulk ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <CheckCheck size={14} aria-hidden="true" />}
        {narrowed ? `Select all ${Number(pagination.total).toLocaleString("en-IN")}` : "Select all matching"}
      </button>
    </div>
    {bulkError && <div className="px-3 pt-3"><Notice error>{bulkError}</Notice></div>}
    <div className="overflow-x-auto">
      <table data-no-serial className="w-full min-w-[760px] text-left text-sm">
        <caption className="sr-only">Registered students</caption>
        <thead className={tableHeadClass}>
          <tr>
            <th scope="col" className="w-12 px-4 py-2.5"><CheckBox label="Select every student on this page" checked={allOnPage} indeterminate={onPage > 0} disabled={!selectable.length} onChange={togglePage} /></th>
            <th scope="col" className="px-2 py-2.5 font-semibold">Student</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Roll / ID</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Email</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Department</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Year</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
          {loading && !students.length ? Array.from({ length: 5 }, (_, index) => <tr key={index}><td colSpan={6} className="px-4 py-3"><div className="h-6 animate-pulse rounded-md bg-slate-100 dark:bg-gray-800" /></td></tr>)
            : error ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-rose-600 dark:text-rose-400">{error}</td></tr>
              : !students.length ? <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-gray-400">{narrowed ? "No students match this search." : "No registered students yet."}</td></tr>
                : students.map((student) => {
                  const key = sid(student);
                  const checked = selectedIds.has(key) || (mode !== "edit" && assigned.has(key));
                  const row = assigned.get(key);
                  const isLocked = locked(student);
                  return <tr key={key} className={`transition-colors ${checked ? "bg-sky-50/60 dark:bg-sky-400/[0.06]" : "hover:bg-slate-50/80 dark:hover:bg-white/[0.03]"} ${isLocked ? "" : "cursor-pointer"}`}
                    onClick={(event) => { if (!isLocked && !event.target.closest("input,button,a")) onToggle(student); }}>
                    <td className="px-4 py-2.5"><CheckBox label={`Select ${student.name || "student"}`} checked={checked} disabled={isLocked} onChange={() => onToggle(student)} /></td>
                    <td className="px-2 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Initials name={student.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900 dark:text-gray-100">{student.name || "Unnamed student"}</p>
                          {row && <div className="mt-0.5"><AssignedTag row={row} /></div>}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12px] text-slate-600 dark:text-gray-300">{student.studentId || "—"}</td>
                    <td className="max-w-[16rem] truncate px-3 py-2.5 text-[13px] text-slate-600 dark:text-gray-300" title={student.email}>{student.email || "—"}</td>
                    <td className="px-3 py-2.5 text-[13px] text-slate-600 dark:text-gray-300">{departmentLabel(student) || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[13px] tabular-nums text-slate-600 dark:text-gray-300">{yearLabel(student.semester)}</td>
                  </tr>;
                })}
        </tbody>
      </table>
    </div>
    <Pagination value={pagination} onPage={setPage} onLimit={(value) => { setLimit(value); setPage(1); }} />
  </div>;
}

/** Batch filters. In "create" everyone who matches is scheduled; otherwise the matching students are added. */
function FilterTab({ mode, filters, onFiltersChange, onCount, onBusy, onAddMatching, pickedCount }) {
  const [facets, setFacets] = useState({});
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const settled = useDebounced(filters, 350);
  const request = useRef(0);
  // Busy from the first change (including the debounce), so Continue never validates a stale count.
  const counting = loading || settled !== filters;
  useEffect(() => { onBusy?.(counting || adding); }, [counting, adding, onBusy]);
  useEffect(() => () => onBusy?.(false), [onBusy]);
  useEffect(() => {
    const ticket = ++request.current;
    setLoading(true); setError("");
    api.listAllStudents({ ...settled, page: 1, limit: 1, skipCache: true })
      .then((result) => {
        if (ticket !== request.current) return;
        setFacets(result?.facets || {});
        const total = Number(result?.pagination?.total ?? result?.total ?? 0);
        const next = hasFilter(settled) ? total : null;
        setCount(next); onCount?.(next);
      })
      .catch((cause) => { if (ticket === request.current) { setError(cause.message || "Student filters could not be loaded."); setCount(null); onCount?.(null); } })
      .finally(() => { if (ticket === request.current) setLoading(false); });
  }, [settled, onCount]);
  const addMatching = async () => {
    setAdding(true); setError("");
    try {
      const data = await api.listAllStudents({ ...settled, page: 1, limit: MAX_COHORT, sortOrder: "asc" });
      onAddMatching(Array.isArray(data?.students) ? data.students : []);
    } catch (cause) { setError(cause.message || "The matching students could not be added."); }
    finally { setAdding(false); }
  };
  const tooMany = count !== null && count > MAX_COHORT;
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {FILTER_FIELDS.map(([key, label, facet]) => <FilterField key={key} label={label}>
        <Select aria-label={label === "Department" ? "Branch" : label} value={String(filters[key] ?? "")} onChange={(event) => onFiltersChange({ ...filters, [key]: event.target.value })} options={facetOptions(facets, facet, filters[key], `Any ${label.toLowerCase()}`)} />
      </FilterField>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-gray-800 dark:bg-gray-950/50" aria-live="polite">
      <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-gray-200">
        {loading ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" />Counting matching students…</>
          : count === null ? <span className="text-slate-500 dark:text-gray-400">Choose at least one filter to see who matches.</span>
            : <span><strong className="tabular-nums text-slate-900 dark:text-white">{count.toLocaleString("en-IN")}</strong> students match now{tooMany ? <span className="text-rose-600 dark:text-rose-400"> · more than the {MAX_COHORT.toLocaleString("en-IN")} limit</span> : ""}.</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {hasFilter(filters) && <button type="button" className={ghostClass} onClick={() => onFiltersChange({ ...EMPTY_FILTERS })}><X size={14} aria-hidden="true" />Clear filters</button>}
        {(mode !== "create" || count) && <button type="button" className={mode === "create" ? secondaryClass : primaryClass} disabled={!count || tooMany || counting || adding} onClick={addMatching}>
          {adding ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <UserPlus size={14} aria-hidden="true" />}
          {mode === "create" ? "Pick from these students instead" : `Add ${count ? count.toLocaleString("en-IN") : ""} matching students`.replace("  ", " ")}
        </button>}
      </div>
    </div>
    {mode === "create" && <p className="text-xs leading-relaxed text-slate-500 dark:text-gray-400">Everyone who matches all chosen filters when you schedule is assigned. Inactive and assessment-only accounts are left out, and students who join later are not added. Department, course and college are self-reported in student profiles; for an exact cohort, pick students or upload a roster.</p>}
    {mode === "create" && pickedCount > 0 && <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300"><AlertTriangle size={14} aria-hidden="true" className="mt-px shrink-0" />Scheduling by filters ignores the {plural(pickedCount, "student")} you picked. Open Pick students to keep them.</p>}
    {error && <Notice error>{error}</Notice>}
  </div>;
}

/** The selected students in a drawer: search, remove one, and undo a pending removal (edit). */
function SelectionDrawer({ mode, selected, assigned, removedRows, onRemove, onUndo, onClose }) {
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const rows = needle ? selected.filter((student) => [student.name, student.email, student.studentId].some((value) => String(value || "").toLowerCase().includes(needle))) : selected;
  const shown = rows.slice(0, 500);
  return <Drawer title={mode === "edit" ? "Students on this schedule" : "Selected students"} description={`${plural(selected.length, "student")}${removedRows.length ? ` · ${removedRows.length} to remove when you save` : ""}`} onClose={onClose}
    footer={<button type="button" className={primaryClass} onClick={onClose}>Done</button>}>
    <label className="relative block">
      <span className="sr-only">Search selected students</span>
      <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
      <input type="search" className={`${inputClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the selection" />
    </label>
    <section className={`${surfaceClass} overflow-hidden`} aria-label="Selected students">
      {shown.length ? <ul className="divide-y divide-slate-100 dark:divide-gray-800">
        {shown.map((student) => {
          const row = assigned.get(sid(student));
          const locked = Boolean(row) && (mode === "add" || !isRemovableTarget(row));
          return <li key={sid(student)} className="flex items-center gap-3 px-4 py-2.5">
            <Initials name={student.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-gray-100">{student.name || "Student"}</p>
              <p className="truncate text-xs text-slate-500 dark:text-gray-400">{[student.studentId, student.email, departmentLabel(student)].filter(Boolean).join(" · ")}</p>
            </div>
            {row ? <AssignedTag row={row} /> : mode === "edit" ? <ToneChip tone="emerald" className="text-[11px]">New</ToneChip> : null}
            <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
              disabled={locked} title={locked ? "Started or completed; stays on the schedule" : "Remove"} aria-label={`Remove ${student.name || "student"} from the selection`} onClick={() => onRemove(student)}><X size={15} aria-hidden="true" /></button>
          </li>;
        })}
      </ul> : <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-gray-400">{needle ? "No selected student matches." : "No students selected yet."}</p>}
      {rows.length > shown.length && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-gray-800 dark:text-gray-400">Showing the first 500 of {rows.length.toLocaleString("en-IN")}.</p>}
    </section>
    {removedRows.length > 0 && <section className={`${surfaceClass} overflow-hidden`} aria-label="Students to remove">
      <h3 className="border-b border-slate-100 px-4 py-2.5 text-[13px] font-semibold text-rose-700 dark:border-gray-800 dark:text-rose-300">Removed when you save ({removedRows.length})</h3>
      <ul className="divide-y divide-slate-100 dark:divide-gray-800">
        {removedRows.map((row) => <li key={row.studentId} className="flex items-center gap-3 px-4 py-2.5">
          <Initials name={row.student?.name} size="sm" />
          <p className="min-w-0 flex-1 truncate text-sm text-slate-600 line-through decoration-slate-400 dark:text-gray-300">{row.student?.name || "Student"}</p>
          <button type="button" className={ghostClass} onClick={() => onUndo(row)}><Undo2 size={14} aria-hidden="true" />Undo</button>
        </li>)}
      </ul>
    </section>}
  </Drawer>;
}

export default function StudentPicker({
  mode = "create", selected, onChange, assigned = new Map(), source = "selected", onSourceChange,
  filters = EMPTY_FILTERS, onFiltersChange, onFilterCount, onFilterBusy, onBusyChange, onPendingChange, filterCount = null,
}) {
  const [tab, setTab] = useState(() => (mode === "create" && source === "filters" ? "filters" : mode === "create" && source === "csv" ? "csv" : "pick"));
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [individual, setIndividual] = useState(false);
  const selectedIds = useMemo(() => new Set(selected.map(sid)), [selected]);
  const removedRows = useMemo(() => (mode === "edit" ? [...assigned.values()].filter((row) => row.status !== "removed" && !selectedIds.has(String(row.studentId))) : []), [mode, assigned, selectedIds]);
  const fresh = mode === "add" ? selected.length : selected.filter((student) => !assigned.has(sid(student))).length;
  const byFilters = mode === "create" && tab === "filters";

  const choose = (next) => {
    setTab(next);
    if (mode === "create") onSourceChange?.(next === "filters" ? "filters" : next === "csv" ? "csv" : "selected");
  };
  const add = (students) => {
    const known = new Set(selectedIds);
    const additions = students.filter((student) => {
      const key = sid(student);
      if (!key || known.has(key) || (mode === "add" && assigned.has(key))) return false;
      known.add(key);
      return true;
    });
    if (additions.length) onChange([...selected, ...additions]);
  };
  const drop = (students) => {
    const gone = new Set(students.map(sid));
    onChange(selected.filter((student) => !gone.has(sid(student))));
  };
  // Removing an already-assigned student is consequential (their booking is cancelled), so it asks first.
  const remove = (student) => {
    const row = assigned.get(sid(student));
    if (row && mode === "edit") { if (isRemovableTarget(row)) setConfirm({ student, row }); return; }
    drop([student]);
  };
  const toggle = (student) => (selectedIds.has(sid(student)) ? remove(student) : add([student]));
  const removeMany = (students) => {
    const plain = students.filter((student) => !(mode === "edit" && assigned.has(sid(student))));
    const guarded = students.length - plain.length;
    if (plain.length) drop(plain);
    if (guarded === 1) remove(students.find((student) => assigned.has(sid(student))));
    else if (guarded > 1) setConfirm({ many: students.filter((student) => assigned.has(sid(student)) && isRemovableTarget(assigned.get(sid(student)))) });
  };
  const clear = () => (mode === "edit" ? onChange(selected.filter((student) => assigned.has(sid(student)))) : onChange([]));
  const undo = (row) => add([{ _id: String(row.studentId), name: row.student?.name, email: row.student?.email, studentId: row.student?.studentCode, branch: row.student?.branch, course: row.student?.course, semester: row.student?.semester }]);
  const tooMany = !byFilters && selected.length > MAX_COHORT;

  const summary = byFilters
    ? filterCount === null
      ? <span className="text-slate-500 dark:text-gray-400">Choose a filter to see who will be assigned</span>
      : <><strong className="tabular-nums text-slate-900 dark:text-white">{filterCount.toLocaleString("en-IN")}</strong> students match <span className="text-slate-500 dark:text-gray-400">· everyone who matches is assigned</span></>
    : mode === "edit"
      ? <><strong className="tabular-nums text-slate-900 dark:text-white">{selected.length.toLocaleString("en-IN")}</strong> on this schedule
        {fresh > 0 && <span className="text-emerald-700 dark:text-emerald-300"> · {fresh.toLocaleString("en-IN")} new</span>}
        {removedRows.length > 0 && <span className="text-rose-700 dark:text-rose-300"> · {removedRows.length.toLocaleString("en-IN")} to remove</span>}</>
      : <><strong className="tabular-nums text-slate-900 dark:text-white">{(mode === "add" ? fresh : selected.length).toLocaleString("en-IN")}</strong> {mode === "add" ? "new " : ""}selected</>;

  return <div className="space-y-4">
    <div data-selection-bar className="sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
      <p className="flex min-w-0 items-center gap-2.5 text-sm text-slate-700 dark:text-gray-200" aria-live="polite">
        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300"><Users size={15} /></span>
        <span className="min-w-0">{summary}{tooMany && <span className="text-rose-600 dark:text-rose-400"> · over the {MAX_COHORT.toLocaleString("en-IN")} limit</span>}</span>
      </p>
      {!byFilters && <div className="flex items-center gap-1.5">
        <button type="button" className={secondaryClass} disabled={!selected.length && !removedRows.length} onClick={() => setDrawer(true)}><ListChecks size={14} aria-hidden="true" />Review list</button>
        <button type="button" className={ghostClass} disabled={mode === "edit" ? !fresh : !selected.length} onClick={clear}>{mode === "edit" ? "Clear new" : "Clear"}</button>
      </div>}
    </div>

    <section className={`${surfaceClass} p-4 sm:p-5`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented label="How to choose students" value={tab} onChange={choose} items={[
          { value: "filters", label: "Filter by batch", icon: Filter },
          { value: "pick", label: "Pick students", icon: Users },
          { value: "csv", label: "Upload CSV", icon: Upload },
        ]} />
        <p className="text-xs text-slate-500 dark:text-gray-400">{{ filters: mode === "create" ? "Assign everyone in a semester, department or batch." : "Add everyone in a semester, department or batch.", pick: "Search, filter and tick students.", csv: "Match a roster file to registered students." }[tab]}</p>
      </div>
      {tab === "filters" && <FilterTab mode={mode} filters={filters} onFiltersChange={(next) => (onFiltersChange ? onFiltersChange(next) : null)} onCount={onFilterCount} onBusy={onFilterBusy || onBusyChange}
        pickedCount={selected.length} onAddMatching={(students) => { add(students); choose("pick"); }} />}
      {tab === "pick" && <PickTable mode={mode} selectedIds={selectedIds} assigned={assigned} onToggle={toggle} onAddMany={add} onRemoveMany={removeMany} onBusyChange={onBusyChange} />}
      {tab === "csv" && <div className="space-y-4">
        <InterviewStudentEditor key={individual ? "individual" : "bulk"} mode={individual ? "individual" : "bulk"} special={false} selected={selected}
          onChange={(next) => add(next.filter((student) => !selectedIds.has(sid(student))))} onPendingChange={onPendingChange || (() => {})} />
        <button type="button" className={ghostClass} onClick={() => setIndividual(!individual)}>{individual ? <><Upload size={14} aria-hidden="true" />Upload a CSV instead</> : <><UserPlus size={14} aria-hidden="true" />Add one student by email or ID</>}</button>
      </div>}
    </section>

    {drawer && <SelectionDrawer mode={mode} selected={selected} assigned={assigned} removedRows={removedRows} onRemove={remove} onUndo={undo} onClose={() => setDrawer(false)} />}
    {confirm && <ConfirmDialog danger title={confirm.many ? `Remove ${confirm.many.length} students` : "Remove from schedule"} confirmLabel={confirm.many ? `Remove ${confirm.many.length} students` : "Remove student"}
      message={confirm.many
        ? `Remove ${confirm.many.length} already-assigned students when you save? Their future bookings are cancelled and they are notified. Interviews already started stay.`
        : `Remove ${confirm.student.name || "this student"} when you save?${confirm.row.booking?.active && confirm.row.booking.startsAt ? ` Their booking on ${formatIst(confirm.row.booking.startsAt)} is cancelled and the seat is released.` : ""} They are notified and can no longer take this interview as scheduled.`}
      onClose={() => setConfirm(null)}
      onConfirm={() => { drop(confirm.many || [confirm.student]); setConfirm(null); }} />}
  </div>;
}
