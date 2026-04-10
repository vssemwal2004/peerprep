import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
  sectionIndex: { type: Number, required: true },
  questionIndex: { type: Number, required: true },
  answer: { type: mongoose.Schema.Types.Mixed },
  language: { type: String },
  code: { type: String },
  jobId: { type: String },
  executionStatus: {
    type: String,
    enum: ['queued', 'processing', 'completed', 'failed'],
  },
  executionVerdict: {
    type: String,
    enum: ['PENDING', 'AC', 'WA', 'TLE', 'RE', 'CE', 'FAILED'],
  },
  executionResult: { type: mongoose.Schema.Types.Mixed },
  lastEvaluatedAt: { type: Date },
}, { _id: false });

const assessmentSubmissionSchema = new mongoose.Schema({
  assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  answers: { type: [answerSchema], default: [] },
  score: { type: Number },
  maxMarks: { type: Number },
  accuracy: { type: Number },
  timeTakenSec: { type: Number },
  startedAt: { type: Date },
  submittedAt: { type: Date },
  status: { type: String, enum: ['not_started', 'in_progress', 'submitted', 'expired', 'violation', 'incomplete'], default: 'not_started' },
  lastSavedAt: { type: Date },
  tabSwitches: { type: Number, default: 0 },
  fullscreenExits: { type: Number, default: 0 },
  copyPasteCount: { type: Number, default: 0 },
  cameraFlags: { type: Number, default: 0 },
  violations: { type: [mongoose.Schema.Types.Mixed], default: [] },
  attemptCount: { type: Number, default: 0 },
  isLate: { type: Boolean, default: false },
  lastIp: { type: String },
  lastUserAgent: { type: String },
  evaluationStatus: {
    type: String,
    enum: ['completed', 'processing', 'failed'],
    default: 'completed',
  },
  codingJobsPending: { type: Number, default: 0 },
  codingJobsCompleted: { type: Number, default: 0 },
}, { timestamps: true });

assessmentSubmissionSchema.index({ assessmentId: 1, studentId: 1 }, { unique: true });
assessmentSubmissionSchema.index({ assessmentId: 1, submittedAt: -1 });
assessmentSubmissionSchema.index({ studentId: 1, submittedAt: -1 });
assessmentSubmissionSchema.index({ status: 1, submittedAt: -1 });

export default mongoose.model('AssessmentSubmission', assessmentSubmissionSchema);

