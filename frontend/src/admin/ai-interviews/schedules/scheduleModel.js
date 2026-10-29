// Pure scheduling helpers: IST conversion, slot preview, validation and the create payload.
// Every admin input is wall-clock IST; the server stores UTC and rejects offset-less strings.

export const IST_OFFSET_MINUTES = 330;
export const IST_LABEL = "IST";
export const MAX_COHORT = 2000;
export const MAX_SLOTS = 2000;
export const MAX_WINDOW_DAYS = 120;
export const CHECK_CSV_BATCH = 1000;
const MINUTE = 60_000;
const DAY = 86_400_000;

export const WEEKDAYS = Object.freeze([
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 0, short: "Sun", label: "Sunday" },
]);

export const BOOKING_DEFAULTS = Object.freeze({ rescheduleLimit: 2, cutoffMinutes: 60, earlyJoinMinutes: 10, lateGraceMinutes: 10, attemptsAllowed: 1 });
export const BOOKING_LIMITS = Object.freeze({
  rescheduleLimit: [0, 10],
  cutoffMinutes: [0, 1440],
  earlyJoinMinutes: [0, 60],
  lateGraceMinutes: [0, 60],
  attemptsAllowed: [1, 5],
});
export const SLOT_DEFAULTS = Object.freeze({ slotMinutes: 45, capacityPerSlot: 10, dailyStart: "09:00", dailyEnd: "17:00", weekdays: [1, 2, 3, 4, 5], blackoutDates: [] });
export const SLOT_LIMITS = Object.freeze({ slotMinutes: [15, 120], capacityPerSlot: [1, 200] });

export const INTERVIEW_MODES = Object.freeze([
  { value: "mock", label: "Mock interview", description: "The published question plan, run like a real interview. Best for a fair, comparable cohort." },
  { value: "adaptive", label: "Adaptive interview", description: "ANVI adjusts follow-ups to each answer. Scores are less directly comparable across students." },
]);
export const VISIBILITY_OPTIONS = Object.freeze([
  { value: "after_close", label: "After the window closes", description: "Every student sees their report together once the schedule closes. Recommended." },
  { value: "immediate", label: "As soon as it is ready", description: "Students see their score and feedback right after evaluation. Expected key points and unasked questions stay hidden until the window closes, because others may still be interviewing (or retaking)." },
  { value: "manual", label: "When I release them", description: "Reports stay hidden until you choose Release reports on the schedule." },
]);
export const STATUS_META = Object.freeze({
  draft: { label: "Draft", tone: "slate" },
  scheduled: { label: "Scheduled", tone: "sky" },
  open: { label: "Open", tone: "emerald" },
  paused: { label: "Paused", tone: "amber" },
  closed: { label: "Closed", tone: "slate" },
  cancelled: { label: "Cancelled", tone: "rose" },
  archived: { label: "Archived", tone: "slate" },
});
export const STATUS_FILTERS = Object.freeze([
  { value: "", label: "All statuses" },
  ...["scheduled", "open", "paused", "closed", "cancelled", "archived"].map((value) => ({ value, label: STATUS_META[value].label })),
]);
export const OUTCOME_META = Object.freeze({
  pending: { label: "Not booked", tone: "slate" },
  booked: { label: "Booked", tone: "sky" },
  in_progress: { label: "In progress", tone: "violet" },
  completed: { label: "Completed", tone: "emerald" },
  no_show: { label: "No-show", tone: "rose" },
  missed: { label: "Missed", tone: "amber" },
  cancelled: { label: "Cancelled", tone: "slate" },
});
export const OUTCOME_FILTERS = Object.freeze([
  { value: "", label: "All outcomes" },
  ...Object.entries(OUTCOME_META).map(([value, meta]) => ({ value, label: meta.label })),
]);
export const KPI_KEYS = Object.freeze([
  ["assigned", "Assigned"],
  ["booked", "Booked"],
  ["in_progress", "In progress"],
  ["completed", "Completed"],
  ["no_show", "No-show"],
  ["missed", "Missed"],
]);

