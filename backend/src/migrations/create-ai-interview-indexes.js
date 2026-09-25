import mongoose from "mongoose";
import AIInterview from "../models/AIInterview.js";
import Resource from "../models/AIInterviewResource.js";

// Explicit, additive deployment step. No index drops and no application bootstrap.
if (!process.env.MONGODB_URI || process.env.MONGODB_URI === "memory")
  throw new Error("Set MONGODB_URI to the intended deployment database.");
try {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  await AIInterview.createIndexes();
  await Resource.createIndexes();
  console.log("AI interview authoring indexes created.");
} finally {
  await mongoose.disconnect();
}
