import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarClock, Check, CheckCircle2, ClipboardList, Eye, Info, Loader2, Lock, Pencil, Search, ShieldCheck, SlidersHorizontal, Users, X } from "lucide-react";
import { interviewApi } from "../api";
import { ROOT, uid } from "../definition";
import { useDebounced } from "../useRemote";
import { EmptyState, Notice, ToneChip, ghostClass, inputClass, primaryClass, secondaryClass, surfaceClass } from "../ui";
import { scheduleApi } from "./schedulesApi";
import { PolicyFields, WindowSlotFields } from "./scheduleFields";
import { Choice, ScheduleFrame, SectionCard, StatusPill } from "./scheduleUi";
import { ineligibleRows, recheckStudents } from "./scheduleStudents";
import StudentPicker from "./StudentPicker";
import {
  INTERVIEW_MODES,
  MAX_COHORT,
  VISIBILITY_OPTIONS,
  WEEKDAYS,
  blockingTargets,
  buildSchedulePatch,
  buildSchedulePayload,
  conflictOf,
  draftFromAssignment,
  formatIst,
  idOf,
  isEditable,
  istInputToIso,
  newScheduleDraft,
  previewSlots,
  sourceLabel,
  studentFromTarget,
  targetDelta,
  validateInterviewStep,
  validatePolicyStep,
  validateStudentStep,
  validateWindowStep,
} from "./scheduleModel";

const STEPS = ["Interview & mode", "Students", "Window & slots", "Policies & reports", "Review & schedule"];
const minutesOf = (summary = {}) => (summary.budgetSeconds ? Math.ceil(summary.budgetSeconds / 60) : null);
const PICKER_LIMIT = 100;
const sameSet = (a, b) => {
  if (a.length !== b.length) return false;
  const known = new Set(a);
  return b.every((value) => known.has(value));
};
const metaLine = (interview = {}) => [interview.role, interview.companyName, minutesOf(interview.summary) ? `${minutesOf(interview.summary)} min` : null].filter(Boolean).join(" · ");
const filterText = (filters = {}) => Object.entries(filters).filter(([, value]) => String(value ?? "").trim())
  .map(([key, value]) => (key === "semester" ? `Semester ${value}` : String(value))).join(" · ");

function InterviewPicker({ value, onChange }) {
  const [search, setSearch] = useState("");
  const settled = useDebounced(search);
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setError("");
    // Filtered on publication, not on draft validation: an interview edited after publishing still
    // schedules its published version.
    interviewApi.list({ published: "true", sort: "title", limit: PICKER_LIMIT, page: 1, search: settled })
      .then((result) => { if (alive) setItems((result?.items || []).filter((item) => item.publishedAt)); })
      .catch((cause) => { if (alive) { setItems([]); setError(cause.message || "Interviews could not be loaded."); } });
    return () => { alive = false; };
  }, [settled]);
  const list = items || [];
  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Search published interviews</span>
        <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
        <input className={`${inputClass} pl-9`} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by title, role or company" />
      </label>
      {error && <Notice error>{error}</Notice>}
      {items === null ? <p className="py-6 text-center text-sm text-slate-500 dark:text-gray-400" aria-busy="true">Loading interviews…</p>
        : list.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-gray-700 dark:text-gray-400">{settled ? "No published interview matches this search." : "No published interviews yet. Publish one from the Interviews page, then schedule it here."}</p>
          : <div role="radiogroup" aria-label="Published interviews" className="grid max-h-[26rem] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
            {list.map((item) => {
              const active = idOf(item) === value;
              return <button key={idOf(item)} type="button" role="radio" aria-checked={active} onClick={() => onChange(item)}
                className={`flex min-w-0 items-center gap-3 rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${active ? "border-sky-500 bg-sky-50/70 ring-1 ring-sky-500 dark:border-sky-500 dark:bg-sky-400/10" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600 dark:hover:bg-gray-800/60"}`}>
                <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-gray-400"}`}><ClipboardList size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900 dark:text-gray-100">{item.title || "Untitled interview"}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-gray-400">{metaLine(item) || "Published"}</span>
                </span>
                <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 dark:border-gray-600"}`}>{active && <Check size={12} strokeWidth={3} />}</span>
              </button>;
            })}
          </div>}
      {items?.length >= PICKER_LIMIT && <p className="text-xs text-slate-500 dark:text-gray-400">Showing the first {PICKER_LIMIT} published interviews. Search to find others.</p>}
    </div>
  );
}