// The lifecycle actions an admin can take from each status; the server re-checks every one.
const ACTIONS_BY_STATUS = Object.freeze({
  // A draft is a create that never finished; it can only be cancelled.
  draft: ["cancel"],
  scheduled: ["pause", "cancel"],
  open: ["pause", "close", "cancel"],
  paused: ["resume", "close", "cancel"],
  closed: ["archive"],
  cancelled: ["archive"],
});
export const ACTION_META = Object.freeze({
  pause: { label: "Pause", confirm: "Pause this schedule? Students cannot book or start until you resume. Interviews already in progress continue." },
  resume: { label: "Resume", confirm: "Resume this schedule? Booking and starts reopen for the cohort." },
  close: { label: "Close now", confirm: "Close this schedule now? No new interviews can start, unbooked students are marked missed, and reports follow your visibility setting." },
  cancel: { label: "Cancel schedule", confirm: "Cancel this schedule? Every booking is cancelled and students are notified. This cannot be undone.", danger: true },
  archive: { label: "Archive", confirm: "Archive this schedule? It moves out of the active list; its results are kept." },
  release: { label: "Release reports", confirm: "Release reports to every student with a completed interview? Students are notified and can see their scores and feedback. Expected key points appear once the window has closed." },
});
export function actionsFor(assignment, now = Date.now()) {
  const status = assignment?.status;
  let actions = [...(ACTIONS_BY_STATUS[status] || [])];
  // Before the window opens nobody can have missed it, so the server refuses close; cancel instead.
  const opensAt = new Date(assignment?.window?.opensAt ?? 0).getTime();
  if (Number.isFinite(opensAt) && now < opensAt) actions = actions.filter((action) => action !== "close");
  // Manual reports stay releasable after a cancel or an archive too.
  if (assignment?.reportVisibility === "manual" && !assignment?.releasedAt && ["open", "paused", "closed", "cancelled", "archived"].includes(status)) actions.unshift("release");
  return actions;
}
export const isEditable = (assignment) => ["scheduled", "open", "paused"].includes(assignment?.status);

const pad = (value) => String(value).padStart(2, "0");
const INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "YYYY-MM-DDTHH:mm" read as IST wall-clock time → ISO string with an explicit +05:30 offset. */
export function istInputToIso(value) {
  const match = INPUT_PATTERN.exec(String(value || ""));
  if (!match) return "";
  const [, year, month, day, hour, minute] = match.map(Number);
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute));
  // Reject rolled-over values such as 2026-02-31.
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return "";
  return `${value}:00+05:30`;
}
/** Milliseconds since the epoch of an IST input, or NaN. */
export function istInputToMs(value) {
  const iso = istInputToIso(value);
  return iso ? new Date(iso).getTime() : Number.NaN;
}
/** Any date value → "YYYY-MM-DDTHH:mm" in IST, for prefilling inputs. */
export function toIstInput(value) {
  if (value === null || value === undefined || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * MINUTE);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}
export const istNowInput = (now = Date.now()) => toIstInput(new Date(now));
/** The IST calendar date ("YYYY-MM-DD") of a moment. */
export const istDateOf = (value) => toIstInput(value).slice(0, 10);

