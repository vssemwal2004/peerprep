import mongoose from 'mongoose';

// A day's question is pinned, so catalog edits cannot change an already-running challenge.
const schema = new mongoose.Schema({
  dateKey: { type: String, required: true, unique: true },
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
  source: { type: String, enum: ['university', 'shared'], default: 'university' },
}, { timestamps: true });

export default mongoose.model('DailyChallengeDay', schema);
