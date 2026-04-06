import mongoose from 'mongoose';

export const SUPPORTED_LANGUAGES = ['python', 'javascript', 'java', 'cpp', 'c'];

const problemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  description: {
    type: String,
    default: '',
  },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    default: 'Easy',
  },
  tags: [{
    type: String,
    trim: true,
  }],
  companyTags: [{
    type: String,
    trim: true,
  }],
  supportedLanguages: [{
    type: String,
    enum: SUPPORTED_LANGUAGES,
  }],
  codeTemplates: {
    type: Map,
    of: String,
    default: {},
  },
  referenceSolutions: {
    type: Map,
    of: String,
    default: {},
  },
  inputFormat: {
    type: String,
    default: '',
  },
  outputFormat: {
    type: String,
    default: '',
  },
  constraints: {
    type: String,
    default: '',
  },
  timeLimitSeconds: {
    type: Number,
    default: 2,
    min: 1,
    max: 15,
  },
  memoryLimitMb: {
    type: Number,
    default: 256,
    min: 64,
    max: 1024,
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft',
  },
  visibility: {
    type: String,
    enum: ['public', 'assessment', 'private'],
    default: 'public',
  },
  previewValidated: {
    type: Boolean,
    default: false,
  },
  // Backward-compat field for older documents
  previewTested: {
    type: Boolean,
    default: false,
  },
  hiddenTestSource: {
    provider: {
      type: String,
      enum: ['none', 'db', 's3'],
      default: 'none',
    },
    inputObjectKey: {
      type: String,
      default: '',
    },
    outputObjectKey: {
      type: String,
      default: '',
    },
    delimiter: {
      type: String,
      default: '###CASE###',
    },
    caseCount: {
      type: Number,
      default: 0,
    },
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  publishedAt: Date,
  stats: {
    totalSubmissions: {
      type: Number,
      default: 0,
    },
    acceptedSubmissions: {
      type: Number,
      default: 0,
    },
    totalRuns: {
      type: Number,
      default: 0,
    },
    acceptanceRate: {
      type: Number,
      default: 0,
    },
    averageExecutionTimeMs: {
      type: Number,
      default: 0,
    },
  },
}, { timestamps: true });

problemSchema.index({ title: 'text', tags: 'text', companyTags: 'text' });
problemSchema.index({ status: 1, visibility: 1, difficulty: 1, createdAt: -1 });

export default mongoose.model('Problem', problemSchema);
