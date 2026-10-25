import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import AIInterview from "../src/models/AIInterview.js";
import User from "../src/models/User.js";
import { AnviAttempt } from "../src/modules/anviInterview/anviInterview.models.js";
import { AnviAssignment, AnviAssignmentTarget, AnviBooking, AnviSlot, ANVI_SCHEDULING_MODELS } from "../src/modules/anviInterview/anviInterview.scheduling.models.js";
import { createAnviScheduling, evaluateStart, generateSlotTimes, normalizeSlotPolicy, parseIstInstant } from "../src/modules/anviInterview/anviInterview.scheduling.service.js";
import { buildAnviBookingIcs, escapeIcsText, foldIcsLine } from "../src/modules/anviInterview/anviInterview.scheduling.ics.js";
import { buildEmail, createSchedulingNotifier, describe as describeEvent } from "../src/modules/anviInterview/anviInterview.scheduling.notify.js";

// Scheduling service over an ephemeral MongoDB with a fixed clock and a recording notifier.
let mongo;
let skipped = false;
const MINUTE = 60_000;
const admin = { _id: new mongoose.Types.ObjectId(), role: "admin" };
const otherAdmin = { _id: new mongoose.Types.ObjectId(), role: "admin" };
const clock = { t: 0, now() { return this.t; } };
const events = [];
const notifier = { async send(event, context) { events.push({ event, ...context }); return { notified: context.recipients.length }; } };
const scheduling = createAnviScheduling({ clock, notifier, log: { warn() {} } });
const SUNDAY = Date.parse("2026-11-01T00:00:00.000Z");

before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } }); }
  catch (error) { if (error?.code === "EPERM") { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: "anvi_scheduling_test" });
  await Promise.all([AIInterview.init(), AnviAttempt.init(), ...ANVI_SCHEDULING_MODELS.map((model) => model.init())]);
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  clock.t = SUNDAY;
  events.length = 0;
  if (skipped) return;
  await Promise.all([AIInterview, User, AnviAttempt, ...ANVI_SCHEDULING_MODELS].map((model) => model.deleteMany({})));
});

const skip = (t) => (skipped ? t.skip("Local sockets are unavailable in this sandbox") : false);
const published = (ownerId = admin._id, fields = {}) => AIInterview.create({
  ownerId, creationKey: crypto.randomUUID(), title: "Backend round", data: { title: "Backend round draft" },
  publishedAt: new Date(), publishedRevision: 3, publishedSnapshot: { data: { title: "Backend round", role: "SDE", secretKeyPoint: "pinned" }, revision: 3, at: new Date() },
  ...fields,
});
async function students(count, fields = {}) {
  const rows = Array.from({ length: count }, (_, index) => ({
    _id: new mongoose.Types.ObjectId(), role: "student", name: `Student ${index}`, email: `s${index}-${crypto.randomUUID()}@example.com`,
    studentId: `GEU-${crypto.randomUUID().slice(0, 8)}`, branch: "CSE", semester: 5, ...fields,
  }));
  if (rows.length) await User.collection.insertMany(rows);
  return rows;
}
const ids = (rows) => rows.map((row) => String(row._id));
const WINDOW = { opensAt: "2026-11-02T09:00:00+05:30", closesAt: "2026-11-04T18:00:00+05:30" };
const oneSlot = (capacityPerSlot) => ({ mode: "slots", slotMinutes: 30, capacityPerSlot, dailyStart: "10:00", dailyEnd: "10:30", weekdays: [1] });
async function slotsAssignment(cohort, { slotPolicy = oneSlot(5), bookingPolicy, reportVisibility, window = WINDOW } = {}) {
  const interview = await published();
  const { assignment } = await scheduling.createAssignment(admin, {
    interviewId: String(interview._id), audience: { source: "selected", studentIds: ids(cohort) }, window, slotPolicy, bookingPolicy, reportVisibility,
  });
  const slots = await AnviSlot.find({ assignmentId: assignment.id }).sort({ startsAt: 1 }).lean();
  return { interview, assignment, slots };
}
const rejectsWith = (promise, code) => assert.rejects(promise, (error) => { assert.equal(error.details?.code, code, error.message); return true; });

test("IST date-times need an explicit +05:30 (or Z) offset and a real calendar date", () => {
  assert.equal(parseIstInstant("2026-11-02T09:00:00+05:30").toISOString(), "2026-11-02T03:30:00.000Z");
  assert.equal(parseIstInstant("2026-11-02T09:00+05:30").toISOString(), "2026-11-02T03:30:00.000Z");
  assert.equal(parseIstInstant("2026-11-02T03:30:00.000Z").toISOString(), "2026-11-02T03:30:00.000Z");
  for (const [value, code] of [
    ["2026-11-02T09:00:00", "INVALID_DATETIME"],
    ["2026-11-02", "INVALID_DATETIME"],
    [1762054200000, "INVALID_DATETIME"],
    ["2026-11-02T09:00:00+01:00", "INVALID_TIMEZONE_OFFSET"],
    ["2026-02-30T09:00:00+05:30", "INVALID_DATETIME"],
    ["2026-11-02T24:00:00+05:30", "INVALID_DATETIME"],
    ["2026-11-02T09:60:00+05:30", "INVALID_DATETIME"],
  ]) assert.throws(() => parseIstInstant(value), (error) => error.details?.code === code, String(value));
});

test("slots follow IST weekdays, daily hours and blackout dates, and are capped", () => {
  const window = { opensAt: parseIstInstant(WINDOW.opensAt), closesAt: parseIstInstant(WINDOW.closesAt) };
  const policy = normalizeSlotPolicy({ mode: "slots", slotMinutes: 30, capacityPerSlot: 4, dailyStart: "10:00", dailyEnd: "12:00", weekdays: [1, 2, 3], blackoutDates: ["2026-11-03"] });
  const slots = generateSlotTimes(window, policy);
  assert.equal(slots.length, 8, "Monday and Wednesday, four 30-minute slots each");
  assert.equal(slots[0].startsAt.toISOString(), "2026-11-02T04:30:00.000Z", "10:00 IST");
  assert.equal(slots.at(-1).endsAt.toISOString(), "2026-11-04T06:30:00.000Z", "12:00 IST");
  assert.equal(generateSlotTimes(window, policy, new Date("2026-11-02T05:00:00Z")).length, 6, "past slots are not generated");
  const wide = { opensAt: parseIstInstant("2026-11-02T00:00:00+05:30"), closesAt: parseIstInstant("2027-02-28T00:00:00+05:30") };
  const dense = normalizeSlotPolicy({ mode: "slots", slotMinutes: 15, capacityPerSlot: 1, dailyStart: "00:00", dailyEnd: "23:45", weekdays: [0, 1, 2, 3, 4, 5, 6] });
  assert.throws(() => generateSlotTimes(wide, dense), (error) => error.details?.code === "TOO_MANY_SLOTS");
  assert.throws(() => normalizeSlotPolicy({ mode: "slots", slotMinutes: 10, capacityPerSlot: 1, dailyStart: "10:00", dailyEnd: "11:00" }), /15 to 120/);
  assert.throws(() => normalizeSlotPolicy({ mode: "slots", slotMinutes: 60, capacityPerSlot: 201, dailyStart: "10:00", dailyEnd: "11:00" }), /1 to 200/);
  assert.throws(() => normalizeSlotPolicy({ mode: "slots", slotMinutes: 60, capacityPerSlot: 2, dailyStart: "10:00", dailyEnd: "10:30" }), /fit at least one slot/);
  assert.throws(() => normalizeSlotPolicy({ mode: "slots", slotMinutes: 60, capacityPerSlot: 2, dailyStart: "10:00", dailyEnd: "12:00", blackoutDates: ["2026-02-30"] }), /YYYY-MM-DD/);
});

