import mongoose from 'mongoose';

const slotProposalSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  pair: { type: mongoose.Schema.Types.ObjectId, ref: 'Pair', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // At most one active slot at a time (latest proposal)
  slots: [{ type: Date }],
  // Previously proposed (rejected or expired) slots (dates only for backward-compat)
  pastSlots: [{ type: Date }],
  // Rich past entries with reason for UI and auditing
  pastEntries: [{
    time: { type: Date },
    reason: { type: String, enum: ['rejected', 'expired', 'superseded'], default: 'rejected' },
    proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Who originally proposed this time
    replacedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Who caused it to be replaced (optional)
    replacedAt: { type: Date } // When it was replaced/rejected/expired
  }],
}, { timestamps: true });

slotProposalSchema.index({ event: 1, pair: 1, user: 1 }, { unique: true });

export default mongoose.model('SlotProposal', slotProposalSchema);
