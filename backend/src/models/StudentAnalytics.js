import mongoose from 'mongoose';

const metricSchema = new mongoose.Schema({
  label: String,
  value: Number,
  rawScore: Number,
  adjustedScore: Number,
  integrityScore: Number,
  violationCount: Number,
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
  overview: {
    totalAttempts: { type: Number, default: 0 },
    problemAttempts: { type: Number, default: 0 },
    assessmentAttempts: { type: Number, default: 0 },
    avgScore: { type: Number, default: 0 },
    interviewScore: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    readinessScore: { type: Number, default: 0 },
    healthScore: { type: Number, default: 0 },
    currentFocus: { type: String, default: '' },
  },
  assessments: {
    attempts: { type: Number, default: 0 },
    submittedAttempts: { type: Number, default: 0 },
    violationAttempts: { type: Number, default: 0 },
    avgScore: { type: Number, default: 0 },
    adjustedAvgScore: { type: Number, default: 0 },
    avgAccuracy: { type: Number, default: 0 },
    highestScore: { type: Number, default: 0 },
    latestScore: { type: Number, default: 0 },
    latestAdjustedScore: { type: Number, default: 0 },
    stabilityScore: { type: Number, default: 0 },
    integrityScore: { type: Number, default: 100 },
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
    consistencyScore: { type: Number, default: 0 },
    effortScore: { type: Number, default: 0 },
    assessmentIntegrityScore: { type: Number, default: 100 },
    performanceScore: { type: Number, default: 0 },
    readinessScore: { type: Number, default: 0 },
    placementSignal: { type: Number, default: 0 },
    growthScore: { type: Number, default: 0 },
    riskLevel: { type: String, default: 'low' },
  },
}, { timestamps: true });

studentAnalyticsSchema.index({ generatedAt: -1 });

export default mongoose.model('StudentAnalytics', studentAnalyticsSchema);
