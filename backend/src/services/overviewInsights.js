import mongoose from 'mongoose';
import User from '../models/User.js';
import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import Progress from '../models/Progress.js';
import Assessment from '../models/Assessment.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import Event from '../models/Event.js';
import Pair from '../models/Pair.js';
import Feedback from '../models/Feedback.js';
import Activity from '../models/Activity.js';
import StudentActivity from '../models/StudentActivity.js';
import QuestionPracticeAttempt from '../models/QuestionPracticeAttempt.js';
import { InterviewEngagementReceipt } from '../models/AdaptiveEngagement.js';
import { PrepScoreState, StudentPrepScore } from '../models/StudentPrepScore.js';
import { isUniversity } from '../platform/deployment.js';
import { universityPolicy } from '../platform/client.js';
import { hasCoordinatorPermission } from './coordinatorPermissions.js';

// Dashboard numbers for admins and coordinators. Every figure is counted in the database for the
// viewer's own scope: the university's licensed modules, the coordinator's permissions and, for
// coordinators without "all data" scope, only their assigned students and their own content.

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;
const TIMEZONE = 'Asia/Kolkata';
const TREND_DAYS = 14;
const QUERY_MS = 8_000;
const LIVE_EVENT_STATUSES = { $nin: ['draft', 'cancelled', 'archived'] };
const PUBLIC_PROBLEMS = { status: { $in: ['published', 'Active', 'active'] }, $or: [{ visibility: 'public' }, { visibility: { $exists: false } }] };
// Score bands 0–25, 26–50, 51–75, 76–90, 91–100 (percent of marks).
const SCORE_BOUNDARIES = [0, 25.0001, 50.0001, 75.0001, 90.0001, 100.0001];

const startOfDay = (time) => new Date(Math.floor((time + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS);
const dayKey = (date) => new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const round = (value, places = 1) => Number.isFinite(value) ? Number(value.toFixed(places)) : null;

export function trendDays(now = new Date(), days = TREND_DAYS) {
  const today = startOfDay(now.getTime());
  return Array.from({ length: days }, (_, index) => dayKey(new Date(today.getTime() - (days - 1 - index) * DAY_MS)));
}

async function dailyCounts(Model, match, field) {
  const rows = await Model.aggregate([
    { $match: match },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: TIMEZONE } }, n: { $sum: 1 } } },
  ]).option({ maxTimeMS: QUERY_MS });
  return new Map(rows.map((row) => [row._id, row.n]));
}

async function lastSeenBy(Model, match, userField, dateField) {
  return Model.aggregate([
    { $match: match },
    { $group: { _id: `$${userField}`, last: { $max: `$${dateField}` } } },
  ]).option({ maxTimeMS: QUERY_MS });
}

// One failing source must not blank the whole dashboard; the payload says which parts are partial.
function collector() {
  const failed = [];
  const safe = async (name, work, fallback) => {
    try { return await work(); } catch (error) {
      failed.push(name);
      console.warn('[Overview] source failed', { name, error: error?.message });
      return fallback;
    }
  };
  return { safe, failed };
}

export async function overviewAccess(user) {
  const licensed = isUniversity()
    ? ((await universityPolicy())?.permissions || {})
    : { questions: true, assessments: true, events: true, interviews: true, learning: true };
  const admin = user.role === 'admin';
  const can = (...permissions) => admin || permissions.some((permission) => hasCoordinatorPermission(user, permission));
  return {
    admin,
    ownScope: !admin && user.coordinatorDataScope !== 'all',
    students: can('coordinator.students.view'),
    activity: can('coordinator.activity.view'),
    coordinators: admin,
    coding: licensed.questions === true && can('coordinator.compiler.view', 'coordinator.compiler.analytics'),
    assessments: licensed.assessments === true && can('coordinator.assessment.view', 'coordinator.assessment.reports'),
    mockInterviews: licensed.events === true && can('coordinator.interviews.view'),
    aiInterviews: licensed.interviews === true && can('coordinator.interviews.view'),
    learning: licensed.learning === true && can('coordinator.learning.manage'),
  };
}

