import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import AIInterview from "../src/models/AIInterview.js";
import User from "../src/models/User.js";
import { InterviewEngagementReceipt } from "../src/models/AdaptiveEngagement.js";
import { PlatformCoinPricing } from "../src/platform/models.js";
import { getCoinPricing } from "../src/platform/coinSpend.js";
import { normalizeDefinition } from "../src/services/aiInterviewDefinition.js";
import { aiInterviewStarted } from "../src/services/coinEntitlements.js";
import { errorHandler } from "../src/utils/errors.js";
import { createAnviStudentRouter } from "../src/modules/anviInterview/anviInterview.routes.js";
import { finalizeFromLive } from "../src/modules/anviInterview/anviInterview.service.js";
import { createAnviEvaluator } from "../src/modules/anviInterview/anviInterview.evaluation.js";
import { AnviAttempt, AnviLiveSession } from "../src/modules/anviInterview/anviInterview.models.js";
import { AnviAssignment, AnviAssignmentTarget, AnviBooking, AnviSlot, ANVI_SCHEDULING_MODELS } from "../src/modules/anviInterview/anviInterview.scheduling.models.js";
import { createAnviScheduling } from "../src/modules/anviInterview/anviInterview.scheduling.service.js";
import { createAnviSchedulingAdminRouter, createAnviSchedulingStudentRouter } from "../src/modules/anviInterview/anviInterview.scheduling.routes.js";
import { sweepAnviScheduling } from "../src/modules/anviInterview/anviInterview.scheduling.maintenance.js";

// Phase 3 end to end over HTTP: the real scheduling service and routers, the real ANVI student router and
// service, the real evaluator and sweeper. Only the clock, the notifier, the plan builder and Gemini are
// fakes; MongoDB is ephemeral.
let mongo, server, base;
let skipped = false;
const MINUTE = 60_000;
const admin = new mongoose.Types.ObjectId();
const [alice, bala, chen] = [0, 1, 2].map(() => new mongoose.Types.ObjectId());
const clock = { t: 0, now() { return this.t; } };
const at = (iso) => { clock.t = Date.parse(iso); };
const events = [];
const notifier = { async send(event, context) { events.push({ event, ...context }); return { notified: context.recipients.length }; } };
const scheduling = createAnviScheduling({ clock, notifier, log: { warn() {} } });
const config = Object.freeze({ apiKey: "test", generateModel: "fake-generate", maxSessionMinutes: 45, resumeWindowMinutes: 15, maxAttemptsPerDay: 5 });
const evaluations = [];
const evaluateSoon = (attemptId) => { evaluations.push(String(attemptId)); return null; };
const gemini = { generateJson: async () => ({ questions: [] }) };
// 45 planned minutes, so a start late in a slot is cut to the slot end plus the late grace.
const buildPlan = async (data) => ({
  plan: [
    { qid: "q1", n: 1, sectionId: "s1", sectionName: "Technical", text: data.sections[0].groups[0].questions[0].prompt, keyPoints: ["Stateless requests"], competency: "APIs" },
    { qid: "q2", n: 2, sectionId: "s1", sectionName: "Technical", text: "Explain caching.", keyPoints: ["TTL"] },
  ],
  persona: { displayName: "ANVI" },
  rules: { language: "English" },
  estimatedMinutes: 45,
});
const judge = (beforeAnswer = async () => {}) => ({
  async generateJson() {
    await beforeAnswer();
    return { items: [{ qid: "q1", keyPoints: [{ index: 1, verdict: "matched" }], rubric: [], feedback: "Good.", strengths: [], improvements: [] }] };
  },
});
const definition = () => normalizeDefinition({
  title: "Backend round", role: "Backend engineer", experience: "junior", difficulty: "medium",
  rules: { language: "English", responseSeconds: 90 },
  interviewer: { profileId: "p1", displayName: "ANVI" },
  sections: [{ id: "s1", name: "Technical", weight: 100, groups: [{ id: "g1", name: "APIs", weight: 100, source: "manual", questions: [
    { id: "q1", kind: "specific", prompt: "Explain REST.", expectedAnswer: "Stateless requests." },
  ] }] }],
  rubric: [{ id: "r1", name: "Clarity", weight: 100 }],
});
const publish = () => {
  const data = definition();
  return AIInterview.create({
    ownerId: admin, creationKey: crypto.randomUUID(), title: data.title, role: data.role, data,
    publishedSnapshot: { data, revision: 2, at: new Date() }, publishedAt: new Date(), publishedRevision: 2,
  });
};

