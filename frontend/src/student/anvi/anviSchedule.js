// Pure helpers for scheduled (assigned) ANVI interviews. Every time a student sees is shown in IST,
// because windows and slots are defined by the institution in Asia/Kolkata, whatever the browser's zone.

export const IST_ZONE = "Asia/Kolkata";
const MINUTE = 60_000;

const validDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};
const timeOf = (value) => validDate(value)?.getTime() ?? NaN;

/** "22 Oct 2026, 3:30 pm IST". */
export function formatIST(value) {
  const date = validDate(value);
  if (!date) return "Time to be confirmed";
  return `${date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: IST_ZONE })} IST`;
}

/** "3:30 pm" (no label: callers add "IST" once per sentence). */
export function formatISTTime(value) {
  const date = validDate(value);
  return date ? date.toLocaleTimeString("en-IN", { timeStyle: "short", timeZone: IST_ZONE }) : "";
}

/** "Thu, 22 Oct". */
export function formatISTDay(value) {
  const date = validDate(value);
  return date ? date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: IST_ZONE }) : "";
}

/** The IST calendar day, "YYYY-MM-DD", used to group slots into day tabs. */
export function istDayKey(value) {
  const date = validDate(value);
  if (!date) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: IST_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** "2 d 3 h", "3 h 5 min", "12 min", "less than a minute". */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "less than a minute";
  const minutes = Math.floor(ms / MINUTE);
  if (minutes < 1) return "less than a minute";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return hours ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  return `${rest} min`;
}

export const MODE_LABEL = { mock: "Mock interview", adaptive: "Adaptive interview", practice: "Practice" };
export const modeLabel = (mode) => MODE_LABEL[String(mode || "mock").toLowerCase()] || MODE_LABEL.mock;

const DEFAULT_POLICY = { rescheduleLimit: 2, cutoffMinutes: 60, earlyJoinMinutes: 10, lateGraceMinutes: 10, attemptsAllowed: 1 };

/** Booking policy for an assignment, from the list item or a slots response, falling back to the contract defaults. */
export function policyOf(item, slotsResponse) {
  const sources = [slotsResponse?.policy, slotsResponse?.bookingPolicy, slotsResponse, item?.bookingPolicy, item?.policy];
  const pick = (key) => {
    for (const source of sources) {
      const value = Number(source?.[key]);
      if (source && source[key] !== undefined && source[key] !== null && Number.isFinite(value)) return value;
    }
    return DEFAULT_POLICY[key];
  };
  return Object.fromEntries(Object.keys(DEFAULT_POLICY).map((key) => [key, pick(key)]));
}

export const assignmentIdOf = (item) => String(item?.assignmentId || item?.id || "");
export const bookingIdOf = (booking) => String(booking?.id || booking?._id || "");
export const slotIdOf = (slot) => String(slot?.id || slot?._id || "");

/** Slots mode means the student books a slot; window mode means they start any time inside the window. */
export function isSlotMode(item) {
  const value = item?.slotMode;
  if (typeof value === "string") return value === "slots";
  if (typeof value === "boolean") return value;
  return item?.slotPolicy?.mode === "slots" || Boolean(item?.booking?.startsAt && item?.booking?.slotId);
}

/** Which card a scheduled interview shows. */
export function cardStateOf(item, now = Date.now()) {
  const outcome = String(item?.outcome || "pending");
  if (outcome === "completed") return "completed";
  if (outcome === "in_progress" && item?.attemptId) return "in_progress";
  if (outcome === "no_show" || outcome === "missed") return "missed";
  if (outcome === "cancelled" || item?.status === "cancelled") return "cancelled";
  const closesAt = timeOf(item?.window?.closesAt);
  const booking = item?.booking;
  if (isSlotMode(item)) {
    if (booking?.status === "booked") {
      const to = timeOf(item?.joinWindow?.to);
      return Number.isFinite(to) && to < now ? "missed" : "booked";
    }
    if (Number.isFinite(closesAt) && closesAt <= now) return "missed";
    return booking?.status === "needs_reschedule" ? "needs_reschedule" : "book";
  }
  if (Number.isFinite(closesAt) && closesAt <= now) return "missed";
  return "window";
}

