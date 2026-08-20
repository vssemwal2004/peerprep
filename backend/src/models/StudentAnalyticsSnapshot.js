import mongoose from 'mongoose';

const SNAPSHOT_RETENTION_SECONDS = 400 * 24 * 60 * 60;

const scoreSchema = new mongoose.Schema({
  readiness: { type: Number, default: null },
  performance: { type: Number, default: null },
  placementSignal: { type: Number, default: null },
  consistency: { type: Number, default: 0 },
  effort: { type: Number, default: 0 },
  codingAccuracy: { type: Number, default: 0 },
  assessment: { type: Number, default: 0 },
  interview: { type: Number, default: 0 },
  learning: { type: Number, default: 0 },
  assessmentIntegrity: { type: Number, default: null },
}, { _id: false });

const evidenceSchema = new mongoose.Schema({
  hasEvidence: { type: Boolean, default: false },
  observedSources: [String],
  totalSources: { type: Number, default: 4 },
  signalCount: { type: Number, default: 0 },
  invalidAssessmentAttempts: { type: Number, default: 0 },
  coverageScore: { type: Number, default: 0 },
  freshnessScore: { type: Number, default: 0 },
  latestEvidenceAt: { type: Date, default: null },
  confidence: {
    score: { type: Number, default: 0 },
    level: { type: String, enum: ['low', 'moderate', 'high'], default: 'low' },
  },
}, { _id: false });

const studentAnalyticsSnapshotSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  snapshotDate: {
    type: Date,
    required: true,
  },
  generatedAt: {
    type: Date,
    required: true,
  },
  contractVersion: {
    type: String,
    required: true,
  },
  evidenceVersion: {
    type: String,
    required: true,
  },
  scores: {
    type: scoreSchema,
    required: true,
  },
  evidence: { type: evidenceSchema, required: true },
}, { timestamps: true });

studentAnalyticsSnapshotSchema.index({ studentId: 1, snapshotDate: 1 }, { unique: true });
studentAnalyticsSnapshotSchema.index(
  { snapshotDate: 1 },
  { expireAfterSeconds: SNAPSHOT_RETENTION_SECONDS },
);

export default mongoose.model('StudentAnalyticsSnapshot', studentAnalyticsSnapshotSchema);
