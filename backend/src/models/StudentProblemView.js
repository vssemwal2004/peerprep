import mongoose from 'mongoose';

// A visit is navigation history, never evidence of a completed problem or a rank award.
const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
  source: { type: String, enum: ['university', 'shared'], default: 'university' },
  lastViewedAt: { type: Date, default: Date.now, required: true },
}, { timestamps: true });

schema.index({ studentId: 1, problemId: 1, source: 1 }, { unique: true });
schema.index({ studentId: 1, lastViewedAt: -1 });
schema.index({ lastViewedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model('StudentProblemView', schema);
