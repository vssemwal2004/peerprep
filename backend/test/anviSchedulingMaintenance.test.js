import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import AIInterview from "../src/models/AIInterview.js";
import User from "../src/models/User.js";
import { AnviAttempt } from "../src/modules/anviInterview/anviInterview.models.js";
import { AnviAssignment, AnviAssignmentTarget, AnviBooking, AnviSlot, ANVI_SCHEDULING_MODELS } from "../src/modules/anviInterview/anviInterview.scheduling.models.js";
import { createAnviScheduling } from "../src/modules/anviInterview/anviInterview.scheduling.service.js";
import { sweepAnviScheduling } from "../src/modules/anviInterview/anviInterview.scheduling.maintenance.js";

// The scheduling sweeper over an ephemeral MongoDB with a fixed clock and a recording notifier.
let mongo;
let skipped = false;
const admin = { _id: new mongoose.Types.ObjectId(), role: "admin" };
const clock = { t: 0, now() { return this.t; } };
const events = [];
const scheduling = createAnviScheduling({ clock, notifier: { async send(event, context) { events.push({ event, ...context }); } }, log: { warn() {} } });
const SUNDAY = Date.parse("2026-11-01T00:00:00.000Z");
const at = (iso) => { clock.t = Date.parse(iso); return new Date(clock.t); };
const sweep = (now) => sweepAnviScheduling(now, { scheduling });
const sent = (event) => events.filter((row) => row.event === event);

before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } }); }
  catch (error) { if (error?.code === "EPERM") { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: "anvi_scheduling_maintenance_test" });
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
async function setup({ count = 2, slotPolicy, window, reportVisibility } = {}) {
  const interview = await AIInterview.create({
    ownerId: admin._id, creationKey: crypto.randomUUID(), title: "Backend round", data: { title: "Backend round" },
    publishedAt: new Date(), publishedRevision: 1, publishedSnapshot: { data: { title: "Backend round" }, revision: 1 },
  });
  const students = Array.from({ length: count }, (_, index) => ({ _id: new mongoose.Types.ObjectId(), role: "student", name: `S${index}`, email: `s${index}-${crypto.randomUUID()}@example.com` }));
  await User.collection.insertMany(students);
  const { assignment } = await scheduling.createAssignment(admin, {
    interviewId: String(interview._id),
    audience: { source: "selected", studentIds: students.map((row) => String(row._id)) },
    window: window || { opensAt: "2026-11-02T09:00:00+05:30", closesAt: "2026-11-02T18:00:00+05:30" },
    slotPolicy: slotPolicy === undefined ? { mode: "slots", slotMinutes: 30, capacityPerSlot: 5, dailyStart: "10:00", dailyEnd: "11:00", weekdays: [1] } : slotPolicy,
    reportVisibility,
  });
  const slots = await AnviSlot.find({ assignmentId: assignment.id }).sort({ startsAt: 1 }).lean();
  events.length = 0;
  return { interview, students, assignment, slots };
}

test("the sweep runs in both scopes and skips universities without interviews or service", async (t) => {
  const source = readFileSync(new URL("../src/platform/sharedMaintenance.js", import.meta.url), "utf8");
  assert.match(source, /due\('platform', 'anviSchedule', 60_000\)\) await runForPlatform\(\(\) => sweepAnviScheduling\(new Date\(\)\)\)\.catch/);
  assert.match(source, /due\(id, 'anviSchedule', 60_000\)\) await sweepAnviScheduling\(new Date\(\), \{ tenant \}\)\.catch/);
  if (skip(t)) return;
  const now = new Date("2026-11-05T00:00:00Z");
  assert.deepEqual(await sweepAnviScheduling(now, { scheduling, tenant: { universityId: "north", permissions: { interviews: false } } }), { skipped: true });
  assert.deepEqual(await sweepAnviScheduling(now, { scheduling, tenant: { universityId: "north", permissions: { interviews: true }, serviceStartDate: "2025-01-01", serviceEndDate: "2026-01-01" } }), { skipped: true });
  const ran = await sweepAnviScheduling(now, { scheduling, tenant: { universityId: "north", permissions: { interviews: true } } });
  assert.equal(ran.skipped, undefined);
});