before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } }); }
  catch (error) { if (error?.code === "EPERM") { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: "anvi_schedule_flow_test" });
  await Promise.all([AIInterview, User, AnviAttempt, AnviLiveSession, InterviewEngagementReceipt, ...ANVI_SCHEDULING_MODELS].map((model) => model.init()));
  // Starts are priced: a start requireCoins did not exempt would try to charge (and fail without a replica set).
  await PlatformCoinPricing.collection.insertOne({ _id: "current", version: 1, features: { "ai_interview.start": { price: 5, freePerMonth: 0 } } });
  await getCoinPricing({ fresh: true });
  const app = express();
  app.use(express.json());
  const authStudent = (req, _res, next) => {
    req.user = { _id: new mongoose.Types.ObjectId(req.get("X-Test-Student")), role: "student", accessScope: "full", college: "Test College" };
    next();
  };
  const authAdmin = (req, _res, next) => { req.user = { _id: admin, role: "admin" }; next(); };
  // Same order as routes/index.js.
  app.use("/api/ai-interviews/schedules", createAnviSchedulingAdminRouter(authAdmin, { service: scheduling }));
  app.use("/api/student/ai-interviews", createAnviSchedulingStudentRouter(authStudent, { service: scheduling }));
  app.use("/api/student/ai-interviews", createAnviStudentRouter(authStudent, { gemini, buildPlan, config, clock, evaluateSoon, scheduling }));
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
  events.length = 0;
  evaluations.length = 0;
  at("2027-01-03T00:00:00Z"); // Sunday
  if (skipped) return;
  await Promise.all([AIInterview, User, AnviAttempt, AnviLiveSession, InterviewEngagementReceipt, ...ANVI_SCHEDULING_MODELS].map((model) => model.deleteMany({})));
  await User.collection.insertMany([alice, bala, chen].map((_id, index) => ({
    _id, role: "student", name: ["Alice", "Bala", "Chen"][index], email: `flow${index}@example.com`, studentId: `GEU-F${index}`, isActive: true, accessScope: "full",
  })));
});

const skip = (t) => (skipped ? t.skip("Local sockets are unavailable in this sandbox") : false);
async function call(path, { method = "GET", body, as, headers = {} } = {}) {
  const result = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(as ? { "X-Test-Student": String(as) } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await result.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* ICS */ }
  return { status: result.status, body: parsed, headers: result.headers };
}
const iso = (value) => new Date(value).toISOString();

