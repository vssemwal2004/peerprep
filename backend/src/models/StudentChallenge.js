import mongoose from 'mongoose';

const goalSchema = new mongoose.Schema({
  metric: { type: String, enum: ['coding', 'learning', 'activeDays'], required: true },
  target: { type: Number, required: true, min: 1 },
}, { _id: false });

// Permanent, server-verified awards. Unlike recent-view history, this has no TTL.
const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
  periodKey: { type: String, required: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem' },
  problemSource: { type: String, enum: ['university', 'shared'], default: 'university' },
  goals: { type: [goalSchema], default: [] },
  rewardPoints: { type: Number, required: true, min: 0 },
  ruleVersion: { type: Number, default: 1 },
  earnedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ studentId: 1, kind: 1, periodKey: 1 }, { unique: true });
schema.index({ studentId: 1, earnedAt: -1 });
schema.index({ studentId: 1, kind: 1, endsAt: -1 });

export default mongoose.model('StudentChallenge', schema);
