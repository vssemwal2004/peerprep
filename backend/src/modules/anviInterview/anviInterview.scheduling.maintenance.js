import { servicePeriodStatus } from "../../platform/servicePeriod.js";
import { AnviAssignment, AnviAssignmentTarget, AnviBooking } from "./anviInterview.scheduling.models.js";
import { anviScheduling, DEFAULT_BOOKING_POLICY } from "./anviInterview.scheduling.service.js";

const MINUTE = 60_000;
const ACTIVE = ["scheduled", "open", "paused"];
// Smallest first: a booking made 50 minutes ahead gets the 1h reminder only, never a late "24h" one.
const REMINDERS = [
  { label: "10m", ms: 10 * MINUTE },
  { label: "1h", ms: 60 * MINUTE },
  { label: "24h", ms: 24 * 60 * MINUTE },
];
const WINDOW_REMINDER = { label: "24h", ms: 24 * 60 * MINUTE };
const MAX_GRACE_MS = 60 * MINUTE;

const notify = (scheduling, event, context) => Promise.resolve()
  .then(() => scheduling.notifier.send(event, context))
  .catch((error) => console.warn(`[ANVI] Schedule notification failed (${error?.name || "Error"}).`));
const grace = (assignment) => (assignment?.bookingPolicy?.lateGraceMinutes ?? DEFAULT_BOOKING_POLICY.lateGraceMinutes) * MINUTE;

/**
 * One scheduling pass, run every 60 s for the platform and for each university (in the caller's tenant
 * context). Every transition is a conditional write, so two processes running it at once change nothing twice.
 * `tenant` is the university record; null means the platform database.
 */
