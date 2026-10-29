import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import AIInterview from "../src/models/AIInterview.js";
import User from "../src/models/User.js";
import { errorHandler } from "../src/utils/errors.js";
import { AnviAttempt } from "../src/modules/anviInterview/anviInterview.models.js";
import { AnviBooking, AnviSlot, ANVI_SCHEDULING_MODELS } from "../src/modules/anviInterview/anviInterview.scheduling.models.js";
import { createAnviScheduling } from "../src/modules/anviInterview/anviInterview.scheduling.service.js";
import { createAnviSchedulingAdminRouter, createAnviSchedulingStudentRouter } from "../src/modules/anviInterview/anviInterview.scheduling.routes.js";

// Scheduling routes over an ephemeral MongoDB; the user comes from test headers.
let mongo, server, base;
let skipped = false;
let authCalls = 0;
const adminId = new mongoose.Types.ObjectId();
const clock = { t: Date.parse("2026-11-01T00:00:00.000Z"), now() { return this.t; } };
const events = [];
const service = createAnviScheduling({ clock, notifier: { async send(event, context) { events.push({ event, ...context }); } }, log: { warn() {} } });

before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } }); }
  catch (error) { if (error?.code === "EPERM") { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: "anvi_scheduling_routes_test" });
  await Promise.all([AIInterview.init(), AnviAttempt.init(), ...ANVI_SCHEDULING_MODELS.map((model) => model.init())]);
  const authenticate = (req, _res, next) => {
    authCalls += 1;
    req.user = { _id: new mongoose.Types.ObjectId(req.get("X-Test-User") || String(adminId)), role: req.get("X-Test-Role") || "admin", accessScope: req.get("X-Test-Scope") || "full" };
    next();
  };
  const app = express();
  app.use(express.json());
  app.use("/api/ai-interviews/schedules", createAnviSchedulingAdminRouter(authenticate, { service }));
  app.use("/api/student/ai-interviews", createAnviSchedulingStudentRouter(authenticate, { service }));
  // Stands in for the ANVI student router that owns the assigned start.
  app.post("/api/student/ai-interviews/assignments/:aid/start", (req, res) => res.status(202).json({ passthrough: req.params.aid }));
  app.use(errorHandler);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  clock.t = Date.parse("2026-11-01T00:00:00.000Z");
  events.length = 0;
  authCalls = 0;
  if (skipped) return;
  await Promise.all([AIInterview, User, AnviAttempt, ...ANVI_SCHEDULING_MODELS].map((model) => model.deleteMany({})));
});