/** The join window: the server's, else derived from the booking (slots) or the assignment window (window mode). */
export function joinWindowOf(item) {
  const from = timeOf(item?.joinWindow?.from);
  const to = timeOf(item?.joinWindow?.to);
  if (Number.isFinite(from) && Number.isFinite(to)) return { from, to };
  const policy = policyOf(item);
  if (isSlotMode(item)) {
    const start = timeOf(item?.booking?.startsAt);
    if (!Number.isFinite(start) || item?.booking?.status !== "booked") return null;
    return { from: start - policy.earlyJoinMinutes * MINUTE, to: start + policy.lateGraceMinutes * MINUTE };
  }
  const opens = timeOf(item?.window?.opensAt);
  const closes = timeOf(item?.window?.closesAt);
  if (!Number.isFinite(opens) || !Number.isFinite(closes)) return null;
  return { from: opens, to: closes - 5 * MINUTE };
}

// Server reasons that only describe the clock: the local clock decides those between list reloads.
const TIME_REASONS = new Set(["NOT_YET_OPEN", "TOO_EARLY", "JOIN_NOT_OPEN", "NOT_OPEN_YET", "WINDOW_NOT_OPEN", "BEFORE_WINDOW", "JOIN_WINDOW"]);
const REASON_TEXT = {
  PAUSED: "Your institution has paused this interview. Check back later.",
  ASSIGNMENT_PAUSED: "Your institution has paused this interview. Check back later.",
  ASSIGNMENT_NOT_OPEN: "This interview is not open yet.",
  NOT_OPEN: "This interview is not open yet.",
  ASSIGNMENT_CLOSED: "This interview has closed.",
  WINDOW_CLOSED: "The join window has closed.",
  JOIN_WINDOW_PASSED: "The join time for your slot has passed.",
  TOO_LATE: "The join window has closed.",
  ATTEMPT_LIMIT: "You have used every attempt allowed for this interview.",
  ATTEMPTS_USED: "You have used every attempt allowed for this interview.",
  ATTEMPTS_EXHAUSTED: "You have used every attempt allowed for this interview.",
  NEEDS_RESCHEDULE: "Your slot was withdrawn. Book a new slot first.",
  NO_BOOKING: "Book a slot first.",
  BOOKING_REQUIRED: "Book a slot first.",
  NOT_ASSIGNED: "You are no longer assigned to this interview.",
  TARGET_REMOVED: "You are no longer assigned to this interview.",
  CANCELLED: "This interview was cancelled by your institution.",
};

/** A readable sentence for a server block reason, which may be a code or already a sentence. */
export function reasonText(reason) {
  const value = String(reason?.message || reason?.code || reason || "").trim();
  if (!value) return "";
  if (/^[A-Z0-9_]+$/.test(value)) return REASON_TEXT[value] || "You cannot join this interview right now.";
  return value;
}
const reasonCode = (reason) => String(reason?.code || reason || "").trim();

/**
 * Whether Join is enabled now, and the reason shown when it is not. Join is enabled only inside the
 * join window; the server re-checks everything when the student starts.
 */
export function joinStateOf(item, now = Date.now()) {
  const span = joinWindowOf(item);
  // The server's own sentence wins over the code's generic text.
  const serverReason = reasonText(item?.startBlockedMessage) || reasonText(item?.startBlockedReason);
  if (!span) return { enabled: false, phase: "none", reason: serverReason || (isSlotMode(item) ? "Book a slot first." : "This interview is not open yet."), window: null };
  if (now < span.from) {
    return { enabled: false, phase: "before", window: span,
      reason: `Join opens at ${formatISTTime(span.from)} IST on ${formatISTDay(span.from)} (in ${formatDuration(span.from - now)}).` };
  }
  if (now > span.to) return { enabled: false, phase: "after", window: span, reason: `The join window closed at ${formatISTTime(span.to)} IST.` };
  const code = reasonCode(item?.startBlockedReason);
  if (item?.canStart === false && !TIME_REASONS.has(code)) {
    return { enabled: false, phase: "open", window: span, reason: serverReason || "You cannot join this interview right now." };
  }
  return { enabled: true, phase: "open", window: span, reason: "" };
}