test("a filtered cohort matches case-insensitively and exactly, and skips assessment-only or inactive users", async (t) => {
  if (skip(t)) return;
  const interview = await published();
  const [upper] = await students(1, { branch: "CSE" });
  const [lower] = await students(1, { branch: "cse" });
  await students(1, { branch: "CSE-AI" });
  await students(1, { branch: "CSE", accessScope: "assessment_only" });
  await students(1, { branch: "CSE", isActive: false });
  await students(1, { branch: "CSE", role: "coordinator" });
  const result = await scheduling.createAssignment(admin, {
    interviewId: String(interview._id), audience: { source: "filters", filters: { branch: "Cse", semester: "5" } }, window: WINDOW,
  });
  assert.equal(result.created, true);
  assert.equal(result.assignment.status, "scheduled");
  assert.equal(result.assignment.audience.studentCount, 2);
  assert.deepEqual(result.assignment.audience.filters, { branch: "Cse", semester: 5 });
  assert.equal(result.assignment.snapshotRevision, 3);
  assert.equal(result.assignment.title, "Backend round", "the published title, not the draft");
  assert.equal(result.assignment.mode, "mock");
  assert.deepEqual(result.assignment.bookingPolicy, { rescheduleLimit: 2, cutoffMinutes: 60, earlyJoinMinutes: 10, lateGraceMinutes: 10, attemptsAllowed: 1 });
  assert.equal(result.assignment.reportVisibility, "after_close");
  assert.equal(result.assignment.snapshotData, undefined, "the pinned snapshot never leaves the server");
  const stored = await AnviAssignment.findById(result.assignment.id).lean();
  assert.equal(stored.snapshotData.secretKeyPoint, "pinned");
  const targets = await AnviAssignmentTarget.find({ assignmentId: stored._id }).lean();
  assert.deepEqual(targets.map((row) => String(row.studentId)).sort(), [String(upper._id), String(lower._id)].sort());
  assert.ok(targets.every((row) => row.notifiedAt && row.outcome === "pending" && row.source === "filters"));
  assert.equal(events[0].event, "assigned");
  assert.equal(events[0].recipients.length, 2);

  await rejectsWith(scheduling.createAssignment(admin, { interviewId: String(interview._id), audience: { source: "filters", filters: {} }, window: WINDOW }), "COHORT_FILTER_REQUIRED");
  await rejectsWith(scheduling.createAssignment(admin, { interviewId: String(interview._id), audience: { source: "filters", filters: { branch: "ECE" } }, window: WINDOW }), "COHORT_EMPTY");
});

test("creation validates the interview, window and students, and an Idempotency-Key returns the first assignment", async (t) => {
  if (skip(t)) return;
  const interview = await published();
  const draft = await AIInterview.create({ ownerId: admin._id, creationKey: crypto.randomUUID(), title: "Draft", data: { title: "Draft" } });
  const cohort = await students(2);
  const [blocked] = await students(1, { accessScope: "assessment_only" });
  const body = { interviewId: String(interview._id), audience: { source: "selected", studentIds: ids(cohort) }, window: WINDOW };
  await rejectsWith(scheduling.createAssignment(admin, { ...body, interviewId: String(draft._id) }), "INTERVIEW_NOT_PUBLISHED");
  await rejectsWith(scheduling.createAssignment(otherAdmin, body), "INTERVIEW_NOT_FOUND");
  await rejectsWith(scheduling.createAssignment(admin, { ...body, window: { opensAt: "2026-11-02T09:00:00", closesAt: "2026-11-04T18:00:00" } }), "INVALID_DATETIME");
  await rejectsWith(scheduling.createAssignment(admin, { ...body, window: { opensAt: "2026-10-01T09:00:00+05:30", closesAt: "2026-10-02T18:00:00+05:30" } }), "INVALID_WINDOW");
  await rejectsWith(scheduling.createAssignment(admin, { ...body, audience: { source: "selected", studentIds: [...ids(cohort), String(blocked._id)] } }), "INVALID_STUDENTS");
  await rejectsWith(scheduling.createAssignment(admin, { ...body, bookingPolicy: { attemptsAllowed: 0 } }), "INVALID_POLICY");
  await rejectsWith(scheduling.createAssignment(admin, { ...body, slotPolicy: { mode: "slots", slotMinutes: 30, capacityPerSlot: 2, dailyStart: "10:00", dailyEnd: "11:00", weekdays: [6] } }), "NO_SLOTS");
  assert.equal(await AnviAssignment.countDocuments(), 0, "failed validation writes nothing");

  const preview = await scheduling.createAssignment(admin, { ...body, slotPolicy: oneSlot(1), dryRun: true });
  assert.deepEqual(preview.preview.studentCount, 2);
  assert.equal(preview.preview.slotCount, 1);
  assert.equal(preview.warnings[0].code, "CAPACITY_BELOW_COHORT");
  assert.equal(await AnviAssignment.countDocuments(), 0, "a dry run writes nothing");

  const first = await scheduling.createAssignment(admin, body, { creationKey: "key-1" });
  const again = await scheduling.createAssignment(admin, body, { creationKey: "key-1" });
  assert.equal(again.created, false);
  assert.equal(again.assignment.id, first.assignment.id);
  assert.equal(await AnviAssignmentTarget.countDocuments(), 2);
  clock.t = Date.parse("2026-11-02T05:00:00Z");
  // While the first schedule is open, a second one never assigns the same students again: reject or skip only.
  await rejectsWith(scheduling.createAssignment(admin, body), "ALREADY_ASSIGNED");
  await rejectsWith(scheduling.createAssignment(admin, { ...body, duplicates: "skip" }), "ALREADY_ASSIGNED");
  await rejectsWith(scheduling.createAssignment(admin, { ...body, duplicates: "allow" }), "INVALID_FIELD");
  assert.equal(await AnviAssignmentTarget.countDocuments(), 2, "nobody was assigned twice");
  const newcomers = await students(1);
  const open = await scheduling.createAssignment(admin, { ...body, audience: { source: "selected", studentIds: [...ids(cohort), ...ids(newcomers)] }, duplicates: "skip" });
  assert.equal(open.assignment.status, "open", "a window that already opened starts open");
  assert.equal(open.assignment.audience.studentCount, 1, "skip assigns only the student who had no active schedule of this interview");
  // Once the earlier schedules are closed, the same students may be assigned the interview again.
  await scheduling.transitionAssignment(admin, first.assignment.id, "close");
  await scheduling.transitionAssignment(admin, open.assignment.id, "close");
  const reassigned = await scheduling.createAssignment(admin, body);
  assert.equal(reassigned.assignment.audience.studentCount, 2, "a closed schedule no longer blocks");
});

