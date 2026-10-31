import mongoose from 'mongoose';
import { tenantModel } from '../platform/tenantContext.js';

// A saved Prep Analysis view: an admin's filters, period and chart layout under a name. Only
// its owner changes it; a shared view can be opened (read-only) by every admin of the university.
const prepAnalysisViewSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ownerName: { type: String, default: '' },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  area: { type: String, required: true },
  // The page's filter state and the area's chart layout, as the browser keeps them.
  state: { type: mongoose.Schema.Types.Mixed, required: true },
  layout: { type: mongoose.Schema.Types.Mixed, default: [] },
  shared: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false, minimize: false });

prepAnalysisViewSchema.index({ ownerId: 1, updatedAt: -1 });
prepAnalysisViewSchema.index({ shared: 1, updatedAt: -1 });

export default tenantModel(mongoose.models.PrepAnalysisView || mongoose.model('PrepAnalysisView', prepAnalysisViewSchema));
