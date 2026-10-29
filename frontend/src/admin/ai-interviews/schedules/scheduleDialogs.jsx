import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Plus, XCircle } from "lucide-react";
import { Dialog, Notice, Select, primaryClass, secondaryClass } from "../ui";
import { scheduleApi } from "./schedulesApi";
import { ineligibleRows, recheckStudents } from "./scheduleStudents";
import StudentPicker from "./StudentPicker";
import { MAX_COHORT, blockingTargets, conflictOf, errorText, formatIst, formatIstTime, idOf } from "./scheduleModel";
const nameOf = (row) => row?.student?.name || row?.name || "student";

/** Moves (or, for a no-show, rebooks) one student's booking to another slot with a free seat. */
export function MoveBookingDialog({ assignmentId, row, rebook = false, onClose, onMoved }) {
  const [slots, setSlots] = useState(null);
  const [slotId, setSlotId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    scheduleApi.slots(assignmentId)
      .then((result) => { if (alive) setSlots(Array.isArray(result) ? result : result?.slots || result?.items || []); })
      .catch((cause) => { if (alive) { setSlots([]); setError(cause.message || "Slots could not be loaded."); } });
    return () => { alive = false; };
  }, [assignmentId]);
  const current = String(row.booking?.slotId || "");
  const now = Date.now();
  const choices = (slots || []).filter((slot) => slot.status !== "cancelled" && slot.status !== "closed" && new Date(slot.startsAt).getTime() > now && idOf(slot) !== current);
  const move = async () => {
    if (!slotId) { setError("Choose a slot to move this booking to."); return; }
    setBusy(true); setError("");
    try { await scheduleApi.moveBooking(idOf(row.booking), slotId); onMoved(); }
    catch (cause) { setError(errorText(cause, "The booking could not be moved.")); setBusy(false); }
  };
  return <Dialog title={rebook ? `Book a new slot for ${nameOf(row)}` : `Move ${nameOf(row)}'s booking`} onClose={busy ? () => {} : onClose}>
    <p className="text-sm text-slate-600 dark:text-gray-300">{rebook
      ? `Previous slot: ${formatIst(row.booking?.startsAt)} (${row.booking?.status === "no_show" ? "no-show" : "cancelled by the student"}). Only you can book a new slot for this student. They are notified.`
      : `Current slot: ${formatIst(row.booking?.startsAt)}. The student is notified and the move does not use one of their reschedules.`} Admin moves ignore the change cutoff but never overfill a slot.</p>
    {slots === null ? <p className="mt-4 text-sm text-slate-500 dark:text-gray-400" aria-busy="true">Loading slots…</p>
      : choices.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-gray-700 dark:text-gray-400">No other upcoming slots.</p>
        : <div role="radiogroup" aria-label="Upcoming slots" className="mt-4 grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
          {choices.map((slot) => {
            const left = Math.max(0, Number(slot.capacity || 0) - Number(slot.bookedCount || 0));
            const active = slotId === idOf(slot);
            return <button key={idOf(slot)} type="button" role="radio" aria-checked={active} disabled={left === 0} onClick={() => setSlotId(idOf(slot))}
              className={`rounded-xl border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-sky-500 bg-sky-50 ring-1 ring-sky-500 dark:bg-sky-400/10" : "border-slate-200 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-gray-800/60"}`}>
              <span className="block font-medium tabular-nums text-slate-900 dark:text-gray-100">{formatIst(slot.startsAt)}</span>
              <span className="block text-xs text-slate-500 dark:text-gray-400">until {formatIstTime(slot.endsAt)} · {left === 0 ? "Full" : `${left} seat${left === 1 ? "" : "s"} left`}</span>
            </button>;
          })}
        </div>}
    {error && <div className="mt-3"><Notice error>{error}</Notice></div>}
    <div className="mt-5 flex justify-end gap-2">
      <button type="button" className={secondaryClass} disabled={busy} onClick={onClose}>Cancel</button>
      <button type="button" className={primaryClass} disabled={busy || !slotId} onClick={move}>{busy ? (rebook ? "Booking…" : "Moving…") : rebook ? "Book slot" : "Move booking"}</button>
    </div>
  </Dialog>;
}

/**
 * The Step-2 picker in a dialog: adds students to one schedule. Students already on it are shown ticked
 * and locked; only new ones are sent (the server also skips anyone already assigned).
 * `schedules`: [{ id, title, status }]; with several, the admin picks the schedule first.
 */
