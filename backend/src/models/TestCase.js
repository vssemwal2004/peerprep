import mongoose from 'mongoose';

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
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

testCaseSchema.index({ problem: 1, kind: 1, position: 1 }, { unique: true });

export default mongoose.model('TestCase', testCaseSchema);
