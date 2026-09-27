import mongoose from "mongoose";
import AIAvatar from "../models/AIAvatar.js";

// Additive only. Never starts the application, reads media, or modifies records.
if (!process.env.MONGODB_URI || process.env.MONGODB_URI === "memory") throw new Error("Set MONGODB_URI to the intended deployment database.");
try {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  await AIAvatar.createIndexes();
  console.log("Avatar Studio indexes created.");
} finally {
  await mongoose.disconnect();
}
