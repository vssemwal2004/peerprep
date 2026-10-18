import mongoose from 'mongoose';

const universitySchema = new mongoose.Schema({
  universityId: { type: String, required: true, unique: true, immutable: true },
  name: { type: String, required: true, trim: true },
  contactEmail: { type: String, trim: true, lowercase: true },
  deploymentUrl: String,
  apiUrl: String,
  // Stored on Cloudinary under peerprep/universities/<universityId>; absent until uploaded.
  logo: {
    type: new mongoose.Schema({
      url: String,
      publicId: String,
      width: Number,
      height: Number,
      bytes: Number,
      format: String,
      uploadedAt: Date,
    }, { _id: false }),
    default: undefined,
  },
  active: { type: Boolean, default: true },
  serviceStartDate: { type: String, default: null },
  serviceEndDate: { type: String, default: null },
  coinBalance: { type: Number, default: 0, min: 0 },
  coordinatorLimit: { type: Number, default: null, min: 0 },
  studentLimit: { type: Number, default: null, min: 0 },
  // Older registrations may carry a retired per-installation key. Shared
  // registrations use signed internal requests and never create a new key.
  apiKeyHash: { type: String, select: false },
  dbUriEncrypted: { type: String, select: false },
  judge0UrlEncrypted: { type: String, select: false },
  judge0AuthHeaderEncrypted: { type: String, select: false },
  judge0AuthTokenEncrypted: { type: String, select: false },
  interviewUrlEncrypted: { type: String, select: false },
  interviewSecretEncrypted: { type: String, select: false },
  permissions: {
    learning: { type: Boolean, default: true },
    assessments: { type: Boolean, default: true },
    questions: { type: Boolean, default: true },
    events: { type: Boolean, default: true },
    interviews: { type: Boolean, default: true },
    resumes: { type: Boolean, default: true },
  },
  sources: {
    learning: { type: String, enum: ['university', 'shared'], default: 'university' },
    questions: { type: String, enum: ['university', 'shared'], default: 'university' },
  },
  deletedAt: { type: Date, default: null },
  lastHeartbeatAt: Date,
  usage: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

const publicationSchema = new mongoose.Schema({
  kind: { type: String, enum: ['assessment', 'question'], required: true },
  contentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  universityIds: { type: [String], default: [] },
  everUniversityIds: { type: [String], default: [] },
  published: { type: Boolean, default: false },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
publicationSchema.index({ kind: 1, contentId: 1 }, { unique: true });

const auditSchema = new mongoose.Schema({
  actor: String,
  action: { type: String, required: true },
  universityId: String,
  details: mongoose.Schema.Types.Mixed,
}, { timestamps: true });
auditSchema.index({ createdAt: -1 });

const settingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'defaults' },
  permissions: {
    learning: { type: Boolean, default: true },
    assessments: { type: Boolean, default: true },
    questions: { type: Boolean, default: true },
    events: { type: Boolean, default: true },
    interviews: { type: Boolean, default: true },
    resumes: { type: Boolean, default: true },
  },
  sources: {
    learning: { type: String, enum: ['university', 'shared'], default: 'university' },
    questions: { type: String, enum: ['university', 'shared'], default: 'university' },
  },
}, { timestamps: true });

const loginIdentitySchema = new mongoose.Schema({
  emailKey: { type: String, required: true, index: true },
  universityId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { timestamps: true });
loginIdentitySchema.index({ universityId: 1, userId: 1 }, { unique: true });

const loginDirectoryStateSchema = new mongoose.Schema({
  _id: { type: String, default: 'email' },
  completedAt: Date,
}, { timestamps: true });

// Wallet records live in the main database because they are platform-issued
// credits. The reserved platform scope holds PeerPrep's own users; university
// scopes hold only opaque tenant user IDs, not student profiles.
const coinWalletSchema = new mongoose.Schema({
  universityId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  role: { type: String, enum: ['coordinator', 'student'], required: true },
  balance: { type: Number, default: 0, min: 0 },
}, { timestamps: true });
coinWalletSchema.index({ universityId: 1, userId: 1 }, { unique: true });

const coinMovementSchema = new mongoose.Schema({
  universityId: { type: String, required: true, index: true },
  requestId: { type: String, required: true, unique: true },
  kind: { type: String, enum: ['initial', 'topup', 'admin_to_coordinator', 'coordinator_to_student', 'superadmin_to_coordinator', 'superadmin_to_student'], required: true },
  amount: { type: Number, required: true, min: 1 },
  actorId: { type: mongoose.Schema.Types.ObjectId, required: true },
  fromRole: { type: String, required: true },
  fromUserId: mongoose.Schema.Types.ObjectId,
  toRole: { type: String, required: true },
  toUserId: mongoose.Schema.Types.ObjectId,
}, { timestamps: true });
coinMovementSchema.index({ universityId: 1, createdAt: -1 });
coinMovementSchema.index({ universityId: 1, toUserId: 1, createdAt: -1 });
coinMovementSchema.index({ universityId: 1, fromUserId: 1, createdAt: -1 });

// Serializes account creation across API replicas while a university's live
// account count is checked. An expired lease recovers after a process crash.
const accountCreationLockSchema = new mongoose.Schema({
  _id: String,
  owner: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });

export const University = mongoose.models.PlatformUniversity || mongoose.model('PlatformUniversity', universitySchema);
export const Publication = mongoose.models.PlatformPublication || mongoose.model('PlatformPublication', publicationSchema);
export const PlatformAudit = mongoose.models.PlatformAudit || mongoose.model('PlatformAudit', auditSchema);
export const PlatformSettings = mongoose.models.PlatformSettings || mongoose.model('PlatformSettings', settingsSchema);
export const PlatformLoginIdentity = mongoose.models.PlatformLoginIdentity || mongoose.model('PlatformLoginIdentity', loginIdentitySchema);
export const PlatformLoginDirectoryState = mongoose.models.PlatformLoginDirectoryState || mongoose.model('PlatformLoginDirectoryState', loginDirectoryStateSchema);
export const PlatformCoinWallet = mongoose.models.PlatformCoinWallet || mongoose.model('PlatformCoinWallet', coinWalletSchema);
export const PlatformCoinMovement = mongoose.models.PlatformCoinMovement || mongoose.model('PlatformCoinMovement', coinMovementSchema);
export const PlatformAccountCreationLock = mongoose.models.PlatformAccountCreationLock || mongoose.model('PlatformAccountCreationLock', accountCreationLockSchema);
