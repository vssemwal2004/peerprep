import mongoose from 'mongoose';
import { tenantModel } from '../platform/tenantContext.js';

// Prep Mock catalogue. A company's own website and logo (set by whoever creates mocks; overrides the
// built-in logo list in data/companyLogos.json), and the job roles admins added for mocks.

const companySchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  domain: { type: String, trim: true, lowercase: true, maxlength: 120, default: '' },
  logo: {
    type: new mongoose.Schema({
      url: String, publicId: String, width: Number, height: Number,
      source: { type: String, enum: ['website', 'upload'] },
      updatedAt: Date,
    }, { _id: false }),
    default: null,
  },
  // A built-in logo the admin removed: show the initial instead.
  hideBuiltInLogo: { type: Boolean, default: false },
  updatedBy: { type: mongoose.Schema.Types.ObjectId },
}, { timestamps: true, versionKey: false });
companySchema.index({ key: 1 }, { unique: true });

const roleSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  // Companies it was added for (shown first there); everyone can still pick it for any company.
  companyKeys: { type: [String], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId },
}, { timestamps: true, versionKey: false });
roleSchema.index({ key: 1 }, { unique: true });

export const PrepMockCompany = tenantModel(mongoose.models.PrepMockCompany || mongoose.model('PrepMockCompany', companySchema));
export const PrepMockRole = tenantModel(mongoose.models.PrepMockRole || mongoose.model('PrepMockRole', roleSchema));