test("assignments open at opensAt and close at closesAt exactly once", async (t) => {
  if (skip(t)) return;
  const { assignment, students } = await setup({ slotPolicy: null, reportVisibility: "after_close" });
  assert.equal((await sweep(at("2026-11-02T03:00:00Z"))).opened, 0);
  assert.equal((await sweep(at("2026-11-02T03:30:00Z"))).opened, 1);
  assert.equal((await AnviAssignment.findById(assignment.id).lean()).status, "open");
  assert.equal((await sweep(at("2026-11-02T03:31:00Z"))).opened, 0, "idempotent");

  // One student finished and was evaluated; the other never started.
  const attempt = await AnviAttempt.create({
    studentId: students[0]._id, interviewId: assignment.interviewId, snapshotRevision: 1, mode: "mock", assignmentId: assignment.id, status: "ready", hardDeadline: new Date(),
  });
  await AnviAssignmentTarget.updateOne({ studentId: students[0]._id }, { $set: { attemptsUsed: 1, outcome: "completed", lastAttemptId: attempt._id } });
  const closed = await sweep(at("2026-11-02T12:30:00Z"));
  assert.equal(closed.closed, 1);
  const row = await AnviAssignment.findById(assignment.id).lean();
  assert.equal(row.status, "closed");
  assert.ok(row.closeEffectsAt);
  assert.equal((await AnviAssignmentTarget.findOne({ studentId: students[1]._id }).lean()).outcome, "missed");
  assert.equal((await AnviAssignmentTarget.findOne({ studentId: students[0]._id }).lean()).outcome, "completed");
  assert.ok((await AnviAttempt.findById(attempt._id).lean()).visibleToStudentAt, "after_close releases reports at close");
  assert.equal(sent("missed")[0].recipients.length, 1);
  assert.equal(sent("released")[0].recipients[0].attemptId.toString(), String(attempt._id));
  assert.equal((await sweep(at("2026-11-02T12:31:00Z"))).closed, 0);
  assert.equal(sent("missed").length, 1);
});

test("a close interrupted before its follow-up work is finished by the next sweep", async (t) => {
  if (skip(t)) return;
  const { assignment } = await setup({ slotPolicy: null });
  await AnviAssignment.updateOne({ _id: assignment.id }, { $set: { status: "closed", closedAt: new Date(), closeEffectsAt: null } });
  await sweep(at("2026-11-02T12:40:00Z"));
  assert.ok((await AnviAssignment.findById(assignment.id).lean()).closeEffectsAt);
  assert.equal(await AnviAssignmentTarget.countDocuments({ outcome: "missed" }), 2);
});

test("slot reminders fire once per label, never late, and again after a reschedule", async (t) => {
  if (skip(t)) return;
  const { assignment, students, slots } = await setup();
  const { booking } = await scheduling.bookSlot(students[0], assignment.id, String(slots[0]._id));
  // Booked well ahead: the 24h reminder first.
  let result = await sweep(at("2026-11-01T05:00:00Z"));
  assert.equal(result.reminders, 1);
  assert.equal(sent("reminder")[0].label, "24h");
  assert.equal((await sweep(at("2026-11-01T05:01:00Z"))).reminders, 0, "a second pass sends nothing");
  result = await sweep(at("2026-11-02T03:40:00Z"));
  assert.equal(sent("reminder").at(-1).label, "1h");
  assert.equal(result.reminders, 1);
  await sweep(at("2026-11-02T04:21:00Z"));
  assert.equal(sent("reminder").at(-1).label, "10m");
  assert.deepEqual((await AnviBooking.findById(booking.id).lean()).remindersSent.sort(), ["10m", "1h", "24h"]);
  assert.equal(sent("reminder").length, 3);

  // A late booking 50 minutes ahead gets the 1h reminder only; the 24h one is marked and skipped.
  at("2026-11-02T03:55:00Z");
  await AnviBooking.updateOne({ _id: booking.id }, { $set: { remindersSent: [] } });
  const other = await scheduling.bookSlot(students[1], assignment.id, String(slots[1]._id));
  events.length = 0;
  await sweep(at("2026-11-02T04:10:00Z"));
  const late = sent("reminder").filter((row) => String(row.recipients[0].booking._id) === other.booking.id);
  assert.deepEqual(late.map((row) => row.label), ["1h"]);
  assert.deepEqual((await AnviBooking.findById(other.booking.id).lean()).remindersSent.sort(), ["1h", "24h"]);
});

