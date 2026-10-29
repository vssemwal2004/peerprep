import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, BellRing, CalendarClock, ClipboardCopy, Download, FileBarChart, Loader2, Plus, RefreshCw, RotateCcw, Search, Trash2, UserRound, Users, X, XCircle } from "lucide-react";
import { ROOT } from "../definition";
import { useDebounced, useRemote } from "../useRemote";
import { EmptyState, Notice, Pagination, Select, TextInput, ToneChip, ghostClass, inputClass, primaryClass, secondaryClass, surfaceClass, tableHeadClass } from "../ui";
import { scheduleApi } from "./schedulesApi";
import { AddStudentsDialog, MoveBookingDialog } from "./scheduleDialogs";
import { CheckBox, ConfirmDialog, Initials, OutcomePill, RowMenu, ScheduleFrame, Segmented, StatusPill, dangerClass } from "./scheduleUi";
import { ATTEMPT_META, BOOKING_META, MAX_COHORT, TARGET_STATUS_TABS, departmentLabel, errorText, formatIst, isLiveBooking, isRebookable, isRemovableTarget, targetsCsv, yearLabel } from "./scheduleModel";

/*
 * Every student assigned to one schedule (/schedules/:id/students) or to any schedule of one interview
 * (/schedules/interview/:interviewId/students): search, status tabs, a schedule filter, sortable columns,
 * pagination, bulk actions and a per-row menu (details, report, move or cancel the booking, resend the
 * invite, copy the email, remove from the schedule).
 */
const ACTIVE = ["scheduled", "open", "paused"];
const COLUMNS = [
  ["name", "Student"], ["studentCode", "Roll / ID"], ["email", "Email"], ["department", "Department"], ["schedule", "Schedule"],
  ["slot", "Slot (IST)"], ["status", "Booking"], ["attempt", "Attempt"], ["score", "Score"],
];
const plural = (count, word) => `${Number(count).toLocaleString("en-IN")} ${word}${count === 1 ? "" : "s"}`;
const remindable = (row, schedule) => row.status === "assigned" && ["pending", "booked"].includes(row.outcome) && ACTIVE.includes(schedule?.status);

function SortHeader({ column, label, sort, onSort, className = "" }) {
  const active = sort.key === column;
  const Icon = !active ? ArrowUpDown : sort.order === "asc" ? ArrowUp : ArrowDown;
  return <th scope="col" aria-sort={active ? (sort.order === "asc" ? "ascending" : "descending") : "none"} className={`whitespace-nowrap px-3 py-2.5 font-semibold ${className}`}>
    <button type="button" onClick={() => onSort(column)} className={`-mx-1 inline-flex items-center gap-1 rounded px-1 uppercase tracking-wider hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:text-white ${active ? "text-slate-900 dark:text-white" : ""}`}>
      {label}<Icon size={12} aria-hidden="true" className={active ? "" : "opacity-40"} />
    </button>
  </th>;
}

function BookingCell({ row }) {
  if (row.status === "removed") return <ToneChip tone="slate" className="text-[11px]">Removed</ToneChip>;
  const meta = row.booking ? BOOKING_META[row.booking.status] : null;
  if (meta && (row.booking.active || ["completed", "no_show"].includes(row.booking.status))) return <ToneChip tone={meta.tone} className="text-[11px]">{meta.label}</ToneChip>;
  return <OutcomePill outcome={row.outcome} />;
}

function download(name, content) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
}

