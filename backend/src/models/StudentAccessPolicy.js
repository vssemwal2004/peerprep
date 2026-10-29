import mongoose from 'mongoose';
import { tenantModel } from '../platform/tenantContext.js';
import { STUDENT_FEATURES } from '../services/studentFeatureAccess.js';

const studentAccessPolicySchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true, immutable: true },
  defaultMode: { type: String, enum: ['all', 'custom'], default: 'all' },
  defaultFeatures: [{ type: String, enum: STUDENT_FEATURES }],
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedByEmail: String,
}, { timestamps: true });

export default tenantModel(mongoose.model('StudentAccessPolicy', studentAccessPolicySchema));