test("a booked slot past its late grace with no attempt becomes a no-show, unless paused", async (t) => {
  if (skip(t)) return;
  const { assignment, students, slots } = await setup();
  const first = await scheduling.bookSlot(students[0], assignment.id, String(slots[0]._id));
  const second = await scheduling.bookSlot(students[1], assignment.id, String(slots[0]._id));
  // Student 1 joined in time.
  await AnviBooking.updateOne({ _id: second.booking.id }, { $set: { attemptId: new mongoose.Types.ObjectId() } });
  assert.equal((await sweep(at("2026-11-02T04:39:00Z"))).noShows, 0, "still inside the late grace");
  const result = await sweep(at("2026-11-02T04:41:00Z"));
  assert.equal(result.noShows, 1);
  const booking = await AnviBooking.findById(first.booking.id).lean();
  assert.equal(booking.status, "no_show");
  assert.equal(booking.active, false);
  assert.equal((await AnviAssignmentTarget.findOne({ studentId: students[0]._id }).lean()).outcome, "no_show");
  assert.equal((await AnviBooking.findById(second.booking.id).lean()).status, "booked");
  assert.equal(sent("missed").length, 1);
  assert.equal((await sweep(at("2026-11-02T04:42:00Z"))).noShows, 0);

  // While paused nobody can start, so nobody is marked absent.
  at("2026-11-01T00:00:00Z");
  const third = await setup({ count: 1 });
  await scheduling.bookSlot(third.students[0], third.assignment.id, String(third.slots[0]._id));
  await scheduling.transitionAssignment(admin, third.assignment.id, "pause");
  assert.equal((await sweep(at("2026-11-02T04:45:00Z"))).noShows, 0);
  await scheduling.transitionAssignment(admin, third.assignment.id, "resume");
  assert.equal((await sweep(at("2026-11-02T04:46:00Z"))).noShows, 1, "after resuming, the missed slot counts");
});

test("bookings of a paused assignment never starve the no-show pass of other assignments", async (t) => {
  if (skip(t)) return;
  const paused = await setup({ count: 5 });
  for (const student of paused.students) await scheduling.bookSlot(student, paused.assignment.id, String(paused.slots[0]._id));
  await scheduling.transitionAssignment(admin, paused.assignment.id, "pause");
  const live = await setup({ count: 1 });
  const booking = await scheduling.bookSlot(live.students[0], live.assignment.id, String(live.slots[1]._id));
  // limit 1 reads at most 5 late bookings per pass: before the fix the 5 paused ones (earlier slot) filled it.
  const result = await sweepAnviScheduling(at("2026-11-02T05:11:00Z"), { scheduling, limit: 1 });
  assert.equal(result.noShows, 1);
  assert.equal((await AnviBooking.findById(booking.booking.id).lean()).status, "no_show");
  assert.equal(await AnviBooking.countDocuments({ assignmentId: paused.assignment.id, status: "booked", active: true }), 5, "paused bookings are untouched");
});

