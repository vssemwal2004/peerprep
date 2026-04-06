import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  type: { type: String, required: true, trim: true },
  referenceId: { type: mongoose.Schema.Types.ObjectId },
  actionUrl: { type: String, trim: true },
  isRead: { type: Boolean, default: false, index: true },
  dedupeKey: { type: String, trim: true }
}, {
  timestamps: true
});

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, dedupeKey: 1 });

export default mongoose.model('Notification', notificationSchema);
