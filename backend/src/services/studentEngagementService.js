import mongoose from 'mongoose';
import StudentChallenge from '../models/StudentChallenge.js';
import Submission from '../models/Submission.js';
import QuestionPracticeAttempt from '../models/QuestionPracticeAttempt.js';
import Progress from '../models/Progress.js';
import Problem from '../models/Problem.js';
import Semester from '../models/Subject.js';
import { learningSemesters } from '../platform/sharedContent.js';
import { dashboardPermissions, buildCurriculumTopicMap, getSharedCodingCatalog, publicCodingProblemStages, publicProblemMatch, invalidateChallengeRanking } from './studentDashboardService.js';
import { resolveDailyChallenge } from './codingStreakService.js';
import { requireEngagementUniqueIndex } from '../utils/engagementIndexes.js';
import { HttpError } from '../utils/errors.js';

const DAY = 86400000;
const IST_ROLLOVER_OFFSET = 3.5 * 3600000; // Local 02:00 = previous UTC day 20:30.
const rewards = { daily: 10, weekly: 40, monthly: 150 };
const pendingLoads = new Map();
const query = (model, stages) => model.aggregate(stages).option({ maxTimeMS: 8000 });
const editionBadge = (row) => ({ id: `${row.kind}:${row.periodKey}`, kind: row.kind, periodKey: row.periodKey, title: row.kind === 'monthly' ? 'Monthly explorer' : 'Weekly momentum', earnedAt: row.earnedAt, rewardPoints: row.rewardPoints });

export async function listStudentChallengeBadges(student, { cursor, limit = 12 } = {}) {
  const size = Math.max(1, Math.min(24, Math.floor(Number(limit) || 12)));
  const scope = { studentId: student._id, kind: { $in: ['weekly', 'monthly'] }, earnedAt: { $ne: null } };
  if (cursor) {
    const [timestamp, key] = Buffer.from(String(cursor), 'base64url').toString().split('|');
    const at = new Date(timestamp);
    if (!mongoose.isValidObjectId(key) || !Number.isFinite(at.getTime())) throw new HttpError(400, 'Invalid badge collection cursor');
    scope.$or = [{ earnedAt: { $lt: at } }, { earnedAt: at, _id: { $lt: new mongoose.Types.ObjectId(key) } }];
  }
  const rows = await StudentChallenge.find(scope).sort({ earnedAt: -1, _id: -1 }).limit(size + 1).select('kind periodKey rewardPoints earnedAt').maxTimeMS(8000).lean();
  const page = rows.slice(0, size);
  const last = page.at(-1);
  return { badges: page.map(editionBadge), nextCursor: rows.length > size ? Buffer.from(`${last.earnedAt.toISOString()}|${last._id}`).toString('base64url') : null };
}

export function engagementPeriods(now = new Date()) {
  const shifted = new Date(now.getTime() + IST_ROLLOVER_OFFSET);
  const day = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  const monday = day - ((shifted.getUTCDay() + 6) % 7) * DAY;
  const month = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1);
  const nextMonth = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1);
  const make = (kind, start, end) => ({ kind, periodKey: new Date(start).toISOString().slice(0, kind === 'monthly' ? 7 : 10), startsAt: new Date(start - IST_ROLLOVER_OFFSET), endsAt: new Date(end - IST_ROLLOVER_OFFSET), rewardPoints: rewards[kind] });
  return { daily: make('daily', day, day + DAY), weekly: make('weekly', monday, monday + 7 * DAY), monthly: make('monthly', month, nextMonth) };
}

export function challengeGoals(kind, { codingCount = 0, learningCount = 0 } = {}) {
  if (codingCount <= 0 && learningCount <= 0) return [];
  return [
    ...(codingCount > 0 ? [{ metric: 'coding', target: Math.min(kind === 'weekly' ? 3 : 10, codingCount) }] : []),
    ...(learningCount > 0 ? [{ metric: 'learning', target: Math.min(kind === 'weekly' ? 2 : 6, learningCount) }] : []),
    { metric: 'activeDays', target: kind === 'weekly' ? 2 : 8 },
  ];
}

export function goalProgress(goals, evidence, context) {
  const labels = { coding: 'Accepted problems', learning: 'Completed lessons', activeDays: 'Practice days' };
  const hrefs = { coding: '/problems', learning: '/student/learning', activeDays: context.codingCount > 0 ? '/problems' : '/student/learning' };
  return goals.map((goal) => {
    const paused = goal.metric === 'coding' ? !context.permissions.questions : goal.metric === 'learning' ? !context.permissions.learning : !context.permissions.questions && !context.permissions.learning;
    const value = Math.max(0, Number(evidence?.[goal.metric]) || 0);
    return { metric: goal.metric, label: labels[goal.metric], target: goal.target, value: Math.min(goal.target, value), progress: Math.min(100, Math.round(value / goal.target * 100)), completed: !paused && value >= goal.target, paused, href: paused ? null : hrefs[goal.metric] };
  });
}

