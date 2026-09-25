import mongoose from 'mongoose';

const studentUploadBatchSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  originalFileName: { type: String, required: true, trim: true, maxlength: 255 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedByEmail: String,
  studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  entityType: {
    type: String,
    enum: ['student', 'coordinator', 'question_mcq', 'question_short', 'question_one_line', 'question_coding', 'question_mixed'],
    default: 'student',
    index: true,
  },
  recordIds: [{ type: mongoose.Schema.Types.ObjectId }],
  createdRecordIds: [{ type: mongoose.Schema.Types.ObjectId }],
  updatedRecordIds: [{ type: mongoose.Schema.Types.ObjectId }],
  totalRows: { type: Number, default: 0 },
  createdCount: { type: Number, default: 0 },
  updatedCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  sourceType: { type: String, enum: ['student_upload', 'coordinator_upload', 'question_upload', 'assessment'], default: 'student_upload', index: true },
  sourceAssessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment' },
  status: { type: String, enum: ['active', 'archived', 'deleted'], default: 'active', index: true },
  archivedAt: Date,
  deletedAt: Date,
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletionSummary: { type: mongoose.Schema.Types.Mixed, default: undefined },
  errorRows: { type: [mongoose.Schema.Types.Mixed], default: undefined, select: false },
  originalRows: { type: [mongoose.Schema.Types.Mixed], default: undefined, select: false },
}, { timestamps: true });

studentUploadBatchSchema.index({ createdAt: -1 });
studentUploadBatchSchema.index({ entityType: 1, status: 1, createdAt: -1 });
studentUploadBatchSchema.index(
  { sourceAssessmentId: 1 },
  { unique: true, partialFilterExpression: { sourceAssessmentId: { $type: 'objectId' } } },
);

export default mongoose.model('StudentUploadBatch', studentUploadBatchSchema);
