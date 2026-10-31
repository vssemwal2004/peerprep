import mongoose from "mongoose";
import AIInterview from "../../models/AIInterview.js";
import User from "../../models/User.js";
import { HttpError } from "../../utils/errors.js";
import { AnviAttempt, AnviLiveSession, AnviResumeContext } from "./anviInterview.models.js";
import { AnviAudioAsset } from "./anviInterview.audio.models.js";
import { languageSetupOf, resumeSetupOf, termsOf } from "./anviInterview.plan.js";
import { proctoringSetupOf } from "./anviInterview.proctoring.js";
import { AnviAssignment, AnviAssignmentTarget, AnviBooking, AnviSlot } from "./anviInterview.scheduling.models.js";
import { buildAnviBookingIcs } from "./anviInterview.scheduling.ics.js";
import { createSchedulingNotifier, formatIst } from "./anviInterview.scheduling.notify.js";
import { studentFeatureQuery } from "../../services/studentFeatureAccess.js";

// ANVI Phase 3 scheduling: assignments of a pinned published revision to a cohort, IST windows,
// optional capacity-limited slots and bookings. No Mongo transactions are used anywhere in this
// codebase, so every capacity change is a conditional $inc with compensation on the failure path.
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const IST_OFFSET_MS = 330 * MINUTE;
const OBJECT_ID = /^[a-f0-9]{24}$/i;
export const MAX_COHORT = 2000;
export const MAX_SLOTS = 2000;
const MAX_WINDOW_DAYS = 120;
const MIN_WINDOW_MINUTES = 15;
// Window mode stops new starts five minutes before the window closes.
const WINDOW_START_MARGIN_MS = 5 * MINUTE;
const CLOSED_VISIBLE_DAYS = 30;
const ACTIVE = ["scheduled", "open", "paused"];
const EDITABLE = ["draft", ...ACTIVE];
const FINISHED = new Set(["completed", "evaluating", "ready", "failed"]);
const ENDED = new Set([...FINISHED, "abandoned", "expired"]);
const OUTCOMES = ["pending", "booked", "in_progress", "completed", "no_show", "missed", "cancelled"];
const STATUSES = ["draft", "scheduled", "open", "paused", "closed", "cancelled", "archived"];
const VISIBILITY = ["immediate", "after_close", "manual"];
const MODES = ["mock", "adaptive"];
export const DEFAULT_BOOKING_POLICY = Object.freeze({ rescheduleLimit: 2, cutoffMinutes: 60, earlyJoinMinutes: 10, lateGraceMinutes: 10, attemptsAllowed: 1 });
const POLICY_LIMITS = Object.freeze({
  rescheduleLimit: [0, 10, "Reschedule limit"],
  cutoffMinutes: [0, 1440, "Booking cutoff (minutes)"],
  earlyJoinMinutes: [0, 60, "Early join (minutes)"],
  lateGraceMinutes: [0, 60, "Late grace (minutes)"],
  attemptsAllowed: [1, 5, "Attempts allowed"],
});
// Students who can never use ANVI are left out of every cohort.
const ELIGIBLE = Object.freeze({ role: "student", accessScope: { $ne: "assessment_only" }, isActive: { $ne: false }, ...studentFeatureQuery("ai_interviews") });
const LIST_LIMITS = [10, 25, 50, 100];
const RELEASE_BATCH = 50;
// A student can hold an interview in only one active schedule (scheduled, open or paused, before it
// closes). A request that would assign them again either fails (reject) or leaves them out (skip);
// once the earlier schedule is cancelled, closed or archived they can be assigned again.
const DUPLICATE_POLICIES = ["reject", "skip"];
const TARGET_SOURCES = ["filters", "selected", "csv", "manual"];
// The assigned-students view joins targets in memory; one interview's schedules are capped at this many rows.
const MAX_TARGET_SCAN = MAX_COHORT * 10;
// A repeated invite to the same student waits this long, so a double click sends one reminder.
const INVITE_COOLDOWN_MS = 10 * MINUTE;
const TARGET_STATUS_FILTERS = ["", "all", "removed", ...OUTCOMES];
const TARGET_SORTS = ["name", "studentCode", "email", "department", "schedule", "slot", "status", "attempt", "score", "assignedAt"];
// A create still in its draft phase after this long was interrupted (the process died) and is redone.
const STALE_DRAFT_MS = 2 * MINUTE;

const fail = (status, code, message, extra = {}) => { throw new HttpError(status, message, { code, ...extra }); };
const validId = (value) => OBJECT_ID.test(String(value || ""));
const objectId = (value, label = "identifier") => {
  if (!validId(value)) fail(400, "INVALID_IDENTIFIER", `Invalid ${label}.`);
  return new mongoose.Types.ObjectId(String(value));
};
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exactInsensitive = (value) => new RegExp(`^${escapeRegex(value)}$`, "i");
const ms = (value) => new Date(value).getTime();
const policyOf = (assignment) => ({ ...DEFAULT_BOOKING_POLICY, ...(assignment?.bookingPolicy || {}) });
const slotsMode = (assignment) => assignment?.slotPolicy?.mode === "slots";
const sameId = (a, b) => String(a || "") === String(b || "");

// ---------- IST time handling ----------

const ISO_WITH_OFFSET = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Parses an admin date-time. The offset is mandatory and must be IST (+05:30); "Z" is also accepted
 * because the server returns UTC ISO strings and a client may send one back unchanged.
 */
export function parseIstInstant(value, label = "Date-time") {
  const match = typeof value === "string" ? ISO_WITH_OFFSET.exec(value.trim()) : null;
  if (!match) fail(400, "INVALID_DATETIME", `${label} must be an ISO date-time with an explicit offset, for example 2026-11-02T10:00:00+05:30.`);
  const [, y, mo, d, h, mi, s = "00", frac = "0", offset] = match;
  if (offset !== "Z" && offset !== "+05:30") fail(400, "INVALID_TIMEZONE_OFFSET", `${label} must use the IST offset +05:30.`);
  const [year, month, day, hour, minute, second] = [y, mo, d, h, mi, s].map(Number);
  const utc = Date.UTC(year, month - 1, day, hour, minute, second, Number(frac.padEnd(3, "0")));
  const check = new Date(utc);
  if (hour > 23 || minute > 59 || second > 59 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    fail(400, "INVALID_DATETIME", `${label} is not a valid calendar date-time.`);
  }
  return new Date(utc - (offset === "Z" ? 0 : IST_OFFSET_MS));
}

const istDateKey = (time) => new Date(time + IST_OFFSET_MS).toISOString().slice(0, 10);
const istWeekday = (dateKey) => new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const istAt = (dateKey, minutes) => Date.parse(`${dateKey}T00:00:00.000Z`) - IST_OFFSET_MS + minutes * MINUTE;
const nextDateKey = (dateKey) => new Date(Date.parse(`${dateKey}T00:00:00.000Z`) + DAY).toISOString().slice(0, 10);

/** Slot start/end times inside the window, on allowed IST weekdays and hours, after `after`. */
export function generateSlotTimes(window, policy, after = new Date(0)) {
  const opens = ms(window.opensAt);
  const closes = ms(window.closesAt);
  const length = policy.slotMinutes * MINUTE;
  const dayStart = minutesOf(policy.dailyStart);
  const dayEnd = minutesOf(policy.dailyEnd);
  const weekdays = new Set(policy.weekdays);
  const blackout = new Set(policy.blackoutDates || []);
  const slots = [];
  const lastKey = istDateKey(closes);
  for (let key = istDateKey(opens); key <= lastKey; key = nextDateKey(key)) {
    if (!weekdays.has(istWeekday(key)) || blackout.has(key)) continue;
    const end = istAt(key, dayEnd);
    for (let start = istAt(key, dayStart); start + length <= end; start += length) {
      if (start < opens || start + length > closes || start <= ms(after)) continue;
      slots.push({ startsAt: new Date(start), endsAt: new Date(start + length) });
      if (slots.length > MAX_SLOTS) fail(422, "TOO_MANY_SLOTS", `This schedule creates more than ${MAX_SLOTS} slots. Use longer slots, fewer days or shorter hours.`);
    }
  }
  return slots;
}

/** The assignment status as of `at`, ahead of the sweeper (which runs about once a minute). */
export function effectiveStatus(assignment, at) {
  const time = ms(at);
  if (["scheduled", "open"].includes(assignment.status) && time >= ms(assignment.window.closesAt)) return "closed";
  if (assignment.status === "scheduled" && time >= ms(assignment.window.opensAt)) return "open";
  return assignment.status;
}

export function joinWindowFor(assignment, booking) {
  const policy = policyOf(assignment);
  if (!slotsMode(assignment)) {
    return { from: new Date(assignment.window.opensAt), to: new Date(ms(assignment.window.closesAt) - WINDOW_START_MARGIN_MS) };
  }
  if (!booking || booking.status !== "booked") return null;
  return {
    // Nobody can start before the window opens, so a slot at opensAt has no early join.
    from: new Date(Math.max(ms(booking.startsAt) - policy.earlyJoinMinutes * MINUTE, ms(assignment.window.opensAt))),
    to: new Date(ms(booking.startsAt) + policy.lateGraceMinutes * MINUTE),
  };
}

const deny = (status, code, message) => ({ ok: false, status, code, message, hardDeadlineCap: null });

/**
 * The one rule for an assigned start: the coin exemption and the start handler both use it.
 * Returns { ok, status, code, message, hardDeadlineCap }; `activeAttempt` is an in-progress assigned attempt.
 */
export function evaluateStart({ assignment, target, booking, activeAttempt = null, at }) {
  if (!assignment || !target || target.status !== "assigned") return deny(404, "NOT_ASSIGNED", "This interview is not assigned to you.");
  const now = ms(at);
  if (activeAttempt && ms(activeAttempt.hardDeadline) > now) {
    return { ok: true, status: 200, code: "RESUME", message: "", hardDeadlineCap: new Date(activeAttempt.hardDeadline) };
  }
  const status = effectiveStatus(assignment, at);
  if (status === "paused") return deny(409, "ASSIGNMENT_PAUSED", "Your institution has paused this interview. Try again later.");
  if (!["scheduled", "open"].includes(status)) return deny(403, "ASSIGNMENT_CLOSED", "This interview is no longer open.");
  const policy = policyOf(assignment);
  if ((target.attemptsUsed || 0) >= policy.attemptsAllowed) return deny(409, "ATTEMPTS_EXHAUSTED", "You have used every attempt for this interview.");
  const closes = ms(assignment.window.closesAt);
  const notOpen = () => deny(403, "NOT_YET_OPEN", `This interview opens at ${formatIst(assignment.window.opensAt)}.`);
  if (slotsMode(assignment)) {
    // The booking is the actionable part for a student, so it is reported before "not yet open".
    if (booking?.status === "needs_reschedule") return deny(409, "NEEDS_RESCHEDULE", "Your slot was withdrawn. Book a new slot first.");
    if (!booking || booking.status !== "booked" || !booking.active) return deny(409, "NO_BOOKING", "Book a slot before you start.");
    const join = joinWindowFor(assignment, booking);
    if (now < ms(join.from)) return deny(403, "TOO_EARLY", `You can join from ${formatIst(join.from)}.`);
    if (now > ms(join.to)) return deny(403, "JOIN_WINDOW_PASSED", "The join time for your slot has passed.");
    if (status !== "open") return notOpen();
    return { ok: true, status: 200, code: "OK", message: "", hardDeadlineCap: new Date(Math.min(closes, ms(booking.endsAt) + policy.lateGraceMinutes * MINUTE)) };
  }
  if (status !== "open" || now < ms(assignment.window.opensAt)) return notOpen();
  if (now > closes - WINDOW_START_MARGIN_MS) return deny(403, "WINDOW_CLOSED", "This interview window has closed.");
  return { ok: true, status: 200, code: "OK", message: "", hardDeadlineCap: new Date(closes) };
}

// ---------- Validation ----------

function intIn(value, min, max, label, code) {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (!Number.isInteger(number) || number < min || number > max) fail(400, code, `${label} must be a whole number from ${min} to ${max}.`);
  return number;
}

function hhmm(value, label) {
  const text = String(value ?? "").trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) fail(400, "INVALID_SLOT_POLICY", `${label} must be a time from 00:00 to 23:59 (IST).`);
  return text;
}

const validDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

export function normalizeSlotPolicy(input) {
  const mode = input?.mode ?? "window";
  if (mode === "window") return { mode: "window" };
  if (mode !== "slots") fail(400, "INVALID_SLOT_POLICY", "Slot mode must be window or slots.");
  const slotMinutes = intIn(input.slotMinutes, 15, 120, "Slot length (minutes)", "INVALID_SLOT_POLICY");
  const capacityPerSlot = intIn(input.capacityPerSlot, 1, 200, "Capacity per slot", "INVALID_SLOT_POLICY");
  const dailyStart = hhmm(input.dailyStart, "Daily start");
  const dailyEnd = hhmm(input.dailyEnd, "Daily end");
  if (minutesOf(dailyEnd) - minutesOf(dailyStart) < slotMinutes) fail(400, "INVALID_SLOT_POLICY", "Daily hours must fit at least one slot.");
  const days = input.weekdays === undefined ? [1, 2, 3, 4, 5] : input.weekdays;
  if (!Array.isArray(days) || !days.length) fail(400, "INVALID_SLOT_POLICY", "Choose at least one weekday.");
  const weekdays = [...new Set(days.map((day) => intIn(day, 0, 6, "Weekday", "INVALID_SLOT_POLICY")))].sort((a, b) => a - b);
  const dates = input.blackoutDates === undefined || input.blackoutDates === null ? [] : input.blackoutDates;
  if (!Array.isArray(dates) || dates.length > 366) fail(400, "INVALID_SLOT_POLICY", "Blackout dates must be a list of at most 366 dates.");
  const blackoutDates = [...new Set(dates.map((date) => {
    const text = String(date || "").trim();
    if (!validDateKey(text)) fail(400, "INVALID_SLOT_POLICY", "Blackout dates must be YYYY-MM-DD (IST).");
    return text;
  }))].sort();
  return { mode, slotMinutes, capacityPerSlot, dailyStart, dailyEnd, weekdays, blackoutDates };
}