const IST_FORMAT = { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" };
/** Every displayed time uses en-IN in Asia/Kolkata and says IST. */
export function formatIst(value, { suffix = true } = {}) {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const text = date.toLocaleString("en-IN", IST_FORMAT);
  return suffix ? `${text} ${IST_LABEL}` : text;
}
export function formatIstDate(value) {
  const match = DATE_PATTERN.exec(String(value || ""));
  if (!match) return String(value || "");
  const [, year, month, day] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
export function formatIstTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}
export function formatWindow(window = {}) {
  return `${formatIst(window.opensAt, { suffix: false })} – ${formatIst(window.closesAt)}`;
}
const minutesOf = (time) => {
  const match = TIME_PATTERN.exec(String(time || ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
};
const intIn = (value, [min, max]) => Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max && String(value).trim() !== "";

/**
 * Mirrors the server's slot generation so the admin sees counts before scheduling:
 * every IST day in the window, on the chosen weekdays and not blacked out, from dailyStart
 * in steps of slotMinutes while the slot still ends by dailyEnd and inside the window.
 * Slots that start in the past are skipped. Stops one past the cap so the cap can be reported.
 */
export function previewSlots({ opensAt, closesAt, slotPolicy = {}, now = Date.now(), cap = MAX_SLOTS } = {}) {
  const open = istInputToMs(opensAt), close = istInputToMs(closesAt);
  const length = Number(slotPolicy.slotMinutes), capacity = Number(slotPolicy.capacityPerSlot);
  const startMinute = minutesOf(slotPolicy.dailyStart), endMinute = minutesOf(slotPolicy.dailyEnd);
  const empty = { count: 0, seats: 0, days: [], first: null, last: null, capped: false };
  if (!Number.isFinite(open) || !Number.isFinite(close) || close <= open) return empty;
  if (!intIn(length, SLOT_LIMITS.slotMinutes) || !Number.isFinite(startMinute) || !Number.isFinite(endMinute) || endMinute <= startMinute) return empty;
  const weekdays = new Set((slotPolicy.weekdays || []).map(Number));
  const blackout = new Set(slotPolicy.blackoutDates || []);
  const [y, m, d] = opensAt.slice(0, 10).split("-").map(Number);
  const lastDay = closesAt.slice(0, 10);
  const days = [];
  let count = 0, first = null, last = null;
  for (let cursor = Date.UTC(y, m - 1, d); ; cursor += DAY) {
    const day = new Date(cursor);
    const date = `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
    if (date > lastDay) break;
    if (!weekdays.has(day.getUTCDay()) || blackout.has(date)) continue;
    let dayCount = 0;
    // IST midnight of this date, as an instant.
    const midnight = cursor - IST_OFFSET_MINUTES * MINUTE;
    for (let minute = startMinute; minute + length <= endMinute; minute += length) {
      const startsAt = midnight + minute * MINUTE, endsAt = startsAt + length * MINUTE;
      if (startsAt < open || endsAt > close || startsAt <= now) continue;
      dayCount += 1; count += 1;
      first ??= startsAt; last = startsAt;
      if (count > cap) return { count, seats: count * (capacity || 0), days, first, last, capped: true };
    }
    if (dayCount) days.push({ date, count: dayCount });
  }
  return { count, seats: count * (Number.isFinite(capacity) ? capacity : 0), days, first, last, capped: false };
}

export const newScheduleDraft = (interviewId = "") => ({
  interviewId,
  mode: "mock",
  source: "selected",
  filters: { semester: "", branch: "", course: "", college: "", group: "" },
  opensAt: "",
  closesAt: "",
  timing: "slots",
  slotPolicy: { ...SLOT_DEFAULTS, weekdays: [...SLOT_DEFAULTS.weekdays], blackoutDates: [] },
  bookingPolicy: { ...BOOKING_DEFAULTS },
  reportVisibility: "after_close",
  blockPractice: true,
  notes: "",
});

export const hasFilter = (filters = {}) => Object.values(filters).some((value) => String(value ?? "").trim() !== "");

export function validateInterviewStep(draft, interview) {
  if (!draft.interviewId) return "Choose a published interview to schedule.";
  if (interview && !interview.publishedAt) return "Only published interviews can be scheduled. Publish it first.";
  if (!INTERVIEW_MODES.some((mode) => mode.value === draft.mode)) return "Choose an interview mode.";
  return "";
}
export function validateStudentStep(draft, { selected = [], filterCount = null, busy = false, pending = false, counting = false } = {}) {
  if (busy) return "Wait for the student selection to finish.";
  if (pending) return "Finish adding the reviewed CSV students, or discard the import before continuing.";
  if (draft.source === "filters") {
    if (!hasFilter(draft.filters)) return "Choose at least one student filter.";
    // The count shown may still belong to the previous filters.
    if (counting) return "Wait for the student count to update.";
    if (filterCount === 0) return "No students match these filters.";
    if (filterCount > MAX_COHORT) return `These filters match ${filterCount.toLocaleString("en-IN")} students. Narrow them to ${MAX_COHORT.toLocaleString("en-IN")} or fewer.`;
    return "";
  }
  if (!selected.length) return draft.source === "csv" ? "Upload a CSV and add the reviewed students." : "Add at least one registered student.";
  if (selected.length > MAX_COHORT) return `Select up to ${MAX_COHORT.toLocaleString("en-IN")} students for one schedule.`;
  return "";
}
/**
 * `checkSchedule: false` (an edit that leaves the window and slots alone) skips the window and slot
 * checks, so a notes or visibility change near the end of a window is never blocked by them.
 */
export function validateWindowStep(draft, { now = Date.now(), allowPastOpen = false, checkSchedule = true } = {}) {
  if (!checkSchedule) return "";
  const open = istInputToMs(draft.opensAt), close = istInputToMs(draft.closesAt);
  if (!Number.isFinite(open)) return "Enter when the window opens (IST).";
  if (!Number.isFinite(close)) return "Enter when the window closes (IST).";
  if (close <= open) return "The window must close after it opens.";
  if (close - open > MAX_WINDOW_DAYS * DAY) return `Keep the window to ${MAX_WINDOW_DAYS} days or less.`;
  if (close <= now) return "The closing time has already passed. Choose a future time.";
  if (!allowPastOpen && open < now - 5 * MINUTE) return "The opening time is in the past. Choose now or a later time.";
  if (draft.timing === "window") {
    if (close - open < 15 * MINUTE) return "Keep the window open for at least 15 minutes. Starts stop 5 minutes before it closes.";
    return "";
  }
  const policy = draft.slotPolicy || {};
  if (!intIn(policy.slotMinutes, SLOT_LIMITS.slotMinutes)) return "Slot length must be a whole number from 15 to 120 minutes.";
  if (!intIn(policy.capacityPerSlot, SLOT_LIMITS.capacityPerSlot)) return "Seats per slot must be a whole number from 1 to 200.";
  const start = minutesOf(policy.dailyStart), end = minutesOf(policy.dailyEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Enter the daily start and end times (IST).";
  if (end <= start) return "The daily end time must be after the daily start time.";
  if (end - start < Number(policy.slotMinutes)) return "The daily hours are shorter than one slot.";
  if (!policy.weekdays?.length) return "Choose at least one weekday for slots.";
  const preview = previewSlots({ opensAt: draft.opensAt, closesAt: draft.closesAt, slotPolicy: policy, now });
  if (!preview.count) return "These settings produce no future slots. Widen the window, hours or weekdays.";
  if (preview.capped) return `These settings produce more than ${MAX_SLOTS.toLocaleString("en-IN")} slots. Use longer slots or a shorter window.`;
  return "";
}
export function validatePolicyStep(draft) {
  const policy = draft.bookingPolicy || {};
  const names = { rescheduleLimit: "Reschedules allowed", cutoffMinutes: "Change cutoff", earlyJoinMinutes: "Early join", lateGraceMinutes: "Late grace", attemptsAllowed: "Attempts allowed" };
  for (const [key, range] of Object.entries(BOOKING_LIMITS)) {
    if (draft.timing === "window" && ["rescheduleLimit", "cutoffMinutes", "earlyJoinMinutes", "lateGraceMinutes"].includes(key)) continue;
    if (!intIn(policy[key], range)) return `${names[key]} must be a whole number from ${range[0]} to ${range[1]}.`;
  }
  if (!VISIBILITY_OPTIONS.some((option) => option.value === draft.reportVisibility)) return "Choose when students see their reports.";
  if (String(draft.notes || "").length > 1000) return "Keep notes to 1,000 characters.";
  return "";
}

/** Non-blocking warnings shown beside the slot preview. */
export function capacityWarnings({ preview, cohortSize, slotMinutes, estimatedMinutes, attemptsAllowed = 1 }) {
  const warnings = [];
  if (preview && cohortSize && preview.seats < cohortSize) warnings.push(`Only ${preview.seats.toLocaleString("en-IN")} seats for ${cohortSize.toLocaleString("en-IN")} students. ${(cohortSize - preview.seats).toLocaleString("en-IN")} students will not find a slot.`);
  else if (preview && cohortSize && preview.seats < Math.ceil(cohortSize * 1.1)) warnings.push("Seats barely cover the cohort, so late bookers and reschedules have little choice. Add about 10% spare capacity.");
  if (attemptsAllowed > 1 && preview && cohortSize && preview.seats < cohortSize * attemptsAllowed) warnings.push(`Each attempt needs its own booked seat: a student who retries books a new slot. Plan about ${(cohortSize * attemptsAllowed).toLocaleString("en-IN")} seats for ${attemptsAllowed} attempts each.`);
  if (estimatedMinutes && slotMinutes && Number(slotMinutes) < estimatedMinutes) warnings.push(`Slots are ${slotMinutes} minutes but the interview can take up to ${estimatedMinutes} minutes. Attempts are cut off at the slot end plus late grace.`);
  return warnings;
}

const cleanFilters = (filters = {}) => {
  const out = {};
  for (const [key, value] of Object.entries(filters)) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    out[key] = key === "semester" ? Number(text) : text;
  }
  return out;
};
const ints = (values) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));

/** The POST /ai-interviews/schedules body. Times always carry +05:30. */
export function buildSchedulePayload(draft, { selected = [] } = {}) {
  const audience = draft.source === "filters"
    ? { source: "filters", filters: cleanFilters(draft.filters) }
    : { source: draft.source, studentIds: [...new Set(selected.map((student) => String(student._id)))] };
  const slotPolicy = draft.timing === "window"
    ? { mode: "window" }
    : {
      mode: "slots",
      slotMinutes: Number(draft.slotPolicy.slotMinutes),
      capacityPerSlot: Number(draft.slotPolicy.capacityPerSlot),
      dailyStart: draft.slotPolicy.dailyStart,
      dailyEnd: draft.slotPolicy.dailyEnd,
      weekdays: [...new Set(draft.slotPolicy.weekdays.map(Number))].sort((a, b) => a - b),
      blackoutDates: [...new Set(draft.slotPolicy.blackoutDates)].sort(),
    };
  return {
    interviewId: draft.interviewId,
    mode: draft.mode,
    audience,
    window: { opensAt: istInputToIso(draft.opensAt), closesAt: istInputToIso(draft.closesAt) },
    timezone: "Asia/Kolkata",
    slotPolicy,
    bookingPolicy: ints(draft.bookingPolicy),
    reportVisibility: draft.reportVisibility,
    blockPractice: draft.blockPractice !== false,
    notes: String(draft.notes || "").trim(),
  };
}

/** An editable draft from a saved assignment, for the edit dialog. */
export function draftFromAssignment(assignment = {}) {
  const slots = assignment.slotPolicy || {};
  return {
    opensAt: toIstInput(assignment.window?.opensAt),
    closesAt: toIstInput(assignment.window?.closesAt),
    timing: slots.mode === "window" ? "window" : "slots",
    slotPolicy: {
      ...SLOT_DEFAULTS,
      ...slots,
      weekdays: [...(slots.weekdays || SLOT_DEFAULTS.weekdays)],
      blackoutDates: [...(slots.blackoutDates || [])],
    },
    bookingPolicy: { ...BOOKING_DEFAULTS, ...(assignment.bookingPolicy || {}) },
    reportVisibility: assignment.reportVisibility || "after_close",
    blockPractice: assignment.blockPractice !== false,
    notes: assignment.notes || "",
  };
}
/** Only the fields that changed, in PATCH shape. */
export function buildSchedulePatch(assignment, edit) {
  const next = buildSchedulePayload({ ...newScheduleDraft(assignment.interviewId), ...edit }, {});
  const before = draftFromAssignment(assignment);
  const patch = {};
  if (edit.opensAt !== before.opensAt || edit.closesAt !== before.closesAt) patch.window = next.window;
  if (JSON.stringify(next.slotPolicy) !== JSON.stringify(buildSchedulePayload({ ...newScheduleDraft(), ...before }).slotPolicy)) patch.slotPolicy = next.slotPolicy;
  if (JSON.stringify(next.bookingPolicy) !== JSON.stringify(ints(before.bookingPolicy))) patch.bookingPolicy = next.bookingPolicy;
  if (edit.reportVisibility !== before.reportVisibility) patch.reportVisibility = edit.reportVisibility;
  if (edit.blockPractice !== undefined && (edit.blockPractice !== false) !== before.blockPractice) patch.blockPractice = edit.blockPractice !== false;
  if (String(edit.notes || "").trim() !== String(before.notes || "").trim()) patch.notes = next.notes;
  return patch;
}

// ---------- Assigned students ----------

/** Status tabs of the assigned-students table; `count` names the server's counts key. */
export const TARGET_STATUS_TABS = Object.freeze([
  { value: "", label: "All", count: "all" },
  { value: "pending", label: "Not booked", count: "pending" },
  { value: "booked", label: "Booked", count: "booked" },
  { value: "in_progress", label: "In progress", count: "in_progress" },
  { value: "completed", label: "Completed", count: "completed" },
  { value: "no_show", label: "No-show", count: "no_show" },
  { value: "missed", label: "Missed", count: "missed" },
  { value: "cancelled", label: "Cancelled", count: "cancelled" },
  { value: "removed", label: "Removed", count: "removed" },
]);
export const BOOKING_META = Object.freeze({
  booked: { label: "Booked", tone: "sky" },
  needs_reschedule: { label: "Needs a new slot", tone: "amber" },
  completed: { label: "Attended", tone: "emerald" },
  cancelled: { label: "Cancelled", tone: "slate" },
  no_show: { label: "No-show", tone: "rose" },
});
export const ATTEMPT_META = Object.freeze({
  in_progress: { label: "In progress", tone: "violet" },
  completed: { label: "Awaiting evaluation", tone: "amber" },
  evaluating: { label: "Evaluating", tone: "violet" },
  ready: { label: "Report ready", tone: "emerald" },
  failed: { label: "Evaluation failed", tone: "rose" },
  abandoned: { label: "Ended early", tone: "slate" },
  expired: { label: "Timed out", tone: "slate" },
});
/** Semester 1–8 → study year 1–4. */
export const yearOf = (semester) => (Number(semester) > 0 ? Math.ceil(Number(semester) / 2) : null);
export const yearLabel = (semester) => (yearOf(semester) ? `Year ${yearOf(semester)} · Sem ${Number(semester)}` : "—");
export const departmentLabel = (student = {}) => [student.branch, student.course].filter((value) => String(value ?? "").trim()).join(" · ");
/** A target row (from GET …/targets) as a selection entry, the shape the student pickers use. */
export const studentFromTarget = (row = {}) => ({
  _id: String(row.studentId), name: row.student?.name || "", email: row.student?.email || "", studentId: row.student?.studentCode || "",
  branch: row.student?.branch || "", course: row.student?.course || "", semester: row.student?.semester ?? "",
});
/** An interview under way stays attached; completed students may be removed while their history remains. */
export const isRemovableTarget = (row = {}) => row.status !== "removed" && row.outcome !== "in_progress";
/** What an edit changes: students to add (new to the schedule) and already-assigned students to remove. */
export function targetDelta(assignedIds = [], selected = []) {
  const before = new Set([...assignedIds].map(String));
  const after = new Set(selected.map((student) => String(student._id)));
  return {
    add: [...after].filter((value) => !before.has(value)),
    remove: [...before].filter((value) => !after.has(value)),
  };
}
const csvCell = (value) => {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
/** The assigned-students table as CSV (formula cells neutralised, like the server roster export). */
export function targetsCsv(rows = []) {
  const header = ["Name", "Roll / ID", "Email", "Department", "Semester", "Schedule", "Roster status", "Outcome", "Slot (IST)", "Booking", "Attempt", "Score %"];
  const lines = [header, ...rows.map((row) => [
    row.student?.name, row.student?.studentCode, row.student?.email, departmentLabel(row.student), row.student?.semester ?? "", row.schedule?.title,
    row.status, OUTCOME_META[row.outcome]?.label || row.outcome, row.booking?.startsAt ? formatIst(row.booking.startsAt) : "",
    BOOKING_META[row.booking?.status]?.label || "", ATTEMPT_META[row.attempt?.status]?.label || "", row.attempt?.percent ?? "",
  ])];
  return `\ufeff${lines.map((cells) => cells.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
/** A request error for the admin; a stale-version conflict also says to refresh. */
export const errorText = (cause, fallback) => {
  const code = cause?.response?.data?.code;
  if (code === "REVISION_CONFLICT" || code === "ASSIGNMENT_CHANGED" || cause?.response?.status === 409) return `${cause.message || fallback} Refresh to see the latest version.`;
  return cause?.message || fallback;
};
/**
 * The students a picker locks as "Already added", from GET …/targets or …/by-interview/…/targets:
 * everyone on `scheduleId` itself, plus anyone holding the interview in another schedule that is still
 * active (scheduled, open or paused, before it closes). A cancelled, closed or archived schedule does not
 * block, and removed students never do, matching the server's ALREADY_ASSIGNED rule.
 */
export function blockingTargets(result = {}, { scheduleId = "", now = Date.now() } = {}) {
  const schedules = new Map((result.schedules || []).map((row) => [String(row.id), row]));
  const active = (id) => {
    const schedule = schedules.get(String(id));
    if (!schedule) return true;
    const closes = new Date(schedule.window?.closesAt ?? Number.POSITIVE_INFINITY).getTime();
    return ["scheduled", "open", "paused"].includes(schedule.status) && !(closes <= now);
  };
  return new Map((result.rows || [])
    .filter((row) => row.status !== "removed" && (String(row.assignmentId) === String(scheduleId) || active(row.assignmentId)))
    .map((row) => [String(row.studentId), row]));
}
/** "3 students are already assigned…" with names, from a 409 ALREADY_ASSIGNED body. */
export function conflictOf(cause) {
  const data = cause?.response?.data;
  if (data?.code !== "ALREADY_ASSIGNED") return null;
  return { count: Number(data.conflictCount) || (data.conflicts || []).length, conflicts: data.conflicts || [] };
}

// Server payloads are normalised once so the views tolerate either id or _id.
export const idOf = (value) => String(value?._id ?? value?.id ?? value ?? "");
export function kpiValue(kpis = {}, key) {
  const camel = key.replace(/_(\w)/g, (_, letter) => letter.toUpperCase());
  const value = kpis[key] ?? kpis[camel];
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}
export function rosterRows(detail = {}) {
  const roster = detail.roster || {};
  if (Array.isArray(roster)) return roster;
  return roster.items || roster.rows || roster.targets || detail.targets || [];
}
/** A booking an admin can still move or cancel: active, not started, booked or awaiting a new slot. */
export const isLiveBooking = (booking) => Boolean(booking) && booking.active !== false && ["booked", "needs_reschedule"].includes(booking.status);
/**
 * A finished booking only the admin can replace: a no-show (the student is told to ask the institution),
 * or a student who used up their changes by cancelling. The server moves it to a new slot.
 */
export const isRebookable = (row = {}) => {
  const booking = row.booking;
  if (!booking || row.attempt || row.status === "removed") return false;
  return booking.status === "no_show" || (booking.status === "cancelled" && booking.cancelledBy === "student");
};
export const rosterPagination = (detail = {}) => detail.roster?.pagination || detail.pagination || null;
export const listRows = (result = {}) => result?.items || result?.assignments || [];
export const assignmentOf = (detail = {}) => detail?.assignment || detail || {};
export const timingLabel = (assignment = {}) => assignment.slotPolicy?.mode === "slots"
  ? `${assignment.slotPolicy.slotMinutes} min slots · ${assignment.slotPolicy.capacityPerSlot} per slot`
  : "Open window";
export const sourceLabel = (source) => ({ filters: "Student filters", selected: "Selected students", csv: "CSV upload" })[source] || "Students";

const numberOrNull = (value) => (value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null);
/** The cohort summary, read defensively so small shape differences do not blank the report tab. */
export function normaliseSummary(summary = {}) {
  const kpis = summary.kpis || summary.totals || {};
  const distribution = (summary.distribution || summary.scoreDistribution || []).map((row) => ({
    label: String(row.label ?? row.band ?? row.range ?? row.bucket ?? ""),
    value: Number(row.count ?? row.value ?? 0),
  }));
  const competencies = (summary.competencies || summary.competencyAverages || summary.byCompetency || [])
    .map((row) => ({ label: String(row.name ?? row.competency ?? row.label ?? "General"), value: numberOrNull(row.percent ?? row.averagePercent ?? row.average ?? row.value) }))
    .filter((row) => row.value !== null);
  const weakest = (summary.weakestKeyPoints || summary.keyPoints || []).map((row) => ({
    text: String(row.keyPoint ?? row.point ?? row.text ?? ""),
    question: row.questionText || row.question || "",
    missRate: numberOrNull(row.missRate ?? row.missedPercent ?? row.percentMissed),
    missed: numberOrNull(row.missed ?? row.missedCount),
    total: numberOrNull(row.seen ?? row.total ?? row.answered ?? row.count),
  })).filter((row) => row.text);
  const bands = (summary.bands || []).map((row) => ({ label: String(row.band ?? row.label ?? ""), value: Number(row.count ?? row.value ?? 0) })).filter((row) => row.label);
  const completionRate = numberOrNull(kpis.completionRate ?? summary.completionRate);
  return { kpis, distribution, competencies, weakest, bands, completionRate };
}

/** Splits a roster into check-csv sized batches (the validator accepts 1,000 rows). */
export function chunk(values, size = CHECK_CSV_BATCH) {
  const out = [];
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
  return out;
}
