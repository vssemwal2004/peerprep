import mongoose from 'mongoose';

// How a student worked on a practice question before one submission (services/solveEffort.js).
// Stored on Submission and QuestionPracticeAttempt; absent on anything submitted before tracking.
export const effortSchema = new mongoose.Schema({
  startedAt: Date, // server time = submitted at - elapsedMs
  elapsedMs: Number, // question open in this visit, until submit
  activeMs: Number, // of that, the tab was visible and in use
  pastes: Number, // pastes from outside the editor
  pastedChars: Number,
  codeChars: Number, // length of the submitted code
}, { _id: false });
