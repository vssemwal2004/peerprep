import { Suspense, lazy, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Activity, Archive, Ban, CalendarCheck, CalendarClock, CalendarRange, CheckCircle2, ChevronRight, ClipboardList, Clock3, Download, Eye, Hourglass, Lock, PauseCircle, Pencil, PlayCircle, Plus, RefreshCw, Search, Send, Trash2, UserCog, UserX, Users, XCircle } from "lucide-react";
import { ROOT } from "../definition";
import { useDebounced, useRemote } from "../useRemote";
import { ICON_TONES } from "../theme";
import { ActionMenu, EmptyState, Notice, Pagination, Panel, Select, TextInput, iconActionClass, iconDangerClass, inputClass, primaryClass, secondaryClass, surfaceClass, tableHeadClass, tableRowClass } from "../ui";
import { scheduleApi } from "./schedulesApi";
import { AddStudentsDialog, MoveBookingDialog } from "./scheduleDialogs";
import { ConfirmDialog, KpiTile, OutcomePill, ScheduleFrame, StatusPill } from "./scheduleUi";
import {
  ACTION_META,
  KPI_KEYS,
  OUTCOME_FILTERS,
  VISIBILITY_OPTIONS,
  actionsFor,
  assignmentOf,
  errorText,
  formatIst,
  idOf,
  isEditable,
  isLiveBooking,
  isRebookable,
  kpiValue,
  rosterPagination,
  rosterRows,
  sourceLabel,
  timingLabel,
} from "./scheduleModel";

const ScheduleCohortReport = lazy(() => import("./ScheduleCohortReport"));
const KPI_TONES = { assigned: "slate", booked: "sky", in_progress: "violet", completed: "emerald", no_show: "rose", missed: "amber" };
const KPI_ICONS = { assigned: Users, booked: CalendarCheck, in_progress: Activity, completed: CheckCircle2, no_show: UserX, missed: Hourglass };
const plural = (count, word) => `${Number(count).toLocaleString("en-IN")} ${word}${count === 1 ? "" : "s"}`;
/** The notice after the edit wizard saved: what changed. */
function savedMessage(saved) {
  if (!saved) return "";
  const parts = [];
  if (saved.added) parts.push(`${plural(saved.added, "student")} added`);
  if (saved.removed) parts.push(`${plural(saved.removed, "student")} removed`);
  if (saved.skipped) parts.push(`${plural(saved.skipped, "student")} skipped (in another active schedule)`);
  if (saved.settings) parts.push("settings updated");
  return parts.length ? `Schedule saved: ${parts.join(", ")}. Affected students are notified.` : "Schedule saved.";
}
const ACTION_ICONS = { pause: PauseCircle, resume: PlayCircle, close: Lock, archive: Archive, cancel: Ban, release: Send };
// "By filters: CSE · Semester 7", "Selected individually", "From a CSV roster".
const audienceSummary = (audience = {}) => {
  if (audience.source === "filters") {
    const filters = audience.filters || {};
    const parts = [filters.branch, filters.course, filters.college, filters.group, filters.semester && `Semester ${filters.semester}`].filter((value) => String(value ?? "").trim());
    return parts.length ? `By filters: ${parts.join(" · ")}` : sourceLabel(audience.source);
  }
  return { selected: "Selected individually", csv: "From a CSV roster" }[audience.source] || sourceLabel(audience.source);
};
const bookingIdOf = (row) => idOf(row.booking) || "";
const studentOf = (row) => row.student || { name: row.name, email: row.email, studentId: row.studentCode };
const studentKey = (row) => idOf(row.student) || String(row.studentId || "");