export async function buildOverview(user, now = new Date()) {
  const access = await overviewAccess(user);
  const { safe, failed } = collector();
  const time = now.getTime();
  const days = trendDays(now);
  const trendStart = startOfDay(time - (TREND_DAYS - 1) * DAY_MS);
  const todayStart = startOfDay(time);
  const weekStart = new Date(time - 7 * DAY_MS);
  const monthStart = new Date(time - 30 * DAY_MS);

  const studentFilter = access.ownScope ? { role: 'student', teacherIds: user.coordinatorId } : { role: 'student' };
  const scopedIds = access.ownScope ? await User.distinct('_id', studentFilter).maxTimeMS(QUERY_MS) : null;
  const byStudent = (field) => (scopedIds ? { [field]: { $in: scopedIds } } : {});
  const assessmentScope = access.ownScope ? { createdBy: user._id } : {};
  const eventScope = access.ownScope ? { coordinatorId: user.coordinatorId } : {};
  const countStudents = (ids) => (ids.length
    ? User.countDocuments({ ...studentFilter, _id: { $in: ids } }).maxTimeMS(QUERY_MS) : 0);

  const result = { generatedAt: now.toISOString(), role: user.role, ownScope: access.ownScope, access, days };
  const series = {};
  const pending = {};

  // People and engagement. "Active" means any recorded study action or sign-in.
  const activityWindow = { $gte: weekStart };
  const seen = await safe('engagement', async () => {
    const sources = await Promise.all([
      lastSeenBy(StudentActivity, { date: activityWindow, ...byStudent('studentId') }, 'studentId', 'date'),
      access.coding ? lastSeenBy(Submission, { createdAt: activityWindow, ...byStudent('user') }, 'user', 'createdAt') : [],
      access.coding ? lastSeenBy(QuestionPracticeAttempt, { createdAt: activityWindow, ...byStudent('studentId') }, 'studentId', 'createdAt') : [],
      access.assessments ? lastSeenBy(AssessmentSubmission, { updatedAt: activityWindow, status: { $ne: 'not_started' }, ...byStudent('studentId') }, 'studentId', 'updatedAt') : [],
      access.learning ? lastSeenBy(Progress, { lastAccessedAt: activityWindow, ...byStudent('studentId') }, 'studentId', 'lastAccessedAt') : [],
    ]);
    const last = new Map();
    for (const row of sources.flat()) {
      if (!row._id || !mongoose.isValidObjectId(row._id)) continue;
      const key = String(row._id);
      if (!last.has(key) || last.get(key) < row.last) last.set(key, row.last);
    }
    const week = [...last.keys()];
    const today = week.filter((key) => last.get(key) >= todayStart);
    const [activeWeek, activeToday] = await Promise.all([countStudents(week), countStudents(today)]);
    return { activeWeek, activeToday };
  }, { activeWeek: 0, activeToday: 0 });

  result.people = await safe('people', async () => {
    const [students, newStudents, notActivated, emailFailed, coordinators, logins] = await Promise.all([
      User.countDocuments(studentFilter).maxTimeMS(QUERY_MS),
      User.countDocuments({ ...studentFilter, createdAt: { $gte: monthStart } }).maxTimeMS(QUERY_MS),
      User.countDocuments({ ...studentFilter, mustChangePassword: true }).maxTimeMS(QUERY_MS),
      User.countDocuments({ ...studentFilter, credentialEmailStatus: 'failed' }).maxTimeMS(QUERY_MS),
      access.coordinators ? User.countDocuments({ role: 'coordinator' }).maxTimeMS(QUERY_MS) : null,
      dailyCounts(StudentActivity, { activityType: 'LOGIN', date: { $gte: trendStart }, ...byStudent('studentId') }, 'date'),
    ]);
    series.logins = logins;
    if (access.students) {
      pending.notActivated = notActivated;
      pending.emailFailed = emailFailed;
    }
    return { students, newStudents, coordinators, ...seen };
  }, { students: 0, newStudents: 0, coordinators: null, ...seen });

  if (access.coding) {
    result.coding = await safe('coding', async () => {
      const match = { mode: 'submit', assessmentId: null, createdAt: { $gte: trendStart }, ...byStudent('user') };
      const [problems, difficulty, submits, practice, coders] = await Promise.all([
        Problem.countDocuments(PUBLIC_PROBLEMS).maxTimeMS(QUERY_MS),
        Submission.aggregate([
          { $match: match },
          { $group: { _id: { $toLower: { $ifNull: ['$problemSnapshot.difficulty', 'medium'] } }, attempts: { $sum: 1 }, accepted: { $sum: { $cond: [{ $eq: ['$status', 'AC'] }, 1, 0] } } } },
        ]).option({ maxTimeMS: QUERY_MS }),
        dailyCounts(Submission, match, 'createdAt'),
        dailyCounts(QuestionPracticeAttempt, { createdAt: { $gte: trendStart }, ...byStudent('studentId') }, 'createdAt'),
        Submission.distinct('user', { mode: 'submit', createdAt: activityWindow, ...byStudent('user') }).maxTimeMS(QUERY_MS),
      ]);
      series.coding = new Map(days.map((day) => [day, (submits.get(day) || 0) + (practice.get(day) || 0)]));
      const attempts = difficulty.reduce((sum, row) => sum + row.attempts, 0);
      const accepted = difficulty.reduce((sum, row) => sum + row.accepted, 0);
      const level = (name) => difficulty.find((row) => row._id === name) || { attempts: 0, accepted: 0 };
      return {
        problems,
        attempts,
        accepted,
        acceptanceRate: attempts ? round((accepted / attempts) * 100) : null,
        activeCoders: await countStudents(coders.filter((id) => mongoose.isValidObjectId(id))),
        byDifficulty: ['easy', 'medium', 'hard'].map((name) => ({ difficulty: name, attempts: level(name).attempts, accepted: level(name).accepted })),
      };
    }, null);
  }

  if (access.assessments) {
    result.assessments = await safe('assessments', async () => {
      const ownIds = access.ownScope ? await Assessment.distinct('_id', assessmentScope).maxTimeMS(QUERY_MS) : null;
      const submissionScope = { ...(ownIds ? { assessmentId: { $in: ownIds } } : {}), ...byStudent('studentId') };
      const published = { ...assessmentScope, lifecycleStatus: { $ne: 'draft' } };
      const [publishedCount, drafts, live, upcoming, closingSoon, inProgress, flagged, scores, submitted] = await Promise.all([
        Assessment.countDocuments(published).maxTimeMS(QUERY_MS),
        Assessment.countDocuments({ ...assessmentScope, lifecycleStatus: 'draft' }).maxTimeMS(QUERY_MS),
        Assessment.countDocuments({ ...published, startTime: { $lte: now }, endTime: { $gte: now } }).maxTimeMS(QUERY_MS),
        Assessment.countDocuments({ ...published, startTime: { $gt: now } }).maxTimeMS(QUERY_MS),
        Assessment.countDocuments({ ...published, endTime: { $gte: now, $lte: new Date(time + DAY_MS) } }).maxTimeMS(QUERY_MS),
        AssessmentSubmission.countDocuments({ ...submissionScope, status: 'in_progress' }).maxTimeMS(QUERY_MS),
        AssessmentSubmission.countDocuments({ ...submissionScope, updatedAt: { $gte: trendStart }, $or: [{ status: 'violation' }, { violationScore: { $gt: 0 } }] }).maxTimeMS(QUERY_MS),
        AssessmentSubmission.aggregate([
          { $match: { ...submissionScope, status: 'submitted', submittedAt: { $gte: trendStart }, maxMarks: { $gt: 0 } } },
          { $project: { pct: { $min: [100, { $max: [0, { $multiply: [{ $divide: [{ $ifNull: ['$score', 0] }, '$maxMarks'] }, 100] }] }] } } },
          { $bucket: { groupBy: '$pct', boundaries: SCORE_BOUNDARIES, default: 'other', output: { n: { $sum: 1 }, total: { $sum: '$pct' } } } },
        ]).option({ maxTimeMS: QUERY_MS }),
        dailyCounts(AssessmentSubmission, { ...submissionScope, status: 'submitted', submittedAt: { $gte: trendStart } }, 'submittedAt'),
      ]);
      series.assessments = submitted;
      // $bucket omits empty buckets, so match each band by its lower boundary.
      const bands = SCORE_BOUNDARIES.slice(0, -1).map((lower) => scores.find((row) => row._id === lower)?.n || 0);
      const graded = scores.reduce((sum, row) => sum + (row._id === 'other' ? 0 : row.n), 0);
      const totalPct = scores.reduce((sum, row) => sum + (row._id === 'other' ? 0 : row.total), 0);
      pending.draftAssessments = drafts;
      pending.closingSoon = closingSoon;
      pending.flaggedAttempts = flagged;
      return {
        published: publishedCount, drafts, live, upcoming, inProgress, flagged,
        submissions: [...submitted.values()].reduce((sum, n) => sum + n, 0),
        averageScore: graded ? round(totalPct / graded) : null,
        scoreBands: bands,
      };
    }, null);
  }

  if (access.mockInterviews) {
    result.mockInterviews = await safe('mockInterviews', async () => {
      const ownEvents = access.ownScope ? await Event.distinct('_id', eventScope).maxTimeMS(QUERY_MS) : null;
      const pairScope = ownEvents ? { event: { $in: ownEvents } } : {};
      const active = { ...eventScope, status: LIVE_EVENT_STATUSES };
      const [upcoming, live, startingSoon, pairs, feedback, feedbackTrend] = await Promise.all([
        Event.countDocuments({ ...active, startDate: { $gt: now } }).maxTimeMS(QUERY_MS),
        Event.countDocuments({ ...active, startDate: { $lte: now }, endDate: { $gte: now } }).maxTimeMS(QUERY_MS),
        Event.countDocuments({ ...active, startDate: { $gt: now, $lte: new Date(time + 2 * DAY_MS) } }).maxTimeMS(QUERY_MS),
        Pair.aggregate([{ $match: pairScope }, { $group: { _id: '$status', n: { $sum: 1 } } }]).option({ maxTimeMS: QUERY_MS }),
        Feedback.aggregate([
          { $match: { ...pairScope, createdAt: { $gte: trendStart }, ...byStudent('to') } },
          { $group: { _id: null, n: { $sum: 1 }, avg: { $avg: '$marks' } } },
        ]).option({ maxTimeMS: QUERY_MS }),
        dailyCounts(Feedback, { ...pairScope, createdAt: { $gte: trendStart }, ...byStudent('to') }, 'createdAt'),
      ]);
      series.interviews = feedbackTrend;
      const pairCount = Object.fromEntries(pairs.map((row) => [row._id, row.n]));
      pending.pairsPending = pairCount.pending || 0;
      pending.startingSoon = startingSoon;
      return {
        upcoming, live,
        pairs: { pending: pairCount.pending || 0, scheduled: pairCount.scheduled || 0, completed: pairCount.completed || 0, rejected: pairCount.rejected || 0 },
        feedback: feedback[0]?.n || 0,
        averageFeedback: feedback[0] ? round(feedback[0].avg) : null,
      };
    }, null);
  }

  if (access.aiInterviews) {
    result.aiInterviews = await safe('aiInterviews', async () => {
      const completed = await dailyCounts(InterviewEngagementReceipt, { completedAt: { $gte: trendStart }, ...byStudent('studentId') }, 'completedAt');
      series.aiInterviews = completed;
      return { completed: [...completed.values()].reduce((sum, n) => sum + n, 0) };
    }, null);
  }

  if (access.learning) {
    result.learning = await safe('learning', async () => {
      const [completed, learners] = await Promise.all([
        dailyCounts(Progress, { completed: true, completedAt: { $gte: trendStart }, ...byStudent('studentId') }, 'completedAt'),
        Progress.distinct('studentId', { lastAccessedAt: activityWindow, ...byStudent('studentId') }).maxTimeMS(QUERY_MS),
      ]);
      series.learning = completed;
      return { topicsCompleted: [...completed.values()].reduce((sum, n) => sum + n, 0), activeLearners: await countStudents(learners) };
    }, null);
  }

  result.prepScore = await safe('prepScore', () => prepScoreSummary(byStudent('studentId'), access.students), null);

  result.trend = days.map((day) => ({
    date: day,
    coding: series.coding?.get(day) || 0,
    assessments: series.assessments?.get(day) || 0,
    interviews: (series.interviews?.get(day) || 0) + (series.aiInterviews?.get(day) || 0),
    learning: series.learning?.get(day) || 0,
    logins: series.logins?.get(day) || 0,
  }));

  result.upcoming = await safe('upcoming', () => upcomingItems(access, assessmentScope, eventScope, now), []);
  result.recent = access.activity
    ? await safe('recent', () => recentActivity(access.admin ? {} : { userEmail: user.email }), [])
    : [];
  result.pending = pending;
  result.partial = failed;
  return result;
}

