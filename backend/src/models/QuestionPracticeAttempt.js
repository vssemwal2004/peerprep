import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  source: { type: String, enum: ['university', 'shared'], required: true },
  questionType: { type: String, required: true },
  answer: { type: mongoose.Schema.Types.Mixed, required: true },
  language: { type: String, default: '' },
  result: { type: String, enum: ['correct', 'incorrect', 'submitted'], required: true },
  totalTestCases: { type: Number, min: 0, default: 0 },
  passedTestCases: { type: Number, min: 0, default: 0 },
  executionTimeMs: { type: Number, min: 0, default: 0 },
  memoryUsedKb: { type: Number, min: 0, default: 0 },
  failureStatus: { type: String, enum: ['WA', 'CE', 'RE', 'TLE'], default: undefined },
  compileOutput: { type: String, default: '' },
  testCaseResults: [{ _id: false, index: Number,
    status: { type: String, enum: ['AC', 'WA', 'CE', 'RE', 'TLE'] }, executionTimeMs: Number }],
}, { timestamps: true });

schema.index({ studentId: 1, source: 1, questionId: 1, createdAt: -1 });
schema.index({ studentId: 1, source: 1, questionType: 1, createdAt: -1 });
schema.index({ source: 1, questionId: 1, questionType: 1, result: 1 });
export default mongoose.model('QuestionPracticeAttempt', schema);
