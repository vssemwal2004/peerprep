import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  source: { type: String, enum: ['university', 'shared'], required: true },
  questionType: { type: String, required: true },
  answer: { type: mongoose.Schema.Types.Mixed, required: true },
  language: { type: String, default: '' },
  result: { type: String, enum: ['correct', 'incorrect', 'submitted'], required: true },
}, { timestamps: true });

schema.index({ studentId: 1, source: 1, questionId: 1, createdAt: -1 });
export default mongoose.model('QuestionPracticeAttempt', schema);