export function AddStudentsDialog({ interviewId = "", schedules = [], scheduleId: initial = "", onClose, onAdded }) {
  const editable = useMemo(() => schedules.filter((row) => ["scheduled", "open", "paused"].includes(row.status)), [schedules]);
  const [scheduleId, setScheduleId] = useState(initial || editable[0]?.id || "");
  const [assigned, setAssigned] = useState(null);
  const [selected, setSelected] = useState([]);
  const [selecting, setSelecting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState([]);
  const [conflict, setConflict] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!scheduleId) return undefined;
    let alive = true;
    setAssigned(null); setSelected([]); setConflict(null); setInvalid([]); setError("");
    const request = interviewId
      ? scheduleApi.interviewTargets(interviewId, { status: "all", limit: MAX_COHORT })
      : scheduleApi.targets(scheduleId, { status: "all", limit: MAX_COHORT });
    request
      .then((result) => { if (alive) setAssigned(blockingTargets(result, { scheduleId })); })
      .catch((cause) => { if (alive) { setAssigned(new Map()); setError(cause.message || "The interview's students could not be loaded."); } });
    return () => { alive = false; };
  }, [interviewId, scheduleId]);
  const add = async (duplicates) => {
    if (selecting || pending) { setError("Finish the current selection or import first."); return; }
    if (!selected.length) { setError("Choose at least one student."); return; }
    const onSchedule = [...(assigned?.values() || [])].filter((row) => String(row.assignmentId) === String(scheduleId)).length;
    if (onSchedule + selected.length > MAX_COHORT) { setError(`A schedule holds up to ${MAX_COHORT.toLocaleString("en-IN")} students.`); return; }
    setBusy(true); setError(""); setInvalid([]); setConflict(null);
    try {
      const rows = await recheckStudents(selected);
      if (rows.length) { setInvalid(rows); throw new Error("Some students are not eligible. Remove them and try again."); }
      const result = await scheduleApi.addTargets(scheduleId, selected.map((student) => String(student._id)), { source: "selected", ...(duplicates ? { duplicates } : {}) });
      onAdded(result, scheduleId);
    } catch (cause) {
      // The server also refuses inactive and assessment-only accounts, which the CSV check does not catch.
      const refused = cause?.response?.data?.code === "INVALID_STUDENTS" ? ineligibleRows(selected, cause.response.data.invalid) : [];
      const clash = conflictOf(cause);
      if (clash) setConflict(clash);
      else if (refused.length) {
        setInvalid(refused);
        setError(`${refused.length.toLocaleString("en-IN")} selected student${refused.length === 1 ? " is" : "s are"} not eligible. Remove ${refused.length === 1 ? "it" : "them"} and try again.`);
      } else setError(errorText(cause, "The students could not be added."));
      setBusy(false);
    }
  };
  const removeInvalid = () => {
    const ids = new Set(invalid.map((row) => String(row._id || "")).filter(Boolean));
    const numbers = new Set(invalid.map((row) => row.row));
    setSelected(selected.filter((student, index) => !ids.has(String(student._id)) && !numbers.has(index + 1)));
    setInvalid([]); setError("");
  };
  return <Dialog wide title="Add students" onClose={busy ? () => {} : onClose}>
    <div className="max-h-[66dvh] space-y-4 overflow-y-auto pr-1">
      {schedules.length > 1 && <label className="block max-w-md text-[13px] font-medium text-slate-700 dark:text-gray-200">Schedule
        <span className="mt-1.5 block"><Select aria-label="Schedule to add students to" value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}
          options={editable.length ? editable.map((row) => ({ value: row.id, label: row.title })) : [{ value: "", label: "No active schedule" }]} /></span>
      </label>}
      {!scheduleId ? <Notice>Only scheduled, open or paused schedules accept new students.</Notice>
        : assigned === null ? <p className="py-10 text-center text-sm text-slate-500 dark:text-gray-400" aria-busy="true">Loading the schedule…</p>
          : <StudentPicker mode="add" selected={selected} onChange={(next) => { setSelected(next); setConflict(null); setInvalid([]); }} assigned={assigned} onBusyChange={setSelecting} onPendingChange={setPending} />}
      {invalid.length > 0 && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300">
        <ul className="max-h-40 space-y-1 overflow-auto">
          {invalid.map((row) => <li key={row.row}>{row.name || row.email || row.studentid}: {row.message || String(row.status || "").replaceAll("_", " ")}</li>)}
        </ul>
        <button type="button" className={`${secondaryClass} mt-2`} disabled={busy} onClick={removeInvalid}><XCircle size={14} aria-hidden="true" />Remove {invalid.length === 1 ? "this student" : `these ${invalid.length.toLocaleString("en-IN")} students`}</button>
      </div>}
      {conflict && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
        <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={15} aria-hidden="true" />{conflict.count.toLocaleString("en-IN")} already assigned this interview in another active schedule</p>
        <p className="mt-1">{conflict.conflicts.slice(0, 8).map((row) => row.name || row.email).filter(Boolean).join(", ")}{conflict.count > 8 ? ", …" : ""}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={primaryClass} disabled={busy} onClick={() => add("skip")}>Skip them and add the rest</button>
        </div>
      </div>}
      {error && <Notice error>{error}</Notice>}
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-gray-800">
      <p className="text-[13px] text-slate-500 dark:text-gray-400">New students are notified. Anyone with this interview in an active schedule is marked “Already added”; after that schedule is cancelled or closed they can be added again.</p>
      <div className="flex gap-2">
        <button type="button" className={secondaryClass} disabled={busy} onClick={onClose}>Cancel</button>
        <button type="button" className={primaryClass} disabled={busy || !selected.length || !scheduleId} onClick={() => add()}>{busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}{busy ? "Adding…" : `Add ${selected.length ? selected.length.toLocaleString("en-IN") : ""} student${selected.length === 1 ? "" : "s"}`.replace("  ", " ")}</button>
      </div>
    </div>
  </Dialog>;
}
