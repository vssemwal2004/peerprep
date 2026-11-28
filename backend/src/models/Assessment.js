import { tenantModel } from '../platform/tenantContext.js';
﻿import mongoose from 'mongoose';

const starterCodeSchema = new mongoose.Schema({
  language: { type: String, trim: true },
  code: { type: String },
}, { _id: false });

const testCaseSchema = new mongoose.Schema({
  input: { type: String },
  output: { type: String },
  explanation: { type: String },
  hidden: { type: Boolean, default: false },
  marks: { type: Number, min: 0.01, default: 1 },
  images: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { _id: false });

const codingSchema = new mongoose.Schema({
  title: { type: String },
  description: { type: String },
  statement: { type: String },
  constraints: { type: String },
  inputFormat: { type: String },
  outputFormat: { type: String },
  sampleInput: { type: String },
  sampleOutput: { type: String },
  tags: { type: [String], default: [] },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
  timeLimitSeconds: { type: Number, default: 2 },
  memoryLimitMb: { type: Number, default: 256 },
  supportedLanguages: { type: [String], default: [] },
  starterCode: { type: [starterCodeSchema], default: [] },
  testCases: { type: [testCaseSchema], default: [] },
  sampleTestCases: { type: mongoose.Schema.Types.Mixed },
  contentImages: { type: mongoose.Schema.Types.Mixed },
  problemId: { type: mongoose.Schema.Types.ObjectId },
  problemData: { type: mongoose.Schema.Types.Mixed },
  category: { type: String, enum: ['DSA', 'SQL'], default: 'DSA' },
}, { _id: false });

const questionSchema = new mongoose.Schema({
  questionId: { type: String },
  librarySourceId: { type: String, default: '' },
  librarySourceQuestionId: { type: String, default: '' },
  librarySourceChildId: { type: String, default: '' },
  saveToLibrary: { type: Boolean, default: true },
  type: { type: String, enum: ['mcq', 'short', 'one_line', 'coding'] },
  questionText: { type: String },
  options: { type: [String], default: [] },
  correctOptionIndex: { type: Number },
  correctOptionIndexes: { type: [Number], default: [] },
  allowMultipleAnswers: { type: Boolean, default: false },
  partialScoring: { type: Boolean, default: false },
  shuffleOptions: { type: Boolean, default: false },
  questionImage: { type: mongoose.Schema.Types.Mixed },
  optionImages: { type: [mongoose.Schema.Types.Mixed], default: [] },
  passage: { type: mongoose.Schema.Types.Mixed },
  answerExplanation: { type: String, default: '' },
  difficulty: { type: String, default: '' },
  timeLimitSeconds: { type: Number },
  expectedAnswer: { type: String },
  keywords: { type: [String], default: [] },
  tags: { type: [String], default: [] },
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem' },
  problemDataSnapshot: { type: mongoose.Schema.Types.Mixed },
  coding: { type: codingSchema },
  points: { type: Number, default: 1 },
  marksMode: { type: String, enum: ['test_cases', 'custom'], default: 'custom' },
  negativePoints: { type: Number, default: 0 },
  marks: { type: Number },
  weight: { type: Number },
}, { _id: false });

const sectionSchema = new mongoose.Schema({
  sectionName: { type: String, required: true },
  type: { type: String, enum: ['mcq', 'short', 'one_line', 'coding'], required: true },
  marksPerQuestion: { type: Number, default: 1 },
  negativeMarksPerQuestion: { type: Number, default: 0 },
  totalMarks: { type: Number, default: 0 },
  // Prep Mock pattern pacing guidance.
  suggestedMinutes: { type: Number, min: 0, max: 1440 },
  timeLimitMinutes: { type: Number, min: 1, validate: Number.isSafeInteger },
  questions: { type: [questionSchema], default: [] },
}, { _id: false });

const questionSetSchema = new mongoose.Schema({
  setNumber: { type: Number, required: true, min: 1, max: 8 },
  label: { type: String, trim: true, default: '' },
  sections: { type: [sectionSchema], default: [] },
  totalMarks: { type: Number, default: 0 },
}, { _id: false });

const candidateSetAssignmentSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  studentIdSnapshot: { type: String, trim: true, default: '' },
  setNumber: { type: Number, required: true, min: 1, max: 8 },
  source: { type: String, enum: ['automatic', 'csv', 'manual'], default: 'automatic' },
  frozenAt: { type: Date, default: Date.now },
}, { _id: false });

const aiProctoringSettingsSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  detectMobile: { type: Boolean, default: true },
  detectMultiplePersons: { type: Boolean, default: true },
  detectNoFace: { type: Boolean, default: true },
  detectFaceOutOfFrame: { type: Boolean, default: true },
  faceOutOfFrameGraceSec: { type: Number, default: 8, min: 3, max: 60 },
  // Assessments never flag eye/head movement; normalizeAiProctoringSettings forces false.
  detectLookingAway: { type: Boolean, default: false },
  detectVirtualCamera: { type: Boolean, default: true },
  detectionIntervalMs: { type: Number, default: 500, min: 500, max: 5000 },
  ignoreLimit: { type: Number, default: 5, min: 0, max: 50 },
  violationCooldownSec: { type: Number, default: 20, min: 5, max: 120 },
  criticalAutoFlag: { type: Boolean, default: true },
}, { _id: false });

