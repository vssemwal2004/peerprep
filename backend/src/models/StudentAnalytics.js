import mongoose from 'mongoose';

const metricSchema = new mongoose.Schema({
  label: String,
  value: Number,
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
  },
  assessments: {
    attempts: { type: Number, default: 0 },
    avgScore: { type: Number, default: 0 },
    avgAccuracy: { type: Number, default: 0 },
    highestScore: { type: Number, default: 0 },
    latestScore: { type: Number, default: 0 },
    progress: [metricSchema],
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
  },
}, { timestamps: true });

studentAnalyticsSchema.index({ generatedAt: -1 });

export default mongoose.model('StudentAnalytics', studentAnalyticsSchema);