test("50 parallel bookings never exceed the slot capacity", async (t) => {
  if (skip(t)) return;
  const cohort = await students(50);
  const { assignment, slots } = await slotsAssignment(cohort, { slotPolicy: oneSlot(5) });
  assert.equal(slots.length, 1);
  const results = await Promise.allSettled(cohort.map((student) => scheduling.bookSlot(student, assignment.id, String(slots[0]._id))));
  const won = results.filter((row) => row.status === "fulfilled");
  assert.equal(won.length, 5);
  assert.ok(results.filter((row) => row.status === "rejected").every((row) => row.reason.details?.code === "SLOT_FULL"));
  const slot = await AnviSlot.findById(slots[0]._id).lean();
  assert.equal(slot.bookedCount, 5);
  assert.equal(await AnviBooking.countDocuments({ active: true }), 5);
  assert.equal(await AnviAssignmentTarget.countDocuments({ outcome: "booked" }), 5);
});

test("parallel bookings by one student keep one booking and give back every other seat", async (t) => {
  if (skip(t)) return;
  const [student] = await students(1);
  const { assignment, slots } = await slotsAssignment([student], { slotPolicy: { ...oneSlot(10), dailyEnd: "11:30" } });
  const results = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => scheduling.bookSlot(student, assignment.id, String(slots[index % slots.length]._id))));
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  assert.ok(results.filter((row) => row.status === "rejected").every((row) => row.reason.details?.code === "ALREADY_BOOKED"));
  const seats = (await AnviSlot.find({ assignmentId: assignment.id }).lean()).reduce((sum, row) => sum + row.bookedCount, 0);
  assert.equal(seats, 1, "compensation released every losing claim");
  assert.equal(await AnviBooking.countDocuments({ active: true }), 1);
});

test("reschedule books the new seat first, enforces the limit and the cutoff, and cancel releases the seat", async (t) => {
  if (skip(t)) return;
  const [student, other] = await students(2);
  const { assignment, slots } = await slotsAssignment([student, other], {
    slotPolicy: { mode: "slots", slotMinutes: 30, capacityPerSlot: 1, dailyStart: "10:00", dailyEnd: "12:00", weekdays: [1] },
    bookingPolicy: { rescheduleLimit: 1 },
  });
  const [a, b, c, d] = slots.map((slot) => String(slot._id));
  const { booking } = await scheduling.bookSlot(student, assignment.id, a);
  assert.equal(booking.rescheduleLeft, 1);
  await scheduling.bookSlot(other, assignment.id, c);
  await rejectsWith(scheduling.bookSlot(student, assignment.id, b), "ALREADY_BOOKED");
  await rejectsWith(scheduling.rescheduleBooking(student, booking.id, c), "SLOT_FULL");
  let seats = Object.fromEntries((await AnviSlot.find({ assignmentId: assignment.id }).lean()).map((row) => [String(row._id), row.bookedCount]));
  assert.deepEqual([seats[a], seats[b], seats[c]], [1, 0, 1], "a failed reschedule changes nothing");
  const moved = await scheduling.rescheduleBooking(student, booking.id, b);
  assert.equal(moved.booking.slotId, b);
  assert.equal(moved.booking.rescheduleCount, 1);
  assert.equal(moved.booking.rescheduleLeft, 0);
  seats = Object.fromEntries((await AnviSlot.find({ assignmentId: assignment.id }).lean()).map((row) => [String(row._id), row.bookedCount]));
  assert.deepEqual([seats[a], seats[b]], [0, 1]);
  await rejectsWith(scheduling.rescheduleBooking(student, booking.id, d), "RESCHEDULE_LIMIT");
  await rejectsWith(scheduling.rescheduleBooking(other, booking.id, d), "BOOKING_NOT_FOUND");
  await rejectsWith(scheduling.cancelBooking(other, booking.id), "BOOKING_NOT_FOUND");
  const stored = await AnviBooking.findById(booking.id).lean();
  assert.deepEqual(stored.history.map((row) => row.action), ["booked", "rescheduled"]);

  // Inside the cutoff (60 minutes before 10:30 IST) nothing can change.
  clock.t = Date.parse("2026-11-02T04:31:00Z");
  await rejectsWith(scheduling.cancelBooking(student, booking.id), "BOOKING_CUTOFF");
  await rejectsWith(scheduling.bookSlot(other, assignment.id, a), "ALREADY_BOOKED");
  clock.t = SUNDAY;
  const cancelled = await scheduling.cancelBooking(student, booking.id);
  assert.equal(cancelled.booking.status, "cancelled");
  assert.equal((await AnviSlot.findById(b).lean()).bookedCount, 0);
  assert.equal((await AnviAssignmentTarget.findOne({ studentId: student._id }).lean()).outcome, "pending");
  assert.deepEqual(events.filter((row) => row.event !== "assigned").map((row) => row.event), ["booked", "booked", "rescheduled", "cancelled"]);
  // Cancel and book again counts as a change: with the one allowed reschedule used, it is refused, so
  // the limit cannot be bypassed. The other student (no changes used) may cancel and book again.
  await rejectsWith(scheduling.bookSlot(student, assignment.id, d), "RESCHEDULE_LIMIT");
  const otherBooking = (await AnviBooking.findOne({ studentId: other._id, active: true }).lean())._id;
  await scheduling.cancelBooking(other, String(otherBooking));
  const rebooked = await scheduling.bookSlot(other, assignment.id, d);
  assert.equal(rebooked.booking.rescheduleLeft, 0, "the cancel used the one change");
  await scheduling.cancelBooking(other, rebooked.booking.id);
  await rejectsWith(scheduling.bookSlot(other, assignment.id, d), "RESCHEDULE_LIMIT");
  // A slot inside the cutoff is refused.
  clock.t = Date.parse("2026-11-02T04:31:00Z");
  await AnviBooking.deleteMany({ studentId: student._id, status: "cancelled" });
  await rejectsWith(scheduling.bookSlot(student, assignment.id, b), "BOOKING_CUTOFF");
  const open = await scheduling.listOpenSlots(student, assignment.id);
  assert.deepEqual(open.slots.map((slot) => [slot.id, slot.bookable]), [[b, false], [c, false], [d, true]], "past slots are hidden");
});

