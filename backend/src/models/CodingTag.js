import mongoose from 'mongoose';

const codingTagSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  normalizedName: { type: String, required: true, trim: true, lowercase: true, unique: true },
  slug: { type: String, required: true, trim: true, unique: true },
  status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

codingTagSchema.index({ status: 1, name: 1 });

export default mongoose.model('CodingTag', codingTagSchema);
