import mongoose from 'mongoose';
import { tenantModel } from '../platform/tenantContext.js';

// Prep Readiness (SBC/PBC coding practice targets) and the Prep Score topic-quota receipts.
// Central (one for every university, like PrepScorePolicy): names start with "Platform".
// Tenant (each university's own database): evidence, allocation receipts, quota slots.

const topicTrack = new mongoose.Schema({
  weight: { type: Number, required: true, min: 0 },
  target: { type: Number, required: true, min: 0 },
  priority: { type: Number, required: true, min: 0, max: 5 },
}, { _id: false });

/** Versioned topic policy. One draft at a time; publishing archives the previous active version. */
const readinessPolicySchema = new mongoose.Schema({
  version: { type: Number, required: true, unique: true, min: 1 },
  status: { type: String, enum: ['draft', 'active', 'archived'], required: true, index: true },
  topics: [{
    _id: false,
    key: { type: String, required: true },
    label: { type: String, required: true },
    category: { type: String, required: true },
    sbc: { type: topicTrack, required: true },
    pbc: { type: topicTrack, required: true },
  }],
  tracks: { type: mongoose.Schema.Types.Mixed, required: true },
  // The active version this draft was edited from: publishing fails (409) if another admin
  // published in between, and the draft is kept.
  baseVersion: { type: Number, default: 0 },
  // Bumped on every draft save so a stale editor cannot overwrite a newer draft.
  revision: { type: Number, default: 1 },
  changeReason: { type: String, trim: true, maxlength: 500, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  publishedAt: Date,
}, { timestamps: true });
readinessPolicySchema.index({ status: 1, version: -1 });

/**
 * Admin-resolved primary topic for a problem whose tags match no canonical topic (or to correct
 * one). Keyed by the canonical problem key, so it applies to every student; every change is also
 * written to PlatformAudit.
 */
const topicMappingSchema = new mongoose.Schema({
  problemKey: { type: String, required: true, unique: true },
  topic: { type: String, required: true },
  title: { type: String, default: '' },
  note: { type: String, trim: true, maxlength: 300, default: '' },
  setBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

/**
 * One row per student and canonical problem: the first verified accepted practice solve.
 * `topic` (the readiness primary) and `attribution` are fixed when the row is written, so a later
 * tag or policy change never silently moves old evidence. `reconstructed`: written from history
 * well after the solve (backfill), shown as such on the growth chart.
 */
const evidenceSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // 'lc:<LeetCode number>' when both copies carry it (local and shared merge), else 'local:<id>' / 'shared:<id>'.
  problemKey: { type: String, required: true },
  sourceKeys: { type: [String], default: [] },
  title: { type: String, default: '' },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
  topic: { type: String, default: null },
  tags: { type: [String], default: [] },
  unmappedTags: { type: [String], default: [] },
  attribution: { type: String, enum: ['publisher', 'rule', 'admin', null], default: null },
  solvedAt: { type: Date, required: true },
  reconstructed: { type: Boolean, default: false },
}, { versionKey: false, timestamps: true });
evidenceSchema.index({ studentId: 1, problemKey: 1 }, { unique: true });
evidenceSchema.index({ studentId: 1, solvedAt: 1 });
evidenceSchema.index({ topic: 1 });

/**
 * Prep Score receipt: the one allocation decision for a student's first accepted solve of a
 * canonical problem. Written once (unique index); a retry or a later re-accept returns it.
 * parts: the tags that had an open quota slot and their share of the base reward.
 */
const allocationSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  problemKey: { type: String, required: true },
  sourceKey: { type: String, required: true },
  day: { type: String, required: true },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
  base: { type: Number, required: true },
  limit: { type: Number, required: true },
  policyVersion: { type: Number, default: null },
  tags: { type: [String], default: [] },
  parts: [{ _id: false, topic: String, label: String, points: Number }],
  fullTags: { type: [String], default: [] },
  points: { type: Number, required: true },
  readinessTopic: { type: String, default: null },
  solvedAt: { type: Date, required: true },
}, { versionKey: false, timestamps: true });
allocationSchema.index({ studentId: 1, problemKey: 1 }, { unique: true });
allocationSchema.index({ studentId: 1, day: 1 });

/** Credited solves per student, topic (canonical tag key) and IST day; taken with a conditional $inc. */
const topicSlotSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  day: { type: String, required: true },
  topic: { type: String, required: true },
  used: { type: Number, default: 0 },
}, { versionKey: false, timestamps: true });
topicSlotSchema.index({ studentId: 1, day: 1, topic: 1 }, { unique: true });

export const ReadinessPolicy = mongoose.models.PlatformReadinessPolicy || mongoose.model('PlatformReadinessPolicy', readinessPolicySchema);
export const ReadinessTopicMapping = mongoose.models.PlatformReadinessTopicMapping || mongoose.model('PlatformReadinessTopicMapping', topicMappingSchema);
export const ReadinessEvidence = tenantModel(mongoose.models.ReadinessEvidence || mongoose.model('ReadinessEvidence', evidenceSchema));
export const PrepScoreAllocation = tenantModel(mongoose.models.PrepScoreAllocation || mongoose.model('PrepScoreAllocation', allocationSchema));
export const PrepScoreTopicSlot = tenantModel(mongoose.models.PrepScoreTopicSlot || mongoose.model('PrepScoreTopicSlot', topicSlotSchema));

// University connections never auto-create indexes. The unique indexes above carry the
// idempotency guarantees, so create them once per connection before first use.
const ensured = new WeakMap();
export async function ensureReadinessIndexes(...models) {
  for (const model of models) {
    const collection = model.collection;
    if (ensured.has(collection)) { await ensured.get(collection); continue; }
    const work = model.createIndexes().catch((error) => { ensured.delete(collection); throw error; });
    ensured.set(collection, work);
    await work;
  }
}