const skip = (t) => (skipped ? t.skip("Local sockets are unavailable in this sandbox") : false);
async function call(path, { method = "GET", body, user, role, headers = {} } = {}) {
  const result = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(user ? { "X-Test-User": String(user) } : {}), ...(role ? { "X-Test-Role": role } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = result.headers.get("content-type") || "";
  return { status: result.status, headers: result.headers, body: type.includes("json") ? await result.json() : await result.text() };
}
const asStudent = (student, path, options = {}) => call(path, { ...options, user: student._id, role: "student" });
async function seed() {
  const interview = await AIInterview.create({
    ownerId: adminId, creationKey: crypto.randomUUID(), title: "Backend round", data: { title: "Backend round" },
    publishedAt: new Date(), publishedRevision: 1, publishedSnapshot: { data: { title: "Backend round", role: "SDE" }, revision: 1 },
  });
  const students = [
    { _id: new mongoose.Types.ObjectId(), role: "student", name: "=HYPERLINK(\"http://x\")", email: "asha@example.com", studentId: "GEU-1" },
    { _id: new mongoose.Types.ObjectId(), role: "student", name: "Ravi Kumar", email: "ravi@example.com", studentId: "GEU-2" },
  ];
  await User.collection.insertMany(students);
  return { interview, students };
}
const createBody = (interview, students) => ({
  interviewId: String(interview._id),
  audience: { source: "csv", studentIds: students.map((row) => String(row._id)) },
  window: { opensAt: "2026-11-02T09:00:00+05:30", closesAt: "2026-11-04T18:00:00+05:30" },
  slotPolicy: { mode: "slots", slotMinutes: 30, capacityPerSlot: 1, dailyStart: "10:00", dailyEnd: "11:30", weekdays: [1] },
});

test("scheduling routers are mounted ahead of the interview id routes", () => {
  const source = readFileSync(new URL("../src/routes/index.js", import.meta.url), "utf8");
  const admin = source.indexOf("router.use('/ai-interviews/schedules'");
  const student = source.indexOf("router.use('/student/ai-interviews', createAnviSchedulingStudentRouter())");
  assert.ok(admin > 0 && admin < source.indexOf("router.use('/ai-interviews', "), "/schedules must not be captured by /ai-interviews/:id");
  assert.ok(student > 0 && student < source.indexOf("router.use('/student/ai-interviews', aiInterviewStudentRoutes)"));
});

test("admin routes create, list, edit, transition and export an assignment", async (t) => {
  if (skip(t)) return;
  const { interview, students } = await seed();
  assert.equal((await call("/ai-interviews/schedules", { role: "coordinator" })).status, 403);
  const bad = await call("/ai-interviews/schedules", { method: "POST", body: { ...createBody(interview, students), window: { opensAt: "2026-11-02T09:00", closesAt: "2026-11-04T18:00" } } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, "INVALID_DATETIME");
  const created = await call("/ai-interviews/schedules", { method: "POST", body: createBody(interview, students), headers: { "Idempotency-Key": "abc" } });
  assert.equal(created.status, 201);
  assert.equal(created.body.assignment.audience.source, "csv");
  assert.equal(created.body.assignment.slotMode, "slots");
  assert.equal(created.body.preview.slotCount, 3);
  assert.equal(created.body.warnings.length, 0);
  const repeat = await call("/ai-interviews/schedules", { method: "POST", body: createBody(interview, students), headers: { "Idempotency-Key": "abc" } });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body.assignment.id, created.body.assignment.id);
  const id = created.body.assignment.id;

  const list = await call(`/ai-interviews/schedules?interviewId=${interview._id}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.assignments.length, 1);
  assert.equal(list.body.assignments[0].kpis.assigned, 2);
  assert.equal((await call("/ai-interviews/schedules?status=weird")).body.code, "INVALID_STATUS");
  assert.equal((await call(`/ai-interviews/schedules/${id}`, { user: new mongoose.Types.ObjectId() })).status, 404, "other admins cannot see it");

  const detail = await call(`/ai-interviews/schedules/${id}`);
  assert.equal(detail.body.roster.length, 2);
  assert.equal(detail.body.slots.count, 3);
  const conflict = await call(`/ai-interviews/schedules/${id}`, { method: "PATCH", body: { revision: 1, notes: "late" } });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, "REVISION_CONFLICT");
  assert.equal(conflict.body.revision, detail.body.assignment.revision);
  const patched = await call(`/ai-interviews/schedules/${id}`, { method: "PATCH", body: { revision: detail.body.assignment.revision, notes: "Bring headphones", bookingPolicy: { cutoffMinutes: 30 } } });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.assignment.notes, "Bring headphones");
  assert.equal(patched.body.assignment.bookingPolicy.cutoffMinutes, 30);

  const slots = await call(`/ai-interviews/schedules/${id}/slots`);
  assert.equal(slots.body.slots.length, 3);
  assert.equal(slots.body.slots[0].seatsLeft, 1);
  const csv = await call(`/ai-interviews/schedules/${id}/roster.csv`);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type"), /text\/csv/);
  assert.match(csv.headers.get("content-disposition"), /attachment; filename="backend-round-roster.csv"/);
  assert.match(csv.body, /"'=HYPERLINK\(""http:\/\/x""\)"/, "formula cells are neutralised");

  assert.equal((await call(`/ai-interviews/schedules/${id}/pause`, { method: "POST" })).body.assignment.status, "paused");
  assert.equal((await call(`/ai-interviews/schedules/${id}/resume`, { method: "POST" })).body.assignment.status, "scheduled");
  assert.equal((await call(`/ai-interviews/schedules/${id}/explode`, { method: "POST" })).status, 404);
  const removed = await call(`/ai-interviews/schedules/${id}/targets/${students[1]._id}`, { method: "DELETE" });
  assert.equal(removed.body.removed, 1);
  const added = await call(`/ai-interviews/schedules/${id}/targets`, { method: "POST", body: { studentIds: [String(students[1]._id)] } });
  assert.equal(added.body.added, 1);
  const invalid = await call(`/ai-interviews/schedules/${id}/targets`, { method: "POST", body: { studentIds: [String(new mongoose.Types.ObjectId())] } });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, "INVALID_STUDENTS");
  assert.equal(invalid.body.invalid.length, 1);
});

test("students book, reschedule, download and cancel only their own bookings", async (t) => {
  if (skip(t)) return;
  const { interview, students } = await seed();
  const [asha, ravi] = students;
  const { assignment } = await service.createAssignment({ _id: adminId }, createBody(interview, students));
  const listed = await asStudent(asha, "/student/ai-interviews/assignments");
  assert.equal(listed.status, 200);
  assert.equal(listed.body[0].assignmentId, assignment.id);
  assert.equal((await call("/student/ai-interviews/assignments")).status, 403, "admins are not students");
  assert.equal((await call("/student/ai-interviews/assignments", { user: asha._id, role: "student", headers: { "X-Test-Scope": "assessment_only" } })).status, 403);

  const open = await asStudent(asha, `/student/ai-interviews/assignments/${assignment.id}/slots`);
  assert.equal(open.body.slots.length, 3);
  const [a, b] = open.body.slots.map((slot) => slot.id);
  const booked = await asStudent(asha, `/student/ai-interviews/assignments/${assignment.id}/book`, { method: "POST", body: { slotId: a } });
  assert.equal(booked.status, 201);
  const bookingId = booked.body.booking.id;
  const full = await asStudent(ravi, `/student/ai-interviews/assignments/${assignment.id}/book`, { method: "POST", body: { slotId: a } });
  assert.equal(full.status, 409);
  assert.equal(full.body.code, "SLOT_FULL");
  assert.equal((await asStudent(ravi, `/student/ai-interviews/assignments/${new mongoose.Types.ObjectId()}/slots`)).status, 404);

  const moved = await asStudent(asha, `/student/ai-interviews/bookings/${bookingId}/reschedule`, { method: "POST", body: { slotId: b } });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.booking.slotId, b);
  const ics = await asStudent(asha, `/student/ai-interviews/bookings/${bookingId}/calendar.ics`);
  assert.equal(ics.status, 200);
  assert.match(ics.headers.get("content-type"), /text\/calendar/);
  assert.match(ics.headers.get("content-disposition"), /attachment; filename="anvi-interview.ics"/);
  assert.match(ics.body, new RegExp(`UID:anvi-booking-${bookingId}@peerprep`));
  assert.match(ics.body, /SEQUENCE:1/);
  assert.equal((await asStudent(ravi, `/student/ai-interviews/bookings/${bookingId}/calendar.ics`)).status, 404);
  assert.equal((await asStudent(ravi, `/student/ai-interviews/bookings/${bookingId}`, { method: "DELETE" })).status, 404);
  const cancelled = await asStudent(asha, `/student/ai-interviews/bookings/${bookingId}`, { method: "DELETE" });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.booking.status, "cancelled");
  assert.equal((await AnviSlot.findById(b).lean()).bookedCount, 0);

  authCalls = 0;
  const start = await asStudent(asha, `/student/ai-interviews/assignments/${assignment.id}/start`, { method: "POST", body: {} });
  assert.equal(start.status, 202, "the assigned start falls through to the ANVI student router");
  assert.equal(authCalls, 0, "scheduling guards only run on its own routes");
});

test("admin booking routes move and cancel a student's booking", async (t) => {
  if (skip(t)) return;
  const { interview, students } = await seed();
  const { assignment } = await service.createAssignment({ _id: adminId }, createBody(interview, students));
  const slots = await AnviSlot.find({ assignmentId: assignment.id }).sort({ startsAt: 1 }).lean();
  const { booking } = await service.bookSlot(students[0], assignment.id, String(slots[0]._id));
  const moved = await call(`/ai-interviews/schedules/bookings/${booking.id}/move`, { method: "POST", body: { slotId: String(slots[2]._id) } });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.booking.slotId, String(slots[2]._id));
  assert.equal((await call(`/ai-interviews/schedules/bookings/${booking.id}/move`, { method: "POST", body: { slotId: "nope" } })).body.code, "INVALID_IDENTIFIER");
  const cancelled = await call(`/ai-interviews/schedules/bookings/${booking.id}/cancel`, { method: "POST", body: { reason: "Exam clash" } });
  assert.equal(cancelled.status, 200);
  assert.equal((await AnviBooking.findById(booking.id).lean()).cancelledBy, "admin");
  assert.equal((await call(`/ai-interviews/schedules/bookings/${booking.id}/cancel`, { method: "POST", body: {} })).body.code, "BOOKING_NOT_ACTIVE");
});
