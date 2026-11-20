import mongoose from 'mongoose';
import { tenantModel } from '../platform/tenantContext.js';

// One person's progress through the platform guides (the ⓘ page tours): which tours they
// finished, which "new here?" nudges they closed, and whether they turned the nudges off.
// Any role (student, coordinator, admin) has one record; it follows them to any device.
const guideProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  completed: { type: [String], default: [] },
  dismissed: { type: [String], default: [] },
  nudgesOff: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });

guideProgressSchema.index({ userId: 1 }, { unique: true });

export default tenantModel(mongoose.models.GuideProgress || mongoose.model('GuideProgress', guideProgressSchema));
