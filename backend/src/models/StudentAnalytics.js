import mongoose from 'mongoose';

const metricSchema = new mongoose.Schema({
  label: String,
  value: Number,
  rawScore: Number,
  adjustedScore: Number,
  integrityScore: Number,
  violationCount: Number,
  invalidScore: Boolean,
}, { _id: false });

const topicMetricSchema = new mongoose.Schema({
  topic: String,
  accuracy: Number,
  attempts: Number,
  level: String,
}, { _id: false });

const activityPointSchema = new mongoose.Schema({
  date: String,
  count: Number,
}, { _id: false });

const explanationSchema = new mongoose.Schema({
  id: String,
  title: String,
  score: Number,
  impact: String,
  tone: String,
  summary: String,
  evidence: [String],
  action: String,
}, { _id: false });

const evidenceSchema = new mongoose.Schema({
  version: { type: String, required: true },
  hasEvidence: { type: Boolean, default: false },
  observedSources: [String],
  totalSources: { type: Number, default: 4 },
  sourceCounts: {
    coding: { type: Number, default: 0 },
    assessments: { type: Number, default: 0 },
    interviews: { type: Number, default: 0 },
    learning: { type: Number, default: 0 },
  },
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

const studentAnalyticsSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  generatedAt: {
    type: Date,
    default: Date.now,
  },
  contractVersion: {
    type: String,
    default: '2026.08.evidence-readiness-v2',
  },
  scoreModel: {
    version: { type: String, default: '2026.08.evidence-readiness-v2' },
    studentVisibleSecurityAggregatesOnly: { type: Boolean, default: true },
    topicMinimumAttempts: { type: Number, default: 4 },
  },
  evidence: { type: evidenceSchema, required: true },
  overview: {
    totalAttempts: { type: Number, default: 0 },
    problemAttempts: { type: Number, default: 0 },
    assessmentAttempts: { type: Number, default: 0 },
    avgScore: { type: Number, default: 0 },
    interviewScore: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    readinessScore: { type: Number, default: null },
    healthScore: { type: Number, default: null },
    currentFocus: { type: String, default: '' },
  },
  assessments: {
    attempts: { type: Number, default: 0 },
    validScoreAttempts: { type: Number, default: 0 },
    invalidScoreAttempts: { type: Number, default: 0 },
    submittedAttempts: { type: Number, default: 0 },
    violationAttempts: { type: Number, default: 0 },
    avgScore: { type: Number, default: null },
    adjustedAvgScore: { type: Number, default: null },
    avgAccuracy: { type: Number, default: 0 },
    highestScore: { type: Number, default: null },
    latestScore: { type: Number, default: null },
    latestAdjustedScore: { type: Number, default: null },
    stabilityScore: { type: Number, default: null },
    integrityScore: { type: Number, default: null },
    violationRate: { type: Number, default: 0 },
    violationCount: { type: Number, default: 0 },
    avgTimeTakenSec: { type: Number, default: 0 },
    securityRisk: { type: String, default: 'low' },
    proctoring: {
      tabSwitches: { type: Number, default: 0 },
      fullscreenExits: { type: Number, default: 0 },
      copyPasteCount: { type: Number, default: 0 },
      cameraFlags: { type: Number, default: 0 },
      violationScore: { type: Number, default: 0 },
      pauseCount: { type: Number, default: 0 },
    },
    progress: [metricSchema],
    recentAttempts: [metricSchema],
  },
  problems: {
    attempts: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    topics: [topicMetricSchema],
    solved: { type: Number, default: 0 },
    acceptedSubmissions: { type: Number, default: 0 },
  },
  interviews: {
    avgScore: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    tags: [String],
    ratingDistribution: [metricSchema],
    categoryScores: {
      communication: { type: Number, default: 0 },
      problemSolving: { type: Number, default: 0 },
      preparedness: { type: Number, default: 0 },
      attitude: { type: Number, default: 0 },
      integrity: { type: Number, default: 0 },
    },
  },
  learning: {
    completedTopics: { type: Number, default: 0 },
    totalTopics: { type: Number, default: 0 },
    completionPercent: { type: Number, default: 0 },
    coursesEnrolled: { type: Number, default: 0 },
    videosWatched: { type: Number, default: 0 },
    practiceSolved: { type: Number, default: 0 },
  },
  consistency: {
    currentStreak: { type: Number, default: 0 },
    weeklyActivity: [activityPointSchema],
    activeDays: { type: Number, default: 0 },
    lastActiveAt: Date,
  },
  derived: {
    contractVersion: { type: String, default: '2026.08.evidence-readiness-v2' },
    consistencyScore: { type: Number, default: 0 },
    effortScore: { type: Number, default: 0 },
    assessmentIntegrityScore: { type: Number, default: null },
    performanceScore: { type: Number, default: 0 },
    readinessScore: { type: Number, default: null },
    placementSignal: { type: Number, default: null },
    growthScore: { type: Number, default: 0 },
    riskLevel: { type: String, default: 'unknown' },
  },
  explanations: {
    overview: [explanationSchema],
    coding: [explanationSchema],
    assessment: [explanationSchema],
    interview: [explanationSchema],
    learning: [explanationSchema],
    placement: [explanationSchema],
  },
}, { timestamps: true });

studentAnalyticsSchema.index({ generatedAt: -1 });

export default mongoose.model('StudentAnalytics', studentAnalyticsSchema);
