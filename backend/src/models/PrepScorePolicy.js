import mongoose from 'mongoose';

const prepScorePolicySchema = new mongoose.Schema({
  version: { type: Number, required: true, unique: true, min: 1 },
  status: { type: String, enum: ['draft', 'calculating', 'active', 'archived'], required: true, index: true },
  config: { type: mongoose.Schema.Types.Mixed, required: true },
  changeReason: { type: String, trim: true, maxlength: 500, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  publishedAt: Date,
}, { timestamps: true });

prepScorePolicySchema.index({ status: 1, version: -1 });

export default mongoose.models.PrepScorePolicy
  || mongoose.model('PrepScorePolicy', prepScorePolicySchema);
