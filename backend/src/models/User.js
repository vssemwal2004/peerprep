import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema({
  role: { type: String, enum: ['admin', 'student', 'coordinator'], default: 'student' },
  name: String,
  email: { type: String, unique: true, sparse: true },
  studentId: { type: String, unique: true, sparse: true },
  coordinatorId: { type: String, unique: true, sparse: true },
  teacherIds: [String], // For students: links to coordinator's coordinatorID (supports multiple)
  passwordHash: { type: String, required: true },
  mustChangePassword: { type: Boolean, default: false },
  course: String,
  branch: String,
  college: String,
  semester: { type: Number, min: 1, max: 8 }, // Required for students: current semester (1-8)
  group: String, // Student group (e.g., G1, G2, A, B, etc.)

  // Special student support (for special events)
  isSpecialStudent: { type: Boolean, default: false },
  specialEvents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Event' }],
  
  // SECURITY: Password reset tokens with expiration and single-use
  passwordResetToken: String,
  passwordResetExpires: Date,
  passwordResetUsed: { type: Boolean, default: false }, // Prevent token reuse
  passwordChangedAt: Date, // Track when password was last changed
  
  // SECURITY: Email verification
  emailVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  
  // SECURITY: Session management - one active session per user
  activeSessionToken: String, // Hash of the current valid JWT token
  activeSessionCreatedAt: Date, // When this session was created
  
  // Additional fields
  avatarUrl: String,
  department: String, // For coordinators
}, { timestamps: true });

userSchema.methods.verifyPassword = async function (pw) {
  return bcrypt.compare(pw, this.passwordHash);
};

userSchema.statics.hashPassword = async function (pw) {
  const saltRounds = Number(process.env.BCRYPT_ROUNDS || 10);
  return bcrypt.hash(pw, saltRounds);
};

// SECURITY: Invalidate password reset tokens when password changes
userSchema.pre('save', function(next) {
  if (this.isModified('passwordHash') && !this.isNew) {
    // Password was changed - invalidate all reset tokens
    this.passwordChangedAt = new Date();
    this.passwordResetToken = undefined;
    this.passwordResetExpires = undefined;
    this.passwordResetUsed = true;
  }
  next();
});

export default mongoose.model('User', userSchema);