export async function sweepAnviScheduling(now = new Date(), { tenant = null, limit = 100, scheduling = anviScheduling() } = {}) {
  if (tenant && (tenant.permissions?.interviews !== true || servicePeriodStatus(tenant, now) !== "active")) return { skipped: true };
  const result = { opened: 0, closed: 0, settled: 0, reminders: 0, windowReminders: 0, noShows: 0 };

  const opened = await AnviAssignment.updateMany(
    { status: "scheduled", "window.opensAt": { $lte: now }, "window.closesAt": { $gt: now } },
    { $set: { status: "open" }, $inc: { revision: 1 } },
  );
  result.opened = opened.modifiedCount || 0;

  const due = await AnviAssignment.find({ status: { $in: ACTIVE }, "window.closesAt": { $lte: now } })
    .select("-snapshotData").limit(limit).maxTimeMS(8000).lean();
  for (const row of due) {
    const closed = await AnviAssignment.findOneAndUpdate(
      { _id: row._id, status: row.status },
      { $set: { status: "closed", closedAt: now }, $inc: { revision: 1 } },
      { new: true },
    ).select("-snapshotData").lean();
    if (!closed) continue;
    result.closed += 1;
    await scheduling.runCloseEffects(closed, now);
  }
  // A process that died between the status change and the close work is finished here.
  // The same for a cancel: its effects (seats, bookings, outcomes, after_close release) are idempotent.
  const unfinished = await AnviAssignment.find({ status: { $in: ["closed", "cancelled"] }, closeEffectsAt: null })
    .select("-snapshotData").limit(limit).maxTimeMS(8000).lean();
  for (const row of unfinished) {
    if (row.status === "closed") await scheduling.runCloseEffects(row, now);
    else await scheduling.runCancelEffects?.(row, now);
  }

  // Assigned attempts that ended while their schedule update failed are settled here.
  result.settled = scheduling.reconcileFinalized ? await scheduling.reconcileFinalized({ limit }) : 0;

  const live = await AnviAssignment.find({ status: { $in: ["scheduled", "open"] }, "window.closesAt": { $gt: now } })
    .select("-snapshotData").limit(500).maxTimeMS(8000).lean();
  const byId = new Map(live.map((row) => [String(row._id), row]));

  // Slot reminders: bookings starting within an offset that have not had that reminder yet.
  if (live.length) {
    const horizon = new Date(now.getTime() + REMINDERS.at(-1).ms);
    const bookings = await AnviBooking.find({
      assignmentId: { $in: live.map((row) => row._id) },
      status: "booked",
      active: true,
      attemptId: null,
      startsAt: { $gt: now, $lte: horizon },
      $or: REMINDERS.map((reminder) => ({ startsAt: { $lte: new Date(now.getTime() + reminder.ms) }, remindersSent: { $ne: reminder.label } })),
    }).sort({ startsAt: 1 }).limit(limit * 5).maxTimeMS(8000).lean();
    for (const booking of bookings) {
      const left = new Date(booking.startsAt).getTime() - now.getTime();
      const index = REMINDERS.findIndex((reminder) => left <= reminder.ms);
      const reminder = REMINDERS[index];
      if (!reminder || booking.remindersSent?.includes(reminder.label)) continue;
      // Larger reminders that are now pointless are marked too, so they never fire late.
      const labels = REMINDERS.slice(index).map((row) => row.label);
      const claimed = await AnviBooking.updateOne(
        { _id: booking._id, startsAt: booking.startsAt, status: "booked", remindersSent: { $ne: reminder.label } },
        { $addToSet: { remindersSent: { $each: labels } } },
      );
      if (!claimed.modifiedCount) continue;
      result.reminders += 1;
      await notify(scheduling, "reminder", { assignment: byId.get(String(booking.assignmentId)), recipients: [{ studentId: booking.studentId, booking }], label: reminder.label });
    }
  }

  // Window reminder, 24 h before close, for students who have not started (or, with slots, not booked).
  for (const assignment of live) {
    const closes = new Date(assignment.window.closesAt).getTime();
    if (closes - now.getTime() > WINDOW_REMINDER.ms || new Date(assignment.window.opensAt) > now) continue;
    const slots = assignment.slotPolicy?.mode === "slots";
    const targets = await AnviAssignmentTarget.find({
      assignmentId: assignment._id,
      status: "assigned",
      attemptsUsed: 0,
      outcome: slots ? "pending" : { $in: ["pending", "booked"] },
      remindersSent: { $ne: WINDOW_REMINDER.label },
    }).select("_id studentId").limit(limit * 10).maxTimeMS(8000).lean();
    if (!targets.length) continue;
    const claimed = await AnviAssignmentTarget.updateMany(
      { _id: { $in: targets.map((row) => row._id) }, remindersSent: { $ne: WINDOW_REMINDER.label } },
      { $addToSet: { remindersSent: WINDOW_REMINDER.label } },
    );
    if (!claimed.modifiedCount) continue;
    result.windowReminders += targets.length;
    // notifyOnce dedupes per student, so a target claimed by a parallel pass is never notified twice.
    await notify(scheduling, "window_reminder", { assignment, recipients: targets.map((row) => ({ studentId: row.studentId })), label: WINDOW_REMINDER.label });
  }

  // No-shows: a booked slot past its late grace with no attempt. Only live (scheduled or open) assignments
  // are read, and each one only up to its own grace, so bookings that cannot be marked yet (paused
  // assignments, slots still inside their grace) never fill the page and starve everyone else.
  const byGrace = new Map();
  for (const assignment of live) {
    const wait = Math.min(grace(assignment), MAX_GRACE_MS);
    byGrace.set(wait, [...(byGrace.get(wait) || []), assignment._id]);
  }
  const horizonStart = new Date(now.getTime() - 7 * 24 * 60 * MINUTE);
  const late = byGrace.size
    ? await AnviBooking.find({
      status: "booked", active: true, attemptId: null,
      $or: [...byGrace].map(([wait, ids]) => ({ assignmentId: { $in: ids }, startsAt: { $lt: new Date(now.getTime() - wait), $gte: horizonStart } })),
    }).sort({ startsAt: 1 }).limit(limit * 5).maxTimeMS(8000).lean()
    : [];
  for (const booking of late) {
    const assignment = byId.get(String(booking.assignmentId));
    // While paused nobody can start, so nobody is marked absent (paused assignments are not in `live`).
    if (!assignment || !["scheduled", "open"].includes(assignment.status)) continue;
    if (new Date(booking.startsAt).getTime() + Math.min(grace(assignment), MAX_GRACE_MS) >= now.getTime()) continue;
    const marked = await AnviBooking.updateOne(
      { _id: booking._id, status: "booked", active: true, attemptId: null },
      { $set: { status: "no_show", active: false }, $push: { history: { $each: [{ action: "no_show", from: booking.startsAt, at: now, by: "system" }], $slice: -10 } } },
    );
    if (!marked.modifiedCount) continue;
    result.noShows += 1;
    await AnviAssignmentTarget.updateOne(
      { assignmentId: booking.assignmentId, studentId: booking.studentId, status: "assigned", outcome: { $in: ["booked", "pending"] } },
      { $set: { outcome: "no_show" } },
    );
    await notify(scheduling, "missed", { assignment, recipients: [{ studentId: booking.studentId, booking }] });
  }
  return result;
}