async function assign(studentId, period, fields = {}) {
  try {
    return await StudentChallenge.findOneAndUpdate({ studentId, kind: period.kind, periodKey: period.periodKey }, { $setOnInsert: { ...period, ...fields } }, { upsert: true, new: true, setDefaultsOnInsert: true }).maxTimeMS(8000).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    return StudentChallenge.findOne({ studentId, kind: period.kind, periodKey: period.periodKey }).maxTimeMS(8000).lean();
  }
}

function evidenceFacets(periods, dateField, itemField, now) {
  return Object.fromEntries(periods.map((period, index) => [String(index), [
    { $match: { [dateField]: { $gte: period.startsAt, $lt: new Date(Math.min(period.endsAt.getTime(), now.getTime() + 1)) } } },
    { $group: { _id: null, items: { $addToSet: itemField }, days: { $addToSet: { $dateToString: { date: { $subtract: [`$${dateField}`, 2 * 3600000] }, format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } } } } },
    { $project: { _id: 0, count: { $size: '$items' }, days: 1 } },
  ]]));
}

async function evidenceForPeriods(studentId, periods, context, now) {
  if (!periods.length) return [];
  const start = new Date(Math.min(...periods.map((period) => period.startsAt.getTime())));
  const range = { $gte: start, $lte: now };
  const [local, shared, learning] = await Promise.all([
    context.permissions.questions ? query(Submission, [
      { $match: { user: studentId, mode: 'submit', assessmentId: null, status: { $in: ['AC', 'ACCEPTED', 'ACCEPT'] }, $or: [{ completedAt: range }, { completedAt: null, createdAt: range }] } },
      ...publicCodingProblemStages(), { $set: { acceptedAt: { $ifNull: ['$completedAt', '$createdAt'] } } },
      { $facet: evidenceFacets(periods, 'acceptedAt', '$problem', now) },
    ]) : [],
    context.permissions.questions && context.sharedCatalog.length ? query(QuestionPracticeAttempt, [
      { $match: { studentId, source: 'shared', questionType: 'coding', result: 'correct', createdAt: range, questionId: { $in: context.sharedCatalog.map((question) => new mongoose.Types.ObjectId(String(question._id))) } } },
      { $facet: evidenceFacets(periods, 'createdAt', '$questionId', now) },
    ]) : [],
    context.permissions.learning && context.topicIds.length ? query(Progress, [
      { $match: { studentId, completed: true, completedAt: range, topicId: { $in: context.topicIds } } },
      { $facet: evidenceFacets(periods, 'completedAt', '$topicId', now) },
    ]) : [],
  ]);
  return periods.map((_, index) => {
    const a = local[0]?.[index]?.[0], b = shared[0]?.[index]?.[0], c = learning[0]?.[index]?.[0];
    return { coding: (a?.count || 0) + (b?.count || 0), learning: c?.count || 0, activeDays: new Set([...(a?.days || []), ...(b?.days || []), ...(c?.days || [])]).size };
  });
}

async function award(assignment, now, newAwards) {
  const result = await StudentChallenge.updateOne({ _id: assignment._id, earnedAt: null }, { $set: { earnedAt: now } }).maxTimeMS(8000);
  if (result.modifiedCount) newAwards.push({ kind: assignment.kind, periodKey: assignment.periodKey, rewardPoints: assignment.rewardPoints });
  assignment.earnedAt ||= now;
}

function periodCard(assignment, goals) {
  const earned = Boolean(assignment.earnedAt);
  const progress = earned ? 100 : Math.round(goals.reduce((sum, goal) => sum + goal.progress, 0) / Math.max(1, goals.length));
  return { kind: assignment.kind, periodKey: assignment.periodKey, title: assignment.kind === 'weekly' ? 'Weekly momentum' : 'Monthly explorer', startsAt: assignment.startsAt, endsAt: assignment.endsAt, rewardPoints: assignment.rewardPoints, earned, earnedAt: assignment.earnedAt, progress, goals, paused: goals.some((goal) => goal.paused) };
}

