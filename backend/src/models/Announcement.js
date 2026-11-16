import { tenantModel } from '../platform/tenantContext.js';
import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  type: { type: String, enum: ['motivation', 'info', 'alert'], default: 'motivation' },
  status: { type: String, enum: ['active', 'inactive'], default: 'inactive' },
  priority: { type: String, enum: ['high', 'normal', 'low'], default: 'normal' },
  // Also shown as a popup to students right after they log in (once per login).
  showAsPopup: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  expiryDate: { type: Date }
}, { timestamps: true });

announcementSchema.index({ status: 1, expiryDate: 1 });
announcementSchema.index({ priority: 1, createdAt: -1 });

export default tenantModel(mongoose.model('Announcement', announcementSchema));