const assessmentSettingsSchema = new mongoose.Schema({
  aiProctoring: { type: aiProctoringSettingsSchema, default: () => ({}) },
}, { _id: false, strict: false });

const assessmentSchema = new mongoose.Schema({
  kind: { type: String, enum: ['assessment', 'mock'], default: 'assessment', index: true },
  company: { type: String, trim: true, maxlength: 120, default: '' },
  // Prep Mock only: the job role inside the company (e.g. "SDE 1") and a copy of the company's logo
  // at save time, so shared mocks show it in every university.
  role: { type: String, trim: true, maxlength: 80, default: '' },
  companyLogo: { type: new mongoose.Schema({ url: String, width: Number, height: Number }, { _id: false }), default: null },
  // Prep Mock only: when the company used this OA pattern (month 1–12 + year). Required to publish.
  patternFrom: { type: new mongoose.Schema({ month: { type: Number, min: 1, max: 12 }, year: { type: Number, min: 2000, max: 2100 } }, { _id: false }), default: null },
  // Prep Mock exam pattern (PrepMockPattern) and the copy students and universities see.
  patternId: { type: mongoose.Schema.Types.ObjectId, default: null },
  mockPattern: { type: mongoose.Schema.Types.Mixed, default: null },
  // Prep Mock: Master Admin's own platform students (kept apart from assignedStudents, which mock
  // edits clear) and the date-time window in which they see it (null = no limit on that side).
  ownStudents: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  // One grant per own student with its own window (null = no limit on that side). ownStudents stays
  // the id index (same students, kept in sync by services/prepMockOwnStudents grantPipeline). A
  // student in ownStudents without a grant (older data) uses ownAccess. No default: a document saved
  // by mongoose never writes an empty list over grants written atomically elsewhere.
  ownGrants: {
    type: [new mongoose.Schema({
      student: { type: mongoose.Schema.Types.ObjectId, required: true },
      startTime: { type: Date, default: null },
      endTime: { type: Date, default: null },
      grantedAt: { type: Date, default: null },
      grantedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    }, { _id: false })],
    default: undefined,
  },
  // The mock's default window: what the "Assign own students" dialog offers for new students.
  ownAccess: {
    type: new mongoose.Schema({ startTime: { type: Date, default: null }, endTime: { type: Date, default: null } }, { _id: false }),
    default: null,
  },
  mockAudienceMode: { type: String, enum: ['students', 'universities'], default: 'students' },
  mockUniversityIds: { type: [String], default: [] },
  title: { type: String },
  description: { type: String, default: '' },
  instructions: { type: String, default: '' },
  startTime: { type: Date },
  endTime: { type: Date },
  availabilityMode: { type: String, enum: ['scheduled', 'always'], default: 'scheduled' },
  duration: { type: Number }, // minutes
  allowLateSubmission: { type: Boolean, default: false },
  attemptLimit: { type: Number, default: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: { type: String, enum: ['all', 'selected'], default: 'all' },
  assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  audienceType: { type: String, enum: ['platform_students', 'assessment_candidates'], default: 'platform_students' },
  draftTargetMode: { type: String, enum: ['all', 'csv', 'individual'], default: 'all' },
  draftAssignedStudents: { type: [mongoose.Schema.Types.Mixed], default: [] },
  lifecycleStatus: { type: String, enum: ['draft', 'published'], default: 'published' },
  mockHasHistory: { type: Boolean, default: false },
  manuallyCompletedAt: { type: Date },
  version: { type: Number, default: 1 },
  versionUpdatedAt: { type: Date },
  assessmentType: { type: String, default: 'mixed' },
  assessmentId: { type: String, trim: true },
  testType: { type: String, trim: true },
  isVisible: { type: Boolean, default: true },
  customInstructions: { type: [String], default: [] },
  invitationTemplate: {
    subject: { type: String, default: '' },
    htmlContent: { type: String, default: '' },
  },
  settings: { type: assessmentSettingsSchema, default: () => ({}) },
  passwordEnabled: { type: Boolean, default: false },
  passwordHash: { type: String },
  passwordEncrypted: { type: String, select: false },
  sections: { type: [sectionSchema], default: [] },
  questionSets: { type: [questionSetSchema], default: [] },
  candidateSetAssignments: { type: [candidateSetAssignmentSchema], default: [] },
  totalMarks: { type: Number, default: 0 },
}, { timestamps: true });

assessmentSchema.index({ startTime: 1, endTime: 1 });
assessmentSchema.index({ createdBy: 1, createdAt: -1 });
assessmentSchema.index({ kind: 1, createdAt: -1 });
assessmentSchema.index({ patternId: 1 }, { sparse: true });
assessmentSchema.index({ ownStudents: 1 });
assessmentSchema.index({ lifecycleStatus: 1, startTime: 1, endTime: 1 });
assessmentSchema.index({ assignedStudents: 1, lifecycleStatus: 1, startTime: 1 });

export default tenantModel(mongoose.model('Assessment', assessmentSchema));

