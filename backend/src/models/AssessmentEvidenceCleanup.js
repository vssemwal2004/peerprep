import { tenantModel } from '../platform/tenantContext.js';
import mongoose from 'mongoose';

// One pending Cloudinary deletion: every evidence image whose public ID starts
// with prefix. Written in the same request that deletes the MongoDB records and
// worked off by the maintenance worker, so a deletion survives crashes and
// Cloudinary rate limits without holding an API request open.
const schema = new mongoose.Schema({
  prefix: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseUntil: Date,
  lastError: String,
}, { timestamps: true });
schema.index({ prefix: 1 }, { unique: true });
schema.index({ nextAttemptAt: 1 });
export default tenantModel(mongoose.model('AssessmentEvidenceCleanup', schema));
