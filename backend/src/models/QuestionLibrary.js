import mongoose from 'mongoose';

const questionLibrarySchema = new mongoose.Schema({
  sourceKey: { type: String, required: true, unique: true, trim: true },
  sourceType: {
    type: String,
    enum: ['assessment', 'compiler', 'manual'],
    default: 'assessment',
    index: true,
  },
  sourceAssessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', index: true },
  sourceAssessmentTitle: { type: String, default: '', trim: true },
  sourceProblemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', index: true },
  sourceProblemTitle: { type: String, default: '', trim: true },
  sourceQuestionId: { type: String, default: '', trim: true },
  sectionName: { type: String, default: '', trim: true },
  questionType: { type: String, required: true, trim: true },
  questionText: { type: String, default: '' },
  tags: { type: [String], default: [] },
  keywords: { type: [String], default: [] },
  difficulty: { type: String, default: '', trim: true, index: true },
  status: { type: String, default: 'draft', trim: true, index: true },
  visibility: { type: String, default: 'public', trim: true, index: true },
  searchPrefixes: { type: [String], default: [] },
  questionData: { type: mongoose.Schema.Types.Mixed, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastSyncedAt: { type: Date, default: Date.now },
}, { timestamps: true });

questionLibrarySchema.index({ questionType: 1, createdAt: -1 });
questionLibrarySchema.index({ tags: 1, createdAt: -1 });
questionLibrarySchema.index({ sourceType: 1, createdAt: -1 });
questionLibrarySchema.index({ status: 1, createdAt: -1 });
questionLibrarySchema.index({ visibility: 1, createdAt: -1 });
questionLibrarySchema.index({ status: 1, visibility: 1 });
questionLibrarySchema.index({ searchPrefixes: 1 });
// Compound index for the hot query path: status+visibility filter + sort by updatedAt
questionLibrarySchema.index({ status: 1, visibility: 1, updatedAt: -1 });
questionLibrarySchema.index({ status: 1, visibility: 1, questionType: 1, updatedAt: -1 });
// Compound index for coordinator-scoped queries
questionLibrarySchema.index({ createdBy: 1, status: 1, visibility: 1, updatedAt: -1 });

export default mongoose.model('QuestionLibrary', questionLibrarySchema);
