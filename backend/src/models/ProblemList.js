import mongoose from 'mongoose';

const problemListSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 30,
  },
  description: {
    type: String,
    default: '',
    trim: true,
    maxlength: 150,
  },
  isPrivate: {
    type: Boolean,
    default: true,
  },
  problemIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem',
  }],
}, { timestamps: true });

problemListSchema.index({ userId: 1, title: 1 }, { unique: true });
problemListSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model('ProblemList', problemListSchema);
