import mongoose from 'mongoose';

const mailJobSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['student_credentials', 'coordinator_onboarding', 'assessment_invitation', 'event_invitation', 'event_cancellation'],
    required: true,
    index: true,
  },
  to: { type: String, required: true, trim: true, lowercase: true, index: true },
  payloadEncrypted: { type: String, required: true },
  status: {
    type: String,
    enum: ['queued', 'processing', 'sent', 'failed', 'cancelled'],
    default: 'queued',
    index: true,
  },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 4 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  lockedAt: Date,
  sentAt: Date,
  failedAt: Date,
  lastError: String,
  providerMessageId: String,
  idempotencyKey: { type: String, required: true, unique: true, index: true },
  batchId: { type: String, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  requestedByEmail: String,
  targetType: String,
  targetId: { type: mongoose.Schema.Types.ObjectId },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
}, { timestamps: true });

mailJobSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });

export default mongoose.model('MailJob', mailJobSchema);
