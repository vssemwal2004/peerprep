import mongoose from 'mongoose';

const codingStreakSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  currentStreak: { type: Number, default: 0, min: 0 },
  bestStreak: { type: Number, default: 0, min: 0 },
  lastCompletedDateKey: { type: String, default: '' },
  lastCompletedAt: Date,
  completedDateKeys: { type: [String], default: [] },
}, { timestamps: true });

export default mongoose.model('CodingStreak', codingStreakSchema);
