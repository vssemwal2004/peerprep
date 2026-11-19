import mongoose from 'mongoose';
import { tenantModel } from '../platform/tenantContext.js';

// Monthly badge ladders (services/monthlyBadges.js). Every student has the same badges; each month
// each badge gets levels 1-10 whose targets come from that student's own last three months, so the
// targets rise as the student improves. A ladder is frozen for its month once created.
const ladderTrackSchema = new mongoose.Schema({
  key: { type: String, required: true },
  baseline: { type: Number, default: 0 },
  // targets[i] is the value needed for level i + 1.
  targets: { type: [Number], default: [] },
}, { _id: false });

const badgeLadderSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // IST calendar month, YYYY-MM.
  month: { type: String, required: true },
  tracks: { type: [ladderTrackSchema], default: [] },
  // Ladder rules version (services/monthlyBadges.js LADDER_RULES); an older one is rebuilt once.
  rules: { type: String, default: null },
}, { versionKey: false, timestamps: true });
badgeLadderSchema.index({ studentId: 1, month: 1 }, { unique: true });

// One earned level. Unique, so a level (and its coins) is awarded once however often we evaluate.
const badgeLevelAwardSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  month: { type: String, required: true },
  track: { type: String, required: true },
  level: { type: Number, required: true, min: 1, max: 10 },
  target: { type: Number, default: 0 },
  value: { type: Number, default: 0 },
  coins: { type: Number, default: 0 },
  earnedAt: { type: Date, default: Date.now },
}, { versionKey: false });
badgeLevelAwardSchema.index({ studentId: 1, month: 1, track: 1, level: 1 }, { unique: true });
badgeLevelAwardSchema.index({ studentId: 1, earnedAt: -1 });

// First app open per IST calendar day: the daily login coin and the heatmap's login day.
const studentDailyLoginSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  day: { type: String, required: true },
  at: { type: Date, default: Date.now },
}, { versionKey: false });
studentDailyLoginSchema.index({ studentId: 1, day: 1 }, { unique: true });

export const BadgeLadder = tenantModel(mongoose.models.BadgeLadder || mongoose.model('BadgeLadder', badgeLadderSchema));
export const BadgeLevelAward = tenantModel(mongoose.models.BadgeLevelAward || mongoose.model('BadgeLevelAward', badgeLevelAwardSchema));
export const StudentDailyLogin = tenantModel(mongoose.models.StudentDailyLogin || mongoose.model('StudentDailyLogin', studentDailyLoginSchema));
