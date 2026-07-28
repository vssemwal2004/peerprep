import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  startDate: Date,
  endDate: Date,
  templateUrl: String,
  templateName: String,
  templateKey: String,
  isSpecial: { type: Boolean, default: false },
  allowedParticipants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // whitelist for special events
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  selectionMode: {
    type: String,
    enum: ['all', 'filters', 'selected', 'csv'],
    default: 'all',
  },
  participantFilters: { type: mongoose.Schema.Types.Mixed, default: {} },
  excludedParticipants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'published', 'live', 'completed', 'cancelled', 'archived'],
    default: 'published',
    index: true,
  },
  publishedAt: Date,
  cancelledAt: Date,
  archivedAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // If created by a coordinator, tag the event with their coordinatorId
  coordinatorId: { type: String, index: true },
}, { timestamps: true });

export default mongoose.model('Event', eventSchema);
