import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    kind: { type: String, enum: ["companies", "profiles"], required: true },
    name: { type: String, required: true },
    normalizedName: { type: String, required: true },
    active: { type: Boolean, default: true },
    revision: { type: Number, default: 1 },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);
schema.index({ ownerId: 1, kind: 1, normalizedName: 1 }, { unique: true });
schema.index({ ownerId: 1, kind: 1, active: 1, updatedAt: -1 });
export default mongoose.model("AIInterviewResource", schema);
