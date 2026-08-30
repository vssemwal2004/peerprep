import mongoose from 'mongoose';

const bulletSchema = new mongoose.Schema({
  text: { type: String, default: '', maxlength: 1200 },
}, { _id: false });

const educationSchema = new mongoose.Schema({
  year: { type: String, default: '', maxlength: 80 },
  degree: { type: String, default: '', maxlength: 180 },
  institute: { type: String, default: '', maxlength: 220 },
  score: { type: String, default: '', maxlength: 80 },
}, { _id: false });

const detailEntrySchema = new mongoose.Schema({
  title: { type: String, default: '', maxlength: 220 },
  subtitle: { type: String, default: '', maxlength: 220 },
  location: { type: String, default: '', maxlength: 140 },
  date: { type: String, default: '', maxlength: 100 },
  link: { type: String, default: '', maxlength: 500 },
  technologies: { type: String, default: '', maxlength: 1000 },
  bullets: { type: [bulletSchema], default: [] },
}, { _id: false });

const skillGroupSchema = new mongoose.Schema({
  category: { type: String, default: '', maxlength: 160 },
  skills: { type: String, default: '', maxlength: 1400 },
}, { _id: false });

const customSectionSchema = new mongoose.Schema({
  id: { type: String, required: true, maxlength: 80 },
  title: { type: String, default: 'CUSTOM SECTION', maxlength: 120 },
  format: { type: String, enum: ['details', 'highlights', 'skills'], default: 'details' },
  entries: { type: [detailEntrySchema], default: [] },
}, { _id: false });

const snapshotSchema = new mongoose.Schema({
  data: { type: mongoose.Schema.Types.Mixed, default: null },
  savedAt: { type: Date },
}, { _id: false });

const resumeSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  template: { type: String, enum: ['iit-bombay-classic'], default: 'iit-bombay-classic' },
  basics: {
    name: { type: String, default: '', maxlength: 160 },
    location: { type: String, default: '', maxlength: 160 },
    email: { type: String, default: '', maxlength: 254 },
    mobile: { type: String, default: '', maxlength: 60 },
    linkedin: { type: String, default: '', maxlength: 500 },
    github: { type: String, default: '', maxlength: 500 },
    portfolio: { type: String, default: '', maxlength: 500 },
  },
  basicsVisibility: {
    location: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    mobile: { type: Boolean, default: true },
    linkedin: { type: Boolean, default: true },
    github: { type: Boolean, default: true },
    portfolio: { type: Boolean, default: true },
  },
  education: { type: [educationSchema], default: [] },
  experience: { type: [detailEntrySchema], default: [] },
  projects: { type: [detailEntrySchema], default: [] },
  skills: { type: [skillGroupSchema], default: [] },
  achievements: { type: [detailEntrySchema], default: [] },
  customSections: { type: [customSectionSchema], default: [] },
  sectionOrder: {
    type: [String],
    default: ['education', 'experience', 'projects', 'skills', 'achievements'],
  },
  hiddenSections: { type: [String], default: [] },
  completion: { type: Number, min: 0, max: 100, default: 0 },
  previousVersion: { type: snapshotSchema, default: undefined },
}, { timestamps: true });

export default mongoose.model('Resume', resumeSchema);
