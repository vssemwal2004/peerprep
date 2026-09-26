import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  submissionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  assessmentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  attemptGeneration: { type: Number, default: 1 },
  eventId: { type: String, required: true },
  kind: { type: String, enum: ['monitoring', 'violation', 'snapshot'], required: true },
  type: String,
  message: String,
  at: { type: Date, required: true },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  objectKey: String,
  // Only for compatibility with pre-upgrade clients/unconfigured storage.
  // Never embedded in the hot submission or selected by reporting queries.
  legacyDataUrl: { type: String, select: false },
  width: Number,
  height: Number,
}, { timestamps: true });
schema.index({ submissionId: 1, attemptGeneration: 1, eventId: 1 }, { unique: true });
schema.index({ submissionId: 1, at: -1 });
schema.index({ submissionId: 1, attemptGeneration: 1, _id: -1 });
schema.index({ assessmentId: 1, kind: 1, at: -1 });
schema.index({ studentId: 1 });
export default mongoose.model('AssessmentEvent', schema);
