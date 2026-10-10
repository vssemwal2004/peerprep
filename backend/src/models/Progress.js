import mongoose from 'mongoose';
import { attachAdminAnalyticsInvalidation } from '../modules/adminAnalytics/adminAnalytics.invalidation.js';

const progressSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  semesterId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  chapterId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  topicId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  coordinatorId: {
    type: String,
    required: true
  },
  completed: {
    type: Boolean,
    default: false
  },
  videoWatchedSeconds: {
    type: Number,
    default: 0
  },
  videoDuration: {
    type: Number,
    default: 0
  },
  completedAt: {
    type: Date
  },
  lastAccessedAt: {
    type: Date,
    default: Date.now
  },
  lastViewedContentType: {
    type: String,
    enum: ['video', 'notes', 'questions', 'topic'],
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
progressSchema.index({ studentId: 1, topicId: 1 }, { unique: true });
progressSchema.index({ studentId: 1, subjectId: 1 });
progressSchema.index({ studentId: 1, semesterId: 1 });
progressSchema.index({ studentId: 1, completed: 1, lastAccessedAt: -1 });
progressSchema.index({ studentId: 1, completed: 1, completedAt: -1 });

attachAdminAnalyticsInvalidation(progressSchema, {
  source: 'learning-progress',
  relevantPaths: ['studentId', 'semesterId', 'subjectId', 'chapterId', 'topicId', 'completed', 'completedAt', 'videoWatchedSeconds', 'videoDuration', 'lastAccessedAt'],
});

export default mongoose.model('Progress', progressSchema);
