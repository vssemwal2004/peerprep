import mongoose from 'mongoose';

const { Schema } = mongoose;
const owner = {
  tenantKey: { type: String, required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
};
const make = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

const policySchema = new Schema({
  tenantKey: { type: String, required: true },
  cohort: { type: String, default: 'all' },
  revision: { type: Number, default: 1 },
  settings: { type: Schema.Types.Mixed, required: true },
  history: { type: [Schema.Types.Mixed], default: [] },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
policySchema.index({ tenantKey: 1, cohort: 1 }, { unique: true });
export const EngagementPolicy = make('EngagementPolicy', policySchema);

const missionSchema = new Schema({
  ...owner,
  kind: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
  periodKey: { type: String, required: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  assignedAt: { type: Date, required: true },
  acceptedAt: { type: Date, default: null },
  ruleVersion: { type: Number, default: 2 },
  policyRevision: { type: String, required: true },
  goals: { type: [Schema.Types.Mixed], default: [] },
  rewardPoints: { type: Number, min: 0, required: true },
  earnedAt: { type: Date, default: null },
  settledAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },
}, { timestamps: true });
missionSchema.index({ tenantKey: 1, studentId: 1, kind: 1, periodKey: 1 }, { unique: true });
missionSchema.index({ tenantKey: 1, studentId: 1, endsAt: -1 });
export const MissionAssignment = make('MissionAssignment', missionSchema);

// Rewards are immutable, independently deduplicated receipts; retries cannot add XP twice.
const rewardSchema = new Schema({ ...owner, key: { type: String, required: true },
  points: { type: Number, min: 0, required: true }, kind: String, earnedAt: Date,
}, { timestamps: true });
rewardSchema.index({ tenantKey: 1, studentId: 1, key: 1 }, { unique: true });
rewardSchema.index({ studentId: 1, earnedAt: -1 });
export const EngagementReward = make('EngagementReward', rewardSchema);

const activitySchema = new Schema({ ...owner,
  sourceKey: { type: String, required: true },
  domain: { type: String, enum: ['coding', 'learning', 'assessments', 'interviews', 'events'], required: true },
  contentKey: { type: String, required: true },
  occurredAt: { type: Date, required: true },
  dayKey: { type: String, required: true },
  difficulty: String, score: Number, tags: [String],
}, { timestamps: true });
activitySchema.index({ tenantKey: 1, studentId: 1, sourceKey: 1 }, { unique: true });
activitySchema.index({ tenantKey: 1, studentId: 1, occurredAt: -1 });
export const EngagementActivity = make('EngagementActivity', activitySchema);

const progressionSchema = new Schema({ ...owner,
  level: { type: Number, default: 1, min: 1, max: 7 },
  joinedAt: { type: Date, required: true },
  syncedAt: Date,
  domainSyncedAt: Schema.Types.Mixed,
  legacyImportedAt: Date,
  lastMonth: String,
  ability: Schema.Types.Mixed,
  levelHistory: { type: [Schema.Types.Mixed], default: [] },
}, { timestamps: true });
progressionSchema.index({ tenantKey: 1, studentId: 1 }, { unique: true });
export const StudentProgression = make('StudentProgression', progressionSchema);

const badgeSchema = new Schema({ ...owner,
  badgeId: { type: String, required: true }, definition: { type: Schema.Types.Mixed, required: true },
  earnedAt: { type: Date, required: true }, evidence: Schema.Types.Mixed,
}, { timestamps: true });
badgeSchema.index({ tenantKey: 1, studentId: 1, badgeId: 1 }, { unique: true });
export const StudentBadge = make('StudentBadge', badgeSchema);

const eventSchema = new Schema({ ...owner,
  key: { type: String, required: true }, payload: { type: Schema.Types.Mixed, required: true },
  deliveredAt: { type: Date, default: null }, acknowledgedAt: { type: Date, default: null },
}, { timestamps: true });
eventSchema.index({ tenantKey: 1, studentId: 1, key: 1 }, { unique: true });
eventSchema.index({ tenantKey: 1, studentId: 1, deliveredAt: 1, createdAt: 1 });
export const AchievementEvent = make('AchievementEvent', eventSchema);

const monthSchema = new Schema({ ...owner, month: { type: String, required: true }, summary: Schema.Types.Mixed }, { timestamps: true });
monthSchema.index({ tenantKey: 1, studentId: 1, month: 1 }, { unique: true });
export const MonthlyProgressSnapshot = make('MonthlyProgressSnapshot', monthSchema);

const interviewReceiptSchema = new Schema({ ...owner, sessionId: { type: String, required: true }, interviewId: String, completedAt: Date }, { timestamps: true });
interviewReceiptSchema.index({ tenantKey: 1, studentId: 1, sessionId: 1 }, { unique: true });
export const InterviewEngagementReceipt = make('InterviewEngagementReceipt', interviewReceiptSchema);

// Quests: admin-curated, ordered sets of library coding questions (company sets, topic tracks,
// study plans). Items reference the library; titles and difficulty are read live, never copied.
const questItemSchema = new Schema({
  source: { type: String, enum: ['university', 'shared'], required: true },
  problemId: { type: Schema.Types.ObjectId, required: true },
  section: { type: String, default: '', trim: true, maxlength: 60 },
}, { _id: false });
const questSchema = new Schema({
  tenantKey: { type: String, required: true },
  slug: { type: String, required: true },
  title: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, default: '', trim: true, maxlength: 600 },
  category: { type: String, enum: ['company', 'topic', 'study-plan', 'difficulty'], default: 'study-plan' },
  company: { type: String, default: '', trim: true, maxlength: 60 },
  topics: { type: [String], default: [] },
  theme: { type: String, enum: ['sky', 'violet', 'emerald', 'amber', 'rose', 'indigo'], default: 'sky' },
  items: { type: [questItemSchema], default: [] },
  rewardXp: { type: Number, min: 0, max: 1000, default: 50 },
  badgeTitle: { type: String, default: '', trim: true, maxlength: 60 },
  semesters: { type: [Number], default: [] },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  publishedAt: { type: Date, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
questSchema.index({ tenantKey: 1, slug: 1 }, { unique: true });
questSchema.index({ tenantKey: 1, status: 1, publishedAt: -1 });
export const Quest = make('Quest', questSchema);

// One row per student and quest: when they started, where they were last, and completion.
const enrollmentSchema = new Schema({ ...owner,
  questId: { type: Schema.Types.ObjectId, ref: 'Quest', required: true },
  startedAt: { type: Date, required: true },
  lastProblemKey: { type: String, default: null },
  lastViewedAt: { type: Date, default: null },
  solvedCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  completedAt: { type: Date, default: null },
}, { timestamps: true });
enrollmentSchema.index({ tenantKey: 1, studentId: 1, questId: 1 }, { unique: true });
enrollmentSchema.index({ tenantKey: 1, questId: 1, completedAt: 1 });
enrollmentSchema.index({ tenantKey: 1, studentId: 1, lastViewedAt: -1 });
export const QuestEnrollment = make('QuestEnrollment', enrollmentSchema);

export const adaptiveModels = [EngagementPolicy, MissionAssignment, EngagementReward, EngagementActivity,
  StudentProgression, StudentBadge, AchievementEvent, MonthlyProgressSnapshot, InterviewEngagementReceipt, Quest, QuestEnrollment];
