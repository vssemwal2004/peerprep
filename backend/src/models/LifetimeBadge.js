import mongoose from 'mongoose';
import { tenantModel } from '../platform/tenantContext.js';

// Lifetime milestone badges (services/lifetimeBadges.js): permanent, awarded once when a student's
// all-time count crosses a threshold (e.g. 100 problems solved). Unique per student and badge, so a
// badge, its coins and its Prep Score points are given exactly once.
const lifetimeBadgeAwardSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // e.g. 'solved-100', 'active-50', 'streak-30', 'challenge-25', 'hard-25', 'sheets-5'.
  badgeId: { type: String, required: true },
  track: { type: String, required: true },
  threshold: { type: Number, required: true },
  // 1 (first milestone of a track) .. 5 (highest): sets the Prep Score points and the look.
  tier: { type: Number, required: true, min: 1, max: 5 },
  value: { type: Number, default: 0 },
  coins: { type: Number, default: 0 },
  earnedAt: { type: Date, default: Date.now },
}, { versionKey: false });
lifetimeBadgeAwardSchema.index({ studentId: 1, badgeId: 1 }, { unique: true });
lifetimeBadgeAwardSchema.index({ studentId: 1, earnedAt: -1 });

export const LifetimeBadgeAward = tenantModel(mongoose.models.LifetimeBadgeAward || mongoose.model('LifetimeBadgeAward', lifetimeBadgeAwardSchema));
