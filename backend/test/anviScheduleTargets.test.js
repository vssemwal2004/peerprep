import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import AIInterview from "../src/models/AIInterview.js";
import User from "../src/models/User.js";
import { errorHandler } from "../src/utils/errors.js";
import { runForTenant } from "../src/platform/tenantContext.js";
import { AnviAttempt } from "../src/modules/anviInterview/anviInterview.models.js";
import { AnviAssignment, AnviAssignmentTarget, AnviBooking, AnviSlot, ANVI_SCHEDULING_MODELS } from "../src/modules/anviInterview/anviInterview.scheduling.models.js";
import { createAnviScheduling } from "../src/modules/anviInterview/anviInterview.scheduling.service.js";
import { createAnviSchedulingAdminRouter } from "../src/modules/anviInterview/anviInterview.scheduling.routes.js";
import { describe as describeEvent } from "../src/modules/anviInterview/anviInterview.scheduling.notify.js";

// Assigned students: no duplicate targets (same schedule or a second schedule of the same interview),
// add/remove by delta, the assigned-students list (one schedule and per interview) and resend invite.
let mongo, server, base, tenantConnection;
let skipped = false;
const admin = { _id: new mongoose.Types.ObjectId(), role: "admin" };
const otherAdmin = { _id: new mongoose.Types.ObjectId(), role: "admin" };
const clock = { t: 0, now() { return this.t; } };
const events = [];
const notifier = { async send(event, context) { events.push({ event, ...context }); return { notified: context.recipients.length }; } };
const scheduling = createAnviScheduling({ clock, notifier, log: { warn() {} } });
const SUNDAY = Date.parse("2026-11-01T00:00:00.000Z");
const WINDOW = { opensAt: "2026-11-02T09:00:00+05:30", closesAt: "2026-11-04T18:00:00+05:30" };
const SLOTS = { mode: "slots", slotMinutes: 30, capacityPerSlot: 5, dailyStart: "10:00", dailyEnd: "11:00", weekdays: [1, 2] };