/** The chosen interview as one compact card; "Change" only when the wizard was opened from Schedules. */
function InterviewCard({ interview, loading, canChange, onChange, editing, snapshotRevision }) {
  return <section aria-label="Chosen interview" data-interview-summary className={`${surfaceClass} flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap sm:p-5`}>
    <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300"><ClipboardList size={20} /></span>
    <div className="min-w-0 flex-1">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-gray-400">Interview</p>
      {loading ? <div className="mt-1.5 h-5 w-64 max-w-full animate-pulse rounded bg-slate-100 dark:bg-gray-800" />
        : <>
          <p className="mt-0.5 truncate text-[15px] font-semibold text-slate-900 dark:text-white">{interview?.title || "Selected interview"}</p>
          {metaLine(interview) && <p className="mt-0.5 truncate text-[13px] text-slate-500 dark:text-gray-400">{metaLine(interview)}</p>}
        </>}
    </div>
    <div className="flex shrink-0 items-center gap-3">
      {editing ? <ToneChip tone="slate" icon={Lock}>{snapshotRevision ? `Published version ${snapshotRevision}` : "Pinned version"}</ToneChip>
        : interview?.publishedAt ? <ToneChip tone="emerald">Published</ToneChip> : null}
      {canChange && <button type="button" onClick={onChange} className="rounded-md px-1 text-sm font-semibold text-sky-700 hover:text-sky-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-400 dark:hover:text-sky-300">Change</button>}
    </div>
  </section>;
}

