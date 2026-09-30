import mongoose from 'mongoose';

const codingTopicSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  normalizedName: { type: String, required: true, trim: true, lowercase: true },
  slug: { type: String, required: true, trim: true, unique: true, index: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'CodingTopic', default: null, index: true },
  ancestorIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CodingTopic' }],
  depth: { type: Number, default: 0, min: 0, max: 12 },
  description: { type: String, default: '', trim: true, maxlength: 1000 },
  aliases: [{ type: String, trim: true }],
  legacyTag: { type: String, default: '', trim: true },
  displayOrder: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

codingTopicSchema.index({ parentId: 1, normalizedName: 1 }, { unique: true });
codingTopicSchema.index({ ancestorIds: 1, status: 1 });
codingTopicSchema.index({ status: 1, parentId: 1, displayOrder: 1, name: 1 });

export default mongoose.model('CodingTopic', codingTopicSchema);