test("checkAssignedStart is the single start rule for window and slot assignments", async (t) => {
  if (skip(t)) return;
  const [student, stranger] = await students(2);
  const interview = await published();
  const { assignment: windowed } = await scheduling.createAssignment(admin, {
    interviewId: String(interview._id), audience: { source: "selected", studentIds: [String(student._id)] }, window: WINDOW,
  });
  let check = await scheduling.checkAssignedStart(student, windowed.id);
  assert.equal(check.code, "NOT_YET_OPEN");
  assert.equal(check.ok, false);
  assert.equal((await scheduling.checkAssignedStart(stranger, windowed.id)).code, "NOT_ASSIGNED");
  assert.equal((await scheduling.checkAssignedStart(student, "nope")).code, "INVALID_IDENTIFIER");
  clock.t = Date.parse("2026-11-02T04:00:00Z");
  check = await scheduling.checkAssignedStart(student, windowed.id);
  assert.equal(check.ok, true, "inside the window before the sweeper flips the status");
  assert.equal(check.hardDeadlineCap.toISOString(), "2026-11-04T12:30:00.000Z");
  assert.equal(check.assignment.snapshotData.secretKeyPoint, "pinned", "the start uses the pinned snapshot");
  await scheduling.transitionAssignment(admin, windowed.id, "pause");
  assert.equal((await scheduling.checkAssignedStart(student, windowed.id)).code, "ASSIGNMENT_PAUSED");
  await scheduling.transitionAssignment(admin, windowed.id, "resume");
  clock.t = Date.parse("2026-11-04T12:26:00Z");
  assert.equal((await scheduling.checkAssignedStart(student, windowed.id)).code, "WINDOW_CLOSED", "no new start in the last five minutes");

  clock.t = SUNDAY;
  const { assignment, slots } = await slotsAssignment([student], { slotPolicy: oneSlot(2) });
  assert.equal((await scheduling.checkAssignedStart(student, assignment.id)).code, "NO_BOOKING");
  await scheduling.bookSlot(student, assignment.id, String(slots[0]._id));
  clock.t = Date.parse("2026-11-02T04:19:00Z");
  assert.equal((await scheduling.checkAssignedStart(student, assignment.id)).code, "TOO_EARLY");
  clock.t = Date.parse("2026-11-02T04:20:00Z");
  check = await scheduling.checkAssignedStart(student, assignment.id);
  assert.equal(check.ok, true, "ten minutes early");
  assert.equal(check.hardDeadlineCap.toISOString(), "2026-11-02T05:10:00.000Z", "slot end plus late grace");
  const attempt = await AnviAttempt.create({
    studentId: student._id, interviewId: assignment.interviewId, snapshotRevision: 3, mode: "mock",
    assignmentId: assignment.id, bookingId: check.booking._id, hardDeadline: check.hardDeadlineCap,
  });
  assert.equal(await scheduling.recordAssignedAttempt({ ...check, attempt }), true);
  assert.equal(await scheduling.recordAssignedAttempt({ ...check, attempt }), false, "the attempt limit holds under a race");
  const target = await AnviAssignmentTarget.findOne({ assignmentId: assignment.id, studentId: student._id }).lean();
  assert.equal(target.attemptsUsed, 1);
  assert.equal(target.outcome, "in_progress");
  const resume = await scheduling.checkAssignedStart(student, assignment.id);
  assert.equal(resume.code, "RESUME");
  assert.equal(resume.activeAttemptId, String(attempt._id));
  const listed = (await scheduling.listStudentAssignments(student)).find((row) => row.assignmentId === assignment.id);
  assert.equal(listed.resume, true);
  // The booking step and lobby read the resume step and the terms from the pinned snapshot.
  assert.deepEqual(listed.resumeSetup, { mode: listed.requiresResume ? "required" : "none", sources: ["builder", "upload"], questionCount: 2, provided: false, source: null, providedAt: null });
  assert.deepEqual(listed.terms, { text: "", required: false });
  // ...and the proctoring step (off unless the pinned snapshot turns it on).
  assert.equal(listed.proctoring.enabled, false);
  await AnviAssignment.updateOne({ _id: assignment.id }, { $set: { "snapshotData.anvi.proctoring": { enabled: true, fullscreen: "required", maxViolations: 4 } } });
  const proctored = (await scheduling.listStudentAssignments(student)).find((row) => row.assignmentId === assignment.id);
  assert.deepEqual([proctored.proctoring.enabled, proctored.proctoring.fullscreen, proctored.proctoring.maxViolations, proctored.proctoring.ai.enabled], [true, "required", 4, false]);

  await AnviAttempt.updateOne({ _id: attempt._id }, { $set: { status: "completed", endedAt: new Date(clock.t) } });
  assert.equal(await scheduling.onAttemptFinalized({ _id: attempt._id }), true);
  assert.equal(await scheduling.onAttemptFinalized({ _id: new mongoose.Types.ObjectId(), assignmentId: null }), false, "practice attempts are ignored");
  assert.equal((await AnviAssignmentTarget.findById(target._id).lean()).outcome, "completed");
  const booking = await AnviBooking.findById(check.booking._id).lean();
  assert.equal(booking.status, "completed");
  assert.equal(booking.active, false);
  assert.equal((await scheduling.checkAssignedStart(student, assignment.id)).code, "ATTEMPTS_EXHAUSTED");
  clock.t = Date.parse("2026-11-02T05:00:01Z");
  const late = evaluateStart({ assignment: { ...check.assignment, status: "open" }, target: { status: "assigned", attemptsUsed: 0 }, booking: check.booking, at: new Date(clock.t) });
  assert.equal(late.code, "JOIN_WINDOW_PASSED");
});

test("an abandoned attempt with attempts left lets the student try again", async (t) => {
  if (skip(t)) return;
  const [student] = await students(1);
  const interview = await published();
  clock.t = Date.parse("2026-11-02T04:00:00Z");
  const { assignment } = await scheduling.createAssignment(admin, {
    interviewId: String(interview._id), audience: { source: "selected", studentIds: [String(student._id)] }, window: WINDOW, bookingPolicy: { attemptsAllowed: 2 },
  });
  const check = await scheduling.checkAssignedStart(student, assignment.id);
  const attempt = await AnviAttempt.create({ studentId: student._id, interviewId: interview._id, snapshotRevision: 3, mode: "mock", assignmentId: assignment.id, hardDeadline: check.hardDeadlineCap });
  await scheduling.recordAssignedAttempt({ ...check, attempt });
  await AnviAttempt.updateOne({ _id: attempt._id }, { $set: { status: "abandoned", partial: true } });
  await scheduling.onAttemptFinalized(attempt._id);
  const target = await AnviAssignmentTarget.findOne({ studentId: student._id }).lean();
  assert.equal(target.outcome, "pending");
  assert.equal(target.partial, true);
  assert.equal((await scheduling.checkAssignedStart(student, assignment.id)).ok, true);
});

