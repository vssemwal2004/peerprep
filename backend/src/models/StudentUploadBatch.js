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
}, { timestamps: true });

studentUploadBatchSchema.index({ createdAt: -1 });

export default mongoose.model('StudentUploadBatch', studentUploadBatchSchema);
