import { tenantModel } from '../platform/tenantContext.js';
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
  // Canonical attempt counts (services/assessmentAttemptCounts.js). submissionCount
  // = started (in progress + finished); completedCount = finished (submitted,
  // expired, violation, incomplete); passCount uses the assessment's pass mark.
  submissionCount: { type: Number, default: 0 },
  completedCount: { type: Number, default: 0 },
  candidateCount: { type: Number, default: 0 },
  startedCount: { type: Number, default: 0 },
  inProgressCount: { type: Number, default: 0 },
  finishedCount: { type: Number, default: 0 },
  submittedCount: { type: Number, default: 0 },
  expiredCount: { type: Number, default: 0 },
  violationStatusCount: { type: Number, default: 0 },
  incompleteCount: { type: Number, default: 0 },
  notStartedCount: { type: Number, default: 0 },
  passedCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  passRate: Number,
  avgPercentage: Number,
  passPercentage: Number,
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
export default tenantModel(mongoose.model('AssessmentReportSummary', schema));
