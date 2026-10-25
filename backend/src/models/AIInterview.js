import { tenantModel } from '../platform/tenantContext.js';
import mongoose from "mongoose";
const { Schema } = mongoose;
const schema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    creationKey: { type: String, required: true },
    revision: { type: Number, default: 1 },
    schemaVersion: { type: Number, default: 1 },
    lifecycle: { type: String, enum: ["draft", "archived"], default: "draft" },
    title: { type: String, required: true },
    companyName: String,
    role: String,
    data: { type: Schema.Types.Mixed, required: true },
    summary: Schema.Types.Mixed,
    validation: Schema.Types.Mixed,
    // Audit and last validation snapshot are committed atomically with the draft.
    history: { type: [Schema.Types.Mixed], default: [] },
    validatedSnapshot: Schema.Types.Mixed,
    publishedSnapshot: Schema.Types.Mixed,
    publishedAt: Date,
    publishedRevision: Number,
    requiresResume: Boolean,
    archivedAt: Date,
    // Publish-time question audio outbox (ANVI hybrid). Written in the publish CAS; a background pass
    // and the maintenance tick voice the revision's static lines. Holds counts only, never text.
    audioPregen: {
      type: new Schema(
        {
          revision: Number,
          status: { type: String, enum: ["pending", "running", "done", "partial", "inactive"] },
          attempts: { type: Number, default: 0 },
          nextAt: { type: Date, default: null },
          leaseUntil: { type: Date, default: null },
          requestedAt: Date,
          startedAt: Date,
          finishedAt: Date,
          counts: { total: Number, ready: Number, failed: Number },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true, minimize: false },
);
schema.index({ ownerId: 1, creationKey: 1 }, { unique: true });
schema.index({ ownerId: 1, lifecycle: 1, updatedAt: -1, _id: -1 });
schema.index({ "audioPregen.status": 1, "audioPregen.nextAt": 1 }, { sparse: true });
export default tenantModel(mongoose.model("AIInterview", schema));
