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
  passwordVerifiedAt: { type: Date },
  securitySetup: { type: mongoose.Schema.Types.Mixed, default: {} },
  securityCompletedAt: { type: Date },
  submittedAt: { type: Date },
  status: { type: String, enum: ['not_started', 'in_progress', 'submitted', 'expired', 'violation', 'incomplete'], default: 'not_started' },
  lastSavedAt: { type: Date },
  tabSwitches: { type: Number, default: 0 },
  fullscreenExits: { type: Number, default: 0 },
  copyPasteCount: { type: Number, default: 0 },
  cameraFlags: { type: Number, default: 0 },
  violationScore: { type: Number, default: 0 },
  pauseCount: { type: Number, default: 0 },
  lastPauseAt: { type: Date },
  pauseStartedAt: { type: Date },
  pausedDurationMs: { type: Number, default: 0 },
  securityHeartbeat: { type: mongoose.Schema.Types.Mixed, default: {} },
  violations: { type: [mongoose.Schema.Types.Mixed], default: [] },
  violationLog: { type: [mongoose.Schema.Types.Mixed], default: [] },
  proctoringSnapshots: { type: [mongoose.Schema.Types.Mixed], default: [] },
  monitoringEvents: { type: [mongoose.Schema.Types.Mixed], default: [] },
  aiProctoringSummary: {
    totalViolations: { type: Number, default: 0 },
    noFace: { type: Number, default: 0 },
    faceOutOfFrame: { type: Number, default: 0 },
    multipleFaces: { type: Number, default: 0 },
    multiplePersons: { type: Number, default: 0 },
    mobileDetected: { type: Number, default: 0 },
    lookingAway: { type: Number, default: 0 },
    cameraBlocked: { type: Number, default: 0 },
    riskLevel: {
      type: String,
      enum: ['clean', 'low', 'medium', 'high', 'critical'],
      default: 'clean',
    },
    lastViolationAt: { type: Date },
  },
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