export function normalizeBookingPolicy(input, base = DEFAULT_BOOKING_POLICY) {
  if (input !== undefined && input !== null && (typeof input !== "object" || Array.isArray(input))) fail(400, "INVALID_POLICY", "Booking policy must be an object.");
  const policy = { ...DEFAULT_BOOKING_POLICY, ...base };
  for (const [key, [min, max, label]] of Object.entries(POLICY_LIMITS)) {
    if (input?.[key] !== undefined) policy[key] = intIn(input[key], min, max, label, "INVALID_POLICY");
  }
  return Object.fromEntries(Object.keys(POLICY_LIMITS).map((key) => [key, policy[key]]));
}

export function normalizeWindow(input, at) {
  const opensAt = parseIstInstant(input?.opensAt, "Window opens at");
  const closesAt = parseIstInstant(input?.closesAt, "Window closes at");
  const length = ms(closesAt) - ms(opensAt);
  if (length < MIN_WINDOW_MINUTES * MINUTE) fail(400, "INVALID_WINDOW", `The window must be at least ${MIN_WINDOW_MINUTES} minutes long.`);
  if (length > MAX_WINDOW_DAYS * DAY) fail(400, "INVALID_WINDOW", `The window can be at most ${MAX_WINDOW_DAYS} days long.`);
  if (ms(closesAt) - WINDOW_START_MARGIN_MS <= ms(at)) fail(400, "INVALID_WINDOW", "The window must close in the future.");
  return { opensAt, closesAt };
}

const enumOf = (value, allowed, fallback, code, label) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (!allowed.includes(value)) fail(400, code, `${label} must be one of: ${allowed.join(", ")}.`);
  return value;
};
const boolOf = (value, fallback, label) => {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") fail(400, "INVALID_FIELD", `${label} must be true or false.`);
  return value;
};
const duplicatePolicyOf = (value) => enumOf(value, DUPLICATE_POLICIES, "reject", "INVALID_FIELD", "Duplicates");
const notesOf = (value) => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > 2000) fail(400, "INVALID_FIELD", "Notes must be text of at most 2000 characters.");
  return value.trim();
};

async function eligibleStudentIds(list) {
  if (!Array.isArray(list) || !list.length) fail(400, "COHORT_EMPTY", "Select at least one student.");
  // Lower-cased, so the same id sent twice in another letter case is still one student.
  const unique = [...new Set(list.map((value) => String(value ?? "").trim().toLowerCase()))];
  if (unique.length > MAX_COHORT) fail(422, "COHORT_TOO_LARGE", `An assignment can include at most ${MAX_COHORT} students.`);
  const malformed = unique.filter((id) => !validId(id));
  if (malformed.length) fail(400, "INVALID_STUDENTS", "One or more student identifiers are invalid.", { invalid: malformed.slice(0, 50) });
  const found = await User.find({ _id: { $in: unique }, ...ELIGIBLE }).select("_id").lean();
  if (found.length !== unique.length) {
    const ok = new Set(found.map((row) => String(row._id)));
    fail(400, "INVALID_STUDENTS", "One or more students are not active platform students.", { invalid: unique.filter((id) => !ok.has(id)).slice(0, 50) });
  }
  return unique.map((id) => new mongoose.Types.ObjectId(id));
}

/** Materializes the cohort snapshot; filters match case-insensitively and exactly. */
export async function resolveCohort(audience) {
  const source = audience?.source;
  if (source === "filters") {
    const raw = audience.filters && typeof audience.filters === "object" ? audience.filters : {};
    const filters = {};
    const query = { ...ELIGIBLE };
    if (raw.semester !== undefined && raw.semester !== null && raw.semester !== "") {
      filters.semester = intIn(raw.semester, 1, 8, "Semester", "INVALID_FILTERS");
      query.semester = filters.semester;
    }
    for (const field of ["branch", "course", "college", "group"]) {
      const value = typeof raw[field] === "string" ? raw[field].trim() : "";
      if (!value) continue;
      if (value.length > 120) fail(400, "INVALID_FILTERS", `The ${field} filter is too long.`);
      filters[field] = value;
      query[field] = exactInsensitive(value);
    }
    if (!Object.keys(filters).length) fail(400, "COHORT_FILTER_REQUIRED", "Choose at least one student filter.");
    const students = await User.find(query).select("_id").sort({ _id: 1 }).limit(MAX_COHORT + 1).lean();
    if (students.length > MAX_COHORT) fail(422, "COHORT_TOO_LARGE", `These filters match more than ${MAX_COHORT} students. Narrow them down.`);
    if (!students.length) fail(422, "COHORT_EMPTY", "No active students match these filters.");
    return { source, filters, studentIds: students.map((row) => row._id) };
  }
  if (source === "selected" || source === "csv") return { source, filters: {}, studentIds: await eligibleStudentIds(audience.studentIds) };
  return fail(400, "INVALID_AUDIENCE", "Audience source must be filters, selected or csv.");
}

/**
 * Students among `studentIds` who already hold this interview in another schedule that is still active:
 * scheduled, open or paused, and not past its close. Once that schedule is cancelled, closed or archived
 * the student may be assigned the interview again. Removed targets never block.
 */
export async function activeElsewhere(interviewId, studentIds, { at = new Date(), exceptId = null } = {}) {
  if (!studentIds?.length) return [];
  const others = await AnviAssignment.find({
    interviewId, status: { $in: ACTIVE }, "window.closesAt": { $gt: at }, ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  }).select("_id title").limit(500).lean();
  if (!others.length) return [];
  const titleOf = new Map(others.map((row) => [String(row._id), row.title]));
  const rows = await AnviAssignmentTarget.find({ assignmentId: { $in: others.map((row) => row._id) }, studentId: { $in: studentIds }, status: "assigned" })
    .select("assignmentId studentId").lean();
  const byStudent = new Map();
  for (const row of rows) {
    const key = String(row.studentId);
    if (!byStudent.has(key)) byStudent.set(key, { studentId: key, assignmentId: String(row.assignmentId), title: titleOf.get(String(row.assignmentId)) || "" });
  }
  return [...byStudent.values()];
}

// 409 ALREADY_ASSIGNED, naming up to 50 of the students (with their schedule) so the admin can decide.
async function failAlreadyAssigned(conflicts) {
  const shown = conflicts.slice(0, 50);
  const users = await User.find({ _id: { $in: shown.map((row) => row.studentId) } }).select("_id name email studentId").lean();
  const userById = new Map(users.map((row) => [String(row._id), row]));
  const count = conflicts.length;
  return fail(409, "ALREADY_ASSIGNED", `${count} student${count === 1 ? " is" : "s are"} already assigned this interview in another active schedule.`, {
    conflictCount: count,
    conflicts: shown.map((row) => {
      const user = userById.get(row.studentId) || {};
      return { ...row, name: user.name || "", email: user.email || "", studentCode: user.studentId || "" };
    }),
  });
}

// ---------- Views ----------

export function assignmentView(row) {
  return {
    id: String(row._id),
    interviewId: String(row.interviewId),
    snapshotRevision: row.snapshotRevision,
    title: row.title,
    role: row.role || "",
    mode: row.mode,
    audience: { source: row.audience?.source, filters: row.audience?.filters || {}, studentCount: row.audience?.studentCount || 0 },
    window: { opensAt: row.window.opensAt, closesAt: row.window.closesAt },
    timezone: row.timezone || "Asia/Kolkata",
    slotMode: slotsMode(row) ? "slots" : "window",
    slotPolicy: row.slotPolicy || { mode: "window" },
    bookingPolicy: policyOf(row),
    reportVisibility: row.reportVisibility,
    blockPractice: row.blockPractice !== false,
    status: row.status,
    releasedAt: row.releasedAt || null,
    closedAt: row.closedAt || null,
    cancelledAt: row.cancelledAt || null,
    revision: row.revision,
    notes: row.notes || "",
    createdBy: row.createdBy ? String(row.createdBy) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const paidChanges = (booking) => Math.max(0, (booking?.rescheduleCount || 0) - (booking?.freeReschedules || 0));
/**
 * Student-initiated changes spent on a student's other bookings of one assignment: their paid
 * reschedules plus every booking the student cancelled themselves. Cancelling and booking again is a
 * change too, so it cannot be used to get around the reschedule limit.
 */
export function priorChanges(bookings = [], exceptId = null) {
  return bookings
    .filter((row) => !sameId(row._id, exceptId))
    .reduce((total, row) => total + paidChanges(row) + (row.status === "cancelled" && row.cancelledBy === "student" ? 1 : 0), 0);
}

function bookingView(booking, assignment, at, prior = 0) {
  if (!booking) return null;
  const policy = policyOf(assignment);
  const used = paidChanges(booking) + prior;
  const status = effectiveStatus(assignment, at);
  const changeable = ["scheduled", "open"].includes(status) && booking.active && !booking.attemptId;
  return {
    id: String(booking._id),
    assignmentId: String(booking.assignmentId),
    slotId: booking.slotId ? String(booking.slotId) : null,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status,
    rescheduleCount: booking.rescheduleCount || 0,
    // Student-initiated changes left; a withdrawn slot (needs_reschedule) is rebooked without using one.
    rescheduleLeft: Math.max(0, policy.rescheduleLimit - used),
    canChange: changeable && (booking.status === "needs_reschedule" || ms(booking.startsAt) - policy.cutoffMinutes * MINUTE > ms(at)),
  };
}

const counts = () => Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0]));
const kpisOf = (byOutcome, removed = 0) => ({
  assigned: Object.values(byOutcome).reduce((sum, value) => sum + value, 0),
  pending: byOutcome.pending,
  booked: byOutcome.booked,
  inProgress: byOutcome.in_progress,
  completed: byOutcome.completed,
  noShow: byOutcome.no_show,
  missed: byOutcome.missed,
  cancelled: byOutcome.cancelled,
  removed,
});

