import mongoose from 'mongoose';

const companyBenchmarkSchema = new mongoose.Schema({
  companyName: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    maxlength: 120,
  },
  dsaAccuracyRequired: {
    type: Number,
    default: 70,
    min: 0,
    max: 100,
  },
  requiredTopics: [{
    type: String,
    trim: true,
    maxlength: 80,
  }],
  minQuestionAttempts: {
    type: Number,
    default: 0,
    min: 0,
    max: 100000,
  },
  minStreak: {
    type: Number,
    default: 5,
    min: 0,
    max: 365,
  },
  interviewScore: {
    type: Number,
    default: 70,
    min: 0,
    max: 100,
  },
  weightDsa: {
    type: Number,
    default: 0.4,
    min: 0,
    max: 1,
  },
  weightConsistency: {
    type: Number,
    default: 0.3,
    min: 0,
    max: 1,
  },
  weightInterview: {
    type: Number,
    default: 0.3,
    min: 0,
    max: 1,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

companyBenchmarkSchema.index({ companyName: 1 }, { unique: true });

export default mongoose.model('CompanyBenchmark', companyBenchmarkSchema);