test("practice blocking, the authoring guard and report visibility follow the assignment", async (t) => {
  if (skip(t)) return;
  const [student] = await students(1);
  const interview = await published();
  const free = await published();
  const { assignment } = await scheduling.createAssignment(admin, {
    interviewId: String(interview._id), audience: { source: "selected", studentIds: [String(student._id)] }, window: WINDOW,
  });
  assert.equal(await scheduling.practiceBlocked(String(interview._id)), true);
  assert.equal(await scheduling.practiceBlocked(String(free._id)), false);
  assert.equal(await scheduling.practiceBlocked("bad"), false);
  assert.deepEqual([...await scheduling.practiceBlockedIds([String(interview._id), String(free._id)])], [String(interview._id)]);
  assert.deepEqual(await scheduling.activeAssignmentFor(String(interview._id)), {
    id: assignment.id, title: "Backend round", status: "scheduled", window: (await AnviAssignment.findById(assignment.id).lean()).window,
  });

  const attempt = { assignmentId: new mongoose.Types.ObjectId(assignment.id) };
  assert.equal(await scheduling.visibilityForAttempt(attempt), null, "after_close hides the report while open");
  assert.ok((await scheduling.visibilityForAttempt({ assignmentId: null })) instanceof Date, "practice reports are visible at once");
  const ready = await AnviAttempt.create({
    studentId: student._id, interviewId: interview._id, snapshotRevision: 3, mode: "mock", assignmentId: assignment.id, status: "ready", hardDeadline: new Date(),
  });
  // Close is refused before the window opens (nobody could have taken it yet); cancel is the way out there.
  await rejectsWith(scheduling.transitionAssignment(admin, assignment.id, "close"), "NOT_YET_OPEN");
  clock.t = Date.parse("2026-11-02T04:00:00Z");
  await scheduling.transitionAssignment(admin, assignment.id, "close");
  assert.ok((await scheduling.visibilityForAttempt(attempt)) instanceof Date);
  assert.ok((await AnviAttempt.findById(ready._id).lean()).visibleToStudentAt, "closing releases after_close reports");
  assert.ok(events.some((row) => row.event === "released" && sameIds(row.recipients, [student._id])));
  assert.equal(await scheduling.practiceBlocked(String(interview._id)), false);
  assert.equal(await scheduling.activeAssignmentFor(String(interview._id)), null);

  const { assignment: manual } = await scheduling.createAssignment(admin, {
    interviewId: String(free._id), audience: { source: "selected", studentIds: [String(student._id)] }, window: WINDOW, reportVisibility: "manual", blockPractice: false,
  });
  assert.equal(await scheduling.practiceBlocked(String(free._id)), false, "blockPractice:false leaves practice open");
  const manualAttempt = { assignmentId: new mongoose.Types.ObjectId(manual.id) };
  await scheduling.transitionAssignment(admin, manual.id, "close");
  assert.equal(await scheduling.visibilityForAttempt(manualAttempt), null, "manual stays hidden after close");
  const released = await scheduling.transitionAssignment(admin, manual.id, "release");
  assert.ok(released.assignment.releasedAt);
  assert.ok((await scheduling.visibilityForAttempt(manualAttempt)) instanceof Date);
});
const sameIds = (recipients, expected) => recipients.map((row) => String(row.studentId)).sort().join() === expected.map(String).sort().join();

test("transitions follow the lifecycle and repeat harmlessly", async (t) => {
  if (skip(t)) return;
  const cohort = await students(3);
  const { assignment, slots } = await slotsAssignment(cohort, { slotPolicy: { ...oneSlot(3), dailyEnd: "11:00" } });
  await scheduling.bookSlot(cohort[0], assignment.id, String(slots[0]._id));
  await rejectsWith(scheduling.transitionAssignment(admin, assignment.id, "archive"), "INVALID_TRANSITION");
  await rejectsWith(scheduling.transitionAssignment(otherAdmin, assignment.id, "pause"), "ASSIGNMENT_NOT_FOUND");
  const paused = await scheduling.transitionAssignment(admin, assignment.id, "pause");
  assert.equal(paused.assignment.status, "paused");
  assert.equal((await scheduling.transitionAssignment(admin, assignment.id, "pause")).assignment.status, "paused");
  await rejectsWith(scheduling.bookSlot(cohort[1], assignment.id, String(slots[0]._id)), "ASSIGNMENT_PAUSED");
  assert.equal((await scheduling.transitionAssignment(admin, assignment.id, "resume")).assignment.status, "scheduled");
  const cancelled = await scheduling.transitionAssignment(admin, assignment.id, "cancel");
  assert.equal(cancelled.assignment.status, "cancelled");
  assert.equal(await AnviBooking.countDocuments({ active: true }), 0);
  assert.equal(await AnviAssignmentTarget.countDocuments({ outcome: "cancelled" }), 3);
  assert.ok(events.some((row) => row.event === "assignment_cancelled" && row.recipients.length === 3));
  await rejectsWith(scheduling.transitionAssignment(admin, assignment.id, "resume"), "INVALID_TRANSITION");
  assert.equal((await scheduling.transitionAssignment(admin, assignment.id, "archive")).assignment.status, "archived");
  await rejectsWith(scheduling.updateAssignment(admin, assignment.id, { notes: "x" }, 99), "ASSIGNMENT_LOCKED");
});

test("editing the window withdraws slots: their bookings need a new slot that does not use up the limit", async (t) => {
  if (skip(t)) return;
  const [student, other] = await students(2);
  const policy = { mode: "slots", slotMinutes: 30, capacityPerSlot: 2, dailyStart: "10:00", dailyEnd: "11:00", weekdays: [1, 3] };
  const { assignment, slots } = await slotsAssignment([student, other], { slotPolicy: policy, bookingPolicy: { rescheduleLimit: 0 } });
  assert.equal(slots.length, 4);
  const wednesday = slots.find((slot) => slot.startsAt.toISOString().startsWith("2026-11-04"));
  const { booking } = await scheduling.bookSlot(student, assignment.id, String(wednesday._id));
  const current = await AnviAssignment.findById(assignment.id).lean();
  await rejectsWith(scheduling.updateAssignment(admin, assignment.id, { notes: "x" }, current.revision - 1), "REVISION_CONFLICT");
  await rejectsWith(scheduling.updateAssignment(admin, assignment.id, { window: { opensAt: "2026-11-02T09:00:00+05:30", closesAt: "2026-11-03T18:00" } }, current.revision), "INVALID_DATETIME");
  const edited = await scheduling.updateAssignment(admin, assignment.id, {
    window: { opensAt: "2026-11-02T09:00:00+05:30", closesAt: "2026-11-03T18:00:00+05:30" }, slotPolicy: { ...policy, capacityPerSlot: 3 },
  }, current.revision);
  assert.equal(edited.assignment.revision, current.revision + 1);
  assert.deepEqual(edited.affected, { needsReschedule: 1, cancelled: 0 });
  const open = await AnviSlot.find({ assignmentId: assignment.id, status: "open" }).sort({ startsAt: 1 }).lean();
  assert.equal(open.length, 2);
  assert.ok(open.every((slot) => slot.capacity === 3));
  const waiting = await AnviBooking.findById(booking.id).lean();
  assert.equal(waiting.status, "needs_reschedule");
  assert.equal(waiting.slotId, null);
  assert.ok(events.some((row) => row.event === "needs_reschedule"));
  assert.equal((await scheduling.checkAssignedStart(student, assignment.id)).code, "NEEDS_RESCHEDULE");
  const rebooked = await scheduling.bookSlot(student, assignment.id, String(open[0]._id));
  assert.equal(rebooked.booking.id, booking.id, "the same booking (and calendar entry) moves");
  assert.equal(rebooked.booking.status, "booked");
  assert.equal(rebooked.booking.rescheduleCount, 1);
  assert.equal((await AnviSlot.findById(open[0]._id).lean()).bookedCount, 1);

  const switched = await scheduling.updateAssignment(admin, assignment.id, { slotPolicy: { mode: "window" } }, edited.assignment.revision);
  assert.equal(switched.assignment.slotMode, "window");
  assert.equal(switched.affected.cancelled, 1);
  assert.equal(await AnviBooking.countDocuments({ active: true }), 0);
});