/** Whether a booked slot can still be rescheduled or cancelled (the cutoff and the reschedule allowance). */
export function changeStateOf(item, now = Date.now(), policy = policyOf(item)) {
  const start = timeOf(item?.booking?.startsAt);
  const cutoffAt = Number.isFinite(start) ? start - policy.cutoffMinutes * MINUTE : NaN;
  const pastCutoff = Number.isFinite(cutoffAt) && now >= cutoffAt;
  const leftValue = Number(item?.booking?.rescheduleLeft);
  const rescheduleLeft = Number.isFinite(leftValue) ? Math.max(0, leftValue) : policy.rescheduleLimit;
  const cutoffReason = `Changes close ${policy.cutoffMinutes} min before your slot starts.`;
  // The server also refuses changes while the assignment is paused or closed, or once the attempt started.
  const paused = item?.status === "paused";
  const locked = !pastCutoff && (paused || item?.booking?.canChange === false);
  const lockedReason = paused ? "Your institution has paused bookings for this interview." : "This booking can no longer be changed.";
  const blocked = pastCutoff || locked;
  const blockedReason = pastCutoff ? cutoffReason : locked ? lockedReason : "";
  return {
    blocked,
    pastCutoff,
    rescheduleLeft,
    canCancel: !blocked,
    canReschedule: !blocked && rescheduleLeft > 0,
    cancelReason: blockedReason,
    rescheduleReason: blockedReason || (rescheduleLeft <= 0 ? "You have used every reschedule allowed." : ""),
  };
}

/** Seats left in a slot; null when the server did not say. */
export function seatsLeftOf(slot) {
  const direct = Number(slot?.seatsLeft ?? slot?.remaining);
  if (Number.isFinite(direct)) return Math.max(0, direct);
  const capacity = Number(slot?.capacity);
  const booked = Number(slot?.bookedCount);
  return Number.isFinite(capacity) && Number.isFinite(booked) ? Math.max(0, capacity - booked) : null;
}

/** Normalizes a slots response (an array, or { slots }) into bookable rows sorted by start. */
export function normalizeSlots(response) {
  const rows = Array.isArray(response) ? response : Array.isArray(response?.slots) ? response.slots : [];
  return rows.filter((slot) => slotIdOf(slot) && Number.isFinite(timeOf(slot.startsAt)))
    .map((slot) => ({ ...slot, id: slotIdOf(slot), seatsLeft: seatsLeftOf(slot) }))
    .sort((a, b) => timeOf(a.startsAt) - timeOf(b.startsAt));
}

/** Slot rows grouped into IST days, in order: [{ key, label, slots }]. */
export function groupSlotsByDay(slots = []) {
  const days = new Map();
  for (const slot of slots) {
    const key = istDayKey(slot.startsAt);
    if (!key) continue;
    if (!days.has(key)) days.set(key, { key, label: formatISTDay(slot.startsAt), slots: [] });
    days.get(key).slots.push(slot);
  }
  return [...days.values()];
}

/** Whether a slot can be picked now: it has a seat and starts after the cutoff. */
export function slotBookable(slot, policy, now = Date.now()) {
  const start = timeOf(slot?.startsAt);
  if (!Number.isFinite(start) || start - policy.cutoffMinutes * MINUTE <= now) return false;
  if (slot?.bookable === false || (slot?.status && slot.status !== "open")) return false;
  const seats = seatsLeftOf(slot);
  return seats === null || seats > 0;
}

/** Milliseconds until the next join-window edge among the items (for a list refresh), or null. */
export function nextJoinBoundary(items = [], now = Date.now()) {
  let next = Infinity;
  for (const item of items) {
    const span = joinWindowOf(item);
    if (!span) continue;
    for (const edge of [span.from, span.to]) if (edge > now && edge < next) next = edge;
  }
  return Number.isFinite(next) ? next - now : null;
}

/** Upcoming dashboard rows for scheduled ANVI interviews, in the getUpcomingItems shape (times shown in IST). */
export function upcomingAnviItems(assignments = [], now = Date.now()) {
  const rows = [];
  for (const item of Array.isArray(assignments) ? assignments : []) {
    const state = cardStateOf(item, now);
    const base = { id: `anvi-${assignmentIdOf(item)}`, type: "ai_interview", title: item.title || "AI interview", href: "/student/ai-interviews", ist: true };
    const join = joinStateOf(item, now);
    if (state === "booked") {
      rows.push({ ...base, label: join.enabled ? "Join now" : "AI interview booked", timeLabel: "Starts", time: item.booking.startsAt, available: join.enabled });
    } else if (state === "in_progress") {
      rows.push({ ...base, label: "In progress", timeLabel: "Closes", time: item.window?.closesAt, available: true });
    } else if (state === "book" || state === "needs_reschedule") {
      rows.push({ ...base, label: state === "book" ? "Book a slot" : "Pick a new slot", timeLabel: "Book by", time: item.window?.closesAt, available: false });
    } else if (state === "window") {
      rows.push({ ...base, label: join.enabled ? "Available now" : "Scheduled AI interview", timeLabel: join.enabled ? "Closes" : "Opens", time: join.enabled ? item.window?.closesAt : item.window?.opensAt, available: join.enabled });
    }
  }
  return rows;
}