async function prepScoreSummary(studentMatch, includeNames) {
  const state = await PrepScoreState.findById('state').select('servingVersion').lean();
  if (!state?.servingVersion) return null;
  const match = { policyVersion: state.servingVersion, eligible: true, hasProgress: true, ...studentMatch };
  const [stats, top] = await Promise.all([
    StudentPrepScore.aggregate([{ $match: match }, { $group: { _id: null, n: { $sum: 1 }, avg: { $avg: '$total' }, max: { $max: '$total' } } }]).option({ maxTimeMS: QUERY_MS }),
    includeNames ? StudentPrepScore.find(match).select('studentId total').sort({ total: -1, studentId: 1 }).limit(5).maxTimeMS(QUERY_MS).lean() : [],
  ]);
  const summary = stats[0];
  if (!summary) return { scored: 0, average: null, highest: null, bands: [], top: [] };
  if (!(summary.max > 0)) {
    return { scored: summary.n, average: round(summary.avg, 2), highest: 0, bands: [{ from: 0, to: 0, students: summary.n }], top: [] };
  }
  const width = summary.max / 5;
  const bands = await StudentPrepScore.aggregate([
    { $match: match },
    { $bucket: { groupBy: '$total', boundaries: [0, width, width * 2, width * 3, width * 4, summary.max + 0.0001], default: 'other', output: { n: { $sum: 1 } } } },
  ]).option({ maxTimeMS: QUERY_MS });
  const people = top.length ? await User.find({ _id: { $in: top.map((row) => row.studentId) } }).select('name studentId').lean() : [];
  const names = new Map(people.map((person) => [String(person._id), person]));
  return {
    scored: summary.n,
    average: round(summary.avg, 2),
    highest: round(summary.max, 2),
    bands: [0, 1, 2, 3, 4].map((index) => ({
      from: round(width * index, 1), to: round(width * (index + 1), 1),
      students: bands.find((row) => row._id !== 'other' && Math.abs(row._id - width * index) < 1e-6)?.n || 0,
    })),
    top: top.map((row) => ({ id: String(row.studentId), name: names.get(String(row.studentId))?.name || 'Student', rollNumber: names.get(String(row.studentId))?.studentId || '', score: round(row.total, 2) })),
  };
}

