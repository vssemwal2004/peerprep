import mongoose from 'mongoose';

const joinRequestSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  university: { type: String, required: true, trim: true },
  course: { type: String, required: true, trim: true },
  branch: { type: String, required: true, trim: true },
  semester: { type: Number, required: true, min: 1, max: 8 },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
  // Populated when admin approves and creates the student
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  studentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // created student user
  // Admin can optionally set these when approving
  teacherId: String,  // coordinator ID assigned
  group: String,      // student group
  studentId: String,  // generated student ID
  rejectionReason: String,
}, { timestamps: true });

// Prevent duplicate pending requests from same email
joinRequestSchema.index({ email: 1, status: 1 });

export default mongoose.model('JoinRequest', joinRequestSchema);
