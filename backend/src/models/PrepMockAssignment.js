import mongoose from 'mongoose';
import { tenantModel } from '../platform/tenantContext.js';

// A university's own schedule for one Prep Mock (2026-11-26): the university SPOC picks some of its
// Prep Mock students and a date-time window ("do this mock between …"). Every enrolled student still
// sees every live mock; this only marks the mock as assigned, with dates, for the chosen students.
// Lives in the university's database; the mock itself is the platform's (mockId).
const assignmentSchema = new mongoose.Schema({
  mockId: { type: mongoose.Schema.Types.ObjectId, required: true },
  studentIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  startTime: { type: Date, default: null },
  endTime: { type: Date, default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId },
}, { timestamps: true, versionKey: false });

assignmentSchema.index({ mockId: 1 }, { unique: true });
assignmentSchema.index({ studentIds: 1 });

export default tenantModel(mongoose.models.PrepMockAssignment || mongoose.model('PrepMockAssignment', assignmentSchema));