async function upcomingItems(access, assessmentScope, eventScope, now) {
  const [assessments, events] = await Promise.all([
    access.assessments ? Assessment.find({ ...assessmentScope, lifecycleStatus: { $ne: 'draft' }, endTime: { $gte: now } })
      .select('title startTime endTime').sort({ startTime: 1 }).limit(6).maxTimeMS(QUERY_MS).lean() : [],
    access.mockInterviews ? Event.find({ ...eventScope, status: LIVE_EVENT_STATUSES, $or: [{ endDate: { $gte: now } }, { endDate: null, startDate: { $gte: now } }] })
      .select('name startDate endDate').sort({ startDate: 1 }).limit(6).maxTimeMS(QUERY_MS).lean() : [],
  ]);
  return [
    ...assessments.map((row) => ({ type: 'assessment', id: String(row._id), title: row.title || 'Untitled assessment', startsAt: row.startTime, endsAt: row.endTime })),
    ...events.map((row) => ({ type: 'interview', id: String(row._id), title: row.name || 'Interview event', startsAt: row.startDate, endsAt: row.endDate })),
  ].map((item) => ({ ...item, live: Boolean(item.startsAt && new Date(item.startsAt) <= now) }))
    .sort((a, b) => new Date(a.startsAt || 0) - new Date(b.startsAt || 0)).slice(0, 6);
}

