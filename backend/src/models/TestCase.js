import mongoose from 'mongoose';

const testCaseImageSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true },
  publicId: { type: String, default: '', trim: true },
  sourceUrl: { type: String, default: '', trim: true },
  alt: { type: String, default: '', trim: true, maxlength: 500 },
  caption: { type: String, default: '', trim: true, maxlength: 1000 },
  width: { type: Number, min: 1 },
  height: { type: Number, min: 1 },
  position: { type: Number, min: 0, default: 0 },
}, { _id: false });

const testCaseSchema = new mongoose.Schema({
  problem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem',
    required: true,
    index: true,
  },
  kind: {
    type: String,
    enum: ['sample', 'hidden'],
    required: true,
  },
  position: {
    type: Number,
    required: true,
    min: 1,
  },
  input: {
    type: String,
    default: '',
  },
  output: {
    type: String,
    default: '',
  },
  explanation: {
    type: String,
    default: '',
  },
  images: {
    type: [testCaseImageSchema],
    default: [],
  },
  marks: {
    type: Number,
    min: 0.01,
    default: 1,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

testCaseSchema.index({ problem: 1, kind: 1, position: 1 }, { unique: true });

export default mongoose.model('TestCase', testCaseSchema);
