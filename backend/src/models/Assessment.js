import mongoose from 'mongoose';

const starterCodeSchema = new mongoose.Schema({
  language: { type: String, trim: true },
  code: { type: String },
}, { _id: false });

const testCaseSchema = new mongoose.Schema({
  input: { type: String },
  output: { type: String },
  explanation: { type: String },
  hidden: { type: Boolean, default: false },
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
  problemId: { type: mongoose.Schema.Types.ObjectId },
  problemData: { type: mongoose.Schema.Types.Mixed },
  category: { type: String, enum: ['DSA', 'SQL'], default: 'DSA' },
}, { _id: false });

const questionSchema = new mongoose.Schema({
  questionId: { type: String },
  type: { type: String, enum: ['mcq', 'short', 'one_line', 'coding'] },
  questionText: { type: String },
  options: { type: [String], default: [] },
  correctOptionIndex: { type: Number },
  expectedAnswer: { type: String },
  keywords: { type: [String], default: [] },
  tags: { type: [String], default: [] },
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem' },
  problemDataSnapshot: { type: mongoose.Schema.Types.Mixed },
  coding: { type: codingSchema },
  points: { type: Number, default: 1 },
  marks: { type: Number },
  weight: { type: Number },
}, { _id: false });

const sectionSchema = new mongoose.Schema({
  sectionName: { type: String, required: true },
  type: { type: String, enum: ['mcq', 'short', 'one_line', 'coding'], required: true },
  marksPerQuestion: { type: Number, default: 1 },
  totalMarks: { type: Number, default: 0 },
  questions: { type: [questionSchema], default: [] },
}, { _id: false });

const assessmentSchema = new mongoose.Schema({
  title: { type: String },
  description: { type: String, default: '' },
  instructions: { type: String, default: '' },
  startTime: { type: Date },
  endTime: { type: Date },
  duration: { type: Number }, // minutes
  allowLateSubmission: { type: Boolean, default: false },
  attemptLimit: { type: Number, default: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: { type: String, enum: ['all', 'selected'], default: 'all' },
  assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  draftTargetMode: { type: String, enum: ['all', 'csv', 'individual'], default: 'all' },
  draftAssignedStudents: { type: [mongoose.Schema.Types.Mixed], default: [] },
  lifecycleStatus: { type: String, enum: ['draft', 'published'], default: 'published' },
  version: { type: Number, default: 1 },
  versionUpdatedAt: { type: Date },
  assessmentType: { type: String, default: 'mixed' },
  sections: { type: [sectionSchema], default: [] },
  totalMarks: { type: Number, default: 0 },
}, { timestamps: true });

assessmentSchema.index({ startTime: 1, endTime: 1 });

export default mongoose.model('Assessment', assessmentSchema);

