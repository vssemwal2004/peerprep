import mongoose from 'mongoose';
import { tenantModel } from '../platform/tenantContext.js';

const { Schema } = mongoose;

export const PREP_MATE_STATUSES = Object.freeze(['pending', 'accepted', 'declined', 'cancelled', 'removed']);

// One document per pair of students (pairKey = sorted ids), moved between states in place so two
// students can never hold two open requests or two mate links at once. fromId/toId describe the
// latest request: who asked whom.
const prepMateSchema = new Schema({
  pairKey: { type: String, required: true },
  fromId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  toId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: PREP_MATE_STATUSES, required: true },
  requestedAt: { type: Date, required: true },
  respondedAt: { type: Date, default: null },
  // A declined requester waits before asking the same student again.
  declinedAt: { type: Date, default: null },
}, { timestamps: true });
prepMateSchema.index({ pairKey: 1 }, { unique: true });
prepMateSchema.index({ toId: 1, status: 1, requestedAt: -1 });
prepMateSchema.index({ fromId: 1, status: 1, requestedAt: -1 });

export const PrepMate = tenantModel(mongoose.model('PrepMate', prepMateSchema));
