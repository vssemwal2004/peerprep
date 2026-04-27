import mongoose from 'mongoose';

const submissionCaseResultSchema = new mongoose.Schema({
  index: Number,
  status: {
    type: String,
    enum: ['AC', 'WA', 'TLE', 'RE', 'CE'],
  },
  input: String,
  expectedOutput: String,
  actualOutput: String,
  executionTimeMs: Number,
  memoryUsedKb: Number,
  stderr: String,
  compileOutput: String,
}, { _id: false });

const failedCaseSchema = new mongoose.Schema({
  index: Number,
  input: String,
  expectedOutput: String,
  actualOutput: String,
}, { _id: false });

const submissionSchema = new mongoose.Schema({
  jobId: {
    type: String,
    index: true,
    sparse: true,
  },
  problem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem',
    required: true,
    index: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  userSnapshot: {
    name: String,
    email: String,
    role: String,
  },
  problemSnapshot: {
    title: String,
    difficulty: String,
    status: String,
  },
  mode: {
    type: String,
    enum: ['run', 'submit'],
    default: 'submit',
  },
  language: {
    type: String,
    enum: ['python', 'javascript', 'java', 'cpp', 'c'],
    required: true,
  },
  sourceCode: {
    type: String,
    required: true,
  },
  customInput: {
    type: String,
    default: '',
  },
  assessmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assessment',
  },
  output: {
    type: String,
    default: '',
  },
  stderr: {
    type: String,
    default: '',
  },
  compileOutput: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['PENDING', 'RUNNING', 'AC', 'WA', 'TLE', 'RE', 'CE'],
    default: 'PENDING',
    index: true,
  },
  executionTimeMs: {
    type: Number,
    default: 0,
  },
  memoryUsedKb: {
    type: Number,
    default: 0,
  },
  provider: {
    type: String,
    default: 'local-sandbox',
  },
  totalTestCases: {
    type: Number,
    default: 0,
  },
  passedTestCases: {
    type: Number,
    default: 0,
  },
  failedCase: failedCaseSchema,
  testCaseResults: [submissionCaseResultSchema],
  queuedAt: Date,
  startedAt: Date,
  completedAt: Date,
}, { timestamps: true });

submissionSchema.index({ createdAt: -1 });
submissionSchema.index({ problem: 1, createdAt: -1 });

export default mongoose.model('Submission', submissionSchema);



