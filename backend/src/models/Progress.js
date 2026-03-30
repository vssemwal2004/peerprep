import mongoose from 'mongoose';

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
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
progressSchema.index({ studentId: 1, topicId: 1 }, { unique: true });
progressSchema.index({ studentId: 1, subjectId: 1 });
progressSchema.index({ studentId: 1, semesterId: 1 });

export default mongoose.model('Progress', progressSchema);