before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } }); }
  catch (error) { if (error?.code === "EPERM") { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: "anvi_schedule_targets_test" });
  await Promise.all([AIInterview.init(), AnviAttempt.init(), ...ANVI_SCHEDULING_MODELS.map((model) => model.init())]);
  // A university connection: autoIndex is off there, as in production.
  tenantConnection = await mongoose.createConnection(mongo.getUri(), { dbName: "anvi_schedule_targets_tenant", autoIndex: false }).asPromise();
  const authenticate = (req, _res, next) => {
    req.user = { _id: new mongoose.Types.ObjectId(req.get("X-Test-User") || String(admin._id)), role: req.get("X-Test-Role") || "admin", accessScope: "full" };
    next();
  };
  const app = express();
  app.use(express.json());
  app.use("/api/ai-interviews/schedules", createAnviSchedulingAdminRouter(authenticate, { service: scheduling }));
  app.use(errorHandler);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/ai-interviews/schedules`;
});
after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await tenantConnection?.close();
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
const rejectsWith = (promise, code) => assert.rejects(promise, (error) => { assert.equal(error.details?.code, code, error.message); return true; });
const published = (ownerId = admin._id) => AIInterview.create({
  ownerId, creationKey: crypto.randomUUID(), title: "Backend round", data: { title: "Backend round" },
  publishedAt: new Date(), publishedRevision: 1, publishedSnapshot: { data: { title: "Backend round", role: "SDE" }, revision: 1, at: new Date() },
});
async function students(count, fields = {}) {
  const rows = Array.from({ length: count }, (_, index) => ({
    _id: new mongoose.Types.ObjectId(), role: "student", name: `Student ${String.fromCharCode(65 + index)}`, email: `s${index}-${crypto.randomUUID().slice(0, 6)}@example.edu`,
    studentId: `GEU${100 + index}`, branch: index % 2 ? "ECE" : "CSE", course: "B.Tech", semester: 5, ...fields,
  }));
  if (rows.length) await User.collection.insertMany(rows);
  return rows;
}
const ids = (rows) => rows.map((row) => String(row._id));
const create = (interview, cohort, extra = {}) => scheduling.createAssignment(admin, {
  interviewId: String(interview._id), audience: { source: "selected", studentIds: ids(cohort) }, window: WINDOW, slotPolicy: SLOTS, ...extra,
});
async function call(path, { method = "GET", body, user, role } = {}) {
  const result = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(user ? { "X-Test-User": String(user) } : {}), ...(role ? { "X-Test-Role": role } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: result.status, body: await result.json().catch(() => null) };
}

test("a second schedule of the same interview does not assign the same student again", async (t) => {
  if (skip(t)) return;
  const interview = await published();
  const [asha, ravi, chen] = await students(3);
  const first = await create(interview, [asha]);
  assert.equal(first.created, true);

  // The reported bug: "Assign to students" again (to edit) created a second schedule with the same student.
  await assert.rejects(create(interview, [asha, ravi]), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.details.code, "ALREADY_ASSIGNED");
    assert.equal(error.details.conflictCount, 1);
    assert.deepEqual(error.details.conflicts.map((row) => [row.studentId, row.assignmentId, row.name]), [[String(asha._id), first.assignment.id, asha.name]]);
    return true;
  });
  assert.equal(await AnviAssignment.countDocuments(), 1, "nothing was created");
  const preview = await create(interview, [asha, ravi], { dryRun: true });
  assert.equal(preview.preview.alreadyAssigned, 1);
  assert.ok(preview.warnings.some((row) => row.code === "ALREADY_ASSIGNED"));

  const skipped = await create(interview, [asha, ravi], { duplicates: "skip" });
  assert.equal(skipped.assignment.audience.studentCount, 1, "only Ravi is new");
  assert.ok(skipped.warnings.some((row) => row.code === "ALREADY_ASSIGNED_SKIPPED"));
  const targets = await AnviAssignmentTarget.find({ studentId: asha._id, status: "assigned" }).lean();
  assert.equal(targets.length, 1, "Asha holds one active assignment of this interview");
  await rejectsWith(create(interview, [asha], { duplicates: "skip" }), "ALREADY_ASSIGNED");
  await rejectsWith(create(interview, [asha], { duplicates: "maybe" }), "INVALID_FIELD");

  // Once the earlier schedule is cancelled, the student may be assigned the interview again.
  await scheduling.transitionAssignment(admin, first.assignment.id, "cancel");
  const again = await create(interview, [asha, chen]);
  assert.equal(again.assignment.audience.studentCount, 2, "a cancelled schedule no longer blocks Asha");
  // Ravi's schedule is still upcoming, so he stays blocked; there is no "assign anyway" option.
  await rejectsWith(create(interview, [ravi]), "ALREADY_ASSIGNED");
  await rejectsWith(create(interview, [ravi], { duplicates: "allow" }), "INVALID_FIELD");
  // A different interview never conflicts.
  assert.equal((await create(await published(), [asha])).created, true);
});

test("adding students is an idempotent upsert: existing targets are never added twice", async (t) => {
  if (skip(t)) return;
  const interview = await published();
  const [asha, ravi, chen, dev] = await students(4);
  const { assignment } = await create(interview, [asha, ravi]);
  events.length = 0;

  // The edit flow may send the whole list back: only the new student is added and notified.
  const result = await scheduling.addTargets(admin, assignment.id, { studentIds: [...ids([asha, ravi]), String(chen._id)], source: "csv" });
  assert.equal(result.added, 1);
  assert.deepEqual(result.addedIds, [String(chen._id)]);
  assert.equal(result.alreadyAssigned, 2);
  assert.equal(result.assignment.audience.studentCount, 3);
  assert.deepEqual(events.map((row) => [row.event, row.recipients.map((r) => String(r.studentId))]), [["assigned", [String(chen._id)]]]);
  assert.equal((await AnviAssignmentTarget.findOne({ studentId: chen._id }).lean()).source, "csv");

  // Repeats, letter-case variants and parallel requests still leave one row per student.
  const again = await scheduling.addTargets(admin, assignment.id, { studentIds: [String(chen._id).toUpperCase(), String(chen._id)] });
  assert.equal(again.added, 0);
  const parallel = await Promise.allSettled(Array.from({ length: 8 }, () => scheduling.addTargets(admin, assignment.id, { studentIds: [String(dev._id)] })));
  assert.ok(parallel.every((row) => row.status === "fulfilled"), "parallel adds never fail");
  assert.equal(parallel.reduce((sum, row) => sum + row.value.added, 0), 1, "exactly one request added Dev");
  const dupes = await AnviAssignmentTarget.aggregate([{ $group: { _id: { a: "$assignmentId", s: "$studentId" }, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]);
  assert.deepEqual(dupes, []);
  assert.equal(await AnviAssignmentTarget.countDocuments({ assignmentId: assignment.id }), 4);
});

test("adding a student who already has the interview in another schedule is refused unless skipped", async (t) => {
  if (skip(t)) return;
  const interview = await published();
  const [asha, ravi, chen] = await students(3);
  const a = await create(interview, [asha]);
  const b = await create(interview, [ravi]);
  await rejectsWith(scheduling.addTargets(admin, b.assignment.id, { studentIds: ids([asha, chen]) }), "ALREADY_ASSIGNED");
  const skipped = await scheduling.addTargets(admin, b.assignment.id, { studentIds: ids([asha, chen]), duplicates: "skip" });
  assert.equal(skipped.added, 1);
  assert.equal(skipped.skipped, 1);
  assert.equal(skipped.alreadyAssigned, 0);
  // Re-adding to the schedule that already has the student is a no-op, not a conflict with itself.
  assert.equal((await scheduling.addTargets(admin, a.assignment.id, { studentIds: [String(asha._id)] })).added, 0);
});

test("removing students cancels their active booking, keeps history, and they can be added back", async (t) => {
  if (skip(t)) return;
  const interview = await published();
  const [asha, ravi] = await students(2);
  const { assignment } = await create(interview, [asha, ravi]);
  const [slot] = await AnviSlot.find({ assignmentId: assignment.id }).sort({ startsAt: 1 }).lean();
  const { booking } = await scheduling.bookSlot(asha, assignment.id, String(slot._id));
  events.length = 0;

  const removed = await call(`/${assignment.id}/targets/remove`, { method: "POST", body: { studentIds: ids([asha, ravi]) } });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.removed, 2);
  assert.equal(removed.body.assignment.audience.studentCount, 0);
  const cancelled = await AnviBooking.findById(booking.id).lean();
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancelledBy, "admin");
  assert.equal(cancelled.cancelReason, "removed");
  assert.ok(cancelled.history.some((row) => row.action === "cancelled"), "the booking history is kept");
  assert.equal((await AnviSlot.findById(slot._id).lean()).bookedCount, 0, "the seat is released");
  const rows = await AnviAssignmentTarget.find({ assignmentId: assignment.id }).lean();
  assert.ok(rows.every((row) => row.status === "removed" && row.removedAt && row.outcome === "cancelled"), "targets are kept as removed");
  assert.ok(events.some((row) => row.event === "cancelled"));

  const listed = await scheduling.listTargets(admin, assignment.id, { status: "removed" });
  assert.equal(listed.rows.length, 2);
  assert.equal(listed.counts.removed, 2);
  const back = await scheduling.addTargets(admin, assignment.id, { studentIds: [String(asha._id)] });
  assert.equal(back.added, 1);
  const revived = await AnviAssignmentTarget.findOne({ assignmentId: assignment.id, studentId: asha._id }).lean();
  assert.equal(revived.status, "assigned");
  assert.equal(revived.outcome, "pending");
  assert.equal(await AnviAssignmentTarget.countDocuments({ assignmentId: assignment.id }), 2, "re-adding reuses the row");
});

test("resetting a completed interview clears its attempt and reopens the original target", async (t) => {
  if (skip(t)) return;
  const interview = await published();
  const [asha] = await students(1);
  const { assignment } = await create(interview, [asha], { slotPolicy: { mode: "window" } });
  const attempt = await AnviAttempt.collection.insertOne({
    studentId: asha._id, interviewId: interview._id, assignmentId: new mongoose.Types.ObjectId(assignment.id),
    snapshotRevision: 1, status: "ready", hardDeadline: new Date(clock.t + 60_000), startedAt: new Date(clock.t - 60_000), endedAt: new Date(clock.t), overall: { percent: 72 },
  });
  await AnviAssignmentTarget.updateOne({ assignmentId: assignment.id, studentId: asha._id }, { $set: { outcome: "completed", attemptsUsed: 1, lastAttemptId: attempt.insertedId } });

  const reset = await call(`/${assignment.id}/targets/${asha._id}/reset`, { method: "POST", body: {} });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.reset, 1);
  assert.equal(await AnviAttempt.countDocuments({ assignmentId: assignment.id, studentId: asha._id }), 0);
  const target = await AnviAssignmentTarget.findOne({ assignmentId: assignment.id, studentId: asha._id }).lean();
  assert.deepEqual([target.outcome, target.attemptsUsed, target.lastAttemptId, target.partial], ["pending", 0, null, false]);
  await rejectsWith(scheduling.resetTarget(admin, assignment.id, String(asha._id)), "ATTEMPT_NOT_FOUND");
});

test("the assigned-students list joins student, booking and attempt, and searches, filters, sorts and pages", async (t) => {
  if (skip(t)) return;
  const interview = await published();
  const cohort = await students(5);
  const [asha, ravi, chen] = cohort;
  const { assignment } = await create(interview, cohort);
  const [slot] = await AnviSlot.find({ assignmentId: assignment.id }).sort({ startsAt: 1 }).lean();
  await scheduling.bookSlot(ravi, assignment.id, String(slot._id));
  const attempt = await AnviAttempt.collection.insertOne({ studentId: chen._id, assignmentId: new mongoose.Types.ObjectId(assignment.id), status: "ready", overall: { percent: 81 } });
  await AnviAssignmentTarget.updateOne({ assignmentId: assignment.id, studentId: chen._id }, { $set: { outcome: "completed", attemptsUsed: 1, lastAttemptId: attempt.insertedId } });

  const all = await scheduling.listTargets(admin, assignment.id, { limit: 2, sort: "name" });
  assert.equal(all.assignment.id, assignment.id);
  assert.deepEqual(all.schedules.map((row) => row.id), [assignment.id]);
  assert.deepEqual(all.pagination, { page: 1, limit: 2, total: 5, pages: 3 });
  assert.deepEqual(all.rows.map((row) => row.student.name), ["Student A", "Student B"]);
  assert.equal(all.counts.all, 5);
  assert.equal(all.counts.booked, 1);
  assert.equal(all.counts.completed, 1);
  assert.equal(all.counts.pending, 3);
  const row = all.rows[1];
  assert.equal(row.id, `${assignment.id}:${ravi._id}`);
  assert.deepEqual(Object.keys(row.student).sort(), ["branch", "college", "course", "email", "group", "name", "semester", "studentCode"]);
  assert.equal(row.student.studentCode, ravi.studentId);
  assert.equal(row.student.branch, "ECE");
  assert.equal(row.schedule.title, "Backend round");
  assert.equal(row.outcome, "booked");
  assert.equal(row.booking.status, "booked");
  assert.equal(row.booking.active, true);
  assert.equal(row.attemptsAllowed, 1);

  const done = await scheduling.listTargets(admin, assignment.id, { status: "completed" });
  assert.deepEqual(done.rows.map((entry) => [entry.studentId, entry.attempt.percent, entry.attempt.reportReady]), [[String(chen._id), 81, true]]);
  const found = await scheduling.listTargets(admin, assignment.id, { search: asha.email.slice(0, 6).toUpperCase() });
  assert.deepEqual(found.rows.map((entry) => entry.studentId), [String(asha._id)]);
  assert.equal(found.counts.all, 1, "counts follow the search");
  assert.equal((await scheduling.listTargets(admin, assignment.id, { search: "GEU10" })).rows.length, 5, "searches the roll number");
  const byScore = await scheduling.listTargets(admin, assignment.id, { sort: "score", order: "desc" });
  assert.equal(byScore.rows[0].studentId, String(chen._id));
  const bySlot = await scheduling.listTargets(admin, assignment.id, { sort: "slot" });
  assert.equal(bySlot.rows[0].studentId, String(ravi._id), "booked first, unbooked last");
  const lastPage = await scheduling.listTargets(admin, assignment.id, { limit: 2, page: 99 });
  assert.equal(lastPage.pagination.page, 3);
  assert.equal(lastPage.rows.length, 1);
  await rejectsWith(scheduling.listTargets(admin, assignment.id, { status: "weird" }), "INVALID_STATUS");
  await rejectsWith(scheduling.listTargets(otherAdmin, assignment.id), "ASSIGNMENT_NOT_FOUND");
});

test("the per-interview list spans every schedule of the interview, with a schedule filter, owner-checked", async (t) => {
  if (skip(t)) return;
  const interview = await published();
  const [asha, ravi, chen] = await students(3);
  const a = await create(interview, [asha, ravi]);
  const b = await create(interview, [chen]);
  // Legacy bad data can contain the same student in two schedules. The interview roster collapses it.
  await AnviAssignmentTarget.create({ assignmentId: b.assignment.id, studentId: asha._id, status: "assigned", outcome: "pending" });
  await create(await published(), [asha]);

  const all = await scheduling.listInterviewTargets(admin, String(interview._id), { sort: "schedule" });
  assert.equal(all.interview.id, String(interview._id));
  assert.deepEqual(all.schedules.map((row) => row.id).sort(), [a.assignment.id, b.assignment.id].sort());
  assert.equal(all.pagination.total, 3, "the other interview and duplicate student row are not included");
  assert.equal(all.rows.filter((row) => row.studentId === String(asha._id)).length, 1, "legacy duplicates render once");
  assert.deepEqual(new Set(all.rows.map((row) => row.assignmentId)), new Set([a.assignment.id, b.assignment.id]));
  const one = await scheduling.listInterviewTargets(admin, String(interview._id), { assignmentId: b.assignment.id });
  assert.deepEqual(
    new Set(one.rows.map((row) => row.studentId)),
    new Set([String(asha._id), String(chen._id)]),
  );
  assert.equal(one.schedules.length, 2, "the filter keeps every schedule listed");
  await rejectsWith(scheduling.listInterviewTargets(admin, String(interview._id), { assignmentId: String(new mongoose.Types.ObjectId()) }), "ASSIGNMENT_NOT_FOUND");
  await rejectsWith(scheduling.listInterviewTargets(otherAdmin, String(interview._id)), "INTERVIEW_NOT_FOUND");
  await rejectsWith(scheduling.listInterviewTargets(admin, "nope"), "INVALID_IDENTIFIER");
  const empty = await scheduling.listInterviewTargets(admin, String((await published())._id));
  assert.deepEqual([empty.rows, empty.schedules, empty.pagination.total], [[], [], 0]);
});

test("list routes answer with the documented shape and refuse other roles and admins", async (t) => {
  if (skip(t)) return;
  const interview = await published();
  const cohort = await students(2);
  const { assignment } = await create(interview, cohort);
  const list = await call(`/${assignment.id}/targets?limit=10&sort=email`);
  assert.equal(list.status, 200);
  assert.deepEqual(Object.keys(list.body).sort(), ["assignment", "counts", "pagination", "rows", "schedules", "sort", "truncated"]);
  assert.equal(list.body.rows.length, 2);
  assert.deepEqual(list.body.sort, { key: "email", order: "asc" });
  const perInterview = await call(`/by-interview/${interview._id}/targets`);
  assert.equal(perInterview.status, 200);
  assert.equal(perInterview.body.rows.length, 2);
  assert.equal((await call(`/${assignment.id}/targets`, { role: "coordinator" })).status, 403);
  assert.equal((await call(`/by-interview/${interview._id}/targets`, { role: "student" })).status, 403);
  assert.equal((await call(`/${assignment.id}/targets`, { user: otherAdmin._id })).status, 404);
  assert.equal((await call(`/by-interview/${interview._id}/targets`, { user: otherAdmin._id })).status, 404);
  const conflict = await call("/", { method: "POST", body: { interviewId: String(interview._id), audience: { source: "selected", studentIds: ids(cohort) }, window: WINDOW } });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, "ALREADY_ASSIGNED");
  assert.equal(conflict.body.conflicts.length, 2);
});

test("resend invite reminds students who still have something to do, once per cooldown", async (t) => {
  if (skip(t)) return;
  const interview = await published();
  const [asha, ravi, chen] = await students(3);
  const { assignment } = await create(interview, [asha, ravi, chen]);
  await AnviAssignmentTarget.updateOne({ assignmentId: assignment.id, studentId: chen._id }, { $set: { outcome: "completed" } });
  events.length = 0;
  assert.equal((await call(`/${assignment.id}/targets/notify`, { method: "POST", body: { studentIds: ids([asha]) } })).body.recentlyNotified, 1, "just assigned: inside the cooldown");
  assert.equal(events.length, 0);
  clock.t += 11 * 60_000;
  const sent = await call(`/${assignment.id}/targets/notify`, { method: "POST", body: { studentIds: ids([asha, ravi, chen]) } });
  assert.equal(sent.status, 200);
  assert.deepEqual(sent.body, { sent: 2, recentlyNotified: 0, notEligible: 1 });
  assert.equal(events[0].event, "invite_reminder");
  assert.equal(events[0].recipients.length, 2);
  const note = describeEvent("invite_reminder", { assignment: { _id: assignment.id, title: "Backend round", window: { opensAt: new Date(), closesAt: new Date() }, slotPolicy: { mode: "slots" } }, studentId: "s1", sequence: "x" });
  assert.match(note.dedupeKey, /^anvi-invite:.+:s1:x$/, "every resend has its own key");
  assert.equal((await scheduling.notifyTargets(admin, assignment.id, ids([asha]))).sent, 0, "a second click inside the cooldown sends nothing");
  await scheduling.transitionAssignment(admin, assignment.id, "cancel");
  await rejectsWith(scheduling.notifyTargets(admin, assignment.id, ids([asha])), "ASSIGNMENT_CLOSED");
});

test("targets stay unique on a university database too (autoIndex off), and lists are tenant-scoped", async (t) => {
  if (skip(t)) return;
  const platformInterview = await published();
  const [platformStudent] = await students(1);
  await create(platformInterview, [platformStudent]);
  await runForTenant({ universityId: "north", connection: tenantConnection }, async () => {
    const interview = await published();
    const [asha, ravi] = await students(2);
    const { assignment } = await create(interview, [asha]);
    for (let round = 0; round < 3; round += 1) await scheduling.addTargets(admin, assignment.id, { studentIds: ids([asha, ravi]) });
    assert.equal(await AnviAssignmentTarget.countDocuments({ assignmentId: assignment.id }), 2, "sequential re-adds never duplicate");
    const listed = await scheduling.listTargets(admin, assignment.id);
    assert.equal(listed.pagination.total, 2);
    await rejectsWith(scheduling.listInterviewTargets(admin, String(platformInterview._id)), "INTERVIEW_NOT_FOUND");
  });
  const platform = await scheduling.listInterviewTargets(admin, String(platformInterview._id));
  assert.equal(platform.pagination.total, 1, "the university's rows never leak into the platform list");
});
