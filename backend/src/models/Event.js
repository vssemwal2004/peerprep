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
  // If created by a coordinator, tag the event with their coordinatorId
  coordinatorId: { type: String, index: true },
}, { timestamps: true });

export default mongoose.model('Event', eventSchema);