const CSV_FORMULA = /^[=+\-@\t\r]/;
const csvCell = (value) => {
  let text = value === null || value === undefined ? "" : String(value);
  if (CSV_FORMULA.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

// ---------- Service ----------

// The pinned revision's question audio (ANVI hybrid), loaded on first use; never awaited by a schedule.
let audioPregenModule;
const defaultPregenRevision = async (spec) =>
  (await (audioPregenModule ||= import("./anviInterview.audioPregen.js"))).defaultAudioPregen().ensureRevision(spec);

let liveEndModules = null;
// An admin reset or removal while the student's interview is still running: the attempt is closed from its
// stored answers (abandoned, or expired past its deadline) and the conductor holding it in this process stops
// and tells the student. `evaluate: false` (a reset deletes the attempt right after) queues no evaluation.
const defaultEndInProgress = async (attempt, { endReason, at, evaluate = true }) => {
  const [service, socket] = await (liveEndModules ||= Promise.all([import("./anviInterview.service.js"), import("./anviInterview.socket.js")]));
  const outcome = { status: at >= new Date(attempt.hardDeadline) ? "expired" : "abandoned", endReason };
  const applied = await service.finalizeFromLive(attempt, { ...outcome, now: at, ...(evaluate ? {} : { evaluateSoon: null }) });
  if (applied) socket.stopAnviAttempt(attempt._id, outcome);
  return applied;
};

export function createAnviScheduling({ clock = Date, notifier = createSchedulingNotifier({ clock }), log = console, pregenRevision = defaultPregenRevision, endInProgress = defaultEndInProgress } = {}) {
  const now = () => new Date(clock.now());
  const pregen = (spec) => {
    try {
      Promise.resolve(pregenRevision(spec)).catch(() => {});
    } catch {
      // Question audio is optional; the schedule never depends on it.
    }
  };
  const send = (event, context) => Promise.resolve()
    .then(() => notifier.send(event, context))
    .catch((error) => log.warn?.(`[ANVI] Schedule notification failed (${error?.name || "Error"}).`));

  async function owned(admin, id, { withSnapshot = false } = {}) {
    const query = AnviAssignment.findOne({ _id: objectId(id, "assignment"), ownerId: admin._id });
    const row = await (withSnapshot ? query : query.select("-snapshotData")).lean();
    if (!row) fail(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
    return row;
  }

  const releaseSlot = (slotId) => (slotId
    ? AnviSlot.updateOne({ _id: slotId, bookedCount: { $gt: 0 } }, { $inc: { bookedCount: -1 } })
    : Promise.resolve());

  // Atomic seat claim: bookedCount only moves while it is below capacity, so parallel bookings cannot overbook.
  async function claimSlot(assignment, slotId, at, cutoffMinutes) {
    const cutoff = new Date(ms(at) + cutoffMinutes * MINUTE);
    const slot = await AnviSlot.findOneAndUpdate(
      { _id: slotId, assignmentId: assignment._id, status: "open", startsAt: { $gt: cutoff }, $expr: { $lt: ["$bookedCount", "$capacity"] } },
      { $inc: { bookedCount: 1 } },
      { new: true },
    ).lean();
    if (slot) return slot;
    const current = await AnviSlot.findOne({ _id: slotId, assignmentId: assignment._id }).lean();
    if (!current || current.status !== "open" || ms(current.startsAt) <= ms(at)) fail(404, "SLOT_NOT_FOUND", "This slot is not available.");
    if (ms(current.startsAt) <= ms(cutoff)) fail(409, "BOOKING_CUTOFF", `Slots must be booked at least ${cutoffMinutes} minutes before they start.`);
    return fail(409, "SLOT_FULL", "This slot is full. Choose another one.");
  }

  const historyPush = (entry) => ({ history: { $each: [entry], $slice: -10 } });

  // Cancels an active booking that has not started; releases its seat. Returns the booking or null if it changed.
  async function cancelBookingRow(booking, { by, reason, at, resetOutcome = true }) {
    const updated = await AnviBooking.findOneAndUpdate(
      { _id: booking._id, active: true, status: booking.status, attemptId: null },
      { $set: { status: "cancelled", active: false, cancelledBy: by, cancelReason: reason }, $push: historyPush({ action: "cancelled", from: booking.startsAt, at, by }) },
      { new: true },
    ).lean();
    if (!updated) return null;
    if (booking.status === "booked" && booking.slotId) await releaseSlot(booking.slotId);
    if (resetOutcome) {
      await AnviAssignmentTarget.updateOne({ assignmentId: booking.assignmentId, studentId: booking.studentId, status: "assigned", outcome: "booked" }, { $set: { outcome: "pending" } });
    }
    return updated;
  }

  // Reports become visible for the assignment's evaluated attempts (close with after_close, or a manual release).
  async function releaseReports(assignment, at) {
    const attempts = await AnviAttempt.find({ assignmentId: assignment._id, status: "ready", visibleToStudentAt: null })
      .select("_id studentId").limit(MAX_COHORT * 5).lean();
    if (!attempts.length) return 0;
    // Claimed one by one: an attempt the evaluator released (and announced) meanwhile is not announced again.
    const released = [];
    for (let index = 0; index < attempts.length; index += RELEASE_BATCH) {
      const chunk = attempts.slice(index, index + RELEASE_BATCH);
      const results = await Promise.all(chunk.map((row) => AnviAttempt.updateOne(
        { _id: row._id, status: "ready", visibleToStudentAt: null }, { $set: { visibleToStudentAt: at } },
      )));
      chunk.forEach((row, position) => { if (results[position].modifiedCount) released.push(row); });
    }
    await send("released", { assignment, recipients: released.map((row) => ({ studentId: row.studentId, attemptId: row._id })) });
    return released.length;
  }

  /**
   * Settles assigned attempts that ended while their schedule update failed (a DB error, a restart
   * between the two writes): the target is still in_progress although its last attempt is over.
   * onAttemptFinalized is idempotent, so a repeat changes nothing.
   */
  async function reconcileFinalized({ assignmentId = null, limit = 200 } = {}) {
    // In-progress targets are bounded by the interviews running right now, so the id list stays small.
    const targets = await AnviAssignmentTarget.find({ outcome: "in_progress", lastAttemptId: { $ne: null }, ...(assignmentId ? { assignmentId } : {}) })
      .select("lastAttemptId").limit(MAX_COHORT * 5).maxTimeMS(8000).lean();
    if (!targets.length) return 0;
    const ended = await AnviAttempt.find({ _id: { $in: targets.map((row) => row.lastAttemptId) }, status: { $in: [...ENDED] } })
      .select("_id").limit(limit).maxTimeMS(8000).lean();
    let settled = 0;
    for (const row of ended) {
      try {
        if (await onAttemptFinalized(row._id)) settled += 1;
      } catch (error) {
        log.warn?.(`[ANVI] Assigned attempt ${row._id} still not settled (${error?.name || "Error"}).`);
      }
    }
    return settled;
  }

  // Pending targets that already used an attempt (a scored partial one) cannot retry once the window
  // ends: their last attempt is their result.
  const settleRetries = (assignment) => AnviAssignmentTarget.updateMany(
    { assignmentId: assignment._id, status: "assigned", outcome: "pending", attemptsUsed: { $gt: 0 } },
    { $set: { outcome: "completed", partial: true } },
  );

  /** Close work, idempotent: seats close, unstarted bookings end, unattempted targets are missed, reports may release. */
  async function runCloseEffects(assignment, at = now()) {
    const policy = policyOf(assignment);
    await AnviSlot.updateMany({ assignmentId: assignment._id, status: "open" }, { $set: { status: "closed" } });
    // Attempts that ended without settling their target count before anyone is marked missed.
    await reconcileFinalized({ assignmentId: assignment._id }).catch((error) => log.warn?.(`[ANVI] Close could not settle ended attempts (${error?.name || "Error"}).`));
    await settleRetries(assignment);
    const open = await AnviBooking.find({ assignmentId: assignment._id, active: true, status: { $in: ["booked", "needs_reschedule"] }, attemptId: null }).lean();
    const noShows = [];
    for (const booking of open) {
      const late = booking.status === "booked" && ms(booking.startsAt) + policy.lateGraceMinutes * MINUTE < ms(at);
      if (late) {
        const marked = await AnviBooking.updateOne({ _id: booking._id, active: true, status: "booked", attemptId: null },
          { $set: { status: "no_show", active: false }, $push: historyPush({ action: "no_show", from: booking.startsAt, at, by: "system" }) });
        if (marked.modifiedCount) {
          await AnviAssignmentTarget.updateOne({ assignmentId: assignment._id, studentId: booking.studentId, status: "assigned", outcome: { $in: ["booked", "pending"] } }, { $set: { outcome: "no_show" } });
          noShows.push({ studentId: booking.studentId, booking });
        }
      } else {
        await cancelBookingRow(booking, { by: "system", reason: "assignment_closed", at, resetOutcome: false });
      }
    }
    const missed = await AnviAssignmentTarget.find({ assignmentId: assignment._id, status: "assigned", attemptsUsed: 0, outcome: { $in: ["pending", "booked"] } })
      .select("_id studentId").lean();
    if (missed.length) await AnviAssignmentTarget.updateMany({ _id: { $in: missed.map((row) => row._id) }, outcome: { $in: ["pending", "booked"] } }, { $set: { outcome: "missed" } });
    await send("missed", { assignment, recipients: [...noShows, ...missed.map((row) => ({ studentId: row.studentId }))] });
    if (assignment.reportVisibility === "after_close") await releaseReports(assignment, at);
    await AnviAssignment.updateOne({ _id: assignment._id, closeEffectsAt: null }, { $set: { closeEffectsAt: at } });
    return { noShows: noShows.length, missed: missed.length };
  }

  // `silent`: a draft that never reached students is cancelled without telling anyone.
  async function runCancelEffects(assignment, at = now(), { silent = false } = {}) {
    await AnviSlot.updateMany({ assignmentId: assignment._id, status: { $ne: "cancelled" } }, { $set: { status: "cancelled" } });
    const open = await AnviBooking.find({ assignmentId: assignment._id, active: true, attemptId: null }).lean();
    for (const booking of open) await cancelBookingRow(booking, { by: "admin", reason: "assignment_cancelled", at, resetOutcome: false });
    await reconcileFinalized({ assignmentId: assignment._id }).catch((error) => log.warn?.(`[ANVI] Cancel could not settle ended attempts (${error?.name || "Error"}).`));
    await settleRetries(assignment);
    const affected = await AnviAssignmentTarget.find({ assignmentId: assignment._id, status: "assigned", outcome: { $in: ["pending", "booked"] } }).select("_id studentId").lean();
    if (affected.length) await AnviAssignmentTarget.updateMany({ _id: { $in: affected.map((row) => row._id) } }, { $set: { outcome: "cancelled" } });
    if (!silent) await send("assignment_cancelled", { assignment, recipients: affected.map((row) => ({ studentId: row.studentId })) });
    if (assignment.reportVisibility === "after_close") await releaseReports(assignment, at);
    await AnviAssignment.updateOne({ _id: assignment._id, closeEffectsAt: null }, { $set: { closeEffectsAt: at } });
  }

  // Applies a changed window or slot policy to future slots and the bookings on them.
  async function reconcileSlots(assignment, slotTimes, at) {
    const future = await AnviSlot.find({ assignmentId: assignment._id, startsAt: { $gt: at } }).lean();
    const desired = new Map((slotTimes || []).map((slot) => [ms(slot.startsAt), slot]));
    const withdrawn = future.filter((slot) => slot.status !== "cancelled" && !desired.has(ms(slot.startsAt)));
    const slotMode = slotsMode(assignment);
    let needsReschedule = 0;
    let cancelled = 0;
    if (withdrawn.length) {
      const ids = withdrawn.map((slot) => slot._id);
      await AnviSlot.updateMany({ _id: { $in: ids } }, { $set: { status: "cancelled", bookedCount: 0 } });
      const affected = await AnviBooking.find({ slotId: { $in: ids }, active: true, status: "booked", attemptId: null }).lean();
      for (const booking of affected) {
        if (slotMode) {
          const moved = await AnviBooking.updateOne({ _id: booking._id, active: true, status: "booked", slotId: booking.slotId, attemptId: null },
            { $set: { status: "needs_reschedule", slotId: null }, $push: historyPush({ action: "slot_withdrawn", from: booking.startsAt, at, by: "admin" }) });
          if (!moved.modifiedCount) continue;
          needsReschedule += 1;
          await AnviAssignmentTarget.updateOne({ assignmentId: assignment._id, studentId: booking.studentId, status: "assigned", outcome: "booked" }, { $set: { outcome: "pending" } });
          await send("needs_reschedule", { assignment, recipients: [{ studentId: booking.studentId, booking }] });
        } else {
          // The seat counter was zeroed with the slot; only the booking row changes.
          const done = await cancelBookingRow({ ...booking, status: "booked", slotId: null }, { by: "admin", reason: "schedule_changed", at });
          if (!done) continue;
          cancelled += 1;
          await send("cancelled", { assignment, recipients: [{ studentId: booking.studentId, booking }], by: "admin" });
        }
      }
    }
    if (!slotMode) {
      // Without slots a withdrawn-slot booking has nothing left to choose; the window is enough.
      const waiting = await AnviBooking.find({ assignmentId: assignment._id, active: true, status: "needs_reschedule" }).lean();
      for (const booking of waiting) if (await cancelBookingRow(booking, { by: "admin", reason: "schedule_changed", at })) cancelled += 1;
    }
    if (slotTimes?.length) {
      const capacity = assignment.slotPolicy.capacityPerSlot;
      for (let index = 0; index < slotTimes.length; index += 500) {
        await AnviSlot.bulkWrite(slotTimes.slice(index, index + 500).map((slot) => ({
          updateOne: {
            filter: { assignmentId: assignment._id, startsAt: slot.startsAt },
            update: { $set: { endsAt: slot.endsAt, capacity, status: "open" }, $setOnInsert: { bookedCount: 0 } },
            upsert: true,
          },
        })), { ordered: false });
      }
      // A new slot length moves the end of bookings already on kept slots.
      for (const slot of future) {
        const next = desired.get(ms(slot.startsAt));
        if (next && ms(next.endsAt) !== ms(slot.endsAt) && slot.bookedCount > 0) {
          await AnviBooking.updateMany({ slotId: slot._id, active: true }, { $set: { endsAt: next.endsAt } });
        }
      }
    }
    return { needsReschedule, cancelled };
  }

  // ----- Admin -----

  // Removes a draft (an unfinished create) and its children; students never saw a draft.
  // The row goes first, and only while it is still a draft, so a create that finished meanwhile keeps its children.
  async function discardDraft(assignmentId) {
    const removed = await AnviAssignment.deleteOne({ _id: assignmentId, status: "draft" });
    if (!removed.deletedCount) return false;
    await Promise.all([
      AnviAssignmentTarget.deleteMany({ assignmentId }),
      AnviSlot.deleteMany({ assignmentId }),
    ]);
    return true;
  }

  async function createAssignment(admin, body = {}, { creationKey = null } = {}) {
    const at = now();
    const interviewId = objectId(body.interviewId, "interview");
    const key = typeof creationKey === "string" && creationKey.trim() ? creationKey.trim().slice(0, 200) : null;
    if (key) {
      const existing = await AnviAssignment.findOne({ ownerId: admin._id, creationKey: key }).select("-snapshotData").lean();
      if (existing) {
        if (existing.status !== "draft") return { assignment: assignmentView(existing), created: false, warnings: [] };
        // Still being created by another request, or left half-made by a process that died: never
        // report a draft as a finished schedule. An interrupted one is cleared and created again below.
        // createdAt is the database's wall clock, so it is compared with the wall clock (not the injected one).
        if (Date.now() - new Date(existing.createdAt || 0).getTime() < STALE_DRAFT_MS) {
          fail(409, "ASSIGNMENT_CREATING", "This schedule is still being created. Wait a moment, then try again.");
        }
        if (!(await discardDraft(existing._id))) {
          const finished = await AnviAssignment.findOne({ ownerId: admin._id, creationKey: key }).select("-snapshotData").lean();
          if (finished) return { assignment: assignmentView(finished), created: false, warnings: [] };
        }
      }
    }
    const interview = await AIInterview.findOne({ _id: interviewId, ownerId: admin._id })
      .select("title role lifecycle publishedAt publishedRevision publishedSnapshot").lean();
    if (!interview) fail(404, "INTERVIEW_NOT_FOUND", "Interview not found.");
    if (interview.lifecycle !== "draft" || !interview.publishedAt || !interview.publishedSnapshot?.data) {
      fail(409, "INTERVIEW_NOT_PUBLISHED", "Publish this interview before assigning it to students.");
    }
    const mode = enumOf(body.mode, MODES, "mock", "INVALID_MODE", "Mode");
    const window = normalizeWindow(body.window, at);
    const slotPolicy = normalizeSlotPolicy(body.slotPolicy);
    const bookingPolicy = normalizeBookingPolicy(body.bookingPolicy);
    const reportVisibility = enumOf(body.reportVisibility, VISIBILITY, "after_close", "INVALID_VISIBILITY", "Report visibility");
    const blockPractice = boolOf(body.blockPractice, true, "Block practice");
    const notes = notesOf(body.notes);
    const duplicates = duplicatePolicyOf(body.duplicates);
    const cohort = await resolveCohort(body.audience);
    // Running the wizard again for the same interview used to assign the same students a second time.
    const conflicts = await activeElsewhere(interviewId, cohort.studentIds, { at });
    if (conflicts.length && duplicates === "reject" && body.dryRun !== true) await failAlreadyAssigned(conflicts);
    if (conflicts.length && duplicates === "skip") {
      const taken = new Set(conflicts.map((row) => row.studentId));
      cohort.studentIds = cohort.studentIds.filter((studentId) => !taken.has(String(studentId)));
      if (!cohort.studentIds.length) await failAlreadyAssigned(conflicts);
    }
    const slotTimes = slotPolicy.mode === "slots" ? generateSlotTimes(window, slotPolicy, at) : [];
    if (slotPolicy.mode === "slots" && !slotTimes.length) fail(422, "NO_SLOTS", "No slots fit this window, weekdays and daily hours.");
    const studentCount = cohort.studentIds.length;
    const totalCapacity = slotTimes.length * (slotPolicy.capacityPerSlot || 0);
    const warnings = slotPolicy.mode === "slots" && totalCapacity < studentCount
      ? [{ code: "CAPACITY_BELOW_COHORT", message: `${totalCapacity} seats for ${studentCount} students.` }]
      : [];
    if (conflicts.length) {
      warnings.push(duplicates === "skip"
        ? { code: "ALREADY_ASSIGNED_SKIPPED", message: `${conflicts.length} student${conflicts.length === 1 ? " was" : "s were"} left out: already assigned this interview in another active schedule.` }
        : { code: "ALREADY_ASSIGNED", message: `${conflicts.length} student${conflicts.length === 1 ? " is" : "s are"} already assigned this interview in another active schedule.` });
    }
    const preview = {
      studentCount,
      slotCount: slotTimes.length,
      totalCapacity: slotPolicy.mode === "slots" ? totalCapacity : null,
      firstSlotAt: slotTimes[0]?.startsAt || null,
      lastSlotAt: slotTimes.at(-1)?.startsAt || null,
      alreadyAssigned: conflicts.length,
    };
    if (body.dryRun === true) return { preview, warnings };

    const data = interview.publishedSnapshot.data;
    let created;
    try {
      created = await AnviAssignment.create({
        ownerId: admin._id,
        ...(key ? { creationKey: key } : {}),
        interviewId,
        snapshotRevision: interview.publishedSnapshot.revision || interview.publishedRevision || 1,
        snapshotData: data,
        title: String(data.title || interview.title || "AI interview").slice(0, 200),
        role: data.role || interview.role || "",
        mode,
        audience: { source: cohort.source, filters: cohort.filters, studentCount },
        window,
        slotPolicy,
        bookingPolicy,
        reportVisibility,
        blockPractice,
        status: "draft",
        createdBy: admin._id,
        notes,
      });
    } catch (error) {
      if (error?.code === 11000 && key) {
        const existing = await AnviAssignment.findOne({ ownerId: admin._id, creationKey: key }).select("-snapshotData").lean();
        if (existing?.status === "draft") fail(409, "ASSIGNMENT_CREATING", "This schedule is still being created. Wait a moment, then try again.");
        if (existing) return { assignment: assignmentView(existing), created: false, warnings: [] };
      }
      throw error;
    }
    try {
      for (let index = 0; index < cohort.studentIds.length; index += 1000) {
        await AnviAssignmentTarget.insertMany(cohort.studentIds.slice(index, index + 1000).map((studentId) => ({
          assignmentId: created._id, studentId, source: cohort.source, status: "assigned", outcome: "pending",
        })), { ordered: false });
      }
      if (slotTimes.length) {
        await AnviSlot.insertMany(slotTimes.map((slot) => ({
          assignmentId: created._id, startsAt: slot.startsAt, endsAt: slot.endsAt, capacity: slotPolicy.capacityPerSlot, bookedCount: 0, status: "open",
        })), { ordered: false });
      }
    } catch (error) {
      // Nothing half-made stays behind: the draft row and its children go together.
      await discardDraft(created._id).catch(() => {});
      throw error;
    }
    const status = ms(window.opensAt) <= ms(at) ? "open" : "scheduled";
    const assignment = await AnviAssignment.findOneAndUpdate({ _id: created._id, status: "draft" }, { $set: { status }, $inc: { revision: 1 } }, { new: true })
      .select("-snapshotData").lean();
    // The pinned revision's static question audio, in the background.
    pregen({ interviewId: String(interviewId), revision: assignment.snapshotRevision });
    await send("assigned", { assignment, recipients: cohort.studentIds.map((studentId) => ({ studentId })) });
    await AnviAssignmentTarget.updateMany({ assignmentId: assignment._id, notifiedAt: null }, { $set: { notifiedAt: at } });
    return { assignment: assignmentView(assignment), created: true, warnings, preview };
  }

  async function updateAssignment(admin, id, patch = {}, revision) {
    const at = now();
    const current = await owned(admin, id);
    if (!EDITABLE.includes(current.status)) fail(409, "ASSIGNMENT_LOCKED", "A closed, cancelled or archived assignment cannot be edited.");
    const expected = Number(revision);
    if (!Number.isInteger(expected)) fail(400, "REVISION_REQUIRED", "Send the assignment revision you edited.");
    if (expected !== current.revision) fail(409, "REVISION_CONFLICT", "This assignment changed since you opened it. Reload and try again.", { revision: current.revision });
    if (patch.mode !== undefined && patch.mode !== current.mode) fail(400, "MODE_LOCKED", "The interview mode cannot change after scheduling.");
    const set = {};
    let windowValue = current.window;
    let slotPolicy = current.slotPolicy || { mode: "window" };
    let scheduleChanged = false;
    if (patch.window !== undefined) {
      windowValue = normalizeWindow(patch.window, at);
      set.window = windowValue;
      scheduleChanged = true;
    }
    if (patch.slotPolicy !== undefined) {
      slotPolicy = normalizeSlotPolicy(patch.slotPolicy);
      set.slotPolicy = slotPolicy;
      scheduleChanged = true;
    }
    if (patch.bookingPolicy !== undefined) set.bookingPolicy = normalizeBookingPolicy(patch.bookingPolicy, policyOf(current));
    if (patch.reportVisibility !== undefined) set.reportVisibility = enumOf(patch.reportVisibility, VISIBILITY, current.reportVisibility, "INVALID_VISIBILITY", "Report visibility");
    if (patch.blockPractice !== undefined) set.blockPractice = boolOf(patch.blockPractice, true, "Block practice");
    if (patch.notes !== undefined) set.notes = notesOf(patch.notes);
    if (patch.title !== undefined) {
      if (typeof patch.title !== "string" || !patch.title.trim() || patch.title.length > 200) fail(400, "INVALID_FIELD", "Title must be 1 to 200 characters.");
      set.title = patch.title.trim();
    }
    let slotTimes = null;
    if (scheduleChanged && slotPolicy.mode === "slots") {
      slotTimes = generateSlotTimes(windowValue, slotPolicy, at);
      if (!slotTimes.length) fail(422, "NO_SLOTS", "No future slots fit this window, weekdays and daily hours.");
    }
    if (set.window && ["scheduled", "open"].includes(current.status)) set.status = ms(windowValue.opensAt) <= ms(at) ? "open" : "scheduled";
    if (!Object.keys(set).length) return { assignment: assignmentView(current), affected: { needsReschedule: 0, cancelled: 0 } };
    const updated = await AnviAssignment.findOneAndUpdate(
      { _id: current._id, ownerId: admin._id, revision: expected, status: current.status },
      { $set: set, $inc: { revision: 1 } },
      { new: true },
    ).select("-snapshotData").lean();
    if (!updated) fail(409, "REVISION_CONFLICT", "This assignment changed since you opened it. Reload and try again.");
    const affected = scheduleChanged ? await reconcileSlots(updated, slotTimes, at) : { needsReschedule: 0, cancelled: 0 };
    // Switching to immediate releases the reports already scored, so early finishers are not left behind.
    const released = set.reportVisibility === "immediate" && current.reportVisibility !== "immediate" && current.status !== "draft"
      ? await releaseReports(updated, at)
      : 0;
    return { assignment: assignmentView(updated), affected, released };
  }

  const TRANSITIONS = {
    pause: { from: ["scheduled", "open"], to: () => "paused" },
    resume: { from: ["paused"], to: (row, at) => (ms(row.window.opensAt) <= ms(at) ? "open" : "scheduled") },
    close: { from: ACTIVE, to: () => "closed" },
    // A draft is a create that never finished; cancelling it is the only way to clear it.
    cancel: { from: ["draft", ...ACTIVE], to: () => "cancelled" },
    archive: { from: ["closed", "cancelled"], to: () => "archived" },
  };

  const PAST_TENSE = { pause: "paused", resume: "resumed", close: "closed", cancel: "cancelled", archive: "archived" };

  async function transitionAssignment(admin, id, action) {
    const at = now();
    const current = await owned(admin, id);
    if (action === "release") {
      // Reports of a cancelled or archived assignment can still be released (manual visibility).
      if (current.status === "draft") fail(409, "INVALID_TRANSITION", "Reports of this assignment cannot be released.");
      const updated = current.releasedAt ? current : await AnviAssignment.findOneAndUpdate(
        { _id: current._id, releasedAt: null }, { $set: { releasedAt: at } }, { new: true },
      ).select("-snapshotData").lean() || await owned(admin, id);
      const released = await releaseReports(updated, at);
      return { assignment: assignmentView(updated), released };
    }
    const rule = TRANSITIONS[action];
    if (!rule) fail(404, "ACTION_NOT_FOUND", "Action not found.");
    // Repeating a finished transition is harmless (a double click, a retried request).
    if (["pause", "close", "cancel", "archive"].includes(action) && current.status === rule.to(current, at)) return { assignment: assignmentView(current) };
    if (action === "resume" && ["scheduled", "open"].includes(current.status)) return { assignment: assignmentView(current) };
    if (!rule.from.includes(current.status)) fail(409, "INVALID_TRANSITION", `This assignment is ${current.status}; it cannot be ${PAST_TENSE[action]}.`);
    // Closing before the window opened would mark everyone missed although nobody could take it.
    if (action === "close" && ms(at) < ms(current.window.opensAt)) {
      fail(409, "NOT_YET_OPEN", "This interview has not opened yet, so students cannot have missed it. Cancel it instead.");
    }
    const status = rule.to(current, at);
    const extra = status === "closed" ? { closedAt: at } : status === "cancelled" ? { cancelledAt: at } : {};
    const updated = await AnviAssignment.findOneAndUpdate(
      { _id: current._id, ownerId: admin._id, status: current.status },
      { $set: { status, ...extra }, $inc: { revision: 1 } },
      { new: true },
    ).select("-snapshotData").lean();
    if (!updated) fail(409, "ASSIGNMENT_CHANGED", "This assignment changed meanwhile. Reload and try again.");
    if (status === "closed") await runCloseEffects(updated, at);
    if (status === "cancelled") await runCancelEffects(updated, at, { silent: current.status === "draft" });
    return { assignment: assignmentView(updated) };
  }

  async function outcomeCounts(assignmentIds) {
    const rows = await AnviAssignmentTarget.aggregate([
      { $match: { assignmentId: { $in: assignmentIds } } },
      { $group: { _id: { assignmentId: "$assignmentId", status: "$status", outcome: "$outcome" }, n: { $sum: 1 } } },
    ]);
    const byAssignment = new Map(assignmentIds.map((id) => [String(id), { outcomes: counts(), removed: 0 }]));
    for (const row of rows) {
      const entry = byAssignment.get(String(row._id.assignmentId));
      if (!entry) continue;
      if (row._id.status === "removed") entry.removed += row.n;
      else if (row._id.outcome in entry.outcomes) entry.outcomes[row._id.outcome] += row.n;
    }
    return byAssignment;
  }

  async function listAssignments(admin, query = {}) {
    const filter = { ownerId: admin._id };
    if (query.interviewId) filter.interviewId = objectId(query.interviewId, "interview");
    if (query.status) filter.status = enumOf(String(query.status), STATUSES, undefined, "INVALID_STATUS", "Status");
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const requested = Number.parseInt(query.limit, 10);
    const limit = LIST_LIMITS.includes(requested) ? requested : 25;
    const [total, rows] = await Promise.all([
      AnviAssignment.countDocuments(filter),
      AnviAssignment.find(filter).select("-snapshotData").sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).maxTimeMS(8000).lean(),
    ]);
    const tallies = await outcomeCounts(rows.map((row) => row._id));
    return {
      assignments: rows.map((row) => {
        const tally = tallies.get(String(row._id));
        return { ...assignmentView(row), kpis: kpisOf(tally.outcomes, tally.removed) };
      }),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async function rosterRows(assignment, targets) {
    const studentIds = targets.map((row) => row.studentId);
    const [users, bookings, attempts] = await Promise.all([
      User.find({ _id: { $in: studentIds } }).select("_id name email studentId").lean(),
      AnviBooking.find({ assignmentId: assignment._id, studentId: { $in: studentIds } }).sort({ createdAt: -1, _id: -1 }).lean(),
      AnviAttempt.find({ _id: { $in: targets.map((row) => row.lastAttemptId).filter(Boolean) } })
        .select("_id status partial startedAt endedAt overall.percent overall.score overall.max visibleToStudentAt").lean(),
    ]);
    const userById = new Map(users.map((row) => [String(row._id), row]));
    const bookingByStudent = new Map();
    for (const booking of bookings) {
      const key = String(booking.studentId);
      const known = bookingByStudent.get(key);
      if (!known || (booking.active && !known.active)) bookingByStudent.set(key, booking);
    }
    const attemptById = new Map(attempts.map((row) => [String(row._id), row]));
    return targets.map((target) => {
      const user = userById.get(String(target.studentId)) || {};
      const booking = bookingByStudent.get(String(target.studentId));
      const attempt = target.lastAttemptId ? attemptById.get(String(target.lastAttemptId)) : null;
      return {
        studentId: String(target.studentId),
        name: user.name || "",
        email: user.email || "",
        studentCode: user.studentId || "",
        status: target.status,
        outcome: target.outcome,
        partial: Boolean(target.partial),
        attemptsUsed: target.attemptsUsed || 0,
        booking: booking ? {
          id: String(booking._id), slotId: booking.slotId ? String(booking.slotId) : null, startsAt: booking.startsAt, endsAt: booking.endsAt,
          status: booking.status, active: Boolean(booking.active), rescheduleCount: booking.rescheduleCount || 0,
          cancelledBy: booking.cancelledBy || null,
        } : null,
        attempt: attempt ? {
          id: String(attempt._id), status: attempt.status, partial: Boolean(attempt.partial), startedAt: attempt.startedAt, endedAt: attempt.endedAt,
          percent: attempt.overall?.percent ?? null, visibleToStudentAt: attempt.visibleToStudentAt || null,
        } : null,
      };
    });
  }

  async function rosterFilter(assignment, query = {}) {
    const match = { assignmentId: assignment._id };
    match.status = query.status === "removed" ? "removed" : query.status === "all" ? { $in: ["assigned", "removed"] } : "assigned";
    if (query.outcome) match.outcome = enumOf(String(query.outcome), OUTCOMES, undefined, "INVALID_OUTCOME", "Outcome");
    const search = String(query.search || "").trim().slice(0, 120);
    if (search) {
      const all = await AnviAssignmentTarget.find({ assignmentId: assignment._id }).select("studentId").lean();
      const regex = new RegExp(escapeRegex(search), "i");
      const users = await User.find({ _id: { $in: all.map((row) => row.studentId) }, $or: [{ name: regex }, { email: regex }, { studentId: regex }] }).select("_id").lean();
      match.studentId = { $in: users.map((row) => row._id) };
    }
    return match;
  }

  async function getAssignmentDetail(admin, id, query = {}) {
    const assignment = await owned(admin, id);
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const limit = Math.min(200, Math.max(10, Number.parseInt(query.limit, 10) || 50));
    const match = await rosterFilter(assignment, query);
    const [tallies, total, targets, slotStats] = await Promise.all([
      outcomeCounts([assignment._id]),
      AnviAssignmentTarget.countDocuments(match),
      AnviAssignmentTarget.find(match).sort({ createdAt: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      AnviSlot.aggregate([
        { $match: { assignmentId: assignment._id, status: { $ne: "cancelled" } } },
        { $group: { _id: null, slots: { $sum: 1 }, capacity: { $sum: "$capacity" }, booked: { $sum: "$bookedCount" } } },
      ]),
    ]);
    const tally = tallies.get(String(assignment._id));
    return {
      assignment: assignmentView(assignment),
      kpis: kpisOf(tally.outcomes, tally.removed),
      slots: slotsMode(assignment) ? { count: slotStats[0]?.slots || 0, capacity: slotStats[0]?.capacity || 0, booked: slotStats[0]?.booked || 0 } : null,
      roster: await rosterRows(assignment, targets),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async function listAdminSlots(admin, id) {
    const assignment = await owned(admin, id);
    const slots = await AnviSlot.find({ assignmentId: assignment._id }).sort({ startsAt: 1 }).limit(MAX_SLOTS).lean();
    return {
      assignmentId: String(assignment._id),
      slots: slots.map((slot) => ({
        id: String(slot._id), startsAt: slot.startsAt, endsAt: slot.endsAt, capacity: slot.capacity, bookedCount: slot.bookedCount,
        seatsLeft: Math.max(0, slot.capacity - slot.bookedCount), status: slot.status,
      })),
    };
  }

  async function rosterCsv(admin, id) {
    const assignment = await owned(admin, id);
    const targets = await AnviAssignmentTarget.find({ assignmentId: assignment._id }).sort({ createdAt: 1, _id: 1 }).limit(MAX_COHORT * 2).lean();
    const rows = await rosterRows(assignment, targets);
    const header = ["Name", "Email", "Student ID", "Roster status", "Outcome", "Attempts used", "Slot (IST)", "Booking status", "Attempt status", "Score %"];
    const lines = [header, ...rows.map((row) => [
      row.name, row.email, row.studentCode, row.status, row.outcome, row.attemptsUsed,
      row.booking ? formatIst(row.booking.startsAt) : "", row.booking?.status || "", row.attempt?.status || "", row.attempt?.percent ?? "",
    ])].map((cells) => cells.map(csvCell).join(","));
    const slug = String(assignment.title || "assignment").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "assignment";
    return { filename: `${slug}-roster.csv`, content: `﻿${lines.join("\r\n")}\r\n` };
  }

  async function addTargets(admin, id, body = {}) {
    const at = now();
    const assignment = await owned(admin, id);
    if (!EDITABLE.includes(assignment.status)) fail(409, "ASSIGNMENT_LOCKED", "Students cannot be added to a closed, cancelled or archived assignment.");
    const ids = await eligibleStudentIds(body.studentIds);
    const duplicates = duplicatePolicyOf(body.duplicates);
    const source = TARGET_SOURCES.includes(body.source) ? body.source : "manual";
    const existing = await AnviAssignmentTarget.find({ assignmentId: assignment._id, studentId: { $in: ids } }).select("studentId status").lean();
    const known = new Map(existing.map((row) => [String(row.studentId), row]));
    // Students already on this schedule are never added again; a full list sent back is a no-op for them.
    let candidates = ids.filter((studentId) => known.get(String(studentId))?.status !== "assigned");
    const conflicts = await activeElsewhere(assignment.interviewId, candidates, { at, exceptId: assignment._id });
    if (conflicts.length && duplicates === "reject") await failAlreadyAssigned(conflicts);
    const taken = new Set(conflicts.map((row) => row.studentId));
    candidates = candidates.filter((studentId) => !taken.has(String(studentId)));
    const fresh = candidates.filter((studentId) => !known.has(String(studentId)));
    const revived = candidates.filter((studentId) => known.get(String(studentId))?.status === "removed");
    const assignedNow = await AnviAssignmentTarget.countDocuments({ assignmentId: assignment._id, status: "assigned" });
    if (assignedNow + fresh.length + revived.length > MAX_COHORT) fail(422, "COHORT_TOO_LARGE", `An assignment can include at most ${MAX_COHORT} students.`);
    const inserted = [];
    if (fresh.length) {
      // Idempotent upsert on (assignmentId, studentId), the unique key: a retried or parallel request adds nobody twice.
      let result;
      try {
        result = await AnviAssignmentTarget.bulkWrite(fresh.map((studentId) => ({
          updateOne: {
            filter: { assignmentId: assignment._id, studentId },
            update: { $setOnInsert: { source, status: "assigned", outcome: "pending", attemptsUsed: 0, partial: false, remindersSent: [] } },
            upsert: true,
          },
        })), { ordered: false });
      } catch (error) {
        // A parallel request inserted the same row first; the unique index keeps one.
        if (error?.code !== 11000 && !error?.writeErrors?.every((row) => row.code === 11000)) throw error;
        result = error.result;
      }
      const upserted = result?.upsertedIds || result?.result?.upsertedIds || {};
      for (const index of Object.keys(upserted)) inserted.push(fresh[Number(index)]);
    }
    if (revived.length) {
      await AnviAssignmentTarget.updateMany({ assignmentId: assignment._id, studentId: { $in: revived }, status: "removed", outcome: "cancelled" }, { $set: { outcome: "pending" } });
      await AnviAssignmentTarget.updateMany({ assignmentId: assignment._id, studentId: { $in: revived }, status: "removed" }, { $set: { status: "assigned", removedAt: null } });
    }
    const studentCount = await AnviAssignmentTarget.countDocuments({ assignmentId: assignment._id, status: "assigned" });
    const updated = await AnviAssignment.findOneAndUpdate({ _id: assignment._id }, { $set: { "audience.studentCount": studentCount } }, { new: true }).select("-snapshotData").lean();
    const added = [...inserted, ...revived];
    if (added.length && assignment.status !== "draft") {
      await send("assigned", { assignment: updated, recipients: added.map((studentId) => ({ studentId })) });
      await AnviAssignmentTarget.updateMany({ assignmentId: assignment._id, studentId: { $in: added } }, { $set: { notifiedAt: at } });
    }
    return {
      assignment: assignmentView(updated),
      added: added.length,
      addedIds: added.map(String),
      alreadyAssigned: ids.length - added.length - (duplicates === "skip" ? conflicts.length : 0),
      skipped: duplicates === "skip" ? conflicts.length : 0,
    };
  }

  // ----- Assigned students (one schedule, or every schedule of one interview) -----

  const lower = (value) => String(value ?? "").toLowerCase();
  const departmentOf = (user = {}) => [user.branch, user.course].filter((value) => String(value ?? "").trim()).join(" · ");

  /** Targets of `assignments` joined with the student, the latest booking and the last attempt. */
  async function targetRows(assignments, query = {}, { dedupeStudents = false } = {}) {
    const assignmentById = new Map(assignments.map((row) => [String(row._id), row]));
    const scope = { assignmentId: { $in: assignments.map((row) => row._id) } };
    const total = await AnviAssignmentTarget.countDocuments(scope);
    const targets = await AnviAssignmentTarget.find(scope)
      .select("assignmentId studentId status outcome source attemptsUsed lastAttemptId partial notifiedAt removedAt createdAt")
      .sort({ createdAt: 1, _id: 1 }).limit(MAX_TARGET_SCAN).maxTimeMS(8000).lean();
    const studentIds = [...new Set(targets.map((row) => String(row.studentId)))].map((value) => new mongoose.Types.ObjectId(value));
    const [users, bookings, attempts] = await Promise.all([
      User.find({ _id: { $in: studentIds } }).select("_id name email studentId branch course semester group college").maxTimeMS(8000).lean(),
      AnviBooking.find({ ...scope, studentId: { $in: studentIds } })
        .select("assignmentId studentId slotId startsAt endsAt status active rescheduleCount cancelledBy createdAt").sort({ createdAt: -1, _id: -1 }).maxTimeMS(8000).lean(),
      AnviAttempt.find({ _id: { $in: targets.map((row) => row.lastAttemptId).filter(Boolean) } })
        .select("_id status partial startedAt endedAt overall.percent visibleToStudentAt").maxTimeMS(8000).lean(),
    ]);
    const userById = new Map(users.map((row) => [String(row._id), row]));
    const bookingOf = new Map();
    for (const booking of bookings) {
      const key = `${booking.assignmentId}:${booking.studentId}`;
      const known = bookingOf.get(key);
      if (!known || (booking.active && !known.active)) bookingOf.set(key, booking);
    }
    const attemptById = new Map(attempts.map((row) => [String(row._id), row]));
    let rows = targets.map((target) => {
      const assignment = assignmentById.get(String(target.assignmentId)) || {};
      const user = userById.get(String(target.studentId)) || {};
      const booking = bookingOf.get(`${target.assignmentId}:${target.studentId}`);
      const attempt = target.lastAttemptId ? attemptById.get(String(target.lastAttemptId)) : null;
      return {
        id: `${target.assignmentId}:${target.studentId}`,
        assignmentId: String(target.assignmentId),
        schedule: { id: String(target.assignmentId), title: assignment.title || "", status: assignment.status || "", slotMode: slotsMode(assignment) ? "slots" : "window" },
        studentId: String(target.studentId),
        student: {
          name: user.name || "", email: user.email || "", studentCode: user.studentId || "",
          branch: user.branch || "", course: user.course || "", semester: user.semester ?? null, group: user.group || "", college: user.college || "",
        },
        status: target.status,
        outcome: target.outcome,
        partial: Boolean(target.partial),
        source: target.source || "selected",
        attemptsUsed: target.attemptsUsed || 0,
        attemptsAllowed: policyOf(assignment).attemptsAllowed,
        assignedAt: target.createdAt || null,
        notifiedAt: target.notifiedAt || null,
        removedAt: target.removedAt || null,
        booking: booking ? {
          id: String(booking._id), slotId: booking.slotId ? String(booking.slotId) : null, startsAt: booking.startsAt, endsAt: booking.endsAt,
          status: booking.status, active: Boolean(booking.active), rescheduleCount: booking.rescheduleCount || 0, cancelledBy: booking.cancelledBy || null,
        } : null,
        attempt: attempt ? {
          id: String(attempt._id), status: attempt.status, partial: Boolean(attempt.partial), startedAt: attempt.startedAt || null, endedAt: attempt.endedAt || null,
          percent: attempt.overall?.percent ?? null, reportReady: attempt.status === "ready",
        } : null,
      };
    });

    if (dedupeStudents) {
      const statusRank = (row) => (row.status === "assigned" ? 2 : 0) + (row.attempt ? 4 : 0) + (row.outcome === "completed" ? 2 : 0);
      const timeOf = (row) => ms(row.attempt?.endedAt || row.attempt?.startedAt || row.assignedAt || 0);
      const byStudent = new Map();
      for (const row of rows) {
        const known = byStudent.get(row.studentId);
        if (!known || statusRank(row) > statusRank(known) || (statusRank(row) === statusRank(known) && timeOf(row) > timeOf(known))) byStudent.set(row.studentId, row);
      }
      rows = [...byStudent.values()];
    }

    const search = lower(String(query.search || "").trim().slice(0, 120));
    const matched = search
      ? rows.filter((row) => [row.student.name, row.student.email, row.student.studentCode].some((value) => lower(value).includes(search)))
      : rows;
    const tally = { all: 0, removed: 0, ...counts() };
    for (const row of matched) {
      if (row.status === "removed") tally.removed += 1;
      else { tally.all += 1; tally[row.outcome] = (tally[row.outcome] || 0) + 1; }
    }
    const status = enumOf(String(query.status ?? ""), TARGET_STATUS_FILTERS, "", "INVALID_STATUS", "Status");
    const filtered = matched.filter((row) => (status === "all" ? true
      : status === "removed" ? row.status === "removed"
        : row.status === "assigned" && (!status || row.outcome === status)));
    const sort = TARGET_SORTS.includes(query.sort) ? query.sort : "name";
    const direction = query.order === "desc" ? -1 : 1;
    const keyOf = {
      name: (row) => lower(row.student.name),
      studentCode: (row) => lower(row.student.studentCode),
      email: (row) => lower(row.student.email),
      department: (row) => lower(departmentOf(row.student)),
      schedule: (row) => lower(row.schedule.title),
      slot: (row) => (row.booking?.startsAt ? ms(row.booking.startsAt) : Number.POSITIVE_INFINITY),
      status: (row) => (row.status === "removed" ? OUTCOMES.length : OUTCOMES.indexOf(row.outcome)),
      attempt: (row) => lower(row.attempt?.status || ""),
      score: (row) => (row.attempt?.percent ?? -1),
      assignedAt: (row) => ms(row.assignedAt || 0),
    }[sort];
    filtered.sort((a, b) => {
      const x = keyOf(a), y = keyOf(b);
      if (x < y) return -direction;
      if (x > y) return direction;
      return lower(a.student.name) < lower(b.student.name) ? -1 : lower(a.student.name) > lower(b.student.name) ? 1 : (a.id < b.id ? -1 : 1);
    });
    const requested = Number.parseInt(query.limit, 10);
    const limit = Number.isInteger(requested) ? Math.min(MAX_COHORT, Math.max(1, requested)) : 25;
    const pages = Math.max(1, Math.ceil(filtered.length / limit));
    const page = Math.min(pages, Math.max(1, Number.parseInt(query.page, 10) || 1));
    return {
      rows: filtered.slice((page - 1) * limit, page * limit),
      counts: tally,
      pagination: { page, limit, total: filtered.length, pages },
      sort: { key: sort, order: direction === 1 ? "asc" : "desc" },
      truncated: total > targets.length,
    };
  }

  const scheduleSummary = (row) => ({ id: String(row._id), title: row.title, status: row.status, window: row.window, slotMode: slotsMode(row) ? "slots" : "window" });

  /** GET /schedules/:id/targets: one schedule's students with their booking and attempt. */
  async function listTargets(admin, id, query = {}) {
    const assignment = await owned(admin, id);
    const result = await targetRows([assignment], query);
    return { assignment: assignmentView(assignment), schedules: [scheduleSummary(assignment)], ...result };
  }

  /** GET /schedules/by-interview/:interviewId/targets: students across every schedule of one interview. */
  async function listInterviewTargets(admin, interviewIdValue, query = {}) {
    const interviewId = objectId(interviewIdValue, "interview");
    const interview = await AIInterview.findOne({ _id: interviewId, ownerId: admin._id }).select("_id title role companyName").lean();
    if (!interview) fail(404, "INTERVIEW_NOT_FOUND", "Interview not found.");
    // Drafts are creates that never finished; nobody was told about them.
    const schedules = await AnviAssignment.find({ interviewId, ownerId: admin._id, status: { $ne: "draft" } })
      .select("-snapshotData").sort({ createdAt: -1, _id: -1 }).limit(200).maxTimeMS(8000).lean();
    let scope = schedules;
    if (query.assignmentId) {
      const wanted = String(objectId(query.assignmentId, "schedule"));
      scope = schedules.filter((row) => String(row._id) === wanted);
      if (!scope.length) fail(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
    }
    const result = scope.length ? await targetRows(scope, query, { dedupeStudents: !query.assignmentId })
      : { rows: [], counts: { all: 0, removed: 0, ...counts() }, pagination: { page: 1, limit: 25, total: 0, pages: 1 }, sort: { key: "name", order: "asc" }, truncated: false };
    return {
      interview: { id: String(interview._id), title: interview.title || "", role: interview.role || "", companyName: interview.companyName || "" },
      schedules: schedules.map(scheduleSummary),
      ...result,
    };
  }

  /** Sends the assigned students of an active schedule a reminder of their interview (in-app and email). */
  async function notifyTargets(admin, id, studentIds = []) {
    const at = now();
    const assignment = await owned(admin, id);
    if (!ACTIVE.includes(effectiveStatus(assignment, at))) fail(409, "ASSIGNMENT_CLOSED", "Reminders can only be sent while the schedule is active.");
    if (!Array.isArray(studentIds) || !studentIds.length) fail(400, "INVALID_STUDENTS", "Choose the students to remind.");
    if (studentIds.length > MAX_COHORT) fail(422, "COHORT_TOO_LARGE", `Remind at most ${MAX_COHORT} students at once.`);
    const ids = [...new Set(studentIds.map((value) => String(value).toLowerCase()))].map((value) => objectId(value, "student"));
    // Only students who still have something to do: not booked yet, or booked and not started.
    const targets = await AnviAssignmentTarget.find({ assignmentId: assignment._id, studentId: { $in: ids }, status: "assigned", outcome: { $in: ["pending", "booked"] } })
      .select("_id studentId notifiedAt").lean();
    const due = targets.filter((row) => !row.notifiedAt || ms(row.notifiedAt) <= ms(at) - INVITE_COOLDOWN_MS);
    if (due.length) {
      const bookings = await AnviBooking.find({ assignmentId: assignment._id, studentId: { $in: due.map((row) => row.studentId) }, active: true, status: "booked" }).lean();
      const bookingOf = new Map(bookings.map((row) => [String(row.studentId), row]));
      const sequence = new Date(at).toISOString();
      await send("invite_reminder", { assignment, recipients: due.map((row) => ({ studentId: row.studentId, booking: bookingOf.get(String(row.studentId)) || null, sequence })) });
      await AnviAssignmentTarget.updateMany({ _id: { $in: due.map((row) => row._id) } },
        { $set: { notifiedAt: at }, $push: { remindersSent: { $each: [`invite:${sequence}`], $slice: -20 } } });
    }
    return { sent: due.length, recentlyNotified: targets.length - due.length, notEligible: ids.length - targets.length };
  }

  // The in-progress attempts of these students on this assignment (what endInProgress needs).
  const runningAttempts = (assignmentId, studentIds) => AnviAttempt.find({ assignmentId, studentId: { $in: studentIds }, status: "in_progress" })
    .select("_id studentId interviewId assignmentId bookingId hardDeadline").lean();

  /** `endInProgress: true` first ends a running interview of these students (kept and scored as partial). */
  async function removeTargets(admin, id, studentIds = [], { endInProgress: endRunning = false } = {}) {
    const at = now();
    const assignment = await owned(admin, id);
    if (!Array.isArray(studentIds) || !studentIds.length) fail(400, "INVALID_STUDENTS", "Choose the students to remove.");
    const ids = [...new Set(studentIds.map(String))].map((value) => objectId(value, "student"));
    const targets = await AnviAssignmentTarget.find({ assignmentId: assignment._id, studentId: { $in: ids }, status: "assigned" }).select("_id studentId").lean();
    if (!targets.length) fail(404, "TARGET_NOT_FOUND", "These students are not on this assignment.");
    const removedIds = targets.map((row) => row.studentId);
    if (endRunning) {
      for (const attempt of await runningAttempts(assignment._id, removedIds)) await endInProgress(attempt, { endReason: "removed_by_admin", at });
    }
    await AnviAssignmentTarget.updateMany({ _id: { $in: targets.map((row) => row._id) }, outcome: { $in: ["pending", "booked"] } }, { $set: { outcome: "cancelled" } });
    await AnviAssignmentTarget.updateMany({ _id: { $in: targets.map((row) => row._id) } }, { $set: { status: "removed", removedAt: at } });
    // Removal cancels the student's future booking; an interview already under way is left alone.
    const bookings = await AnviBooking.find({ assignmentId: assignment._id, studentId: { $in: removedIds }, active: true, attemptId: null }).lean();
    for (const booking of bookings) {
      if (await cancelBookingRow(booking, { by: "admin", reason: "removed", at, resetOutcome: false })) {
        await send("cancelled", { assignment, recipients: [{ studentId: booking.studentId, booking }], by: "admin" });
      }
    }
    const studentCount = await AnviAssignmentTarget.countDocuments({ assignmentId: assignment._id, status: "assigned" });
    const updated = await AnviAssignment.findOneAndUpdate({ _id: assignment._id }, { $set: { "audience.studentCount": studentCount } }, { new: true }).select("-snapshotData").lean();
    return { assignment: assignmentView(updated), removed: targets.length };
  }

  /**
   * Clears a finished scheduled attempt so the same target can take this interview again. An interview still
   * in progress is refused unless `endInProgress` is true: it is then stopped first (no evaluation) and cleared.
   */
  async function resetTarget(admin, id, studentIdValue, { endInProgress: endRunning = false } = {}) {
    const at = now();
    const assignment = await owned(admin, id);
    if (!ACTIVE.includes(effectiveStatus(assignment, at))) fail(409, "ASSIGNMENT_CLOSED", "Only an active schedule can be reset for another attempt.");
    const studentId = objectId(studentIdValue, "student");
    const target = await AnviAssignmentTarget.findOne({ assignmentId: assignment._id, studentId, status: "assigned" }).lean();
    if (!target) fail(404, "TARGET_NOT_FOUND", "This student is not on the schedule.");
    const running = await runningAttempts(assignment._id, [studentId]);
    if (running.length && !endRunning) fail(409, "ATTEMPT_IN_PROGRESS", "An interview in progress cannot be reset.");
    for (const attempt of running) await endInProgress(attempt, { endReason: "reset_by_admin", at, evaluate: false });
    const attempts = await AnviAttempt.find({ assignmentId: assignment._id, studentId }).select("_id status").lean();
    if (attempts.some((row) => row.status === "in_progress")) fail(409, "ATTEMPT_IN_PROGRESS", "The interview in progress could not be stopped. Try again.");
    if (!attempts.length && !target.lastAttemptId) fail(409, "ATTEMPT_NOT_FOUND", "This student has no completed interview to reset.");
    const attemptIds = attempts.map((row) => row._id);
    if (attemptIds.length) {
      await AnviLiveSession.deleteMany({ attemptId: { $in: attemptIds } });
      await AnviAttempt.deleteMany({ _id: { $in: attemptIds }, status: { $ne: "in_progress" } });
      await AnviBooking.updateMany({ assignmentId: assignment._id, studentId, attemptId: { $in: attemptIds } }, { $set: { attemptId: null } });
    }
    await AnviResumeContext.deleteOne({ studentId, interviewId: assignment.interviewId, assignmentId: assignment._id });
    const updated = await AnviAssignmentTarget.findOneAndUpdate(
      { _id: target._id, status: "assigned" },
      { $set: { attemptsUsed: 0, lastAttemptId: null, outcome: "pending", partial: false } },
      { new: true },
    ).lean();
    return { reset: attempts.length, studentId: String(studentId), target: { outcome: updated?.outcome || "pending", attemptsUsed: updated?.attemptsUsed || 0 } };
  }

  async function ownedBooking(admin, bookingId) {
    const booking = await AnviBooking.findOne({ _id: objectId(bookingId, "booking") }).lean();
    if (!booking) fail(404, "BOOKING_NOT_FOUND", "Booking not found.");
    const assignment = await AnviAssignment.findOne({ _id: booking.assignmentId, ownerId: admin._id }).select("-snapshotData").lean();
    if (!assignment) fail(404, "BOOKING_NOT_FOUND", "Booking not found.");
    return { booking, assignment };
  }

  const ownBookings = (assignmentId, studentId) => AnviBooking.find({ assignmentId, studentId })
    .select("_id status cancelledBy rescheduleCount freeReschedules").limit(200).lean();

  /**
   * After a seat was claimed and the booking written: the assignment may have closed or been cancelled,
   * the student removed, or the slot withdrawn by an edit in between (each of those scanned bookings
   * before this one existed). The booking is then undone here, so no seat or stale booking survives.
   * Returns null when the booking stands, else the refusal to report.
   */
  async function settleIfWithdrawn(assignment, booking, at) {
    const [current, target, slot] = await Promise.all([
      AnviAssignment.findById(assignment._id).select("status window").lean(),
      AnviAssignmentTarget.findOne({ assignmentId: assignment._id, studentId: booking.studentId, status: "assigned" }).select("_id").lean(),
      booking.slotId ? AnviSlot.findById(booking.slotId).select("status").lean() : null,
    ]);
    // A pause is temporary and its own close still runs later, so only a closed or cancelled assignment undoes it.
    const live = Boolean(current) && ACTIVE.includes(effectiveStatus(current, at));
    if (live && target && (!booking.slotId || slot?.status === "open")) return null;
    if (live && target) {
      // Only the slot went away (a schedule edit): the student picks another one, without using a change.
      const moved = await AnviBooking.updateOne({ _id: booking._id, active: true, status: "booked", slotId: booking.slotId, attemptId: null },
        { $set: { status: "needs_reschedule", slotId: null }, $push: historyPush({ action: "slot_withdrawn", from: booking.startsAt, at, by: "admin" }) });
      if (moved.modifiedCount) {
        await releaseSlot(booking.slotId);
        await AnviAssignmentTarget.updateOne({ assignmentId: assignment._id, studentId: booking.studentId, status: "assigned", outcome: "booked" }, { $set: { outcome: "pending" } });
      }
      return { status: 409, code: "SLOT_WITHDRAWN", message: "This slot was just withdrawn by your institution. Choose another one." };
    }
    await cancelBookingRow(booking, { by: "system", reason: target ? "assignment_closed" : "removed", at, resetOutcome: Boolean(target) });
    if (!target) return { status: 404, code: "ASSIGNMENT_NOT_FOUND", message: "This interview assignment was not found." };
    return { status: 409, code: "ASSIGNMENT_CLOSED", message: "This interview is no longer open for booking." };
  }

  // Book-new, then release-old; if the new seat cannot be claimed nothing changes.
  async function moveBooking({ assignment, booking, slotId, at, by }) {
    const policy = policyOf(assignment);
    const free = by === "admin" || booking.status === "needs_reschedule";
    if (!free) {
      const prior = priorChanges(await ownBookings(assignment._id, booking.studentId), booking._id);
      if (paidChanges(booking) + prior >= policy.rescheduleLimit) {
        fail(409, "RESCHEDULE_LIMIT", `You can reschedule at most ${policy.rescheduleLimit} times.`);
      }
      if (ms(booking.startsAt) - policy.cutoffMinutes * MINUTE <= ms(at)) {
        fail(409, "BOOKING_CUTOFF", `Bookings cannot change within ${policy.cutoffMinutes} minutes of the slot.`);
      }
    }
    if (booking.slotId && sameId(booking.slotId, slotId) && booking.status === "booked") fail(409, "SAME_SLOT", "You are already booked on this slot.");
    const slot = await claimSlot(assignment, slotId, at, by === "admin" ? 0 : policy.cutoffMinutes);
    let updated;
    try {
      updated = await AnviBooking.findOneAndUpdate(
        { _id: booking._id, status: booking.status, active: booking.active, slotId: booking.slotId, rescheduleCount: booking.rescheduleCount || 0, attemptId: null },
        {
          $set: { slotId: slot._id, startsAt: slot.startsAt, endsAt: slot.endsAt, status: "booked", active: true, remindersSent: [] },
          $inc: { rescheduleCount: 1, ...(free ? { freeReschedules: 1 } : {}) },
          $push: historyPush({ action: "rescheduled", from: booking.startsAt, to: slot.startsAt, at, by }),
        },
        { new: true },
      ).lean();
    } catch (error) {
      await releaseSlot(slot._id);
      if (error?.code === 11000) fail(409, "ALREADY_BOOKED", "This student already has another booking.");
      throw error;
    }
    if (!updated) {
      await releaseSlot(slot._id);
      fail(409, "BOOKING_CHANGED", "This booking changed meanwhile. Reload and try again.");
    }
    if (booking.status === "booked" && booking.slotId) await releaseSlot(booking.slotId);
    await AnviAssignmentTarget.updateOne({ assignmentId: assignment._id, studentId: booking.studentId, status: "assigned", outcome: { $in: ["pending", "no_show"] } }, { $set: { outcome: "booked" } });
    const refused = await settleIfWithdrawn(assignment, updated, at);
    if (refused) fail(refused.status, refused.code, refused.message);
    await send("rescheduled", { assignment, recipients: [{ studentId: booking.studentId, booking: updated }], by });
    return updated;
  }

  async function adminMoveBooking(admin, bookingId, slotIdValue) {
    const at = now();
    const { booking, assignment } = await ownedBooking(admin, bookingId);
    if (!ACTIVE.includes(assignment.status) || effectiveStatus(assignment, at) === "closed") fail(409, "ASSIGNMENT_CLOSED", "Bookings of this assignment can no longer change.");
    if (!slotsMode(assignment)) fail(409, "SLOTS_NOT_USED", "This assignment has no slots.");
    if (booking.attemptId) fail(409, "BOOKING_STARTED", "This student already started the interview.");
    // A no-show, or a student who used up their changes by cancelling, can only be rebooked by the admin.
    const rebookable = booking.status === "no_show" || (booking.status === "cancelled" && booking.cancelledBy === "student");
    if (!["booked", "needs_reschedule"].includes(booking.status) && !rebookable) fail(409, "BOOKING_NOT_ACTIVE", "This booking is no longer active.");
    const target = await AnviAssignmentTarget.findOne({ assignmentId: assignment._id, studentId: booking.studentId, status: "assigned" }).lean();
    if (!target) fail(409, "TARGET_REMOVED", "This student is no longer on the assignment.");
    const slotId = objectId(slotIdValue, "slot");
    const updated = await moveBooking({ assignment, booking, slotId, at, by: "admin" });
    return { booking: bookingView(updated, assignment, at) };
  }

  async function adminCancelBooking(admin, bookingId, body = {}) {
    const at = now();
    const { booking, assignment } = await ownedBooking(admin, bookingId);
    if (!booking.active) fail(409, "BOOKING_NOT_ACTIVE", "This booking is no longer active.");
    if (booking.attemptId) fail(409, "BOOKING_STARTED", "This student already started the interview.");
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 200) : "cancelled_by_admin";
    const cancelled = await cancelBookingRow(booking, { by: "admin", reason, at });
    if (!cancelled) fail(409, "BOOKING_CHANGED", "This booking changed meanwhile. Reload and try again.");
    await send("cancelled", { assignment, recipients: [{ studentId: booking.studentId, booking }], by: "admin" });
    return { booking: bookingView(cancelled, assignment, at) };
  }

  // ----- Student -----

  async function studentContext(student, assignmentId, { withSnapshot = false } = {}) {
    const id = objectId(assignmentId, "assignment");
    const query = AnviAssignment.findOne({ _id: id, status: { $ne: "draft" } });
    const [assignment, target] = await Promise.all([
      (withSnapshot ? query : query.select("-snapshotData")).lean(),
      AnviAssignmentTarget.findOne({ assignmentId: id, studentId: student._id, status: "assigned" }).lean(),
    ]);
    if (!assignment || !target) fail(404, "ASSIGNMENT_NOT_FOUND", "This interview assignment was not found.");
    return { assignment, target };
  }

  function assertBookable(assignment, at) {
    const status = effectiveStatus(assignment, at);
    if (status === "paused") fail(409, "ASSIGNMENT_PAUSED", "Booking is paused by your institution. Try again later.");
    if (!["scheduled", "open"].includes(status)) fail(409, "ASSIGNMENT_CLOSED", "This interview is no longer open for booking.");
    if (!slotsMode(assignment)) fail(409, "SLOTS_NOT_USED", "This interview has no slots; start it any time inside its window.");
  }

  async function listStudentAssignments(student) {
    const at = now();
    const targets = await AnviAssignmentTarget.find({ studentId: student._id, status: "assigned" }).sort({ createdAt: -1 }).limit(100).maxTimeMS(8000).lean();
    if (!targets.length) return [];
    const assignmentIds = targets.map((row) => row.assignmentId);
    const recent = new Date(ms(at) - CLOSED_VISIBLE_DAYS * DAY);
    const visibleAssignments = { _id: { $in: assignmentIds }, $or: [{ status: { $in: ACTIVE } }, { status: "closed", "window.closesAt": { $gte: recent } }] };
    const [assignments, bookings, attempts, questionKinds, resumes] = await Promise.all([
      AnviAssignment.find(visibleAssignments).select("-snapshotData").lean(),
      AnviBooking.find({ studentId: student._id, assignmentId: { $in: assignmentIds } }).sort({ createdAt: -1, _id: -1 }).lean(),
      AnviAttempt.find({ studentId: student._id, assignmentId: { $in: assignmentIds } })
        .select("_id assignmentId status hardDeadline visibleToStudentAt partial").sort({ startedAt: -1 }).lean(),
      // Only what the start asks of the student from the pinned snapshot: resume questions and settings, the terms
      // and the interview language.
      AnviAssignment.find(visibleAssignments).select({
        "snapshotData.sections.groups.questions.kind": 1, "snapshotData.rules.resume": 1, "snapshotData.rules.language": 1,
        "snapshotData.anvi.resume": 1, "snapshotData.anvi.conduct": 1, "snapshotData.anvi.language": 1, "snapshotData.anvi.proctoring": 1,
      }).lean(),
      AnviResumeContext.find({ studentId: student._id, assignmentId: { $in: assignmentIds }, expiresAt: { $gt: at } }).select("assignmentId source createdAt").lean(),
    ]);
    // Scheduling pins questions and runtime rules, but student-facing identity stays current. An admin
    // can correct the interview name, role, company or duration without recreating the schedule.
    const definitions = assignments.length ? await AIInterview.find({ _id: { $in: assignments.map((row) => row.interviewId) } })
      .select("title role companyName revision data.anvi.durationMinutes updatedAt").maxTimeMS(8000).lean() : [];
    const definitionById = new Map(definitions.map((row) => [String(row._id), row]));
    const resumeNeeded = new Map(questionKinds.map((row) => [String(row._id), (row.snapshotData?.sections || [])
      .some((section) => (section.groups || []).some((group) => (group.questions || []).some((question) => question.kind === "resume")))]));
    const startNeeds = new Map(questionKinds.map((row) => [String(row._id), row.snapshotData || {}]));
    const resumeByAssignment = new Map(resumes.map((row) => [String(row.assignmentId), row]));
    const targetByAssignment = new Map(targets.map((row) => [String(row.assignmentId), row]));
    const items = assignments.map((assignment) => {
      const key = String(assignment._id);
      const target = targetByAssignment.get(key);
      const own = bookings.filter((row) => String(row.assignmentId) === key);
      const booking = own.find((row) => row.active) || own.find((row) => ["completed", "no_show"].includes(row.status)) || null;
      const ownAttempts = attempts.filter((row) => String(row.assignmentId) === key);
      const activeAttempt = ownAttempts.find((row) => row.status === "in_progress") || null;
      const lastAttempt = target.lastAttemptId ? ownAttempts.find((row) => sameId(row._id, target.lastAttemptId)) : ownAttempts[0];
      const verdict = evaluateStart({ assignment, target, booking: booking?.active ? booking : null, activeAttempt, at });
      const status = effectiveStatus(assignment, at);
      const languageSetup = languageSetupOf(startNeeds.get(key));
      const definition = definitionById.get(String(assignment.interviewId));
      const definitionChangedAfterScheduling = definition?.updatedAt
        && ms(definition.updatedAt) > ms(assignment.createdAt)
        && Number(definition.revision) > Number(assignment.snapshotRevision);
      const currentDuration = Number(definition?.data?.anvi?.durationMinutes);
      return {
        assignmentId: key,
        interviewId: String(assignment.interviewId),
        title: definitionChangedAfterScheduling && definition.title ? definition.title : assignment.title,
        role: definitionChangedAfterScheduling && typeof definition.role === "string" ? definition.role : assignment.role || "",
        companyName: definitionChangedAfterScheduling && typeof definition.companyName === "string" ? definition.companyName : startNeeds.get(key)?.companyName || "",
        estimatedMinutes: definitionChangedAfterScheduling && currentDuration > 0 ? currentDuration : Number(startNeeds.get(key)?.anvi?.durationMinutes) || 0,
        definitionUpdatedAt: definition?.updatedAt || null,
        mode: assignment.mode,
        status,
        window: { opensAt: assignment.window.opensAt, closesAt: assignment.window.closesAt },
        timezone: assignment.timezone || "Asia/Kolkata",
        slotMode: slotsMode(assignment) ? "slots" : "window",
        policy: policyOf(assignment),
        // The start asks for resume consent when the pinned snapshot has resume questions.
        requiresResume: Boolean(resumeNeeded.get(key)),
        // The booking step or lobby shows the resume step (mode, sources, already provided) and the terms.
        // (`resume` below is whether an attempt can be rejoined.)
        resumeSetup: resumeSetupOf(startNeeds.get(key), resumeByAssignment.get(key)),
        terms: termsOf(startNeeds.get(key)),
        // The proctoring step before the start, from the pinned snapshot.
        proctoring: proctoringSetupOf(startNeeds.get(key)),
        // "Interview language: English only", or the languages the student may pick before starting.
        language: languageSetup.primary,
        languageSetup,
        booking: bookingView(booking, assignment, at, priorChanges(own, booking?._id)),
        joinWindow: joinWindowFor(assignment, booking?.active ? booking : null),
        canStart: verdict.ok,
        startBlockedReason: verdict.ok ? null : verdict.code,
        startBlockedMessage: verdict.ok ? null : verdict.message,
        resume: verdict.code === "RESUME",
        outcome: target.outcome,
        attemptsUsed: target.attemptsUsed || 0,
        attemptId: activeAttempt ? String(activeAttempt._id) : lastAttempt ? String(lastAttempt._id) : null,
        attemptStatus: activeAttempt?.status || lastAttempt?.status || null,
        reportVisible: Boolean(lastAttempt && lastAttempt.status === "ready" && lastAttempt.visibleToStudentAt && ms(lastAttempt.visibleToStudentAt) <= ms(at)),
      };
    });
    const rank = (item) => (item.status === "closed" ? 1 : 0);
    const when = (item) => ms(item.booking?.startsAt || item.window.closesAt);
    return items.sort((a, b) => rank(a) - rank(b) || when(a) - when(b));
  }

  async function listOpenSlots(student, assignmentId) {
    const at = now();
    const { assignment } = await studentContext(student, assignmentId);
    if (!slotsMode(assignment)) fail(409, "SLOTS_NOT_USED", "This interview has no slots; start it any time inside its window.");
    const policy = policyOf(assignment);
    const status = effectiveStatus(assignment, at);
    const open = ["scheduled", "open"].includes(status);
    const cutoff = ms(at) + policy.cutoffMinutes * MINUTE;
    const [slots, own] = await Promise.all([
      AnviSlot.find({ assignmentId: assignment._id, status: "open", startsAt: { $gt: at } }).sort({ startsAt: 1 }).limit(MAX_SLOTS).lean(),
      AnviBooking.find({ assignmentId: assignment._id, studentId: student._id }).limit(200).lean(),
    ]);
    const booking = own.find((row) => row.active) || null;
    return {
      assignmentId: String(assignment._id),
      status,
      timezone: assignment.timezone || "Asia/Kolkata",
      policy,
      booking: bookingView(booking, assignment, at, priorChanges(own, booking?._id)),
      slots: slots.map((slot) => {
        const seatsLeft = Math.max(0, slot.capacity - slot.bookedCount);
        return {
          id: String(slot._id), startsAt: slot.startsAt, endsAt: slot.endsAt, capacity: slot.capacity, seatsLeft,
          bookable: open && seatsLeft > 0 && ms(slot.startsAt) > cutoff && !sameId(slot._id, booking?.slotId),
        };
      }),
    };
  }

  async function bookSlot(student, assignmentId, slotIdValue) {
    const at = now();
    const { assignment, target } = await studentContext(student, assignmentId);
    assertBookable(assignment, at);
    const policy = policyOf(assignment);
    if ((target.attemptsUsed || 0) >= policy.attemptsAllowed) fail(409, "ATTEMPTS_EXHAUSTED", "You have used every attempt for this interview.");
    if (target.outcome === "no_show") fail(409, "NO_SHOW_RECORDED", "You missed your slot. Ask your institution to book a new one for you.");
    const slotId = objectId(slotIdValue, "slot");
    const existing = await AnviBooking.findOne({ assignmentId: assignment._id, studentId: student._id, active: true }).lean();
    if (existing?.status === "needs_reschedule") {
      const moved = await moveBooking({ assignment, booking: existing, slotId, at, by: "student" });
      return { booking: bookingView(moved, assignment, at, priorChanges(await ownBookings(assignment._id, student._id), moved._id)) };
    }
    if (existing) fail(409, "ALREADY_BOOKED", "You already have a slot for this interview. Reschedule it instead.");
    // Cancelling and booking again counts as a change, like a reschedule.
    const prior = priorChanges(await ownBookings(assignment._id, student._id));
    if (prior > policy.rescheduleLimit) {
      fail(409, "RESCHEDULE_LIMIT", `You have changed this booking ${policy.rescheduleLimit} times already. Ask your institution to book a slot for you.`);
    }
    const slot = await claimSlot(assignment, slotId, at, policy.cutoffMinutes);
    let booking;
    try {
      booking = (await AnviBooking.create({
        assignmentId: assignment._id, slotId: slot._id, studentId: student._id, startsAt: slot.startsAt, endsAt: slot.endsAt,
        status: "booked", active: true, history: [{ action: "booked", to: slot.startsAt, at, by: "student" }],
      })).toObject();
    } catch (error) {
      // Compensation: the seat claimed above goes back before the error surfaces.
      await releaseSlot(slot._id);
      if (error?.code === 11000) fail(409, "ALREADY_BOOKED", "You already have a slot for this interview.");
      throw error;
    }
    await AnviAssignmentTarget.updateOne({ _id: target._id, status: "assigned", outcome: "pending" }, { $set: { outcome: "booked" } });
    const refused = await settleIfWithdrawn(assignment, booking, at);
    if (refused) {
      // A fresh booking on a withdrawn slot is simply undone; the student picks another slot.
      if (refused.code === "SLOT_WITHDRAWN") await cancelBookingRow({ ...booking, status: "needs_reschedule" }, { by: "system", reason: "slot_withdrawn", at });
      fail(refused.status, refused.code, refused.message);
    }
    await send("booked", { assignment, recipients: [{ studentId: student._id, booking }] });
    return { booking: bookingView(booking, assignment, at, prior) };
  }

  async function ownBooking(student, bookingId) {
    const booking = await AnviBooking.findOne({ _id: objectId(bookingId, "booking"), studentId: student._id }).lean();
    if (!booking) fail(404, "BOOKING_NOT_FOUND", "Booking not found.");
    return booking;
  }

  async function rescheduleBooking(student, bookingId, slotIdValue) {
    const at = now();
    const booking = await ownBooking(student, bookingId);
    const { assignment } = await studentContext(student, booking.assignmentId);
    assertBookable(assignment, at);
    if (!booking.active || !["booked", "needs_reschedule"].includes(booking.status)) fail(409, "BOOKING_NOT_ACTIVE", "This booking is no longer active.");
    if (booking.attemptId) fail(409, "BOOKING_STARTED", "You already started this interview.");
    const slotId = objectId(slotIdValue, "slot");
    const moved = await moveBooking({ assignment, booking, slotId, at, by: "student" });
    return { booking: bookingView(moved, assignment, at, priorChanges(await ownBookings(assignment._id, student._id), moved._id)) };
  }

  async function cancelBooking(student, bookingId) {
    const at = now();
    const booking = await ownBooking(student, bookingId);
    const { assignment } = await studentContext(student, booking.assignmentId);
    if (!booking.active) fail(409, "BOOKING_NOT_ACTIVE", "This booking is no longer active.");
    if (booking.attemptId) fail(409, "BOOKING_STARTED", "You already started this interview.");
    const policy = policyOf(assignment);
    if (booking.status === "booked" && ms(booking.startsAt) - policy.cutoffMinutes * MINUTE <= ms(at)) {
      fail(409, "BOOKING_CUTOFF", `Bookings cannot be cancelled within ${policy.cutoffMinutes} minutes of the slot.`);
    }
    const cancelled = await cancelBookingRow(booking, { by: "student", reason: "cancelled_by_student", at });
    if (!cancelled) fail(409, "BOOKING_CHANGED", "This booking changed meanwhile. Reload and try again.");
    await send("cancelled", { assignment, recipients: [{ studentId: student._id, booking }] });
    return { booking: bookingView(cancelled, assignment, at) };
  }

  async function bookingCalendarIcs(student, bookingId, { url = "" } = {}) {
    const booking = await ownBooking(student, bookingId);
    const assignment = await AnviAssignment.findOne({ _id: booking.assignmentId }).select("title role").lean();
    if (!assignment) fail(404, "BOOKING_NOT_FOUND", "Booking not found.");
    return { filename: "anvi-interview.ics", content: buildAnviBookingIcs({ booking, assignment, url, now: now() }) };
  }

  // ----- Integration with the attempt lifecycle -----

  async function checkAssignedStart(student, assignmentId, at = now()) {
    const empty = { assignment: null, target: null, booking: null, activeAttemptId: null };
    if (!validId(assignmentId)) return { ...deny(400, "INVALID_IDENTIFIER", "Invalid assignment."), ...empty };
    const id = new mongoose.Types.ObjectId(String(assignmentId));
    const [assignment, target, booking, activeAttempt] = await Promise.all([
      AnviAssignment.findOne({ _id: id, status: { $ne: "draft" } }).lean(),
      AnviAssignmentTarget.findOne({ assignmentId: id, studentId: student._id, status: "assigned" }).lean(),
      AnviBooking.findOne({ assignmentId: id, studentId: student._id, active: true }).lean(),
      AnviAttempt.findOne({ assignmentId: id, studentId: student._id, status: "in_progress" }).select("_id hardDeadline").lean(),
    ]);
    const verdict = evaluateStart({ assignment, target, booking, activeAttempt, at: new Date(at) });
    return {
      ...verdict,
      assignment: verdict.code === "NOT_ASSIGNED" ? null : assignment,
      target: verdict.code === "NOT_ASSIGNED" ? null : target,
      booking: booking || null,
      activeAttemptId: activeAttempt && verdict.code === "RESUME" ? String(activeAttempt._id) : null,
    };
  }

  async function recordAssignedAttempt({ assignment, target, booking, attempt }) {
    const allowed = policyOf(assignment).attemptsAllowed;
    const updated = await AnviAssignmentTarget.findOneAndUpdate(
      { _id: target._id, status: "assigned", attemptsUsed: { $lt: allowed } },
      { $inc: { attemptsUsed: 1 }, $set: { outcome: "in_progress", lastAttemptId: attempt._id, partial: false } },
      { new: true },
    ).lean();
    if (!updated) return false;
    if (booking?._id) {
      // A no-show sweep that raced the start (same second) is undone: the student did join.
      await AnviBooking.updateOne({ _id: booking._id, status: { $in: ["booked", "no_show"] }, attemptId: null },
        { $set: { attemptId: attempt._id, status: "booked", active: true } }).catch(() => {});
    }
    return true;
  }

  async function onAttemptFinalized(attempt) {
    const id = attempt?._id || attempt;
    if (!id || attempt?.assignmentId === null) return false;
    const row = await AnviAttempt.findById(id).select("_id assignmentId bookingId studentId status partial").lean();
    if (!row?.assignmentId || !ENDED.has(row.status)) return false;
    const partial = !FINISHED.has(row.status) || Boolean(row.partial);
    const assignment = await AnviAssignment.findById(row.assignmentId).select("bookingPolicy window status").lean();
    const target = await AnviAssignmentTarget.findOne({ assignmentId: row.assignmentId, studentId: row.studentId, lastAttemptId: row._id }).lean();
    if (target) {
      const retry = partial && (target.attemptsUsed || 0) < policyOf(assignment).attemptsAllowed;
      await AnviAssignmentTarget.updateOne({ _id: target._id, lastAttemptId: row._id, outcome: "in_progress" }, { $set: { outcome: retry ? "pending" : "completed", partial } });
    }
    if (row.bookingId) {
      await AnviBooking.updateOne({ _id: row.bookingId, attemptId: row._id, active: true },
        { $set: { status: "completed", active: false }, $push: historyPush({ action: "completed", at: now(), by: "system" }) });
    }
    return true;
  }

  async function practiceBlocked(interviewId) {
    if (!validId(interviewId)) return false;
    return Boolean(await AnviAssignment.exists({ interviewId: new mongoose.Types.ObjectId(String(interviewId)), blockPractice: true, status: { $in: ACTIVE } }));
  }

  /** Interview ids (strings) among `interviewIds` whose practice is blocked; one query for a list page. */
  async function practiceBlockedIds(interviewIds = []) {
    const ids = interviewIds.filter(validId).map((value) => new mongoose.Types.ObjectId(String(value)));
    if (!ids.length) return new Set();
    const rows = await AnviAssignment.distinct("interviewId", { interviewId: { $in: ids }, blockPractice: true, status: { $in: ACTIVE } });
    return new Set(rows.map(String));
  }

  async function visibilityForAttempt(attempt, at = now()) {
    if (!attempt?.assignmentId) return at;
    const assignment = await AnviAssignment.findById(attempt.assignmentId).select("reportVisibility status releasedAt").lean();
    if (!assignment || assignment.releasedAt || assignment.reportVisibility === "immediate") return at;
    if (assignment.reportVisibility === "after_close" && ["closed", "cancelled", "archived"].includes(assignment.status)) return at;
    return null;
  }

  /** True while the assignment can still be taken (scheduled, open or paused, and not past closesAt). */
  async function assignmentActive(assignmentId, at = now()) {
    if (!validId(assignmentId)) return false;
    const row = await AnviAssignment.findById(new mongoose.Types.ObjectId(String(assignmentId))).select("status window").lean();
    return Boolean(row) && ACTIVE.includes(effectiveStatus(row, at));
  }

  async function activeAssignmentFor(interviewId) {
    if (!validId(interviewId)) return null;
    const row = await AnviAssignment.findOne({ interviewId: new mongoose.Types.ObjectId(String(interviewId)), status: { $in: ACTIVE } })
      .select("_id title status window").sort({ "window.closesAt": -1 }).lean();
    return row ? { id: String(row._id), title: row.title, status: row.status, window: row.window } : null;
  }

  /**
   * "Mark complete" on an interview (the caller already set it completed and owns it): every interview still
   * running is ended from its stored answers and evaluated, then each active schedule is closed (one that has
   * not opened yet is cancelled, since nobody could have taken it). Safe to repeat.
   * Returns { ended, closed, cancelled }.
   */
  async function completeInterview(admin, interviewIdValue) {
    const at = now();
    const interviewId = objectId(interviewIdValue, "interview");
    const running = await AnviAttempt.find({ interviewId, status: "in_progress" })
      .select("_id studentId interviewId assignmentId bookingId hardDeadline").lean();
    let ended = 0;
    for (const attempt of running) if (await endInProgress(attempt, { endReason: "interview_completed", at })) ended += 1;
    const schedules = await AnviAssignment.find({ interviewId, ownerId: admin._id, status: { $in: ACTIVE } }).select("_id window").lean();
    let closed = 0;
    let cancelled = 0;
    for (const row of schedules) {
      const early = ms(at) < ms(row.window.opensAt);
      await transitionAssignment(admin, String(row._id), early ? "cancel" : "close");
      if (early) cancelled += 1; else closed += 1;
    }
    return { ended, closed, cancelled };
  }

  /**
   * Permanently removes every ANVI record owned by one interview. Definition deletion uses this after
   * the admin has typed the exact title. A live attempt is the sole blocker: deleting it would eject a
   * student from an interview currently under way.
   */
  async function deleteInterviewData(admin, interviewIdValue) {
    const interviewId = objectId(interviewIdValue, "interview");
    const liveAttempt = await AnviAttempt.findOne({ interviewId, status: "in_progress" }).select("_id").lean();
    if (liveAttempt) fail(409, "INTERVIEW_IN_PROGRESS", "A student is currently taking this interview. End that attempt before deleting the interview.", { attemptId: String(liveAttempt._id) });

    const assignments = await AnviAssignment.find({ interviewId, ownerId: admin._id }).select("_id").lean();
    const assignmentIds = assignments.map((row) => row._id);
    const attempts = await AnviAttempt.find({ interviewId }).select("_id").lean();
    const attemptIds = attempts.map((row) => row._id);

    await Promise.all([
      AnviLiveSession.deleteMany({ attemptId: { $in: attemptIds } }),
      AnviResumeContext.deleteMany({ interviewId }),
      AnviAudioAsset.deleteMany({ interviewId }),
      AnviBooking.deleteMany({ assignmentId: { $in: assignmentIds } }),
      AnviSlot.deleteMany({ assignmentId: { $in: assignmentIds } }),
      AnviAssignmentTarget.deleteMany({ assignmentId: { $in: assignmentIds } }),
      AnviAttempt.deleteMany({ interviewId }),
    ]);
    await AnviAssignment.deleteMany({ _id: { $in: assignmentIds }, ownerId: admin._id });
    return { schedules: assignmentIds.length, attempts: attemptIds.length };
  }

  return {
    createAssignment, updateAssignment, transitionAssignment, listAssignments, getAssignmentDetail, listAdminSlots, rosterCsv,
    addTargets, removeTargets, resetTarget, listTargets, listInterviewTargets, notifyTargets, adminMoveBooking, adminCancelBooking,
    listStudentAssignments, listOpenSlots, bookSlot, rescheduleBooking, cancelBooking, bookingCalendarIcs,
    checkAssignedStart, recordAssignedAttempt, onAttemptFinalized, practiceBlocked, practiceBlockedIds, visibilityForAttempt, activeAssignmentFor,
    deleteInterviewData, completeInterview,
    assignmentActive,
    // Used by the sweeper.
    runCloseEffects, runCancelEffects, reconcileFinalized, notifier, now,
  };
}

let shared;
export const anviScheduling = () => (shared ||= createAnviScheduling());
export const checkAssignedStart = (...args) => anviScheduling().checkAssignedStart(...args);
export const recordAssignedAttempt = (...args) => anviScheduling().recordAssignedAttempt(...args);
export const onAttemptFinalized = (...args) => anviScheduling().onAttemptFinalized(...args);
export const practiceBlocked = (...args) => anviScheduling().practiceBlocked(...args);
export const practiceBlockedIds = (...args) => anviScheduling().practiceBlockedIds(...args);
export const visibilityForAttempt = (...args) => anviScheduling().visibilityForAttempt(...args);
export const activeAssignmentFor = (...args) => anviScheduling().activeAssignmentFor(...args);
export const assignmentActive = (...args) => anviScheduling().assignmentActive(...args);
