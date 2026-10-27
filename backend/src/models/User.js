import { tenantModel, currentTenant } from '../platform/tenantContext.js';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { attachAdminAnalyticsInvalidation } from '../modules/adminAnalytics/adminAnalytics.invalidation.js';
import { normalizeEmailAddress } from '../utils/emailIdentity.js';

const userSchema = new mongoose.Schema({
  role: { type: String, enum: ['admin', 'student', 'coordinator'], default: 'student' },
  accessScope: { type: String, enum: ['full', 'assessment_only'], default: 'full', index: true },
  featureAccess: {
    mode: { type: String, enum: ['all', 'custom'], default: 'all' },
    features: [{
      type: String,
      enum: ['dashboard', 'quickprep', 'analysis', 'rankings', 'interviews', 'ai_interviews', 'assessments', 'learning', 'prep_coding', 'resume', 'prep_coins'],
    }],
    source: { type: String, enum: ['default', 'manual', 'legacy'], default: 'default' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: Date,
  },
  username: { type: String, unique: true, sparse: true, trim: true, maxlength: 32 },
  name: String,
  email: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true,
    set: normalizeEmailAddress,
  },
  studentId: { type: String, unique: true, sparse: true },
  coordinatorId: { type: String, unique: true, sparse: true },
  teacherIds: [String], // For students: links to coordinator's coordinatorID (supports multiple)
  passwordHash: { type: String, required: true },
  mustChangePassword: { type: Boolean, default: false },
  temporaryPasswordEncrypted: { type: String, select: false },
  credentialEmailStatus: {
    type: String,
    enum: ['not_sent', 'pending', 'sent', 'failed'],
    default: 'not_sent',
  },
  credentialEmailSentAt: Date,
  credentialEmailLastAttemptAt: Date,
  credentialEmailLastError: String,
  credentialEmailBatchId: String,
  course: String,
  branch: String,
  college: String,
  semester: { type: Number, min: 1, max: 8 }, // Required for students: current semester (1-8)
  group: String, // Student group (e.g., G1, G2, A, B, etc.)
  uploadBatchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StudentUploadBatch' }],

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
  phone: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  coordinatorPermissions: { type: [String], default: undefined },
  coordinatorDataScope: { type: String, enum: ['own', 'all'], default: 'own' },
  coordinatorPermissionHistory: [{
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedByEmail: String,
    previousPermissions: [String],
    nextPermissions: [String],
    note: String,
    createdAt: { type: Date, default: Date.now },
  }],
  bio: { type: String, trim: true, maxlength: 280 },
  linkedinUrl: { type: String, trim: true },
  githubUrl: { type: String, trim: true },
  portfolioUrl: { type: String, trim: true },
  // The language a student last ran or submitted practice code in; the practice editor opens in it next time.
  practiceLanguage: { type: String, trim: true, maxlength: 20 },
  // Learner level / awards already celebrated in the student UI. Levels and awards themselves are
  // computed from activity data; this only records what the student has been shown (and when),
  // so the level-up celebration appears once across devices and admins can see achievement dates.
  learnerProgress: {
    celebratedLevel: { type: Number, min: 1, max: 6 },
    levelHistory: [{
      _id: false,
      level: { type: Number, min: 1, max: 6 },
      title: { type: String, trim: true, maxlength: 40 },
      achievedAt: Date,
    }],
    awards: [{
      _id: false,
      id: { type: String, trim: true, maxlength: 40 },
      earnedAt: Date,
    }],
  },
}, { timestamps: true });

userSchema.index({ role: 1, semester: 1, createdAt: 1 });
userSchema.index({ role: 1, teacherIds: 1, semester: 1, createdAt: 1 });
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ role: 1, updatedAt: 1 });

attachAdminAnalyticsInvalidation(userSchema, {
  source: 'analytics-cohort',
  relevantPaths: ['role', 'name', 'email', 'studentId', 'teacherIds', 'course', 'branch', 'college', 'semester', 'group', 'uploadBatchIds', 'isActive'],
  documentFilter: (doc) => doc.role === 'student',
});

userSchema.methods.verifyPassword = async function (pw) {
  return bcrypt.compare(pw, this.passwordHash);
};

userSchema.statics.hashPassword = async function (pw) {
  const saltRounds = Number(process.env.BCRYPT_ROUNDS || 10);
  return bcrypt.hash(pw, saltRounds);
};

// SECURITY: Invalidate password reset tokens when password changes
userSchema.pre('save', function(next) {
  this.$locals.syncLoginIdentity = this.isNew || this.isModified('email');
  if (this.isModified('passwordHash') && !this.isNew) {
    // Password was changed - invalidate all reset tokens
    this.passwordChangedAt = new Date();
    this.passwordResetToken = undefined;
    this.passwordResetExpires = undefined;
    this.passwordResetUsed = true;
  }
  next();
});

// Every portal creation path uses User.create(), including CSV and bulk
// coordinator uploads. Hold a cross-replica lock until the insert finishes so
// two concurrent requests cannot both take the last university slot.
userSchema.pre('save', async function() {
  const tenant = currentTenant();
  if (!this.isNew || !tenant || !['student', 'coordinator'].includes(this.role)) return;
  const { reserveAccountSlot } = await import('../platform/accountLimits.js');
  this.$locals.releaseAccountSlot = await reserveAccountSlot(
    tenant.universityId, this.role,
    (role) => this.constructor.countDocuments({ role }),
  );
});

// Main-domain login routes email to a university. Keep only a keyed email
// digest in the main database; student records and passwords stay local.
userSchema.post('save', async function(doc) {
  if (!currentTenant() || !this.$locals.syncLoginIdentity) return;
  const { syncTenantLoginIdentity } = await import('../platform/loginDirectory.js');
  await syncTenantLoginIdentity(doc);
});

userSchema.post('save', async function() {
  if (!this.$locals.releaseAccountSlot) return;
  const release = this.$locals.releaseAccountSlot;
  delete this.$locals.releaseAccountSlot;
  await release();
});

userSchema.post('save', async function(error, doc, next) {
  if (this.$locals.releaseAccountSlot) {
    const release = this.$locals.releaseAccountSlot;
    delete this.$locals.releaseAccountSlot;
    await release();
  }
  next(error);
});

userSchema.post('findOneAndUpdate', async function(doc) {
  const update = this.getUpdate() || {};
  const emailChanged = Object.hasOwn(update, 'email') || Object.hasOwn(update.$set || {}, 'email') || Object.hasOwn(update.$unset || {}, 'email');
  if (!currentTenant() || !doc || !emailChanged) return;
  const fresh = await this.model.findById(doc._id).select('_id email').lean();
  const { syncTenantLoginIdentity } = await import('../platform/loginDirectory.js');
  await syncTenantLoginIdentity(fresh || { _id: doc._id, email: '' });
});

export default tenantModel(mongoose.model('User', userSchema));