export default function AssignedStudents({ navigation = null }) {
  const { id = "", interviewId = "" } = useParams();
  const perInterview = Boolean(interviewId);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(() => ({ search: "", status: params.get("status") || "", assignmentId: params.get("schedule") || "", sort: "name", order: "asc", page: 1, limit: 25 }));
  const search = useDebounced(query.search.trim(), 300);
  const request = { search, status: query.status, sort: query.sort, order: query.order, page: query.page, limit: query.limit, ...(perInterview ? { assignmentId: query.assignmentId } : {}) };
  const remote = useRemote(() => (perInterview ? scheduleApi.interviewTargets(interviewId, request) : scheduleApi.targets(id, request)),
    [id, interviewId, search, query.status, query.assignmentId, query.sort, query.order, query.page, query.limit]);
  const data = remote.result || {};
  const rows = useMemo(() => data.rows || [], [data.rows]);
  const schedules = useMemo(() => data.schedules || [], [data.schedules]);
  const scheduleById = useMemo(() => new Map(schedules.map((row) => [row.id, row])), [schedules]);
  const [picked, setPicked] = useState(() => new Map());
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const set = (patch, keepPage = false) => setQuery((current) => ({ ...current, ...patch, page: keepPage ? patch.page ?? current.page : 1 }));
  const sortBy = (key) => set({ sort: key, order: query.sort === key && query.order === "asc" ? "desc" : "asc" });
  const close = () => { setDialog(null); setReason(""); setDialogError(""); setBusy(false); };
  const done = (text) => { close(); setMessage(text); setError(""); setPicked(new Map()); remote.reload(); };
  const run = async (work, success, fallback) => {
    setBusy(true); setDialogError("");
    try { const result = await work(); done(typeof success === "function" ? success(result) : success); }
    catch (cause) { setDialogError(errorText(cause, fallback)); setBusy(false); }
  };
  const byAssignment = (list) => list.reduce((map, row) => map.set(row.assignmentId, [...(map.get(row.assignmentId) || []), row.studentId]), new Map());
  const remind = (list) => run(async () => {
    let sent = 0, recent = 0;
    for (const [assignmentId, studentIds] of byAssignment(list)) {
      const result = await scheduleApi.notifyTargets(assignmentId, studentIds);
      sent += Number(result?.sent || 0); recent += Number(result?.recentlyNotified || 0);
    }
    return { sent, recent };
  }, ({ sent, recent }) => `${plural(sent, "reminder")} sent.${recent ? ` ${plural(recent, "student")} were notified in the last 10 minutes and were skipped.` : ""}`, "The reminders could not be sent.");
  const remove = (list) => run(async () => {
    let removed = 0;
    for (const [assignmentId, studentIds] of byAssignment(list)) removed += Number((await scheduleApi.removeTargets(assignmentId, studentIds))?.removed || 0);
    return removed;
  }, (removed) => `${plural(removed, "student")} removed. Their future bookings were cancelled and they are notified.`, "The students could not be removed.");
  const resetAttempt = (row) => run(
    () => scheduleApi.resetTarget(row.assignmentId, row.studentId),
    "Interview reset. The previous attempt and report were cleared, and the student can take it again.",
    "The interview could not be reset.",
  );
  const copyEmail = async (row) => {
    try { await navigator.clipboard.writeText(row.student.email); setMessage(`Copied ${row.student.email}.`); setError(""); }
    catch { setError("The email could not be copied. Select it in the table instead."); }
  };
  const exportCsv = async () => {
    setExporting(true); setError("");
    try {
      if (!perInterview) { await scheduleApi.downloadRoster(id); return; }
      const all = [];
      for (let page = 1; page <= 10; page += 1) {
        const result = await scheduleApi.interviewTargets(interviewId, { ...request, status: query.status || "all", page, limit: MAX_COHORT });
        all.push(...(result?.rows || []));
        if (page >= (result?.pagination?.pages || 1)) break;
      }
      const slug = String(data.interview?.title || "interview").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "interview";
      download(`${slug}-assigned-students.csv`, targetsCsv(all));
    } catch (cause) { setError(cause.message || "The export could not be downloaded."); }
    finally { setExporting(false); }
  };

  const assignment = data.assignment || null;
  const title = perInterview ? data.interview?.title : assignment?.title;
  const canAdd = schedules.some((row) => ACTIVE.includes(row.status));
  const pickedRows = [...picked.values()];
  const pageIds = rows.map((row) => row.id);
  const pickedOnPage = pageIds.filter((value) => picked.has(value)).length;
  const togglePage = () => setPicked((current) => {
    const next = new Map(current);
    if (pickedOnPage === rows.length) rows.forEach((row) => next.delete(row.id)); else rows.forEach((row) => next.set(row.id, row));
    return next;
  });
  const toggle = (row) => setPicked((current) => { const next = new Map(current); if (next.has(row.id)) next.delete(row.id); else next.set(row.id, row); return next; });
  const bulkRemindable = pickedRows.filter((row) => remindable(row, scheduleById.get(row.assignmentId)));
  const bulkRemovable = pickedRows.filter((row) => isRemovableTarget(row) && ACTIVE.includes(scheduleById.get(row.assignmentId)?.status));
  const counts = data.counts || {};
  const filtered = Boolean(search || query.status || query.assignmentId);
  const showSchedule = perInterview;
  const crumbs = perInterview
    ? [{ label: "AI Interviews", to: ROOT }, { label: "Schedules", to: `${ROOT}/schedules?interviewId=${encodeURIComponent(interviewId)}` }, { label: title || "Interview" }, { label: "Assigned students" }]
    : [{ label: "AI Interviews", to: ROOT }, { label: "Schedules", to: `${ROOT}/schedules` }, { label: title || "Schedule", to: `${ROOT}/schedules/${id}` }, { label: "Assigned students" }];

  const menuFor = (row) => {
    const schedule = scheduleById.get(row.assignmentId) || row.schedule || {};
    const active = ACTIVE.includes(schedule.status);
    const slots = schedule.slotMode === "slots";
    const live = isLiveBooking(row.booking) && !row.attempt;
    const resettable = active && row.status === "assigned" && Boolean(row.attempt) && row.attempt.status !== "in_progress";
    return [
      { id: "student", label: "View student details", icon: UserRound, onSelect: () => navigate(`/admin/students/${row.studentId}`) },
      { id: "report", label: row.attempt?.reportReady ? "View report" : "View attempt", icon: FileBarChart, disabled: !row.attempt, hint: row.attempt ? undefined : "No attempt yet",
        onSelect: () => navigate(`${ROOT}/reports?assignmentId=${encodeURIComponent(row.assignmentId)}&attemptId=${encodeURIComponent(row.attempt.id)}`) },
      ...(slots && active && row.status === "assigned" && (live || isRebookable(row)) ? [{ id: "move", label: live ? "Move booking" : "Book a new slot", icon: CalendarClock, onSelect: () => { setDialogError(""); setDialog({ kind: "move", row, rebook: !live }); } }] : []),
      ...(live && active ? [{ id: "cancel", label: "Cancel booking", icon: XCircle, onSelect: () => { setDialogError(""); setDialog({ kind: "cancelBooking", row }); } }] : []),
      { id: "remind", label: "Resend invite", icon: BellRing, disabled: !remindable(row, schedule), hint: remindable(row, schedule) ? undefined : "Only for active schedules and students who have not finished",
        onSelect: () => { setDialogError(""); setDialog({ kind: "remind", rows: [row] }); } },
      { id: "copy", label: "Copy email", icon: ClipboardCopy, disabled: !row.student.email, onSelect: () => copyEmail(row) },
      ...(resettable ? [{ separator: true }, { id: "reset", label: "Reset interview", icon: RotateCcw, danger: true, onSelect: () => { setDialogError(""); setDialog({ kind: "reset", row }); } }] : []),
      ...(active && row.status !== "removed" && row.outcome !== "in_progress"
        ? [...(!resettable ? [{ separator: true }] : []), { id: "remove", label: "Remove student", icon: Trash2, danger: true, onSelect: () => { setDialogError(""); setDialog({ kind: "remove", rows: [row] }); } }]
        : []),
    ];
  };

  return (
    <ScheduleFrame
      title="Assigned students"
      description={title ? (perInterview ? `Every student assigned “${title}”, across its schedules.` : `Students on “${title}”.`) : undefined}
      meta={assignment ? <StatusPill status={assignment.status} /> : null}
      back={perInterview ? ROOT : `${ROOT}/schedules/${id}`}
      crumbs={crumbs}
      navigation={navigation}
      actions={<>
        <button type="button" className={secondaryClass} disabled={exporting || !remote.result} onClick={exportCsv}>{exporting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}Export CSV</button>
        <button type="button" className={primaryClass} disabled={!canAdd} title={canAdd ? undefined : "No active schedule to add students to"} onClick={() => { setDialogError(""); setDialog({ kind: "add" }); }}><Plus size={16} aria-hidden="true" />Add students</button>
      </>}
    >
      <div className="space-y-4">
        {message && <Notice>{message}</Notice>}
        {(error || remote.error) && <Notice error>{error || remote.error}</Notice>}
        {data.truncated && <Notice>Only the first {(MAX_COHORT * 10).toLocaleString("en-IN")} students are listed. Filter by schedule to see the rest.</Notice>}
        <section className={`${surfaceClass} overflow-hidden`} aria-label="Assigned students">
          <div className="space-y-3 border-b border-slate-100 px-4 py-4 dark:border-gray-800 sm:px-5">
            <Segmented label="Filter by status" value={query.status} onChange={(status) => set({ status })} className="w-full sm:w-auto"
              items={TARGET_STATUS_TABS.map((tab) => ({ value: tab.value, label: tab.label, count: counts[tab.count] ?? (remote.result ? 0 : undefined) }))} />
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <label className="relative block min-w-0 flex-1">
                <span className="sr-only">Search assigned students</span>
                <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
                <input type="search" className={`${inputClass} pl-9`} placeholder="Search by name, roll number or email" value={query.search} onChange={(event) => set({ search: event.target.value })} />
              </label>
              {perInterview && <Select aria-label="Filter by schedule" className="md:w-72" value={query.assignmentId} onChange={(event) => set({ assignmentId: event.target.value })}
                options={[{ value: "", label: `All schedules (${schedules.length})` }, ...schedules.map((row) => ({ value: row.id, label: row.title }))]} />}
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap text-xs tabular-nums text-slate-500 dark:text-gray-400">{remote.result ? plural(data.pagination?.total || 0, "student") : ""}</span>
                <button type="button" className={`${secondaryClass} h-10 w-10 !px-0`} onClick={remote.reload} aria-label="Refresh" title="Refresh"><RefreshCw size={15} aria-hidden="true" className={remote.loading ? "animate-spin motion-reduce:animate-none" : ""} /></button>
              </div>
            </div>
          </div>
          {picked.size > 0 && <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 border-b border-sky-100 bg-sky-50/70 px-4 py-2.5 dark:border-sky-900/40 dark:bg-sky-400/[0.06] sm:px-5">
            <span className="mr-2 text-sm font-semibold text-sky-900 dark:text-sky-200">{plural(picked.size, "student")} selected</span>
            <button type="button" className={secondaryClass} disabled={!bulkRemindable.length} onClick={() => setDialog({ kind: "remind", rows: bulkRemindable })}><BellRing size={14} aria-hidden="true" />Resend invite{bulkRemindable.length !== picked.size && bulkRemindable.length ? ` (${bulkRemindable.length})` : ""}</button>
            <button type="button" className={dangerClass} disabled={!bulkRemovable.length} onClick={() => setDialog({ kind: "remove", rows: bulkRemovable })}><Trash2 size={14} aria-hidden="true" />Remove{bulkRemovable.length !== picked.size && bulkRemovable.length ? ` (${bulkRemovable.length})` : ""}</button>
            <button type="button" className={`${ghostClass} ml-auto`} onClick={() => setPicked(new Map())}><X size={14} aria-hidden="true" />Clear selection</button>
          </div>}
          {remote.loading && !remote.result ? <div className="space-y-2 p-5" aria-busy="true">{[1, 2, 3, 4].map((n) => <div key={n} className="h-11 animate-pulse rounded-lg bg-slate-100 dark:bg-gray-800" />)}<span className="sr-only">Loading students</span></div>
            : !rows.length ? <EmptyState title={filtered ? "No students match" : "No students assigned yet"} detail={filtered ? "Try another search, status or schedule." : "Add students to assign this interview."}
              action={!filtered && canAdd ? <button type="button" className={primaryClass} onClick={() => setDialog({ kind: "add" })}><Plus size={16} aria-hidden="true" />Add students</button> : null} />
              : <div className="overflow-x-auto">
                <table data-no-serial className={`w-full text-left text-sm ${showSchedule ? "min-w-[1180px]" : "min-w-[1060px]"}`}>
                  <caption className="sr-only">Assigned students</caption>
                  <thead className={tableHeadClass}>
                    <tr>
                      <th scope="col" className="w-11 py-2.5 pl-4 pr-2 sm:pl-5"><CheckBox label="Select every student on this page" checked={rows.length > 0 && pickedOnPage === rows.length} indeterminate={pickedOnPage > 0} onChange={togglePage} /></th>
                      {COLUMNS.filter(([key]) => showSchedule || key !== "schedule").map(([key, label]) => <SortHeader key={key} column={key} label={label} sort={{ key: query.sort, order: query.order }} onSort={sortBy} className={key === "name" ? "pl-1" : ""} />)}
                      <th scope="col" className="w-12 py-2.5 pl-2 pr-4"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                    {rows.map((row) => {
                      const schedule = scheduleById.get(row.assignmentId) || row.schedule || {};
                      const attempt = row.attempt ? ATTEMPT_META[row.attempt.status] : null;
                      return <tr key={row.id} className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-white/[0.03] ${picked.has(row.id) ? "bg-sky-50/50 dark:bg-sky-400/[0.05]" : ""} ${row.status === "removed" ? "text-slate-400" : ""}`}>
                        <td className="py-2.5 pl-4 pr-2 sm:pl-5"><CheckBox label={`Select ${row.student.name || "student"}`} checked={picked.has(row.id)} onChange={() => toggle(row)} /></td>
                        <td className="py-2.5 pl-1 pr-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Initials name={row.student.name} size="sm" />
                            <div className="min-w-0">
                              <p className={`truncate font-medium ${row.status === "removed" ? "text-slate-500 line-through dark:text-gray-500" : "text-slate-900 dark:text-gray-100"}`}>{row.student.name || "Student"}</p>
                              <p className="truncate text-xs text-slate-500 dark:text-gray-400">{yearLabel(row.student.semester)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12px] text-slate-600 dark:text-gray-300">{row.student.studentCode || "—"}</td>
                        <td className={`${showSchedule ? "max-w-[12rem]" : "max-w-[15rem]"} truncate px-3 py-2.5 text-[13px] text-slate-600 dark:text-gray-300`} title={row.student.email}>{row.student.email || "—"}</td>
                        <td className="px-3 py-2.5 text-[13px] text-slate-600 dark:text-gray-300">{departmentLabel(row.student) || "—"}{row.student.group ? <span className="block text-xs text-slate-400 dark:text-gray-500">{row.student.group}</span> : null}</td>
                        {showSchedule && <td className="max-w-[11rem] px-3 py-2.5"><p className="truncate text-[13px] font-medium text-slate-800 dark:text-gray-200" title={schedule.title}>{schedule.title}</p><p className="mt-0.5 text-xs capitalize text-slate-500 dark:text-gray-400">{schedule.status}{schedule.slotMode === "window" ? " · open window" : ""}</p></td>}
                        <td className="whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums text-slate-700 dark:text-gray-300">{row.booking?.startsAt && (row.booking.active || row.booking.status !== "cancelled") ? formatIst(row.booking.startsAt, { suffix: false }) : schedule.slotMode === "window" ? <span className="text-slate-400 dark:text-gray-500">Open window</span> : <span className="text-slate-400 dark:text-gray-600">—</span>}
                          {row.booking?.rescheduleCount ? <span className="block text-xs text-slate-500 dark:text-gray-400">Moved {row.booking.rescheduleCount}×</span> : null}</td>
                        <td className="px-3 py-2.5"><BookingCell row={row} /></td>
                        <td className="px-3 py-2.5">{attempt ? <ToneChip tone={attempt.tone} className="text-[11px]">{attempt.label}</ToneChip> : <span className="text-[13px] text-slate-400 dark:text-gray-600">{row.attemptsUsed ? `${row.attemptsUsed}/${row.attemptsAllowed}` : "Not started"}</span>}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums">{row.attempt?.percent !== null && row.attempt?.percent !== undefined
                          ? <button type="button" className="font-semibold text-sky-700 hover:underline dark:text-sky-400" onClick={() => navigate(`${ROOT}/reports?assignmentId=${encodeURIComponent(row.assignmentId)}&attemptId=${encodeURIComponent(row.attempt.id)}`)} aria-label={`Open the report for ${row.student.name || "student"}, ${Math.round(row.attempt.percent)}%`}>{Math.round(row.attempt.percent)}%</button>
                          : <span className="text-slate-400 dark:text-gray-600">—</span>}</td>
                        <td className="py-2.5 pl-2 pr-4 text-right"><RowMenu label={`Actions for ${row.student.name || "student"}`} items={menuFor(row)} /></td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>}
          {data.pagination && rows.length > 0 && <Pagination value={data.pagination} onPage={(page) => set({ page }, true)} onLimit={(limit) => set({ limit })} />}
        </section>
        <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400"><Users size={13} aria-hidden="true" />Removing a student keeps completed interview history. Resetting a completed interview clears its attempt and report so the student can take it again.</p>
      </div>

      {dialog?.kind === "add" && <AddStudentsDialog interviewId={data.interview?.id || assignment?.interviewId || ""} schedules={query.assignmentId ? schedules.filter((row) => row.id === query.assignmentId) : schedules} scheduleId={perInterview ? query.assignmentId : id} onClose={close}
        onAdded={(result) => {
          const added = Number(result?.added ?? 0), already = Number(result?.alreadyAssigned ?? 0), skipped = Number(result?.skipped ?? 0);
          done(`${plural(added, "student")} added${already ? `, ${already.toLocaleString("en-IN")} already on the schedule` : ""}${skipped ? `, ${skipped.toLocaleString("en-IN")} skipped (in another active schedule)` : ""}.${added ? " They are being notified." : ""}`);
        }} />}
      {dialog?.kind === "move" && <MoveBookingDialog assignmentId={dialog.row.assignmentId} row={dialog.row} rebook={Boolean(dialog.rebook)} onClose={close}
        onMoved={() => done(dialog.rebook ? "New slot booked. The student is notified." : "Booking moved. The student is notified.")} />}
      {dialog?.kind === "cancelBooking" && <ConfirmDialog danger title="Cancel booking" confirmLabel="Cancel booking" busy={busy} error={dialogError} onClose={close}
        message={`Cancel ${dialog.row.student.name || "this student"}'s booking for ${formatIst(dialog.row.booking?.startsAt)}? The seat is released and the student can book again.`}
        onConfirm={() => run(() => scheduleApi.cancelBooking(dialog.row.booking.id, reason.trim()), "Booking cancelled. The student is notified and can book again.", "The booking could not be cancelled.")}>
        <label className="block text-[13px] font-medium text-slate-700 dark:text-gray-200">Reason shown to the student <span className="font-normal text-slate-400 dark:text-gray-500">(optional)</span>
          <span className="mt-1.5 block"><TextInput maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Lab unavailable, please pick another slot" /></span>
        </label>
      </ConfirmDialog>}
      {dialog?.kind === "remove" && <ConfirmDialog danger title={dialog.rows.length === 1 ? "Remove from schedule" : `Remove ${dialog.rows.length} students`} busy={busy} error={dialogError} onClose={close}
        confirmLabel={dialog.rows.length === 1 ? "Remove student" : `Remove ${dialog.rows.length} students`}
        message={dialog.rows.length === 1
          ? `Remove ${dialog.rows[0].student.name || "this student"} from “${scheduleById.get(dialog.rows[0].assignmentId)?.title || "this schedule"}”?${dialog.rows[0].booking && isLiveBooking(dialog.rows[0].booking) ? ` Their booking on ${formatIst(dialog.rows[0].booking.startsAt)} is cancelled.` : ""} They are notified and can no longer take this interview as scheduled.`
          : `Remove ${dialog.rows.length} students? Their future bookings are cancelled and they are notified. Their history is kept.`}
        onConfirm={() => remove(dialog.rows)} />}
      {dialog?.kind === "reset" && <ConfirmDialog danger title="Reset completed interview" confirmLabel="Reset interview" busy={busy} error={dialogError} onClose={close}
        message={`Reset ${dialog.row.student.name || "this student"}'s completed interview? Their previous attempt and report are permanently cleared. They can then take this scheduled interview again.`}
        onConfirm={() => resetAttempt(dialog.row)} />}
      {dialog?.kind === "remind" && <ConfirmDialog title={dialog.rows.length === 1 ? "Resend invite" : `Resend invite to ${dialog.rows.length} students`} confirmLabel="Send reminder" busy={busy} error={dialogError} onClose={close}
        message={dialog.rows.length === 1
          ? `Send ${dialog.rows[0].student.name || "this student"} a reminder of this interview by in-app notification and email?`
          : `Send ${dialog.rows.length} students a reminder by in-app notification and email? Students notified in the last 10 minutes are skipped.`}
        onConfirm={() => remind(dialog.rows)} />}
    </ScheduleFrame>
  );
}