async function recentActivity(filter) {
  const rows = await Activity.find(filter).select('userEmail userRole actionType targetType description createdAt')
    .sort({ createdAt: -1 }).limit(8).maxTimeMS(QUERY_MS).lean();
  return rows.map((row) => ({
    id: String(row._id),
    title: row.description || [row.actionType, row.targetType].filter(Boolean).join(' ').toLowerCase() || 'Activity',
    action: String(row.actionType || '').toLowerCase(),
    actor: row.userEmail || '',
    role: row.userRole || '',
    at: row.createdAt,
  }));
}

// Light per-university snapshot for the Master Admin overview. Runs inside one tenant's context.
export async function universitySnapshot(now = new Date()) {
  const time = now.getTime();
  const trendStart = startOfDay(time - (TREND_DAYS - 1) * DAY_MS);
  const weekStart = new Date(time - 7 * DAY_MS);
  const days = trendDays(now);
  const [students, coordinators, newStudents, active, activity, prep] = await Promise.all([
    User.countDocuments({ role: 'student' }).maxTimeMS(QUERY_MS),
    User.countDocuments({ role: 'coordinator' }).maxTimeMS(QUERY_MS),
    User.countDocuments({ role: 'student', createdAt: { $gte: new Date(time - 30 * DAY_MS) } }).maxTimeMS(QUERY_MS),
    Promise.all([
      StudentActivity.distinct('studentId', { date: { $gte: weekStart } }).maxTimeMS(QUERY_MS),
      Submission.distinct('user', { createdAt: { $gte: weekStart } }).maxTimeMS(QUERY_MS),
      AssessmentSubmission.distinct('studentId', { updatedAt: { $gte: weekStart }, status: { $ne: 'not_started' } }).maxTimeMS(QUERY_MS),
      Progress.distinct('studentId', { lastAccessedAt: { $gte: weekStart } }).maxTimeMS(QUERY_MS),
    ]).then(async (lists) => {
      const ids = [...new Set(lists.flat().map(String))].filter((id) => mongoose.isValidObjectId(id));
      return ids.length ? User.countDocuments({ role: 'student', _id: { $in: ids } }).maxTimeMS(QUERY_MS) : 0;
    }),
    Promise.all([
      dailyCounts(Submission, { mode: 'submit', assessmentId: null, createdAt: { $gte: trendStart } }, 'createdAt'),
      dailyCounts(AssessmentSubmission, { status: 'submitted', submittedAt: { $gte: trendStart } }, 'submittedAt'),
      dailyCounts(Progress, { completed: true, completedAt: { $gte: trendStart } }, 'completedAt'),
      dailyCounts(Feedback, { createdAt: { $gte: trendStart } }, 'createdAt'),
    ]),
    prepScoreSummary({}, false).catch(() => null),
  ]);
  const [coding, assessments, learning, interviews] = activity;
  return {
    students, coordinators, newStudents, activeWeek: active,
    prepScoreAverage: prep?.average ?? null,
    trend: days.map((date) => ({ date, coding: coding.get(date) || 0, assessments: assessments.get(date) || 0, learning: learning.get(date) || 0, interviews: interviews.get(date) || 0 })),
  };
}
