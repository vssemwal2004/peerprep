import mongoose from 'mongoose';
import { tenantModel } from '../platform/tenantContext.js';

// A company's online-test pattern for one role (2026-11-26), written by the admin like an exam
// paper: S.No | Section | Type | Questions | Duration (min) | Marks + Total. One pattern per
// company + role + OA month/year ("version"); every mock of that role points to one of them and
// keeps a copy (Assessment.mockPattern) so universities and students see it without this collection.

export const PATTERN_SECTION_TYPES = Object.freeze(['mcq', 'coding', 'one_line', 'short', 'mixed']);

const rowSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  type: { type: String, enum: PATTERN_SECTION_TYPES, default: 'mcq' },
  questions: { type: Number, min: 0, max: 500, default: 0 },
  minutes: { type: Number, min: 0, max: 1440, default: 0 },
  marks: { type: Number, min: 0, max: 10000, default: 0 },
}, { _id: false });

const patternSchema = new mongoose.Schema({
  companyKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
  roleKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
  company: { type: String, required: true, trim: true, maxlength: 120 },
  role: { type: String, required: true, trim: true, maxlength: 80 },
  patternFrom: {
    type: new mongoose.Schema({ month: { type: Number, min: 1, max: 12 }, year: { type: Number, min: 2000, max: 2100 } }, { _id: false }),
    required: true,
  },
  rows: { type: [rowSchema], default: [] },
  notes: { type: String, trim: true, maxlength: 600, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId },
  updatedBy: { type: mongoose.Schema.Types.ObjectId },
}, { timestamps: true, versionKey: false });

patternSchema.index({ companyKey: 1, roleKey: 1, 'patternFrom.year': -1, 'patternFrom.month': -1 }, { unique: true });

export default tenantModel(mongoose.models.PrepMockPattern || mongoose.model('PrepMockPattern', patternSchema));
