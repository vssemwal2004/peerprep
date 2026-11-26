// One Resume JD Match check, kept in the student's university database. The job description is
// held (encrypted) only until the check finishes; the report is stored encrypted for history.
import mongoose from 'mongoose';
import { tenantModel } from '../../platform/tenantContext.js';

const resumeJdMatchSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['queued', 'running', 'done', 'failed'], default: 'queued' },
  // What the student's popup shows: queued → reading → matching → verifying → done.
  stage: { type: String, enum: ['queued', 'reading', 'matching', 'verifying', 'done', 'failed'], default: 'queued' },
  company: { type: String, default: '', maxlength: 80 },
  role: { type: String, default: '', maxlength: 80 },
  jdHash: { type: String, required: true },
  resumeHash: { type: String, default: '' },
  payload: { type: String, default: null },
  report: { type: String, default: null },
  score: { type: Number, default: null },
  // True while queued or running: a unique index on it allows one check at a time per student,
  // across every API process (an in-memory lock alone cannot).
  active: { type: Boolean, default: undefined },
  // Gemini billed a response for this check (counts toward the daily limit even if it then failed).
  billed: { type: Boolean, default: false },
  chargeId: { type: mongoose.Schema.Types.ObjectId, default: null },
  cost: { type: Number, default: 0 },
  refunded: { type: Boolean, default: false },
  error: {
    code: String,
    message: String,
  },
  usage: {
    model: String,
    input: Number,
    output: Number,
    thoughts: Number,
    usd: Number,
  },
  startedAt: Date,
  finishedAt: Date,
}, { timestamps: true });

resumeJdMatchSchema.index({ student: 1, createdAt: -1 });
resumeJdMatchSchema.index({ student: 1, jdHash: 1, resumeHash: 1, status: 1, createdAt: -1 });
resumeJdMatchSchema.index({ student: 1 }, { name: 'one_active_check_per_student', unique: true, partialFilterExpression: { active: true } });

export const ResumeJdMatch = tenantModel(mongoose.models.ResumeJdMatch || mongoose.model('ResumeJdMatch', resumeJdMatchSchema));
export default ResumeJdMatch;
