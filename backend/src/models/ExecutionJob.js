import mongoose from 'mongoose';

const executionJobSchema = new mongoose.Schema({
  jobId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  queueName: {
    type: String,
    required: true,
    index: true,
  },
  jobName: {
    type: String,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  submissionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Submission',
  },
  assessmentSubmissionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AssessmentSubmission',
  },
  assessmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assessment',
  },
  problemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem',
  },
  status: {
    type: String,
    enum: ['queued', 'processing', 'completed', 'failed'],
    default: 'queued',
    index: true,
  },
  attemptsMade: {
    type: Number,
    default: 0,
  },
  maxAttempts: {
    type: Number,
    default: 3,
  },
  result: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  error: {
    message: { type: String, default: '' },
    code: { type: String, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  queuedAt: {
    type: Date,
    default: Date.now,
  },
  startedAt: Date,
  completedAt: Date,
}, { timestamps: true });

executionJobSchema.index({ userId: 1, createdAt: -1 });
executionJobSchema.index({ queueName: 1, status: 1, createdAt: -1 });

export default mongoose.model('ExecutionJob', executionJobSchema);