async function refresh(student, now) {
  await requireEngagementUniqueIndex(StudentChallenge, { studentId: 1, kind: 1, periodKey: 1 });
  const studentId = new mongoose.Types.ObjectId(String(student._id));
  const permissions = await dashboardPermissions(student);
  const periods = engagementPeriods(now);
  const [semesters, sharedCatalog, localCount, dailyResolved] = await Promise.all([
    permissions.learning ? learningSemesters().then((value) => value ?? Semester.find().select('semesterName coordinatorId subjects').maxTimeMS(8000).lean()) : [],
    permissions.questions ? getSharedCodingCatalog() : [],
    permissions.questions ? Problem.countDocuments(publicProblemMatch).maxTimeMS(8000) : 0,
    permissions.questions ? resolveDailyChallenge(now) : null,
  ]);
  const topicIds = [...buildCurriculumTopicMap(semesters, student).keys()].map((value) => new mongoose.Types.ObjectId(value));
  const context = { permissions, sharedCatalog, topicIds, codingCount: localCount + sharedCatalog.length, learningCount: topicIds.length };
  const current = (await Promise.all(['weekly', 'monthly'].map((kind) => {
    const goals = challengeGoals(kind, context);
    return goals.length ? assign(studentId, periods[kind], { goals }) : null;
  }))).filter(Boolean);
  // Reconcile previously assigned periods even if the student was away at rollover. No arbitrary
  // historical badges are invented; only existing, unearned assignments are checked.
  const backlog = await StudentChallenge.find({ studentId, kind: { $in: ['weekly', 'monthly'] }, earnedAt: null, endsAt: { $lte: now } }).sort({ endsAt: -1 }).limit(16).maxTimeMS(8000).lean();
  const assignments = [...current, ...backlog];
  const evidence = await evidenceForPeriods(studentId, assignments, context, now);
  const newAwards = [];
  const cards = [];
  for (const [index, assignment] of assignments.entries()) {
    const goals = goalProgress(assignment.goals, evidence[index], context);
    if (!assignment.earnedAt && goals.length && goals.every((goal) => goal.completed)) await award(assignment, now, newAwards);
    if (index < current.length) cards.push(periodCard(assignment, goals));
  }

  let daily = null;
  if (permissions.questions) {
    const problem = dailyResolved?.problem;
    daily = { enabled: Boolean(dailyResolved?.config.enabled), periodKey: periods.daily.periodKey, endsAt: periods.daily.endsAt, rewardPoints: rewards.daily, problem: null, completed: false };
    if (problem) {
      const assignment = await assign(studentId, periods.daily, { problemId: problem._id, problemSource: problem.source || 'university' });
      const range = { $gte: assignment.startsAt, $lt: assignment.endsAt, $lte: now };
      const accepted = assignment.problemSource === 'shared'
        ? await QuestionPracticeAttempt.exists({ studentId, source: 'shared', questionType: 'coding', questionId: assignment.problemId, result: 'correct', createdAt: range }).maxTimeMS(8000)
        : await Submission.exists({ user: studentId, problem: assignment.problemId, mode: 'submit', assessmentId: null, status: { $in: ['AC', 'ACCEPTED', 'ACCEPT'] }, $or: [{ completedAt: range }, { completedAt: null, createdAt: range }] }).maxTimeMS(8000);
      if (accepted && !assignment.earnedAt) await award(assignment, now, newAwards);
      daily = { ...daily, completed: Boolean(assignment.earnedAt), earnedAt: assignment.earnedAt, problem: { id: String(problem._id), title: problem.title, difficulty: problem.difficulty, href: problem.href || `/problems/${problem._id}` } };
    }
  }
  if (newAwards.length) invalidateChallengeRanking();
  const [summary, collection] = await Promise.all([
    query(StudentChallenge, [{ $match: { studentId, earnedAt: { $ne: null } } }, { $group: { _id: null, points: { $sum: '$rewardPoints' }, badges: { $sum: { $cond: [{ $in: ['$kind', ['weekly', 'monthly']] }, 1, 0] } }, dailyCompleted: { $sum: { $cond: [{ $eq: ['$kind', 'daily'] }, 1, 0] } } } }]),
    listStudentChallengeBadges(student, { limit: 6 }),
  ]);
  return {
    timezone: 'Asia/Kolkata', rolloverHour: 2, daily, periods: cards,
    lifetime: { points: summary[0]?.points || 0, badges: summary[0]?.badges || 0, dailyCompleted: summary[0]?.dailyCompleted || 0 },
    badges: collection.badges, badgesCursor: collection.nextCursor,
    newAwards, generatedAt: now.toISOString(),
    rules: 'Accepted public practice problems count once per period; running code, failed solutions, assessment submissions, logins and views do not count. Lessons require recorded completion. Practice days count verified accepted solutions or completed lessons. Daily rewards: 10 points; weekly badges: 40; monthly badges: 150. Challenge points add 0.1 level points each. Goals reset at 2:00 AM IST; earned awards never reset.',
  };
}

export function refreshStudentEngagement(student, now = new Date()) {
  const key = String(student._id);
  if (pendingLoads.has(key)) return pendingLoads.get(key);
  const pending = refresh(student, now).finally(() => pendingLoads.delete(key));
  pendingLoads.set(key, pending);
  return pending;
}