test("adding and removing students keeps the roster, cap and bookings consistent", async (t) => {
  if (skip(t)) return;
  const cohort = await students(2);
  const extra = await students(2);
  const { assignment, slots } = await slotsAssignment(cohort, { slotPolicy: oneSlot(5) });
  const { booking } = await scheduling.bookSlot(cohort[0], assignment.id, String(slots[0]._id));
  const added = await scheduling.addTargets(admin, assignment.id, { studentIds: [...ids(extra), String(cohort[1]._id)] });
  assert.equal(added.added, 2);
  assert.equal(added.alreadyAssigned, 1);
  assert.equal(added.assignment.audience.studentCount, 4);
  const removed = await scheduling.removeTargets(admin, assignment.id, [String(cohort[0]._id)]);
  assert.equal(removed.removed, 1);
  assert.equal(removed.assignment.audience.studentCount, 3);
  const cancelled = await AnviBooking.findById(booking.id).lean();
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancelledBy, "admin");
  assert.equal((await AnviSlot.findById(slots[0]._id).lean()).bookedCount, 0);
  await rejectsWith(scheduling.listOpenSlots(cohort[0], assignment.id), "ASSIGNMENT_NOT_FOUND");
  await rejectsWith(scheduling.removeTargets(admin, assignment.id, [String(cohort[0]._id)]), "TARGET_NOT_FOUND");
  const back = await scheduling.addTargets(admin, assignment.id, { studentIds: [String(cohort[0]._id)] });
  assert.equal(back.added, 1);
  assert.equal((await AnviAssignmentTarget.findOne({ studentId: cohort[0]._id }).lean()).outcome, "pending");
  const detail = await scheduling.getAssignmentDetail(admin, assignment.id, { search: extra[1].studentId.toLowerCase() });
  assert.equal(detail.roster.length, 1);
  assert.equal(detail.roster[0].studentCode, extra[1].studentId);
  assert.equal((await scheduling.getAssignmentDetail(admin, assignment.id, { status: "removed" })).roster.length, 0);
  assert.equal((await scheduling.getAssignmentDetail(admin, assignment.id, { outcome: "pending" })).roster.length, 4);
  assert.equal(detail.kpis.assigned, 4);
  assert.equal(detail.slots.count, 1);
});

test("admins move and cancel bookings without the student limits but within capacity", async (t) => {
  if (skip(t)) return;
  const [student, other] = await students(2);
  const { assignment, slots } = await slotsAssignment([student, other], { slotPolicy: { ...oneSlot(1), dailyEnd: "11:30" }, bookingPolicy: { rescheduleLimit: 0 } });
  const { booking } = await scheduling.bookSlot(student, assignment.id, String(slots[0]._id));
  await scheduling.bookSlot(other, assignment.id, String(slots[1]._id));
  await rejectsWith(scheduling.adminMoveBooking(admin, booking.id, String(slots[1]._id)), "SLOT_FULL");
  await rejectsWith(scheduling.adminMoveBooking(otherAdmin, booking.id, String(slots[2]._id)), "BOOKING_NOT_FOUND");
  clock.t = Date.parse("2026-11-02T04:20:00Z");
  const moved = await scheduling.adminMoveBooking(admin, booking.id, String(slots[2]._id));
  assert.equal(moved.booking.slotId, String(slots[2]._id), "inside the student cutoff the admin can still move it");
  assert.equal(moved.booking.rescheduleLeft, 0);
  assert.ok(events.some((row) => row.event === "rescheduled" && row.by === "admin"));
  const cancelled = await scheduling.adminCancelBooking(admin, booking.id, { reason: "Clash with exam" });
  assert.equal(cancelled.booking.status, "cancelled");
  assert.equal((await AnviBooking.findById(booking.id).lean()).cancelReason, "Clash with exam");
  assert.deepEqual((await AnviSlot.find({ assignmentId: assignment.id }).sort({ startsAt: 1 }).lean()).map((row) => row.bookedCount), [0, 1, 0]);
});

test("the student list shows booking state, join window and the start verdict", async (t) => {
  if (skip(t)) return;
  const [student] = await students(1);
  const { assignment, slots } = await slotsAssignment([student]);
  let [item] = await scheduling.listStudentAssignments(student);
  assert.equal(item.assignmentId, assignment.id);
  assert.equal(item.slotMode, "slots");
  assert.equal(item.booking, null);
  assert.equal(item.joinWindow, null);
  assert.equal(item.canStart, false);
  assert.equal(item.startBlockedReason, "NO_BOOKING", "booking comes first: it is what the student can act on");
  await scheduling.bookSlot(student, assignment.id, String(slots[0]._id));
  clock.t = Date.parse("2026-11-02T04:25:00Z");
  [item] = await scheduling.listStudentAssignments(student);
  assert.equal(item.booking.status, "booked");
  assert.equal(item.booking.rescheduleLeft, 2);
  assert.equal(item.booking.canChange, false, "inside the cutoff");
  assert.equal(new Date(item.joinWindow.from).toISOString(), "2026-11-02T04:20:00.000Z");
  assert.equal(new Date(item.joinWindow.to).toISOString(), "2026-11-02T04:40:00.000Z");
  assert.equal(item.canStart, true);
  assert.equal(item.outcome, "booked");
  assert.equal(item.reportVisible, false);
});

