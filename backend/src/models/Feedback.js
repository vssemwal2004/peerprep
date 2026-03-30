import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  pair: { type: mongoose.Schema.Types.ObjectId, ref: 'Pair', required: true },
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  marks: { type: Number, min: 0, max: 100, required: true },
  comments: String,
  // Detailed ratings (5 criteria, each 1-5)
  integrity: { type: Number, min: 1, max: 5 },
  communication: { type: Number, min: 1, max: 5 },
  preparedness: { type: Number, min: 1, max: 5 },
  problemSolving: { type: Number, min: 1, max: 5 },
  attitude: { type: Number, min: 1, max: 5 },
  totalMarks: { type: Number, min: 5, max: 25 },
  suggestions: String,
}, { timestamps: true });

export default mongoose.model('Feedback', feedbackSchema);