test("an interrupted cancel is finished by the next sweep, including the after_close release", async (t) => {
  if (skip(t)) return;
  const { assignment, students } = await setup({ slotPolicy: null, reportVisibility: "after_close" });
  const attempt = await AnviAttempt.create({
    studentId: students[0]._id, interviewId: assignment.interviewId, snapshotRevision: 1, mode: "mock", assignmentId: assignment.id, status: "ready", hardDeadline: new Date(),
  });
  await AnviAssignmentTarget.updateOne({ studentId: students[0]._id }, { $set: { attemptsUsed: 1, outcome: "completed", lastAttemptId: attempt._id } });
  // The status flipped, then the process died before runCancelEffects.
  await AnviAssignment.updateOne({ _id: assignment.id }, { $set: { status: "cancelled", cancelledAt: new Date(), closeEffectsAt: null } });
  await sweep(at("2026-11-02T05:00:00Z"));
  assert.ok((await AnviAssignment.findById(assignment.id).lean()).closeEffectsAt);
  assert.equal((await AnviAssignmentTarget.findOne({ studentId: students[1]._id }).lean()).outcome, "cancelled");
  assert.ok((await AnviAttempt.findById(attempt._id).lean()).visibleToStudentAt, "after_close reports of a cancelled assignment are released");
});

test("an attempt that ended without settling its schedule is reconciled by the sweep", async (t) => {
  if (skip(t)) return;
  const { assignment, students } = await setup({ slotPolicy: null });
  const attempt = await AnviAttempt.create({
    studentId: students[0]._id, interviewId: assignment.interviewId, snapshotRevision: 1, mode: "mock", assignmentId: assignment.id, status: "completed", hardDeadline: new Date(),
  });
  // recordAssignedAttempt ran, the attempt ended, but onAttemptFinalized failed (a DB error).
  await AnviAssignmentTarget.updateOne({ studentId: students[0]._id }, { $set: { attemptsUsed: 1, outcome: "in_progress", lastAttemptId: attempt._id } });
  const running = await AnviAttempt.create({
    studentId: students[1]._id, interviewId: assignment.interviewId, snapshotRevision: 1, mode: "mock", assignmentId: assignment.id, status: "in_progress", hardDeadline: new Date(Date.now() + 60_000),
  });
  await AnviAssignmentTarget.updateOne({ studentId: students[1]._id }, { $set: { attemptsUsed: 1, outcome: "in_progress", lastAttemptId: running._id } });
  const result = await sweep(at("2026-11-02T05:00:00Z"));
  assert.equal(result.settled, 1);
  assert.equal((await AnviAssignmentTarget.findOne({ studentId: students[0]._id }).lean()).outcome, "completed");
  assert.equal((await AnviAssignmentTarget.findOne({ studentId: students[1]._id }).lean()).outcome, "in_progress", "a running attempt is left alone");
});

test("at close a retry-eligible target with a scored partial attempt is completed, not left pending", async (t) => {
  if (skip(t)) return;
  const { students } = await setup({ slotPolicy: null });
  await AnviAssignmentTarget.updateOne({ studentId: students[0]._id }, { $set: { attemptsUsed: 1, outcome: "pending", partial: true } });
  await sweep(at("2026-11-02T12:30:00Z"));
  const target = await AnviAssignmentTarget.findOne({ studentId: students[0]._id }).lean();
  assert.equal(target.outcome, "completed");
  assert.equal(target.partial, true);
  assert.equal((await AnviAssignmentTarget.findOne({ studentId: students[1]._id }).lean()).outcome, "missed");
  assert.equal(sent("missed")[0].recipients.length, 1, "only the student who never started is told they missed it");
});

test("the window reminder reaches unbooked or unstarted students once, 24 h before close", async (t) => {
  if (skip(t)) return;
  const { assignment, students, slots } = await setup({
    count: 3,
    window: { opensAt: "2026-11-02T09:00:00+05:30", closesAt: "2026-11-03T18:00:00+05:30" },
    slotPolicy: { mode: "slots", slotMinutes: 30, capacityPerSlot: 5, dailyStart: "16:00", dailyEnd: "17:00", weekdays: [1, 2] },
  });
  await scheduling.bookSlot(students[0], assignment.id, String(slots.at(-1)._id));
  assert.equal((await sweep(at("2026-11-02T03:00:00Z"))).windowReminders, 0, "not yet open");
  const result = await sweep(at("2026-11-02T13:00:00Z"));
  assert.equal(result.windowReminders, 2, "the booked student is not nagged");
  assert.equal(sent("window_reminder")[0].recipients.length, 2);
  assert.equal((await sweep(at("2026-11-02T13:05:00Z"))).windowReminders, 0);
});