test("calendar files escape text, fold long lines and keep a stable UID", () => {
  assert.equal(escapeIcsText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
  const long = `SUMMARY:${"Ω".repeat(80)}`;
  const folded = foldIcsLine(long);
  assert.ok(folded.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75));
  assert.equal(folded.replace(/\r\n /g, ""), long, "unfolding restores the line");
  const booking = { _id: "65f000000000000000000001", startsAt: new Date("2026-11-02T04:30:00Z"), endsAt: new Date("2026-11-02T05:00:00Z"), status: "booked", rescheduleCount: 2 };
  const ics = buildAnviBookingIcs({ booking, assignment: { title: "Backend, round; one", role: "SDE" }, now: new Date("2026-11-01T00:00:00Z") });
  assert.ok(ics.endsWith("\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "CRLF line endings only");
  assert.match(ics, /UID:anvi-booking-65f000000000000000000001@peerprep/);
  assert.match(ics, /SEQUENCE:2/);
  assert.match(ics, /DTSTART:20261102T043000Z/);
  assert.match(ics, /SUMMARY:Backend\\, round\\; one \(ANVI\)/);
  assert.match(ics, /STATUS:CONFIRMED/);
  assert.match(buildAnviBookingIcs({ booking: { ...booking, status: "cancelled" }, assignment: { title: "x" } }), /STATUS:CANCELLED/);
});

test("notification keys include the booking and slot start, and emails escape titles", async () => {
  const assignment = {
    _id: "65f0000000000000000000aa", title: "<script>alert(1)</script>", role: "SDE", slotPolicy: { mode: "slots" }, bookingPolicy: { earlyJoinMinutes: 10 },
    window: { opensAt: new Date("2026-11-02T03:30:00Z"), closesAt: new Date("2026-11-04T12:30:00Z") },
  };
  const booking = { _id: "65f0000000000000000000bb", startsAt: new Date("2026-11-02T04:30:00Z") };
  const note = describeEvent("reminder", { assignment, booking, label: "1h", studentId: "s1" });
  assert.equal(note.dedupeKey, "anvi-reminder-1h:65f0000000000000000000bb:r0:2026-11-02T04:30:00.000Z");
  assert.match(note.message, /10:00 am IST/i);
  const moved = describeEvent("rescheduled", { assignment, booking: { ...booking, startsAt: new Date("2026-11-02T05:00:00Z") }, studentId: "s1" });
  assert.notEqual(moved.dedupeKey, describeEvent("rescheduled", { assignment, booking, studentId: "s1" }).dedupeKey, "a new slot notifies again");
  // A -> B (count 1), B -> A (count 2), A -> B again (count 3): the third move is a new notice, not a duplicate of the first.
  const atB = { ...booking, startsAt: new Date("2026-11-02T05:00:00Z") };
  assert.notEqual(
    describeEvent("rescheduled", { assignment, booking: { ...atB, rescheduleCount: 1 }, studentId: "s1" }).dedupeKey,
    describeEvent("rescheduled", { assignment, booking: { ...atB, rescheduleCount: 3 }, studentId: "s1" }).dedupeKey,
  );
  const email = buildEmail({ title: note.title, message: note.message, assignment, booking });
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /&lt;script&gt;/);

  const sent = [];
  const queued = [];
  const notifier = createSchedulingNotifier({
    notify: async (row) => { sent.push(row); return true; },
    enqueue: async (jobs) => { queued.push(...jobs); return { queued: jobs.length }; },
    findUsers: async () => [{ _id: "u1", email: "u1@example.com" }],
    log: { warn() {} },
  });
  await notifier.send("booked", { assignment, recipients: [{ studentId: "u1", booking }] });
  await notifier.send("reminder", { assignment, recipients: [{ studentId: "u1", booking }], label: "10m" });
  assert.equal(sent.length, 2);
  assert.equal(sent[0].type, "AI_INTERVIEW");
  assert.equal(sent[0].actionUrl, "/student/ai-interviews");
  assert.equal(queued.length, 1, "the 10-minute reminder is in-app only");
  assert.equal(queued[0].type, "anvi_interview");
  assert.equal(queued[0].idempotencyKey, "anvi:anvi-booked:65f0000000000000000000bb:r0:2026-11-02T04:30:00.000Z:u1");
  assert.deepEqual(Object.keys(queued[0].payload).sort(), ["html", "subject", "to"]);
  const failing = createSchedulingNotifier({ notify: async () => { throw new Error("down"); }, enqueue: async () => { throw new Error("down"); }, findUsers: async () => [{ _id: "u1", email: "x@y.z" }], log: { warn() {} } });
  assert.deepEqual(await failing.send("booked", { assignment, recipients: [{ studentId: "u1", booking }] }), { notified: 0, emailed: 0 }, "never throws");
});

// Temporarily wraps a model method (through the tenant proxy) and always restores it.
async function withWrapped(model, name, wrap, work) {
  const original = model[name];
  model[name] = wrap(original);
  try { return await work(); } finally { model[name] = original; }
}
const readyAttempt = (student, assignment) => AnviAttempt.create({
  studentId: student._id, interviewId: assignment.interviewId, snapshotRevision: 3, mode: "mock", assignmentId: assignment.id, status: "ready", hardDeadline: new Date(),
});

test("reports of a cancelled manual assignment can still be released, and a switch to immediate releases scored reports", async (t) => {
  if (skip(t)) return;
  const [student, other] = await students(2);
  const interview = await published();
  clock.t = Date.parse("2026-11-02T04:00:00Z");
  const body = { interviewId: String(interview._id), audience: { source: "selected", studentIds: ids([student, other]) }, window: WINDOW };
  const { assignment: manual } = await scheduling.createAssignment(admin, { ...body, reportVisibility: "manual" });
  const held = await readyAttempt(student, manual);
  await scheduling.transitionAssignment(admin, manual.id, "cancel");
  assert.equal((await AnviAttempt.findById(held._id).lean()).visibleToStudentAt, null, "cancel does not release manual reports");
  const released = await scheduling.transitionAssignment(admin, manual.id, "release");
  assert.equal(released.released, 1);
  assert.ok((await AnviAttempt.findById(held._id).lean()).visibleToStudentAt, "a cancelled assignment's reports can be released");

  // The cancelled schedule no longer blocks its students: the same interview can be assigned again.
  const { assignment: later } = await scheduling.createAssignment(admin, body);
  assert.equal(later.audience.studentCount, 2);
  // That new schedule is upcoming, so it blocks a third one.
  await rejectsWith(scheduling.createAssignment(admin, body), "ALREADY_ASSIGNED");
  const early = await readyAttempt(other, later);
  const revision = (await AnviAssignment.findById(later.id).lean()).revision;
  const switched = await scheduling.updateAssignment(admin, later.id, { reportVisibility: "immediate" }, revision);
  assert.equal(switched.released, 1);
  assert.ok((await AnviAttempt.findById(early._id).lean()).visibleToStudentAt, "reports scored before the switch are not left hidden");
});

test("a release only announces the attempts it released itself", async (t) => {
  if (skip(t)) return;
  const [first, second] = await students(2);
  const interview = await published();
  clock.t = Date.parse("2026-11-02T04:00:00Z");
  const { assignment } = await scheduling.createAssignment(admin, {
    interviewId: String(interview._id), audience: { source: "selected", studentIds: ids([first, second]) }, window: WINDOW, reportVisibility: "manual",
  });
  const raced = await readyAttempt(first, assignment);
  await readyAttempt(second, assignment);
  events.length = 0;
  // The evaluator's releaseIfDue lands between the release's read and its write for `raced`.
  const result = await withWrapped(AnviAttempt, "updateOne", (original) => async (filter, update) => {
    if (String(filter?._id) === String(raced._id) && filter.visibleToStudentAt === null) {
      await AnviAttempt.collection.updateOne({ _id: raced._id }, { $set: { visibleToStudentAt: new Date() } });
    }
    return original(filter, update);
  }, () => scheduling.transitionAssignment(admin, assignment.id, "release"));
  assert.equal(result.released, 1);
  const announced = events.filter((row) => row.event === "released").flatMap((row) => row.recipients.map((recipient) => String(recipient.studentId)));
  assert.deepEqual(announced, [String(second._id)]);
});

test("an interrupted create behind an Idempotency-Key is redone, a running one is not reported as done, and a draft can be cancelled", async (t) => {
  if (skip(t)) return;
  const cohort = await students(2);
  const interview = await published();
  const body = { interviewId: String(interview._id), audience: { source: "selected", studentIds: ids(cohort) }, window: WINDOW };
  const first = await scheduling.createAssignment(admin, body, { creationKey: "half-made" });
  // The process died during the first create: the row is still a draft, created minutes ago.
  await AnviAssignment.collection.updateOne({ _id: new mongoose.Types.ObjectId(first.assignment.id) }, { $set: { status: "draft", createdAt: new Date(Date.now() - 5 * MINUTE) } });
  const redone = await scheduling.createAssignment(admin, body, { creationKey: "half-made" });
  assert.equal(redone.created, true);
  assert.notEqual(redone.assignment.id, first.assignment.id);
  assert.equal(redone.assignment.status, "scheduled");
  assert.equal(await AnviAssignmentTarget.countDocuments(), 2, "the half-made targets went with the draft");

  // A draft created just now belongs to a create still running.
  await AnviAssignment.collection.updateOne({ _id: new mongoose.Types.ObjectId(redone.assignment.id) }, { $set: { status: "draft", createdAt: new Date() } });
  await rejectsWith(scheduling.createAssignment(admin, body, { creationKey: "half-made" }), "ASSIGNMENT_CREATING");
  events.length = 0;
  const cancelled = await scheduling.transitionAssignment(admin, redone.assignment.id, "cancel");
  assert.equal(cancelled.assignment.status, "cancelled");
  assert.equal(events.filter((row) => row.event === "assignment_cancelled").length, 0, "students never heard of a draft");
});

test("a booking that lands after a cancel or a slot withdrawal is undone and its seat returned", async (t) => {
  if (skip(t)) return;
  const [student] = await students(1);
  const { assignment, slots } = await slotsAssignment([student]);
  const slotId = slots[0]._id;
  await withWrapped(AnviBooking, "create", (original) => async (doc) => {
    // runCancelEffects scanned bookings before this one existed.
    await AnviAssignment.collection.updateOne({ _id: new mongoose.Types.ObjectId(assignment.id) }, { $set: { status: "cancelled" } });
    return original(doc);
  }, () => rejectsWith(scheduling.bookSlot(student, assignment.id, String(slotId)), "ASSIGNMENT_CLOSED"));
  assert.equal(await AnviBooking.countDocuments({ active: true }), 0);
  assert.equal((await AnviSlot.findById(slotId).lean()).bookedCount, 0);

  const second = await slotsAssignment([student]);
  const withdrawn = second.slots[0]._id;
  await withWrapped(AnviBooking, "create", (original) => async (doc) => {
    // reconcileSlots withdrew the slot (and zeroed its seats) after the claim.
    await AnviSlot.collection.updateOne({ _id: withdrawn }, { $set: { status: "cancelled", bookedCount: 0 } });
    return original(doc);
  }, () => rejectsWith(scheduling.bookSlot(student, second.assignment.id, String(withdrawn)), "SLOT_WITHDRAWN"));
  assert.equal(await AnviBooking.countDocuments({ assignmentId: second.assignment.id, active: true }), 0);
  assert.equal((await AnviAssignmentTarget.findOne({ assignmentId: second.assignment.id }).lean()).outcome, "pending");
});

test("a slot that starts as the window opens has no early join, so Join and the start agree", async (t) => {
  if (skip(t)) return;
  const [student] = await students(1);
  const { assignment, slots } = await slotsAssignment([student], { window: { opensAt: "2026-11-02T10:00:00+05:30", closesAt: "2026-11-04T18:00:00+05:30" } });
  await scheduling.bookSlot(student, assignment.id, String(slots[0]._id));
  clock.t = Date.parse("2026-11-02T04:25:00Z");
  const [item] = await scheduling.listStudentAssignments(student);
  assert.equal(new Date(item.joinWindow.from).toISOString(), "2026-11-02T04:30:00.000Z", "clamped to opensAt");
  assert.equal(item.startBlockedReason, "TOO_EARLY");
  clock.t = Date.parse("2026-11-02T04:30:00Z");
  assert.equal((await scheduling.checkAssignedStart(student, assignment.id)).ok, true);
});

test("the admin can rebook a no-show, and the student list says when the pinned snapshot needs the resume", async (t) => {
  if (skip(t)) return;
  const [student] = await students(1);
  const { assignment, slots } = await slotsAssignment([student], { slotPolicy: { ...oneSlot(2), dailyEnd: "11:00" } });
  const { booking } = await scheduling.bookSlot(student, assignment.id, String(slots[0]._id));
  await AnviBooking.updateOne({ _id: booking.id }, { $set: { status: "no_show", active: false } });
  await AnviAssignmentTarget.updateOne({ studentId: student._id }, { $set: { outcome: "no_show" } });
  await rejectsWith(scheduling.bookSlot(student, assignment.id, String(slots[1]._id)), "NO_SHOW_RECORDED");
  const moved = await scheduling.adminMoveBooking(admin, booking.id, String(slots[1]._id));
  assert.equal(moved.booking.status, "booked");
  assert.equal((await AnviAssignmentTarget.findOne({ studentId: student._id }).lean()).outcome, "booked");
  assert.equal((await scheduling.getAssignmentDetail(admin, assignment.id)).roster[0].booking.status, "booked");

  const resumeInterview = await published(admin._id, {
    publishedSnapshot: { data: { title: "Resume round", sections: [{ groups: [{ questions: [{ kind: "resume" }] }] }] }, revision: 3, at: new Date() },
  });
  await scheduling.createAssignment(admin, { interviewId: String(resumeInterview._id), audience: { source: "selected", studentIds: ids([student]) }, window: WINDOW });
  const list = await scheduling.listStudentAssignments(student);
  assert.deepEqual(list.map((row) => [row.title, row.requiresResume]).sort(), [["Backend round", false], ["Resume round", true]]);
});

test("student assignment cards use the latest interview display details while runtime content stays pinned", async (t) => {
  if (skip(t)) return;
  const [student] = await students(1);
  const interview = await published(admin._id, { role: "Backend Engineer", companyName: "Old Co", data: { title: "Backend round draft", anvi: { durationMinutes: 30 } } });
  const { assignment } = await scheduling.createAssignment(admin, {
    interviewId: String(interview._id), audience: { source: "selected", studentIds: ids([student]) }, window: WINDOW,
  });

  await AIInterview.updateOne({ _id: interview._id }, {
    $set: { title: "Platform Engineer Interview", role: "Platform Engineer", companyName: "New Co", revision: 4, "data.anvi.durationMinutes": 45 },
  });
  const [item] = await scheduling.listStudentAssignments(student);
  assert.deepEqual(
    [item.title, item.role, item.companyName, item.estimatedMinutes],
    ["Platform Engineer Interview", "Platform Engineer", "New Co", 45],
  );
  const stored = await AnviAssignment.findById(assignment.id).lean();
  assert.equal(stored.snapshotData.title, "Backend round", "questions and runtime snapshot stay pinned");
});
