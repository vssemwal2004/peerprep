import mongoose from 'mongoose';
import { tenantModel } from '../platform/tenantContext.js';

// Daily per-topic Prep Score quota.
//
// PrepScoreSolve: one row per student and problem, written at the student's FIRST accepted practice
// solve made after the quota launched. `counted` is decided once, at solve time, and never changes,
// so a later policy edit (new limit) only affects solves made after it. Solves from before launch
// have no row and always count.
const prepScoreSolveSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // 'local:<Problem id>' or 'shared:<QuestionLibrary id>'.
  problemKey: { type: String, required: true },
  topic: { type: String, required: true },
  // Calendar day in IST, YYYY-MM-DD.
  day: { type: String, required: true },
  counted: { type: Boolean, required: true },
  limit: { type: Number, default: 0 },
  solvedAt: { type: Date, default: Date.now },
}, { versionKey: false, timestamps: true });

prepScoreSolveSchema.index({ studentId: 1, problemKey: 1 }, { unique: true });
prepScoreSolveSchema.index({ studentId: 1, counted: 1 });

// PrepScoreTopicDay: counted solves per student, topic and day. Incremented atomically only while
// below the limit, so two solves accepted at the same moment can never both take the last slot.
const prepScoreTopicDaySchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  day: { type: String, required: true },
  topic: { type: String, required: true },
  used: { type: Number, default: 0 },
}, { versionKey: false, timestamps: true });

prepScoreTopicDaySchema.index({ studentId: 1, day: 1, topic: 1 }, { unique: true });

export const PrepScoreSolve = tenantModel(mongoose.models.PrepScoreSolve || mongoose.model('PrepScoreSolve', prepScoreSolveSchema));
export const PrepScoreTopicDay = tenantModel(mongoose.models.PrepScoreTopicDay || mongoose.model('PrepScoreTopicDay', prepScoreTopicDaySchema));
