import mongoose from "mongoose";

const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  revision: { type: Number, default: 1 },
  active: { type: Boolean, default: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  assets: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  languagePreviews: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  render: { type: mongoose.Schema.Types.Mixed, default: () => ({ status: "idle", stage: "", error: "" }) },
  // A partial unique index serializes render requests across an owner's avatars.
  activeRenderOwner: String,
  previewStale: { type: Boolean, default: true },
}, { timestamps: true, minimize: false });
schema.index({ ownerId: 1, active: 1, updatedAt: -1, _id: -1 });
schema.index({ activeRenderOwner: 1 }, { unique: true, partialFilterExpression: { activeRenderOwner: { $type: "string" } } });
export default mongoose.model("AIAvatar", schema);
