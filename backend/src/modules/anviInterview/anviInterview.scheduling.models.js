import mongoose from "mongoose";
import { tenantModel } from "../../platform/tenantContext.js";

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

// Scheduled ANVI interviews: an admin assigns one published revision to a cohort inside an IST window.
// Times are stored in UTC; slot hours and blackout dates are IST wall-clock values.
const slotPolicySchema = new Schema({
  mode: { type: String, enum: ["window", "slots"], default: "window" },
  slotMinutes: Number,
  capacityPerSlot: Number,
  dailyStart: String,
  dailyEnd: String,
  weekdays: { type: [Number], default: undefined },
  blackoutDates: { type: [String], default: undefined },
}, { _id: false });

const bookingPolicySchema = new Schema({
  rescheduleLimit: { type: Number, default: 2 },
  cutoffMinutes: { type: Number, default: 60 },
  earlyJoinMinutes: { type: Number, default: 10 },
  lateGraceMinutes: { type: Number, default: 10 },
  attemptsAllowed: { type: Number, default: 1 },
}, { _id: false });

const assignmentSchema = new Schema({
  ownerId: { type: ObjectId, ref: "User", required: true },
  // The admin client's Idempotency-Key, so a double submit returns the first assignment.
  creationKey: { type: String, default: undefined },
  interviewId: { type: ObjectId, ref: "AIInterview", required: true },
  snapshotRevision: { type: Number, required: true },
  // The published definition at scheduling time; later republishes never change this assignment.
  snapshotData: { type: Schema.Types.Mixed, required: true },
  title: { type: String, required: true },
  role: { type: String, default: "" },
  mode: { type: String, enum: ["mock", "adaptive"], default: "mock" },
  audience: {
    source: { type: String, enum: ["filters", "selected", "csv"], required: true },
    filters: { type: Schema.Types.Mixed, default: {} },
    studentCount: { type: Number, default: 0 },
  },
  window: {
    opensAt: { type: Date, required: true },
    closesAt: { type: Date, required: true },
  },
  timezone: { type: String, default: "Asia/Kolkata" },
  slotPolicy: { type: slotPolicySchema, default: () => ({ mode: "window" }) },
  bookingPolicy: { type: bookingPolicySchema, default: () => ({}) },
  reportVisibility: { type: String, enum: ["immediate", "after_close", "manual"], default: "after_close" },
  blockPractice: { type: Boolean, default: true },
  // draft -> scheduled -> open <-> paused -> closed -> archived; cancelled from scheduled, open or paused.
  status: { type: String, enum: ["draft", "scheduled", "open", "paused", "closed", "cancelled", "archived"], default: "draft" },
  releasedAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },
  // Set once the close work (missed, no-shows, report release) has run; the sweeper retries until then.
  closeEffectsAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  createdBy: { type: ObjectId, ref: "User" },
  revision: { type: Number, default: 1 },
  notes: { type: String, default: "" },
}, { timestamps: true, minimize: false });

assignmentSchema.index({ interviewId: 1, status: 1 });
assignmentSchema.index({ status: 1, "window.opensAt": 1 });
assignmentSchema.index({ status: 1, "window.closesAt": 1 });
assignmentSchema.index({ ownerId: 1, createdAt: -1 });
assignmentSchema.index({ ownerId: 1, creationKey: 1 },
  { unique: true, partialFilterExpression: { creationKey: { $type: "string" } }, name: "anvi_assignment_creation_key" });

const targetSchema = new Schema({
  assignmentId: { type: ObjectId, required: true },
  studentId: { type: ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["assigned", "removed"], default: "assigned" },
  source: { type: String, enum: ["filters", "selected", "csv", "manual"], default: "selected" },
  attemptsUsed: { type: Number, default: 0 },
  lastAttemptId: { type: ObjectId, default: null },
  outcome: {
    type: String,
    enum: ["pending", "booked", "in_progress", "completed", "no_show", "missed", "cancelled"],
    default: "pending",
  },
  // The last attempt ended early (abandoned or expired) but was still scored.
  partial: { type: Boolean, default: false },
  remindersSent: { type: [String], default: [] },
  notifiedAt: { type: Date, default: null },
  removedAt: { type: Date, default: null },
}, { timestamps: true });

targetSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });
targetSchema.index({ studentId: 1, status: 1 });
targetSchema.index({ assignmentId: 1, status: 1, outcome: 1 });

const slotSchema = new Schema({
  assignmentId: { type: ObjectId, required: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  capacity: { type: Number, required: true },
  bookedCount: { type: Number, default: 0 },
  status: { type: String, enum: ["open", "closed", "cancelled"], default: "open" },
}, { timestamps: true });

slotSchema.index({ assignmentId: 1, startsAt: 1 }, { unique: true });
slotSchema.index({ assignmentId: 1, status: 1, startsAt: 1 });

const historySchema = new Schema({
  action: String,
  from: { type: Date, default: null },
  to: { type: Date, default: null },
  at: { type: Date, default: Date.now },
  by: { type: String, default: "student" },
}, { _id: false });

const bookingSchema = new Schema({
  assignmentId: { type: ObjectId, required: true },
  // Null in window mode, and after the booked slot was withdrawn (needs_reschedule).
  slotId: { type: ObjectId, default: null },
  studentId: { type: ObjectId, ref: "User", required: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  status: { type: String, enum: ["booked", "completed", "cancelled", "no_show", "needs_reschedule"], default: "booked" },
  // At most one active booking per student and assignment (unique partial index below).
  active: { type: Boolean, default: true },
  // Every change of time; it is the calendar SEQUENCE, so it only ever grows.
  rescheduleCount: { type: Number, default: 0 },
  // Changes the student did not ask for (admin moves, withdrawn slots); they do not use up the limit.
  freeReschedules: { type: Number, default: 0 },
  history: { type: [historySchema], default: [] },
  remindersSent: { type: [String], default: [] },
  attemptId: { type: ObjectId, default: null },
  cancelledBy: { type: String, default: null },
  cancelReason: { type: String, default: null },
}, { timestamps: true });

bookingSchema.index({ assignmentId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { active: true }, name: "anvi_one_active_booking" });
bookingSchema.index({ status: 1, startsAt: 1 });
bookingSchema.index({ studentId: 1, active: 1 });
bookingSchema.index({ slotId: 1, active: 1 });
bookingSchema.index({ assignmentId: 1, status: 1 });

export const AnviAssignment = tenantModel(mongoose.model("AnviAssignment", assignmentSchema));
export const AnviAssignmentTarget = tenantModel(mongoose.model("AnviAssignmentTarget", targetSchema));
export const AnviSlot = tenantModel(mongoose.model("AnviSlot", slotSchema));
export const AnviBooking = tenantModel(mongoose.model("AnviBooking", bookingSchema));
export const ANVI_SCHEDULING_MODELS = [AnviAssignment, AnviAssignmentTarget, AnviSlot, AnviBooking];
