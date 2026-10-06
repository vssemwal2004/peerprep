import mongoose from 'mongoose';

const universitySchema = new mongoose.Schema({
  universityId: { type: String, required: true, unique: true, immutable: true },
  name: { type: String, required: true, trim: true },
  contactEmail: { type: String, trim: true, lowercase: true },
  deploymentUrl: String,
  apiUrl: String,
  active: { type: Boolean, default: true },
  apiKeyHash: { type: String, required: true, select: false },
  permissions: {
    learning: { type: Boolean, default: true },
    assessments: { type: Boolean, default: true },
    questions: { type: Boolean, default: true },
    events: { type: Boolean, default: true },
    interviews: { type: Boolean, default: true },
    resumes: { type: Boolean, default: true },
    analytics: { type: Boolean, default: true },
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
    analytics: { type: Boolean, default: true },
  },
  sources: {
    learning: { type: String, enum: ['university', 'shared'], default: 'university' },
    questions: { type: String, enum: ['university', 'shared'], default: 'university' },
  },
}, { timestamps: true });

export const University = mongoose.models.PlatformUniversity || mongoose.model('PlatformUniversity', universitySchema);
export const Publication = mongoose.models.PlatformPublication || mongoose.model('PlatformPublication', publicationSchema);
export const PlatformAudit = mongoose.models.PlatformAudit || mongoose.model('PlatformAudit', auditSchema);
export const PlatformSettings = mongoose.models.PlatformSettings || mongoose.model('PlatformSettings', settingsSchema);
