import mongoose from 'mongoose';
import { tenantModel } from '../platform/tenantContext.js';

// One admin's progress through the Prep Analysis guides: which chart guides and "what's new"
// notes they finished, the getting-started steps they did, and whether they closed the welcome
// card or the checklist. Kept on the account so it follows the admin to any device.
const prepAnalysisGuideProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  completed: { type: [String], default: [] },
  milestones: { type: [String], default: [] },
  welcomeDismissed: { type: Boolean, default: false },
  checklistDismissed: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });

prepAnalysisGuideProgressSchema.index({ userId: 1 }, { unique: true });

export default tenantModel(mongoose.models.PrepAnalysisGuideProgress || mongoose.model('PrepAnalysisGuideProgress', prepAnalysisGuideProgressSchema));