function Tabs({ id: base, value, onChange, items }) {
  const refs = useRef([]);
  const move = (event, index) => {
    const delta = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const next = (index + delta + items.length) % items.length;
    onChange(items[next].value);
    refs.current[next]?.focus();
  };
  return <div role="tablist" aria-label="Schedule views" className="inline-flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-gray-900">
    {items.map((item, index) => <button key={item.value} ref={(node) => { refs.current[index] = node; }} id={`${base}-${item.value}`} role="tab" type="button" aria-controls={`${base}-panel`}
      aria-selected={value === item.value} tabIndex={value === item.value ? 0 : -1} onKeyDown={(event) => move(event, index)} onClick={() => onChange(item.value)}
      className={`rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${value === item.value ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/70 dark:bg-gray-800 dark:text-white dark:ring-gray-700" : "text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white"}`}>
      {item.label}
    </button>)}
  </div>;
}

function Roster({ assignment, rows, pagination, query, onQuery, onAction, editable, onRefresh, refreshing }) {
  const slots = assignment.slotPolicy?.mode === "slots";
  // Each student's cells, rendered as a card on phones and as a table row from md up.
  const entries = rows.map((row) => {
    const student = studentOf(row);
    const name = student.name || "student";
    const booked = isLiveBooking(row.booking);
    const rebook = slots && !booked && isRebookable(row);
    const removable = row.outcome !== "in_progress" && row.outcome !== "completed";
    return {
      row,
      key: studentKey(row) || bookingIdOf(row),
      who: <div className="min-w-0"><p className="font-semibold text-slate-900 dark:text-white">{student.name || "Student"}</p><p className="mt-0.5 truncate text-xs text-slate-500 dark:text-gray-400" title={[student.studentId, student.email].filter(Boolean).join(" · ")}>{[student.studentId, student.email].filter(Boolean).join(" · ")}</p></div>,
      outcome: <span className="inline-flex flex-wrap gap-1"><OutcomePill outcome={row.status === "removed" ? "cancelled" : row.outcome} />{row.booking?.status === "needs_reschedule" && <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">Needs a new slot</span>}{row.status === "removed" && <span className="text-[11px] text-slate-500 dark:text-gray-400">Removed</span>}</span>,
      booking: row.booking?.startsAt ? <>{formatIst(row.booking.startsAt, { suffix: false })}{row.booking.rescheduleCount ? <span className="block text-xs text-slate-500 dark:text-gray-400">Rescheduled {row.booking.rescheduleCount}×</span> : null}</> : <span className="text-slate-400 dark:text-gray-600">—</span>,
      attempts: `${Number(row.attemptsUsed || 0)} / ${Number(assignment.bookingPolicy?.attemptsAllowed || 1)}`,
      // Icon actions with tooltips; Rebook keeps its word because it is the one call to action.
      actions: editable && row.status !== "removed" && (slots && booked || rebook || booked || removable) ? <>
        {slots && booked && <button type="button" className={iconActionClass} onClick={() => onAction({ kind: "move", row })} aria-label={`Move booking for ${name}`} title="Move to another slot"><CalendarClock size={16} aria-hidden="true" /></button>}
        {rebook && <button type="button" className={`${secondaryClass} min-h-8 px-2.5 text-xs`} onClick={() => onAction({ kind: "move", row, rebook: true })} aria-label={`Rebook ${name}`}><CalendarClock size={14} aria-hidden="true" />Rebook</button>}
        {booked && <button type="button" className={iconActionClass} onClick={() => onAction({ kind: "cancelBooking", row })} aria-label={`Cancel booking for ${name}`} title="Cancel booking"><XCircle size={16} aria-hidden="true" /></button>}
        {removable && <button type="button" className={iconDangerClass} onClick={() => onAction({ kind: "remove", row })} aria-label={`Remove ${name}`} title="Remove from schedule"><Trash2 size={16} aria-hidden="true" /></button>}
      </> : null,
    };
  });
  return <Panel title="Roster" description="Every student in this schedule, with their booking and outcome." icon={Users} bodyClassName="" action={<>
    <Link className={secondaryClass} to={`${ROOT}/schedules/${idOf(assignment)}/students`}>View all<ChevronRight size={14} aria-hidden="true" className="-mr-1 text-slate-400" /></Link>
    {editable && <button type="button" className={secondaryClass} onClick={() => onAction({ kind: "add" })}><Plus size={14} aria-hidden="true" />Add students</button>}
  </>}>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_14rem_auto]">
      <label className="relative col-span-2 block sm:col-span-1">
        <span className="sr-only">Search students</span>
        <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
        <input type="search" className={`${inputClass} pl-9`} placeholder="Search by name, email or student ID" value={query.search} onChange={(event) => onQuery({ search: event.target.value })} />
      </label>
      <Select aria-label="Filter by outcome" value={query.outcome} onChange={(event) => onQuery({ outcome: event.target.value })} options={OUTCOME_FILTERS} />
      <button type="button" className={`${secondaryClass} h-10 w-10 !px-0`} onClick={onRefresh} aria-label="Refresh schedule" title="Refresh"><RefreshCw size={15} aria-hidden="true" className={refreshing ? "animate-spin motion-reduce:animate-none" : ""} /></button>
    </div>
    {rows.length === 0 ? <EmptyState title={query.search || query.outcome ? "No students match" : "No students in this schedule"} detail={query.search || query.outcome ? "Try another search or outcome." : "Add students to assign this interview."} />
      : <>
        {/* Phones get one card per student; the table needs about 820px. */}
        <ul aria-label="Students in this schedule" className="divide-y divide-slate-100 dark:divide-gray-800 md:hidden">
          {entries.map((entry) => <li key={entry.key} className={`space-y-2.5 px-5 py-4 ${entry.row.status === "removed" ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-3">{entry.who}{entry.outcome}</div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] tabular-nums text-slate-700 dark:text-gray-300">
              {slots && <span>{entry.booking}</span>}
              <span className="text-xs text-slate-500 dark:text-gray-400">Attempts {entry.attempts}</span>
              {entry.actions && <div className="-mr-1.5 ml-auto flex items-center gap-1">{entry.actions}</div>}
            </div>
          </li>)}
        </ul>
        <div className="hidden overflow-x-auto md:block">
        <table data-no-serial className="w-full min-w-[820px] text-left text-sm">
          <caption className="sr-only">Students in this schedule</caption>
          <thead className={tableHeadClass}>
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold">Student</th>
              <th scope="col" className="px-3 py-3 font-semibold">Outcome</th>
              {slots && <th scope="col" className="px-3 py-3 font-semibold">Booking (IST)</th>}
              <th scope="col" className="px-3 py-3 font-semibold">Attempts</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
            {entries.map((entry) => <tr key={entry.key} className={`${tableRowClass} ${entry.row.status === "removed" ? "opacity-60" : ""}`}>
              <td className="px-5 py-3">{entry.who}</td>
              <td className="px-3 py-3">{entry.outcome}</td>
              {slots && <td className="px-3 py-3 text-[13px] tabular-nums text-slate-700 dark:text-gray-300">{entry.booking}</td>}
              <td className="px-3 py-3 text-[13px] tabular-nums text-slate-700 dark:text-gray-300">{entry.attempts}</td>
              <td className="px-5 py-3">{entry.actions && <div className="flex items-center justify-end gap-1">{entry.actions}</div>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      </>}
    {pagination && rows.length > 0 && <Pagination value={pagination} onPage={(page) => onQuery({ page }, true)} onLimit={(limit) => onQuery({ limit })} />}
  </Panel>;
}

function Fact({ icon: Icon, label, children }) {
  return <div className="min-w-0">
    <dt className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-gray-400"><span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${ICON_TONES.slate}`}><Icon size={13} /></span>{label}</dt>
    {children}
  </div>;
}

/** One schedule: KPIs, roster operations, lifecycle actions and the cohort report. */
export default function ScheduleDetail({ navigation }) {
  const { id } = useParams();
  const location = useLocation();
  const [query, setQuery] = useState({ search: "", outcome: "", page: 1, limit: 25 });
  const search = useDebounced(query.search);
  const [tab, setTab] = useState("roster");
  const tabsId = useId();
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const navigate = useNavigate();
  const [message, setMessage] = useState(() => {
    const created = location.state?.created;
    if (!created) return savedMessage(location.state?.saved);
    const count = created.studentCount !== null && created.studentCount !== undefined ? ` for ${Number(created.studentCount).toLocaleString("en-IN")} students` : "";
    const slots = created.slotCount ? ` across ${Number(created.slotCount).toLocaleString("en-IN")} slots` : "";
    const warnings = created.warnings?.length ? ` Note: ${created.warnings.join(" ")}` : "";
    return `Scheduled${count}${slots}. Students are being notified.${warnings}`;
  });
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const remote = useRemote(() => scheduleApi.get(id, { search, outcome: query.outcome, page: query.page, limit: query.limit }), [id, search, query.outcome, query.page, query.limit]);
  const detail = remote.result || {};
  const assignment = { ...assignmentOf(detail), kpis: detail.kpis || assignmentOf(detail).kpis || {} };
  const kpis = assignment.kpis;
  const assigned = kpiValue(kpis, "assigned");
  const editable = isEditable(assignment);

  const changeQuery = (patch, keepPage = false) => setQuery((current) => ({ ...current, ...patch, page: keepPage ? patch.page : 1 }));
  const close = () => { setDialog(null); setReason(""); setDialogError(""); setBusy(false); };
  const done = (text) => { close(); setMessage(text); setError(""); remote.reload(); };
  const run = async (work, success, fallback) => {
    setBusy(true); setDialogError("");
    try { await work(); done(success); }
    catch (cause) { setDialogError(errorText(cause, fallback)); setBusy(false); }
  };
  const confirm = () => {
    if (!dialog) return;
    if (dialog.kind === "action") {
      const action = dialog.action;
      return run(() => scheduleApi.transition(id, action), {
        pause: "Schedule paused. New bookings and starts are blocked.", resume: "Schedule resumed.", close: "Schedule closed.",
        cancel: "Schedule cancelled. Students are notified.", archive: "Schedule archived.", release: "Reports released. Students are notified.",
      }[action], "The action could not be completed.");
    }
    if (dialog.kind === "cancelBooking") return run(() => scheduleApi.cancelBooking(bookingIdOf(dialog.row), reason.trim()), "Booking cancelled. The student is notified and can book again.", "The booking could not be cancelled.");
    if (dialog.kind === "remove") return run(() => scheduleApi.removeTarget(id, studentKey(dialog.row)), "Student removed. Any future booking was cancelled.", "The student could not be removed.");
  };
  const exportRoster = async () => {
    setDownloading(true); setError("");
    try { await scheduleApi.downloadRoster(id); } catch (cause) { setError(cause.message); } finally { setDownloading(false); }
  };

  const rows = rosterRows(detail);
  const actions = actionsFor(assignment);
  const title = assignment.title || "Schedule";
  const visibility = VISIBILITY_OPTIONS.find((option) => option.value === assignment.reportVisibility)?.label || "After the window closes";
  const studentName = dialog?.row ? studentOf(dialog.row).name || "this student" : "";

  return (
    <ScheduleFrame
      title={remote.result ? title : "Schedule"}
      meta={remote.result && <StatusPill status={assignment.status} />}
      back={`${ROOT}/schedules`}
      crumbs={[{ label: "AI Interviews", to: ROOT }, { label: "Schedules", to: `${ROOT}/schedules` }, { label: remote.result ? title : "Schedule" }]}
      navigation={navigation}
      actions={remote.result && <>
        {editable && <button type="button" className={secondaryClass} onClick={() => navigate(`${ROOT}/schedules/${id}/edit`)}><Pencil size={14} aria-hidden="true" />Edit</button>}
        <ActionMenu label="More schedule actions" items={[
          { id: "students", label: "View assigned students", icon: Users, onSelect: () => navigate(`${ROOT}/schedules/${id}/students`) },
          ...(editable ? [{ id: "edit-students", label: "Edit students", icon: UserCog, onSelect: () => navigate(`${ROOT}/schedules/${id}/edit?step=students`) }] : []),
          { id: "export", label: downloading ? "Exporting…" : "Export CSV", icon: Download, disabled: downloading, onSelect: exportRoster },
          ...actions.filter((action) => action !== "release" && !ACTION_META[action].danger).map((action) => ({ id: action, label: ACTION_META[action].label, icon: ACTION_ICONS[action], onSelect: () => setDialog({ kind: "action", action }) })),
          ...(actions.some((action) => ACTION_META[action].danger) ? [{ separator: true }] : []),
          ...actions.filter((action) => ACTION_META[action].danger).map((action) => ({ id: action, label: ACTION_META[action].label, icon: ACTION_ICONS[action], danger: true, onSelect: () => setDialog({ kind: "action", action }) })),
        ]} />
        {actions.includes("release") && <button type="button" className={primaryClass} onClick={() => setDialog({ kind: "action", action: "release" })}><Send size={14} aria-hidden="true" />{ACTION_META.release.label}</button>}
      </>}
    >
      <div className="space-y-5">
        {message && <Notice>{message}</Notice>}
        {(error || remote.error) && <Notice error>{error || remote.error}</Notice>}
        {remote.loading && !remote.result ? <p className="py-10 text-center text-sm text-slate-500 dark:text-gray-400" aria-busy="true">Loading schedule…</p> : remote.result && <>
          <section aria-label="Schedule overview" className={`${surfaceClass} p-5`}>
            {assignment.releasedAt && <p className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25"><CheckCircle2 size={13} aria-hidden="true" />Reports released {formatIst(assignment.releasedAt)}</p>}
            <dl className="grid gap-x-6 gap-y-5 text-sm sm:grid-cols-2 lg:grid-cols-5">
              <Fact icon={CalendarRange} label="Window (IST)"><dd className="mt-1 text-[13px] tabular-nums text-slate-900 dark:text-gray-100"><span className="block"><span className="text-slate-500 dark:text-gray-400">Opens </span><span className="font-medium">{formatIst(assignment.window?.opensAt, { suffix: false })}</span></span><span className="block"><span className="text-slate-500 dark:text-gray-400">Closes </span><span className="font-medium">{formatIst(assignment.window?.closesAt, { suffix: false })}</span></span></dd></Fact>
              <Fact icon={Clock3} label="Timing"><dd className="mt-1 font-medium text-slate-900 dark:text-gray-100">{timingLabel(assignment)}</dd>
                {detail.slots && <dd className="mt-0.5 text-xs tabular-nums text-slate-500 dark:text-gray-400">{Number(detail.slots.count || 0).toLocaleString("en-IN")} slots · {Number(detail.slots.booked || 0).toLocaleString("en-IN")} of {Number(detail.slots.capacity || 0).toLocaleString("en-IN")} seats booked</dd>}</Fact>
              <Fact icon={ClipboardList} label="Interview"><dd className="mt-1 font-medium text-slate-900 dark:text-gray-100">{[assignment.role, assignment.mode === "adaptive" ? "Adaptive" : "Mock"].filter(Boolean).join(" · ")}{assignment.snapshotRevision ? <span className="mt-0.5 block text-xs font-normal text-slate-500 dark:text-gray-400">Published version {assignment.snapshotRevision}</span> : null}</dd></Fact>
              <Fact icon={Users} label="Students"><dd className="mt-1 font-medium tabular-nums text-slate-900 dark:text-gray-100">{(assigned || Number(assignment.audience?.studentCount) || 0).toLocaleString("en-IN")} students</dd>
                <dd className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">{audienceSummary(assignment.audience)}</dd></Fact>
              <Fact icon={Eye} label="Reports visible"><dd className="mt-1 font-medium text-slate-900 dark:text-gray-100">{visibility}</dd></Fact>
            </dl>
            {assignment.notes && <p className="mt-5 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-[13px] text-slate-600 dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-300">{assignment.notes}</p>}
          </section>
          <section aria-label="Cohort progress" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {KPI_KEYS.map(([key, label]) => <KpiTile key={key} label={label} value={kpiValue(kpis, key)} total={key === "assigned" ? null : assigned} tone={KPI_TONES[key]} icon={KPI_ICONS[key]} detail={key === "assigned" ? "students in this schedule" : undefined} />)}
          </section>
          <Tabs id={tabsId} value={tab} onChange={setTab} items={[{ value: "roster", label: "Roster" }, { value: "report", label: "Cohort report" }]} />
          <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`}>
            {tab === "roster"
              ? <Roster assignment={assignment} rows={rows} pagination={rosterPagination(detail)} query={query} onQuery={changeQuery} onAction={(value) => { setDialogError(""); setDialog(value); }} editable={editable} onRefresh={remote.reload} refreshing={remote.loading} />
              : <Suspense fallback={<p className="py-8 text-center text-sm text-slate-500 dark:text-gray-400" aria-busy="true">Loading report…</p>}><ScheduleCohortReport assignmentId={id} assigned={assigned} /></Suspense>}
          </div>
        </>}
        {!remote.loading && !remote.result && !remote.error && <EmptyState title="Schedule not found" detail="It may have been removed, or it belongs to another admin." />}
      </div>

      {dialog?.kind === "action" && <ConfirmDialog title={ACTION_META[dialog.action].label} message={ACTION_META[dialog.action].confirm} confirmLabel={ACTION_META[dialog.action].label}
        danger={ACTION_META[dialog.action].danger} busy={busy} error={dialogError} onConfirm={confirm} onClose={close} />}
      {dialog?.kind === "cancelBooking" && <ConfirmDialog title="Cancel booking" message={`Cancel ${studentName}'s booking for ${formatIst(dialog.row.booking?.startsAt)}? The seat is released and the student can book again.`} confirmLabel="Cancel booking" danger busy={busy} error={dialogError} onConfirm={confirm} onClose={close}>
        <label className="block text-[13px] font-medium text-slate-700 dark:text-gray-200">Reason shown to the student <span className="font-normal text-slate-400 dark:text-gray-500">(optional)</span>
          <span className="mt-1.5 block"><TextInput maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Lab unavailable, please pick another slot" /></span>
        </label>
      </ConfirmDialog>}
      {dialog?.kind === "remove" && <ConfirmDialog title="Remove student" message={`Remove ${studentName} from this schedule? Their future booking is cancelled and they can no longer start this interview as scheduled.`} confirmLabel="Remove student" danger busy={busy} error={dialogError} onConfirm={confirm} onClose={close} />}
      {dialog?.kind === "move" && <MoveBookingDialog assignmentId={id} row={dialog.row} rebook={Boolean(dialog.rebook)} onClose={close} onMoved={() => done(dialog.rebook ? "New slot booked. The student is notified." : "Booking moved. The student is notified.")} />}
      {dialog?.kind === "add" && <AddStudentsDialog interviewId={assignment.interviewId || ""} schedules={[{ id, title, status: assignment.status }]} scheduleId={id} onClose={close} onAdded={(result) => {
        const added = Number(result?.added ?? 0), already = Number(result?.alreadyAssigned ?? 0), skipped = Number(result?.skipped ?? 0);
        done(`${added.toLocaleString("en-IN")} student${added === 1 ? "" : "s"} added${already ? `, ${already.toLocaleString("en-IN")} already in the schedule` : ""}${skipped ? `, ${skipped.toLocaleString("en-IN")} skipped (in another active schedule)` : ""}.${added ? " They are being notified." : ""}`);
      }} />}
    </ScheduleFrame>
  );
}
