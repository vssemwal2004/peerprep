// DEPRECATED MODEL
// -----------------
// The SpecialStudent collection is no longer used by the
// application. All students (including those in special events)
// are now represented by the unified User model with the
// fields `isSpecialStudent` and `specialEvents`.
//
// This file is kept only so existing data in the
// `specialstudents` collection can still be inspected or
// migrated manually if needed. Do NOT import or use this model
// in new code.

import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const specialStudentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  studentId: { type: String, required: true },
  branch: { type: String, required: true },
  course: String,
  college: String,
  semester: { type: Number, min: 1, max: 8 }, // Current semester (1-8)
  group: String, // Student group (e.g., G1, G2, A, B, etc.)
  // Optional coordinator/teacher code (e.g., COO1); populated from CSV or event owner
  teacherId: { type: String },
  events: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Event' }], // Array of events this student participates in
  // Store original password for reference (already hashed)
  passwordHash: String,
  mustChangePassword: { type: Boolean, default: true },
}, { timestamps: true });

// Index for faster lookups
specialStudentSchema.index({ email: 1 });
specialStudentSchema.index({ studentId: 1 });
specialStudentSchema.index({ teacherId: 1 });

// Add password verification method (same as User model)
specialStudentSchema.methods.verifyPassword = async function (pw) {
  return bcrypt.compare(pw, this.passwordHash);
};

// Add static hash method (same as User model)
specialStudentSchema.statics.hashPassword = async function (pw) {
  const saltRounds = Number(process.env.BCRYPT_ROUNDS || 10);
  return bcrypt.hash(pw, saltRounds);
};

export default mongoose.model('SpecialStudent', specialStudentSchema);
