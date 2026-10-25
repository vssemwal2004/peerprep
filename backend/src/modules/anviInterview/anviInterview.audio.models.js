import mongoose from "mongoose";
import { currentTenant, tenantModel } from "../../platform/tenantContext.js";

// Metadata for one synthesized ANVI question clip (the WAV itself lives in R2 under `storageKey`).
// Only question and template TTS is stored; student audio never is. The row holds no question, template
// or student text: `textHash` and `hash` identify the spoken line, so a leaked row reveals nothing.
// Scopes: "revision" (a published interview's static item, shared by every attempt on that revision),
// "template" (a tenant-wide generic clip: intro, closing, ack, number), "attempt" (a per-student generated
// question, never shared and removed with the attempt).
const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

export const AUDIO_ASSET_SCOPES = Object.freeze(["revision", "template", "attempt"]);
export const AUDIO_ASSET_STATUSES = Object.freeze(["generating", "ready", "failed"]);

const audioAssetSchema = new Schema({
  tenantKey: { type: String, required: true, maxlength: 100 },
  scope: { type: String, enum: AUDIO_ASSET_SCOPES, required: true },
  // null for templates.
  interviewId: { type: ObjectId, default: null },
  revision: { type: Number, default: null },
  // Attempt scope only; left unset otherwise so the sparse index skips the row.
  attemptId: { type: ObjectId, default: undefined },
  // The plan item's qid (or `${qid}:f${i}` for an authored follow-up), or the template id.
  questionId: { type: String, default: "", maxlength: 200 },
  // sha256 over the full spec (see the TTS asset hash); unique per tenant.
  hash: { type: String, required: true, maxlength: 128 },
  // sha256 of the normalized spoken text, so an unchanged line can be copied across revisions.
  textHash: { type: String, required: true, maxlength: 128 },
  language: { type: String, default: "English", maxlength: 40 },
  voice: { type: String, default: "", maxlength: 60 },
  style: { type: String, default: "", maxlength: 60 },
  model: { type: String, default: "", maxlength: 100 },
  schemaVersion: { type: Number, default: 1 },
  mimeType: { type: String, default: "audio/wav", maxlength: 60 },
  size: { type: Number, default: 0 },
  durationMs: { type: Number, default: 0 },
  wpm: { type: Number, default: null },
  storageKey: { type: String, default: "", maxlength: 500 },
  // generating -> ready | failed. A failed row is retried after `retryAfter`; it is never served.
  status: { type: String, enum: AUDIO_ASSET_STATUSES, default: "generating" },
  failureCode: { type: String, default: null, maxlength: 80 },
  attempts: { type: Number, default: 0 },
  // While generating: the claim holder's lease; another instance may take over after it passes.
  leaseUntil: { type: Date, default: null },
  retryAfter: { type: Date, default: null },
  lastUsedAt: { type: Date, default: null },
}, { timestamps: true, strict: true });

audioAssetSchema.index({ tenantKey: 1, hash: 1 }, { unique: true, name: "anvi_audio_hash" });
audioAssetSchema.index({ interviewId: 1, revision: 1 }, { name: "anvi_audio_revision" });
audioAssetSchema.index({ attemptId: 1 }, { sparse: true, name: "anvi_audio_attempt" });
audioAssetSchema.index({ status: 1, retryAfter: 1 }, { name: "anvi_audio_retry" });

export const AnviAudioAsset = tenantModel(mongoose.model("AnviAudioAsset", audioAssetSchema));
export const ANVI_AUDIO_MODELS = [AnviAudioAsset];

// University connections never auto-create indexes (autoIndex is off) and the TTS claim relies on the
// unique (tenantKey, hash) index, so the asset store creates its indexes once per connection before it
// is first used there. A failed attempt is forgotten so the next call retries.
const PLATFORM = {};
const indexed = new WeakMap();

/** Creates the asset indexes on the current tenant's connection (or the platform) once per process. */
export function ensureAnviAudioIndexes() {
  const key = currentTenant()?.connection || PLATFORM;
  let pending = indexed.get(key);
  if (!pending) {
    pending = Promise.all(ANVI_AUDIO_MODELS.map((model) => model.createIndexes()));
    indexed.set(key, pending);
    pending.catch(() => { if (indexed.get(key) === pending) indexed.delete(key); });
  }
  return pending.then(() => undefined);
}
