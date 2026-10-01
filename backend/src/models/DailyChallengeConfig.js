import mongoose from 'mongoose';

const dailyChallengeConfigSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'coding-daily-challenge' },
  enabled: { type: Boolean, default: true },
  timezone: { type: String, default: 'Asia/Kolkata' },
  rolloverHour: { type: Number, default: 2, min: 0, max: 23 },
  difficultyPool: {
    type: [String],
    enum: ['Easy', 'Medium', 'Hard'],
    default: ['Easy', 'Medium', 'Hard'],
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('DailyChallengeConfig', dailyChallengeConfigSchema);
