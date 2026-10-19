import mongoose from 'mongoose';
import { tenantModel } from '../platform/tenantContext.js';

// One stored Prep Score per student and policy version. Ranks are counted from these rows, so a
// university's rank never needs the whole cohort recomputed. Two versions coexist only while a
// newly published policy is being rebuilt; reads stay on the serving version until it finishes.
const studentPrepScoreSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  policyVersion: { type: Number, required: true },
  // University deployments rank everyone together; the platform ranks within a college.
  cohortKey: { type: String, default: '' },
  eligible: { type: Boolean, default: true },
  hasProgress: { type: Boolean, default: false },
  total: { type: Number, default: 0 },
  // Admin-only detail: per-module score and Easy/Medium/Hard counts. Never sent to students.
  modules: { type: mongoose.Schema.Types.Mixed, default: {} },
  computedAt: { type: Date, default: Date.now },
}, { versionKey: false, minimize: false });

studentPrepScoreSchema.index({ policyVersion: 1, studentId: 1 }, { unique: true });
studentPrepScoreSchema.index({ policyVersion: 1, cohortKey: 1, eligible: 1, hasProgress: 1, total: -1 });

const prepScoreStateSchema = new mongoose.Schema({
  _id: { type: String, default: 'state' },
  servingVersion: Number,
  permissionsKey: String,
  // Activity changed after this moment has not been folded into stored scores yet.
  watermark: Date,
  lastFullAt: Date,
  rebuild: {
    version: Number,
    permissionsKey: String,
    afterId: mongoose.Schema.Types.ObjectId,
    startedAt: Date,
    processed: { type: Number, default: 0 },
  },
}, { versionKey: false, timestamps: true });

export const StudentPrepScore = tenantModel(mongoose.models.StudentPrepScore || mongoose.model('StudentPrepScore', studentPrepScoreSchema));
export const PrepScoreState = tenantModel(mongoose.models.PrepScoreState || mongoose.model('PrepScoreState', prepScoreStateSchema));