test("schedule, book, reschedule, a free capped start, practice blocked, finalize, a no-show, and a manual release", async (t) => {
  if (skip(t)) return;
  const interview = await publish();
  const interviewId = String(interview._id);

  // --- Admin schedules a slot assignment for three students (Mon/Tue 10:00-11:00 IST, two seats each).
  const body = {
    interviewId, mode: "mock",
    audience: { source: "selected", studentIds: [alice, bala, chen].map(String) },
    window: { opensAt: "2027-01-04T09:00:00+05:30", closesAt: "2027-01-05T18:00:00+05:30" },
    slotPolicy: { mode: "slots", slotMinutes: 30, capacityPerSlot: 2, dailyStart: "10:00", dailyEnd: "11:00", weekdays: [1, 2] },
    reportVisibility: "manual",
  };
  const key = { "Idempotency-Key": "flow-create-1" };
  const created = await call("/ai-interviews/schedules", { method: "POST", body, headers: key });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const aid = created.body.assignment.id;
  assert.equal(created.body.assignment.status, "scheduled");
  assert.equal(created.body.assignment.slotMode, "slots");
  assert.equal(created.body.assignment.blockPractice, true);
  assert.deepEqual(created.body.warnings, []);
  assert.deepEqual([created.body.preview.studentCount, created.body.preview.slotCount, created.body.preview.totalCapacity], [3, 4, 8]);
  assert.equal(created.body.assignment.snapshotData, undefined, "the pinned snapshot never leaves the server");
  const repeat = await call("/ai-interviews/schedules", { method: "POST", body, headers: key });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body.created, false);
  assert.equal(repeat.body.assignment.id, aid);
  assert.equal(await AnviAssignment.countDocuments(), 1);
  assert.equal(events.filter((row) => row.event === "assigned")[0].recipients.length, 3);

  // --- Practice of the scheduled interview is unavailable to everyone.
  const cards = await call("/student/ai-interviews", { as: chen });
  assert.equal(cards.status, 200);
  assert.equal(cards.body.find((row) => row.id === interviewId).practiceBlocked, true);

  // --- Alice books, then reschedules; Bala books the first slot.
  let [item] = (await call("/student/ai-interviews/assignments", { as: alice })).body;
  assert.equal(item.assignmentId, aid);
  assert.equal(item.slotMode, "slots");
  assert.equal(item.canStart, false);
  assert.equal(item.startBlockedReason, "NO_BOOKING");
  const open = await call(`/student/ai-interviews/assignments/${aid}/slots`, { as: alice });
  assert.equal(open.status, 200);
  const slots = open.body.slots;
  assert.deepEqual(slots.map((slot) => iso(slot.startsAt)), [
    "2027-01-04T04:30:00.000Z", "2027-01-04T05:00:00.000Z", "2027-01-05T04:30:00.000Z", "2027-01-05T05:00:00.000Z",
  ], "10:00 and 10:30 IST on Monday and Tuesday");
  assert.ok(slots.every((slot) => slot.bookable && slot.seatsLeft === 2));

  const booked = await call(`/student/ai-interviews/assignments/${aid}/book`, { method: "POST", body: { slotId: slots[0].id }, as: alice });
  assert.equal(booked.status, 201, JSON.stringify(booked.body));
  const bookingId = booked.body.booking.id;
  assert.equal((await call(`/student/ai-interviews/assignments/${aid}/book`, { method: "POST", body: { slotId: slots[1].id }, as: alice })).body.code, "ALREADY_BOOKED");
  const moved = await call(`/student/ai-interviews/bookings/${bookingId}/reschedule`, { method: "POST", body: { slotId: slots[1].id }, as: alice });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.deepEqual([moved.body.booking.slotId, moved.body.booking.rescheduleCount, moved.body.booking.rescheduleLeft], [slots[1].id, 1, 1]);
  assert.equal((await call(`/student/ai-interviews/assignments/${aid}/book`, { method: "POST", body: { slotId: slots[0].id }, as: bala })).status, 201);
  const seats = (await call(`/ai-interviews/schedules/${aid}/slots`)).body.slots;
  assert.deepEqual(seats.slice(0, 2).map((slot) => slot.bookedCount), [1, 1], "the old seat was released and the new one taken");
  assert.ok(events.some((row) => row.event === "rescheduled"));

  // Students act only on their own bookings.
  assert.equal((await call(`/student/ai-interviews/bookings/${bookingId}`, { method: "DELETE", as: bala })).status, 404);
  assert.equal((await call(`/student/ai-interviews/bookings/${bookingId}/reschedule`, { method: "POST", body: { slotId: slots[2].id }, as: bala })).status, 404);
  const ics = await call(`/student/ai-interviews/bookings/${bookingId}/calendar.ics`, { as: alice });
  assert.equal(ics.status, 200);
  assert.match(ics.headers.get("content-type"), /text\/calendar/);
  assert.match(ics.body, new RegExp(`UID:anvi-booking-${bookingId}@peerprep`));
  assert.match(ics.body, /SEQUENCE:1/);
  assert.match(ics.body, /DTSTART:20270104T050000Z/);

  // --- Monday 10:15 IST: Bala's 10:00 slot is past its 10 minute grace; Alice is too early for 10:30.
  at("2027-01-04T04:45:00Z");
  const early = await call(`/student/ai-interviews/assignments/${aid}/start`, { method: "POST", body: {}, as: alice });
  assert.equal(early.status, 403);
  assert.equal(early.body.code, "TOO_EARLY");
  assert.equal(await AnviAttempt.countDocuments(), 0);
  const sweep = await sweepAnviScheduling(new Date(clock.t), { scheduling });
  assert.equal(sweep.opened, 1);
  assert.equal(sweep.noShows, 1);
  assert.deepEqual(await sweepAnviScheduling(new Date(clock.t), { scheduling }), { opened: 0, closed: 0, settled: 0, reminders: 0, windowReminders: 0, noShows: 0 }, "a second pass changes nothing");
  assert.equal((await AnviBooking.findOne({ studentId: bala }).lean()).status, "no_show");
  assert.equal((await AnviAssignmentTarget.findOne({ studentId: bala }).lean()).outcome, "no_show");
  assert.equal((await AnviBooking.findById(bookingId).lean()).status, "booked", "Alice's later slot is untouched");
  assert.ok(events.some((row) => row.event === "missed" && String(row.recipients[0].studentId) === String(bala)));
  assert.equal((await call(`/student/ai-interviews/assignments/${aid}/start`, { method: "POST", body: {}, as: bala })).body.code, "NO_BOOKING");
  assert.equal((await call(`/student/ai-interviews/assignments/${aid}/book`, { method: "POST", body: { slotId: slots[2].id }, as: bala })).body.code, "NO_SHOW_RECORDED");

  // --- Monday 10:28 IST: inside Alice's join window. The start is free, pinned and capped.
  at("2027-01-04T04:58:00Z");
  [item] = (await call("/student/ai-interviews/assignments", { as: alice })).body;
  assert.equal(item.canStart, true);
  const started = await call(`/student/ai-interviews/assignments/${aid}/start`, { method: "POST", body: {}, as: alice });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  assert.equal(started.body.resumed, false);
  assert.equal(started.body.assignmentId, aid);
  const attempt = await AnviAttempt.findById(started.body.id).lean();
  assert.equal(attempt.mode, "mock");
  assert.equal(String(attempt.assignmentId), aid);
  assert.equal(String(attempt.bookingId), bookingId);
  assert.equal(attempt.snapshotRevision, 2);
  assert.equal(iso(attempt.hardDeadline), "2027-01-04T05:40:00.000Z", "45 planned minutes are cut to the 11:00 slot end plus 10 minutes grace");
  assert.equal(await aiInterviewStarted({ _id: alice, college: "Test College" }, interviewId), false, "a free scheduled attempt never makes practice free");
  const target = await AnviAssignmentTarget.findOne({ studentId: alice }).lean();
  assert.deepEqual([target.attemptsUsed, target.outcome, String(target.lastAttemptId)], [1, "in_progress", started.body.id]);
  assert.equal(String((await AnviBooking.findById(bookingId).lean()).attemptId), started.body.id);
  [item] = (await call("/student/ai-interviews/assignments", { as: alice })).body;
  assert.equal(item.resume, true);
  const rejoin = await call(`/student/ai-interviews/assignments/${aid}/start`, { method: "POST", body: {}, as: alice });
  assert.deepEqual([rejoin.status, rejoin.body.id, rejoin.body.resumed], [201, started.body.id, true]);

  // Practice start of the same interview is refused for the cohort and for everyone else.
  for (const student of [alice, chen]) {
    const practice = await call(`/student/ai-interviews/${interviewId}/start`, { method: "POST", body: {}, as: student });
    assert.equal(practice.status, 403);
    assert.equal(practice.body.code, "PRACTICE_BLOCKED");
  }
  assert.equal(await AnviAttempt.countDocuments(), 1);

  // --- The conductor completes the interview (same finalize the socket uses).
  await AnviLiveSession.updateOne({ attemptId: attempt._id }, { $set: { answers: { q1: { text: "REST keeps each request stateless so any server can answer it." } } } });
  at("2027-01-04T05:20:00Z");
  assert.equal(await finalizeFromLive(attempt, { status: "completed", endReason: "completed", now: new Date(clock.t), evaluateSoon, onFinalized: scheduling.onAttemptFinalized }), true);
  assert.ok(evaluations.includes(started.body.id));
  const done = await AnviAssignmentTarget.findOne({ studentId: alice }).lean();
  assert.deepEqual([done.outcome, done.partial], ["completed", false]);
  const finished = await AnviBooking.findById(bookingId).lean();
  assert.deepEqual([finished.status, finished.active], ["completed", false]);

  // --- Evaluation: a manual-release report stays hidden, key points included.
  const notes = [];
  const evaluator = createAnviEvaluator({ gemini: judge(), config, clock, scheduling, notify: async (note) => { notes.push(note); return true; }, log: { warn() {} } });
  assert.equal((await evaluator.evaluateNow(attempt._id)).status, "ready");
  assert.equal((await AnviAttempt.findById(attempt._id).lean()).visibleToStudentAt, null);
  assert.equal(notes.length, 0);
  let report = await call(`/student/ai-interviews/attempts/${started.body.id}`, { as: alice });
  assert.equal(report.body.report, "preparing");
  assert.equal(report.body.assignmentId, aid);
  assert.doesNotMatch(JSON.stringify(report.body), /Stateless requests/);
  [item] = (await call("/student/ai-interviews/assignments", { as: alice })).body;
  assert.deepEqual([item.outcome, item.reportVisible], ["completed", false]);

  // --- Admin closes: Chen never booked (missed); a manual report is still hidden after close.
  at("2027-01-04T06:00:00Z");
  const closed = await call(`/ai-interviews/schedules/${aid}/close`, { method: "POST", body: {} });
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.equal(closed.body.assignment.status, "closed");
  const detail = await call(`/ai-interviews/schedules/${aid}`);
  assert.deepEqual(
    [detail.body.kpis.assigned, detail.body.kpis.completed, detail.body.kpis.noShow, detail.body.kpis.missed, detail.body.kpis.pending],
    [3, 1, 1, 1, 0],
  );
  assert.equal(detail.body.roster.find((row) => row.studentId === String(chen)).outcome, "missed");
  report = await call(`/student/ai-interviews/attempts/${started.body.id}`, { as: alice });
  assert.equal(report.body.report, "preparing", "manual visibility waits for the release, not the close");

  // --- Admin releases: the report and its key points become visible, and the student is told.
  const released = await call(`/ai-interviews/schedules/${aid}/release`, { method: "POST", body: {} });
  assert.equal(released.status, 200, JSON.stringify(released.body));
  assert.equal(released.body.released, 1);
  assert.ok(released.body.assignment.releasedAt);
  report = await call(`/student/ai-interviews/attempts/${started.body.id}`, { as: alice });
  assert.equal(report.body.report, "ready");
  assert.match(JSON.stringify(report.body.items), /Stateless requests/);
  const note = events.find((row) => row.event === "released");
  assert.deepEqual(note.recipients.map((row) => String(row.attemptId)), [started.body.id]);
  [item] = (await call("/student/ai-interviews/assignments", { as: alice })).body;
  assert.equal(item.reportVisible, true);
  // A closed assignment no longer holds practice back.
  assert.equal((await call("/student/ai-interviews", { as: chen })).body.find((row) => row.id === interviewId).practiceBlocked, false);
});

