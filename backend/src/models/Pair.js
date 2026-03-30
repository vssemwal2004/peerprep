import mongoose from 'mongoose';

const pairSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  interviewer: { type: mongoose.Schema.Types.ObjectId, refPath: 'interviewerModel', required: true },
  interviewee: { type: mongoose.Schema.Types.ObjectId, refPath: 'intervieweeModel', required: true },
  interviewerModel: { type: String, enum: ['User'], default: 'User' },
  intervieweeModel: { type: String, enum: ['User'], default: 'User' },
  defaultTimeSlot: Date, // Auto-generated default time when pair is created
  scheduledAt: Date,
  finalConfirmedTime: Date,
  // Unified currently active proposed time (default or latest user proposal)
  currentProposedTime: Date,
  meetingLink: String,
  status: { type: String, enum: ['pending', 'rejected', 'scheduled', 'completed'], default: 'pending' },
  interviewerProposalCount: { type: Number, default: 0 },
  intervieweeProposalCount: { type: Number, default: 0 },
  rejectionCount: { type: Number, default: 0 },
  rejectionHistory: [{
    at: { type: Date, default: Date.now },
    reason: String,
  }],
  lastRejectedAt: Date,
}, { timestamps: true });

// Middleware to ensure model types are set for legacy pairs that may lack them
pairSchema.pre('save', async function(next) {
  if (!this.interviewerModel || !this.intervieweeModel) {
    this.interviewerModel = 'User';
    this.intervieweeModel = 'User';
  }
  next();
});

export default mongoose.model('Pair', pairSchema);
