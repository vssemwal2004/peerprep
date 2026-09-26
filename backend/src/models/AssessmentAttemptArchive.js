import mongoose from 'mongoose';

// Retakes must not destroy the previous accepted answers/receipt/results.
const schema = new mongoose.Schema({
  submissionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  assessmentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  attemptGeneration: { type: Number, required: true },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });
schema.index({ submissionId: 1, attemptGeneration: 1 }, { unique: true });
export default mongoose.model('AssessmentAttemptArchive', schema);