test("an after_close report is released even when the assignment closes while it is being scored", async (t) => {
  if (skip(t)) return;
  const interview = await publish();
  at("2027-01-04T05:00:00Z");
  const { assignment } = await scheduling.createAssignment({ _id: admin }, {
    interviewId: String(interview._id), audience: { source: "selected", studentIds: [String(alice)] },
    window: { opensAt: "2027-01-04T09:00:00+05:30", closesAt: "2027-01-04T18:00:00+05:30" }, reportVisibility: "after_close",
  });
  assert.equal(assignment.status, "open");
  const attempt = await AnviAttempt.create({
    studentId: alice, interviewId: interview._id, assignmentId: assignment.id, mode: "mock", snapshotRevision: 2, status: "completed",
    startedAt: new Date(clock.t - 30 * MINUTE), endedAt: new Date(clock.t), hardDeadline: new Date(clock.t),
    items: [{ qid: "q1", n: 1, sectionId: "s1", sectionName: "Technical", questionText: "Explain REST.", answerText: "Stateless requests let any server answer.", status: "answered", expectedKeyPoints: ["Stateless requests"], maxMarks: 10 }],
    pendingWork: { status: "pending", attempts: 0, nextAttemptAt: new Date(clock.t - 1000) },
  });
  const notes = [];
  // The admin closes the assignment while Gemini is still scoring; the close's release finds nothing ready.
  const evaluator = createAnviEvaluator({
    gemini: judge(() => scheduling.transitionAssignment({ _id: admin }, assignment.id, "close")),
    config, clock, scheduling, notify: async (row) => { notes.push(row); return true; }, log: { warn() {} },
  });
  assert.equal((await evaluator.evaluateNow(attempt._id)).status, "ready");
  assert.equal((await AnviAssignment.findById(assignment.id).lean()).status, "closed");
  const stored = await AnviAttempt.findById(attempt._id).lean();
  assert.ok(stored.visibleToStudentAt, "released by the evaluator's recheck");
  assert.equal(notes.length, 1, "the student is told the report is ready");
});
