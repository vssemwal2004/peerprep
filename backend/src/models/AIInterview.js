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
    archivedAt: Date,
  },
  { timestamps: true, minimize: false },
);
schema.index({ ownerId: 1, creationKey: 1 }, { unique: true });
schema.index({ ownerId: 1, lifecycle: 1, updatedAt: -1, _id: -1 });
export default mongoose.model("AIInterview", schema);