/** Live summary beside the steps: what is chosen so far, and in edit mode what will change. */
function SummaryRail({ editing, interview, modeLabel, students, timing, windowText, visibility, changes, step, done }) {
  const rows = [
    ["Interview", interview?.title || "Not chosen", ClipboardList, 0],
    ["Mode", modeLabel, SlidersHorizontal, 0],
    ["Students", students, Users, 1],
    ["Window", windowText, CalendarClock, 2],
    ["Timing", timing, CalendarClock, 2],
    ["Reports", visibility, Eye, 3],
  ];
  return <aside aria-label="Schedule summary" className={`${surfaceClass} p-5`}>
    <h2 className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">{editing ? "Schedule" : "Summary"}</h2>
    <dl className="mt-4 space-y-3.5">
      {rows.map(([label, value, Icon, index]) => <div key={label} className="flex gap-3">
        <span aria-hidden="true" className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${done(index) ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300" : index === step ? "bg-sky-50 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300" : "bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-gray-500"}`}>
          {done(index) ? <Check size={13} strokeWidth={3} /> : <Icon size={13} />}
        </span>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-slate-500 dark:text-gray-400">{label}</dt>
          <dd className="mt-0.5 break-words text-[13px] font-medium leading-5 text-slate-900 dark:text-gray-100">{value || "—"}</dd>
        </div>
      </div>)}
    </dl>
    {editing && <div className="mt-5 border-t border-slate-100 pt-4 dark:border-gray-800">
      <h3 className="text-xs font-semibold text-slate-700 dark:text-gray-200">Changes on save</h3>
      {changes.length ? <ul className="mt-2 space-y-1.5 text-[13px] text-slate-600 dark:text-gray-300">{changes.map((text) => <li key={text} className="flex gap-2"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />{text}</li>)}</ul>
        : <p className="mt-2 text-[13px] text-slate-500 dark:text-gray-400">No changes yet.</p>}
    </div>}
  </aside>;
}

function ReviewSection({ title, icon: Icon, onEdit, children }) {
  return <section className="px-5 py-4 sm:px-6">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Icon size={15} aria-hidden="true" className="text-slate-400 dark:text-gray-500" />{title}</h3>
      <button type="button" className={ghostClass} onClick={onEdit} aria-label={`Edit ${title.toLowerCase()}`}><Pencil size={13} aria-hidden="true" />Edit</button>
    </div>
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">{children}</dl>
  </section>;
}
function Summary({ label, children }) {
  return <div className="min-w-0"><dt className="text-xs font-medium text-slate-500 dark:text-gray-400">{label}</dt><dd className="mt-0.5 break-words text-sm font-medium text-slate-900 dark:text-gray-100">{children}</dd></div>;
}

/** 409 ALREADY_ASSIGNED: who already has this interview elsewhere and can only be skipped. */
function ConflictPanel({ conflict, busy, onSkip }) {
  return <section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/70 dark:bg-amber-950/30">
    <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200"><AlertTriangle size={16} aria-hidden="true" />{conflict.count.toLocaleString("en-IN")} student{conflict.count === 1 ? " is" : "s are"} already assigned this interview</h3>
    <p className="mt-1 text-[13px] text-amber-800 dark:text-amber-300">They already have this interview in another active schedule (scheduled, open or paused). Skip them now; once that schedule is cancelled or closed they can be assigned again.</p>
    <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-[13px] text-amber-900 dark:text-amber-200">
      {conflict.conflicts.map((row) => <li key={row.studentId}><span className="font-medium">{row.name || row.email || row.studentCode || "Student"}</span>{row.title ? <span className="text-amber-700 dark:text-amber-400"> · in “{row.title}”</span> : null}</li>)}
      {conflict.count > conflict.conflicts.length && <li>and {(conflict.count - conflict.conflicts.length).toLocaleString("en-IN")} more</li>}
    </ul>
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" className={primaryClass} disabled={busy} onClick={onSkip}>Skip them and continue</button>
    </div>
  </section>;
}

export default function ScheduleWizard({ navigation }) {
  const { id: editId = "" } = useParams();
  const editing = Boolean(editId);
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const presetId = editing ? "" : params.get("interviewId") || "";
  // "Change" is offered only when the admin came from the Schedules page, not from an interview's menu.
  const fromSchedules = params.get("from") === "schedules" || location.state?.from === "schedules";
  // "Edit students" on a schedule opens the edit wizard on the Students step.
  const [step, setStep] = useState(() => (editing && params.get("step") === "students" ? 1 : 0));
  const [visited, setVisited] = useState(() => new Set(editing ? [0, 1, 2, 3, 4] : [0]));
  const [draft, setDraft] = useState(() => newScheduleDraft(presetId));
  const [interview, setInterview] = useState(null);
  const [interviewLoading, setInterviewLoading] = useState(Boolean(presetId));
  const [picking, setPicking] = useState(!presetId && !editing);
  const [selected, setSelected] = useState([]);
  const [filterCount, setFilterCount] = useState(null);
  const [filterBusy, setFilterBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [pendingImport, setPendingImport] = useState(false);
  const [invalidRows, setInvalidRows] = useState([]);
  const [conflict, setConflict] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Edit mode: the saved schedule, its assigned students and the draft it started from.
  const [assignment, setAssignment] = useState(null);
  const [assigned, setAssigned] = useState(() => new Map());
  const [loadError, setLoadError] = useState("");
  const original = useRef(null);
  const busyRef = useRef(false), key = useRef(uid()), headingRef = useRef(null);
  // The selected ids the eligibility check last passed; any later change is checked again.
  const checkedIds = useRef(null);
  // Edit saves run in phases (settings, removals, additions); a retry skips the phases already done.
  const saved = useRef({ patch: false, remove: false });

  // A preset interview (from "Assign to students") is loaded even if it is not on the first page.
  useEffect(() => {
    if (!presetId) return undefined;
    let alive = true;
    interviewApi.get(presetId).then((doc) => {
      if (!alive || !doc) return;
      setInterview((current) => current || { _id: doc._id, title: doc.title, role: doc.role ?? doc.data?.role, companyName: doc.companyName ?? doc.data?.companyName, publishedAt: doc.publishedAt, summary: doc.summary });
    }).catch(() => { if (alive) setPicking(true); })
      .finally(() => { if (alive) setInterviewLoading(false); });
    return () => { alive = false; };
  }, [presetId]);

  // Before submit, lock students who hold this interview in another active schedule (scheduled, open or
  // paused, not yet closed). Cancelled and closed schedules do not block a new assignment.
  useEffect(() => {
    if (editing || !draft.interviewId) {
      if (!editing) setAssigned(new Map());
      return undefined;
    }
    let alive = true;
    setAssigned(new Map());
    scheduleApi.interviewTargets(draft.interviewId, { status: "all", limit: MAX_COHORT })
      .then((result) => {
        if (!alive) return;
        setAssigned(blockingTargets(result));
      })
      .catch(() => { if (alive) setAssigned(new Map()); });
    return () => { alive = false; };
  }, [editing, draft.interviewId]);

  // Edit: load the schedule and every assigned student (they start selected, labelled "Already assigned").
  useEffect(() => {
    if (!editing) return undefined;
    let alive = true;
    Promise.all([scheduleApi.get(editId, { limit: 10 }), scheduleApi.targets(editId, { limit: MAX_COHORT })])
      .then(([detail, list]) => {
        if (!alive) return;
        const schedule = detail?.assignment || detail || {};
        const rows = (list?.rows || []).filter((row) => row.status !== "removed");
        const start = { ...newScheduleDraft(schedule.interviewId), mode: schedule.mode || "mock", source: "selected", ...draftFromAssignment(schedule) };
        original.current = start;
        setAssignment(schedule);
        setDraft(start);
        setAssigned(new Map(rows.map((row) => [String(row.studentId), row])));
        setSelected(rows.map(studentFromTarget));
        checkedIds.current = rows.map((row) => String(row.studentId));
        setInterview({ _id: schedule.interviewId, title: schedule.title, role: schedule.role, publishedAt: true });
        interviewApi.get(schedule.interviewId).then((doc) => {
          if (alive && doc) setInterview((current) => ({ ...current, companyName: doc.companyName ?? doc.data?.companyName, summary: doc.summary }));
        }).catch(() => {});
      })
      .catch((cause) => { if (alive) setLoadError(cause.message || "This schedule could not be loaded."); });
    return () => { alive = false; };
  }, [editing, editId]);

  const update = (patch) => { setDraft((current) => ({ ...current, ...patch })); setError(""); setConflict(null); };
  const changeStudents = (students) => { setSelected(students); setInvalidRows([]); setError(""); setConflict(null); };
  const cohortSize = draft.source === "filters" ? filterCount : selected.length;
  const estimatedMinutes = minutesOf(interview?.summary);
  const assignedIds = useMemo(() => [...assigned.keys()], [assigned]);
  const delta = useMemo(() => targetDelta(assignedIds, selected), [assignedIds, selected]);
  const patch = useMemo(() => (editing && assignment ? buildSchedulePatch(assignment, draft) : {}), [editing, assignment, draft]);

  const goTo = (value) => {
    setStep(value); setError(""); setNow(Date.now());
    setVisited((current) => new Set(current).add(value));
    requestAnimationFrame(() => { headingRef.current?.focus?.(); });
  };
  const problemAt = (index) => {
    if (index === 0) return validateInterviewStep(draft, interview);
    if (index === 1) return validateStudentStep(draft, { selected, filterCount, busy: selecting, pending: pendingImport, counting: filterBusy });
    if (index === 2) {
      if (!editing) return validateWindowStep(draft, { now: Date.now() });
      return validateWindowStep(draft, { now: Date.now(), allowPastOpen: draft.opensAt === original.current?.opensAt, checkSchedule: Boolean(patch.window || patch.slotPolicy) });
    }
    if (index === 3) return validatePolicyStep(draft);
    return "";
  };

  // Checks the students not yet on the schedule unless this exact selection already passed. Throws
  // (and shows the rows) when some are not eligible.
  const checkStudents = async () => {
    if (draft.source === "filters") return true;
    const ids = selected.map((student) => String(student._id));
    if (checkedIds.current && sameSet(checkedIds.current, ids)) return true;
    setInvalidRows([]);
    const fresh = editing ? selected.filter((student) => !assigned.has(String(student._id))) : selected;
    const invalid = fresh.length ? await recheckStudents(fresh) : [];
    if (invalid.length) { setInvalidRows(invalid); throw new Error("Some selected students are not eligible. Review the records below."); }
    checkedIds.current = ids;
    return true;
  };

  const next = async () => {
    if (busyRef.current) return;
    const problem = problemAt(step);
    if (problem) { setError(problem); return; }
    if (step === 1 && draft.source !== "filters") {
      busyRef.current = true; setBusy(true);
      try {
        await checkStudents();
      } catch (cause) {
        setError(cause.message || "The selected students could not be checked.");
        return;
      } finally { busyRef.current = false; setBusy(false); }
    }
    goTo(step + 1);
  };

  const removeIneligible = () => {
    const bad = new Set(invalidRows.map((row) => String(row._id || "")).filter(Boolean));
    const fresh = editing ? selected.filter((student) => !assigned.has(String(student._id))) : selected;
    const rows = new Set(invalidRows.filter((row) => !row._id).map((row) => row.row));
    const badFresh = new Set(fresh.filter((_, index) => rows.has(index + 1)).map((student) => String(student._id)));
    changeStudents(selected.filter((student) => !bad.has(String(student._id)) && !badFresh.has(String(student._id))));
  };

  const failWith = (cause, fallback) => {
    const code = cause.response?.data?.code;
    const clash = conflictOf(cause);
    const ineligible = code === "INVALID_STUDENTS" ? ineligibleRows(selected, cause.response?.data?.invalid) : [];
    if (clash) {
      setConflict(clash);
      setError("");
    } else if (ineligible.length) {
      // Name the accounts the server refused instead of a bare message.
      checkedIds.current = null;
      setInvalidRows(ineligible);
      goTo(1);
      setError(`${ineligible.length.toLocaleString("en-IN")} selected student${ineligible.length === 1 ? " is" : "s are"} not eligible. Remove ${ineligible.length === 1 ? "it" : "them"} below, then try again.`);
    } else {
      setError(code === "INTERVIEW_NOT_PUBLISHED" ? "This interview is no longer published. Publish it again, then schedule."
        : code === "ASSIGNMENT_CREATING" ? "This schedule is still being created. Wait a moment, then select Schedule interview again."
          : code === "REVISION_CONFLICT" ? "This schedule changed since you opened it. Reload the page to edit the latest version."
            : cause.message || fallback);
    }
  };

  const validateAll = async () => {
    for (let index = 0; index < 4; index += 1) {
      const problem = problemAt(index);
      if (problem) { goTo(index); setError(problem); return false; }
    }
    // Students added after the first check (the step buttons skip Continue) are checked here.
    try {
      await checkStudents();
    } catch (cause) {
      goTo(1); setError(cause.message || "The selected students could not be checked.");
      return false;
    }
    return true;
  };

  const submit = async (duplicates) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    if (!(await validateAll())) { busyRef.current = false; setBusy(false); return; }
    try {
      const result = await scheduleApi.create({ ...buildSchedulePayload(draft, { selected }), ...(duplicates ? { duplicates } : {}) }, key.current);
      const created = result?.assignment || result;
      navigate(`${ROOT}/schedules/${idOf(created)}`, { state: { created: {
        studentCount: created?.audience?.studentCount ?? result?.preview?.studentCount ?? null,
        slotCount: result?.preview?.slotCount ?? null,
        warnings: (result?.warnings || []).map((warning) => warning?.message || String(warning)).filter(Boolean),
      } } });
    } catch (cause) {
      failWith(cause, "The schedule could not be created. Your entries are kept.");
      // A rejected request created nothing, so a corrected retry gets a new key. After a network
      // or server error the request may have been applied, so the same key prevents a duplicate.
      const status = cause.response?.status;
      if (status >= 400 && status < 500) key.current = uid();
      busyRef.current = false; setBusy(false);
    }
  };

  const save = async (duplicates) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    if (!(await validateAll())) { busyRef.current = false; setBusy(false); return; }
    try {
      const keys = Object.keys(patch);
      if (!saved.current.patch && keys.length) {
        const result = await scheduleApi.update(editId, assignment.revision, patch);
        if (result?.assignment) setAssignment(result.assignment);
      }
      saved.current.patch = true;
      // Only the change is sent: removed students, then students new to this schedule.
      if (!saved.current.remove && delta.remove.length) await scheduleApi.removeTargets(editId, delta.remove);
      saved.current.remove = true;
      const added = delta.add.length
        ? await scheduleApi.addTargets(editId, delta.add, { source: "selected", ...(duplicates ? { duplicates } : {}) })
        : null;
      navigate(`${ROOT}/schedules/${editId}`, { state: { saved: {
        settings: keys.length > 0, added: Number(added?.added ?? 0), removed: delta.remove.length, skipped: Number(added?.skipped ?? 0),
      } } });
    } catch (cause) {
      failWith(cause, "The changes could not be saved. Your entries are kept.");
      busyRef.current = false; setBusy(false);
    }
  };
  const finish = (duplicates) => (editing ? save(duplicates) : submit(duplicates));

  const preview = useMemo(() => (draft.timing === "slots" ? previewSlots({ opensAt: draft.opensAt, closesAt: draft.closesAt, slotPolicy: draft.slotPolicy, now }) : null), [draft.timing, draft.opensAt, draft.closesAt, draft.slotPolicy, now]);
  const canEdit = !busy && !selecting;
  const modeLabel = INTERVIEW_MODES.find((mode) => mode.value === draft.mode)?.label;
  const cohortLabel = draft.source === "filters" ? (filterCount === null ? "By filters" : `${filterCount.toLocaleString("en-IN")} students (by filters)`) : `${selected.length.toLocaleString("en-IN")} students`;
  const windowText = draft.opensAt && draft.closesAt ? `${formatIst(istInputToIso(draft.opensAt), { suffix: false })} – ${formatIst(istInputToIso(draft.closesAt))}` : "";
  const timingText = draft.timing === "window" ? "Anytime in the window" : `${draft.slotPolicy.slotMinutes}-min slots · ${draft.slotPolicy.capacityPerSlot} seats${preview?.count ? ` · ${preview.count.toLocaleString("en-IN")} slots` : ""}`;
  const visibility = VISIBILITY_OPTIONS.find((option) => option.value === draft.reportVisibility)?.label;
  const changes = editing ? [
    ...(delta.add.length ? [`Add ${delta.add.length.toLocaleString("en-IN")} student${delta.add.length === 1 ? "" : "s"}`] : []),
    ...(delta.remove.length ? [`Remove ${delta.remove.length.toLocaleString("en-IN")} student${delta.remove.length === 1 ? "" : "s"}`] : []),
    ...(patch.window ? ["New window"] : []), ...(patch.slotPolicy ? ["New slot settings"] : []), ...(patch.bookingPolicy ? ["Booking rules"] : []),
    ...(patch.reportVisibility ? ["Report visibility"] : []), ...(patch.blockPractice !== undefined ? ["Practice blocking"] : []), ...(patch.notes !== undefined ? ["Notes"] : []),
  ] : [];
  const stepLabel = (index) => (editing && index === 4 ? "Review & save" : STEPS[index]);
  // Each earlier step is checked once per render (the stepper and the summary both read it).
  const finished = [0, 1, 2, 3].map((index) => index < step && !problemAt(index));
  const done = (index) => Boolean(finished[index]);
  const lastLabel = editing ? (busy ? "Saving…" : "Save changes") : busy ? "Scheduling…" : "Schedule interview";
  const title = editing ? `Edit ${assignment?.title ? `“${assignment.title}”` : "schedule"}` : "Schedule an AI interview";

  if (editing && (loadError || (assignment && !isEditable(assignment)))) {
    return <ScheduleFrame title="Edit schedule" back={`${ROOT}/schedules/${editId}`} crumbs={[{ label: "AI Interviews", to: ROOT }, { label: "Schedules", to: `${ROOT}/schedules` }, { label: "Edit" }]} navigation={navigation}>
      <div className={`${surfaceClass} mx-auto max-w-2xl`}>
        <EmptyState title={loadError ? "This schedule could not be loaded" : "This schedule can no longer be edited"}
          detail={loadError || `It is ${assignment.status}. Only scheduled, open or paused schedules can change.`}
          action={<Link className={secondaryClass} to={`${ROOT}/schedules/${editId}`}><ArrowLeft size={14} aria-hidden="true" />Back to the schedule</Link>} />
      </div>
    </ScheduleFrame>;
  }
  if (editing && !assignment) {
    return <ScheduleFrame title="Edit schedule" back={`${ROOT}/schedules/${editId}`} crumbs={[{ label: "AI Interviews", to: ROOT }, { label: "Schedules", to: `${ROOT}/schedules` }, { label: "Edit" }]} navigation={navigation}>
      <p className="py-16 text-center text-sm text-slate-500 dark:text-gray-400" aria-busy="true">Loading schedule…</p>
    </ScheduleFrame>;
  }

  return (
    <ScheduleFrame
      title={title}
      meta={editing && assignment ? <StatusPill status={assignment.status} /> : null}
      description={editing ? "Change students, timing or policies. Students are notified of what affects them." : "Five short steps. Nothing is sent to students until you schedule."}
      back={editing ? `${ROOT}/schedules/${editId}` : `${ROOT}/schedules`}
      crumbs={[{ label: "AI Interviews", to: ROOT }, { label: "Schedules", to: `${ROOT}/schedules` }, ...(editing ? [{ label: assignment?.title || "Schedule", to: `${ROOT}/schedules/${editId}` }, { label: "Edit" }] : [{ label: "New" }])]}
      navigation={navigation}
    >
      <div className="mx-auto max-w-[1200px]">
        <nav aria-label="Scheduling steps" className={`mb-6 px-4 py-3 ${surfaceClass}`}>
          <ol className="flex items-center gap-2">
            {STEPS.map((label, index) => <li key={label} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
              <button type="button" disabled={!visited.has(index) || index === step || !canEdit} onClick={() => goTo(index)} aria-current={step === index ? "step" : undefined}
                className="group flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-default">
                <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition ${index === step ? "bg-sky-600 text-white ring-4 ring-sky-100 dark:ring-sky-400/15" : done(index) ? "bg-emerald-500 text-white" : visited.has(index) ? "border border-sky-300 bg-white text-sky-700 dark:border-sky-700 dark:bg-gray-900 dark:text-sky-300" : "border border-slate-300 bg-white text-slate-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"}`}>{done(index) ? <Check size={14} strokeWidth={3} /> : index + 1}</span>
                <span className={`hidden truncate text-[13px] lg:block ${index === step ? "font-semibold text-slate-900 dark:text-white" : "font-medium text-slate-500 dark:text-gray-400"}`}>{stepLabel(index)}</span>
              </button>
              {index < STEPS.length - 1 && <span aria-hidden="true" className={`h-0.5 min-w-3 flex-1 rounded-full ${index < step ? "bg-sky-500/60 dark:bg-sky-500/40" : "bg-slate-200 dark:bg-gray-800"}`} />}
            </li>)}
          </ol>
        </nav>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_288px]">
          <div className="min-w-0">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400">Step {step + 1} of {STEPS.length}</p>
              <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-xl font-semibold tracking-tight text-slate-900 outline-none focus:outline-none focus-visible:!outline-none dark:text-white">{stepLabel(step)}</h2>
            </div>

            <fieldset disabled={!canEdit} className="min-w-0 space-y-5">
              {step === 0 && <>
                {picking
                  ? <SectionCard title="Interview" description="Choose a published interview to assign." icon={ClipboardList}
                    action={interview && presetId ? <button type="button" className={ghostClass} onClick={() => setPicking(false)}><X size={14} aria-hidden="true" />Keep current</button> : null}>
                    <InterviewPicker value={draft.interviewId} onChange={(item) => { setInterview(item); update({ interviewId: idOf(item) }); if (presetId || interview) setPicking(false); }} />
                  </SectionCard>
                  : <InterviewCard interview={interview} loading={interviewLoading && !interview} editing={editing} snapshotRevision={assignment?.snapshotRevision}
                    canChange={!editing && fromSchedules} onChange={() => setPicking(true)} />}
                <SectionCard title="Interview mode" description={editing ? "The mode is fixed once the schedule exists." : "How closely ANVI follows the published question plan."} icon={SlidersHorizontal} tone="indigo">
                  <div className="grid gap-3 md:grid-cols-2">
                    {INTERVIEW_MODES.map((mode) => <Choice key={mode.value} active={draft.mode === mode.value} disabled={editing && draft.mode !== mode.value} onClick={() => !editing && update({ mode: mode.value })} title={mode.label} description={mode.description} />)}
                  </div>
                  {!editing && <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-500 dark:text-gray-400"><Info size={14} aria-hidden="true" className="mt-px shrink-0" />The schedule keeps the version published now; publishing a new version later does not change it.</p>}
                </SectionCard>
              </>}

              {visited.has(1) && <div hidden={step !== 1} className="space-y-5">
                <StudentPicker mode={editing ? "edit" : "create"} selected={selected} onChange={changeStudents} assigned={assigned}
                  source={draft.source} onSourceChange={(source) => update({ source })} filters={draft.filters} onFiltersChange={(filters) => update({ filters })}
                  filterCount={filterCount} onFilterCount={setFilterCount} onFilterBusy={setFilterBusy} onBusyChange={setSelecting} onPendingChange={setPendingImport} />
                {invalidRows.length > 0 && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300">
                  <h3 className="font-semibold">Student records need attention</h3>
                  <ul className="mt-2 max-h-60 space-y-1.5 overflow-auto">{invalidRows.map((row) => <li key={row.row}>Row {row.row}: {row.name || row.email || row.studentid} — {row.message || String(row.status || "").replaceAll("_", " ")}</li>)}</ul>
                  <p className="mt-2">Remove these students or correct their registered profile, then continue.</p>
                  {draft.source !== "filters" && <button type="button" className={`${secondaryClass} mt-3`} onClick={removeIneligible}>
                    <X size={14} aria-hidden="true" />Remove {invalidRows.length === 1 ? "this student" : `these ${invalidRows.length.toLocaleString("en-IN")} students`}
                  </button>}
                </div>}
              </div>}

              {step === 2 && <WindowSlotFields value={draft} onChange={(value) => update(value)} cohortSize={cohortSize} estimatedMinutes={estimatedMinutes} timingLocked={editing} now={now} />}
              {step === 3 && <PolicyFields value={draft} onChange={(value) => update(value)} />}

              {step === 4 && <>
                <section className={`${surfaceClass} divide-y divide-slate-100 dark:divide-gray-800`} aria-label="Review">
                  <ReviewSection title="Interview" icon={ClipboardList} onEdit={() => goTo(0)}>
                    <Summary label="Interview">{interview?.title || "Selected interview"}</Summary><Summary label="Role">{interview?.role || "—"}</Summary><Summary label="Mode">{modeLabel}</Summary>
                  </ReviewSection>
                  <ReviewSection title="Students" icon={Users} onEdit={() => goTo(1)}>
                    {editing ? <>
                      <Summary label="On the schedule">{selected.length.toLocaleString("en-IN")} students</Summary>
                      <Summary label="Added">{delta.add.length ? `${delta.add.length.toLocaleString("en-IN")} new` : "None"}</Summary>
                      <Summary label="Removed">{delta.remove.length ? `${delta.remove.length.toLocaleString("en-IN")} (bookings cancelled)` : "None"}</Summary>
                    </> : <>
                      <Summary label="Source">{draft.source === "filters" ? "Everyone matching filters" : sourceLabel(draft.source)}</Summary><Summary label="Cohort">{cohortLabel}</Summary>
                      {draft.source === "filters" && <Summary label="Filters">{filterText(draft.filters)}</Summary>}
                    </>}
                  </ReviewSection>
                  <ReviewSection title="Window & slots" icon={CalendarClock} onEdit={() => goTo(2)}>
                    <Summary label="Opens">{formatIst(istInputToIso(draft.opensAt))}</Summary>
                    <Summary label="Closes">{formatIst(istInputToIso(draft.closesAt))}</Summary>
                    <Summary label="Timing">{draft.timing === "window" ? "Anytime in the window" : `${draft.slotPolicy.slotMinutes}-minute slots, ${draft.slotPolicy.capacityPerSlot} seats each`}</Summary>
                    {draft.timing === "slots" && <>
                      <Summary label="Daily hours (IST)">{draft.slotPolicy.dailyStart}–{draft.slotPolicy.dailyEnd}</Summary>
                      <Summary label="Weekdays">{WEEKDAYS.filter((day) => draft.slotPolicy.weekdays.map(Number).includes(day.value)).map((day) => day.short).join(", ")}</Summary>
                      <Summary label="Capacity">{preview ? `${preview.count.toLocaleString("en-IN")} slots · ${preview.seats.toLocaleString("en-IN")} seats` : "—"}</Summary>
                    </>}
                  </ReviewSection>
                  <ReviewSection title="Policies & reports" icon={ShieldCheck} onEdit={() => goTo(3)}>
                    {draft.timing === "slots" && <>
                      <Summary label="Reschedules">{draft.bookingPolicy.rescheduleLimit} allowed, until {draft.bookingPolicy.cutoffMinutes} min before</Summary>
                      <Summary label="Join window">{draft.bookingPolicy.earlyJoinMinutes} min early to {draft.bookingPolicy.lateGraceMinutes} min late</Summary>
                    </>}
                    <Summary label="Attempts">{draft.bookingPolicy.attemptsAllowed}</Summary>
                    <Summary label="Reports visible">{visibility}</Summary>
                    <Summary label="Practice">{draft.blockPractice ? "Blocked while scheduled" : "Still available"}</Summary>
                  </ReviewSection>
                </section>
                {conflict && <ConflictPanel conflict={conflict} busy={busy} onSkip={() => finish("skip")} />}
                <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-5 text-[13px] leading-relaxed text-slate-600 dark:border-sky-500/20 dark:bg-sky-400/5 dark:text-gray-300">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Info size={15} aria-hidden="true" className="text-sky-600 dark:text-sky-400" />{editing ? "When you save" : "When you schedule"}</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {editing ? <>
                      <li>Only the change is applied: new students are added and notified, removed students lose their future booking.</li>
                      <li>A shorter window or fewer slots cancels or flags the affected bookings, and those students are notified.</li>
                    </> : <>
                      <li>The cohort is fixed now, and each student gets an in-app notification and an email.</li>
                      <li>Students who have this interview in another active schedule are marked “Already added” and are not assigned twice.</li>
                      <li>Scheduled attempts are free for students; they never spend Prep Coins.</li>
                    </>}
                  </ul>
                </section>
              </>}
            </fieldset>

            {error && <div className="mt-4"><Notice error>{error}</Notice></div>}
            <footer className="sticky bottom-3 z-20 mt-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg shadow-slate-900/10 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 dark:shadow-black/40 sm:gap-3 sm:px-5">
              <span className="hidden min-w-0 truncate text-xs text-slate-500 dark:text-gray-400 sm:inline">{editing ? (changes.length ? `${changes.length} change${changes.length === 1 ? "" : "s"} to save` : "No changes yet") : step === 0 ? "Nothing is sent to students until the last step." : cohortLabel}</span>
              <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
                {editing && <Link className={ghostClass} to={`${ROOT}/schedules/${editId}`}>Cancel</Link>}
                {step > 0 && <button type="button" disabled={!canEdit} onClick={() => goTo(step - 1)} className={secondaryClass}><ArrowLeft size={16} aria-hidden="true" />Back</button>}
                {editing && step < STEPS.length - 1 && <button type="button" disabled={!canEdit} onClick={() => goTo(STEPS.length - 1)} className={secondaryClass}>Review</button>}
                {step < STEPS.length - 1
                  ? <button type="button" disabled={!canEdit} onClick={next} className={primaryClass}>{busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}{busy ? "Checking students…" : <><span className="sm:hidden">Continue</span><span className="hidden sm:inline">Continue to {STEPS[step + 1].toLowerCase()}</span></>}{!busy && <ArrowRight size={16} aria-hidden="true" />}</button>
                  : <button type="button" disabled={!canEdit || (editing && !changes.length)} onClick={() => finish()} className={primaryClass}>{busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : editing ? <CheckCircle2 size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}{lastLabel}</button>}
              </div>
            </footer>
          </div>
          <div className="hidden lg:block">
            <div className="sticky top-6">
              <SummaryRail editing={editing} interview={interview} modeLabel={modeLabel} students={draft.source === "filters" ? cohortLabel : selected.length ? cohortLabel : ""}
                timing={step >= 2 || editing ? timingText : ""} windowText={windowText} visibility={step >= 3 || editing ? visibility : ""} changes={changes} step={step} done={done} />
            </div>
          </div>
        </div>
      </div>
    </ScheduleFrame>
  );
}
