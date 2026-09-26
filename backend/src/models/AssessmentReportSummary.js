import mongoose from 'mongoose';

// _id is the assessment ID: joining through authorized Assessment records keeps
// ownership checks centralized and prevents cross-coordinator summary leakage.
const schema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment' },
  requestedVersion: { type: Number, default: 0 },
  computedVersion: { type: Number, default: 0 },
  nextRefreshAt: { type: Date, default: Date.now },
  leaseToken: String,
  leaseUntil: Date,
  computedAt: Date,
  lastError: String,
  submissionCount: { type: Number, default: 0 },
  completedCount: { type: Number, default: 0 },
  gradedCount: { type: Number, default: 0 },
  pendingEvaluationCount: { type: Number, default: 0 },
  failedEvaluationCount: { type: Number, default: 0 },
  scoreSum: { type: Number, default: 0 },
  avgScore: Number,
  maxScore: Number,
  minScore: Number,
  passCount: { type: Number, default: 0 },
  violationCount: { type: Number, default: 0 },
  lastAttemptAt: Date,
  scoreDistribution: { type: [Number], default: [0, 0, 0, 0, 0] },
}, { timestamps: true });
schema.index({ nextRefreshAt: 1, leaseUntil: 1 });
export default mongoose.model('AssessmentReportSummary', schema);
