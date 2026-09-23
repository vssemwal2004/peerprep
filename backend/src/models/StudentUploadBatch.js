import mongoose from 'mongoose';

const studentUploadBatchSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  originalFileName: { type: String, required: true, trim: true, maxlength: 255 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedByEmail: String,
  studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  totalRows: { type: Number, default: 0 },
  createdCount: { type: Number, default: 0 },
  updatedCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  sourceType: { type: String, enum: ['student_upload', 'assessment'], default: 'student_upload', index: true },
  sourceAssessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment' },
}, { timestamps: true });

studentUploadBatchSchema.index({ createdAt: -1 });
studentUploadBatchSchema.index(
  { sourceAssessmentId: 1 },
  { unique: true, partialFilterExpression: { sourceAssessmentId: { $type: 'objectId' } } },
);

export default mongoose.model('StudentUploadBatch', studentUploadBatchSchema);
