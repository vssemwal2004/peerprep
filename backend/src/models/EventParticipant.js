import mongoose from 'mongoose';

const eventParticipantSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  selectionSource: {
    type: String,
    enum: ['all', 'filters', 'selected', 'csv', 'manual'],
    required: true,
  },
  assignmentStatus: {
    type: String,
    enum: ['assigned', 'removed'],
    default: 'assigned',
    index: true,
  },
  invitationStatus: {
    type: String,
    enum: ['not_sent', 'pending', 'sent', 'failed'],
    default: 'not_sent',
  },
  invitationSentAt: Date,
  joinedAt: Date,
  removedAt: Date,
  removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  removalReason: String,
}, { timestamps: true });

eventParticipantSchema.index({ eventId: 1, studentId: 1 }, { unique: true });
eventParticipantSchema.index({ eventId: 1, assignmentStatus: 1, createdAt: -1 });

export default mongoose.model('EventParticipant', eventParticipantSchema);
