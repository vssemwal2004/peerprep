// Loads the history the Prep Score points ledger (points.js) is replayed from, for a batch of
// students, in a fixed number of queries. Every fact is the student's own verified work.
import mongoose from 'mongoose';
import Problem from '../../models/Problem.js';
import Submission from '../../models/Submission.js';
import QuestionPracticeAttempt from '../../models/QuestionPracticeAttempt.js';
import { BadgeLevelAward, StudentDailyLogin } from '../../models/MonthlyBadge.js';
import { MissionAssignment, QuestEnrollment } from '../../models/AdaptiveEngagement.js';
import { LifetimeBadgeAward } from '../../models/LifetimeBadge.js';
import { ensureReadinessIndexes, PrepScoreAllocation } from '../../models/PrepReadiness.js';
import { canonicalProblemKey } from '../prepReadiness/engine.js';

const QUERY_TIMEOUT_MS = 8_000;
const ACCEPTED = ['AC', 'ACCEPTED', 'ACCEPT'];
// Wrong answer, time limit, runtime error. Compile errors are excluded, and so are runtime errors
// with no test run (the judge itself failed: "Execution failed unexpectedly").
const WRONG = ['WA', 'TLE', 'RE'];
// Older rows may lack createdAt; the ObjectId carries the creation time.
const createdAt = { $ifNull: ['$createdAt', { $toDate: '$_id' }] };
const istDayOf = () => ({ $dateToString: { date: createdAt, format: '%Y-%m-%d', timezone: '+05:30' } });
const objectId = (value) => new mongoose.Types.ObjectId(String(value));
const aggregate = (model, pipeline) => model.aggregate(pipeline).option({ maxTimeMS: QUERY_TIMEOUT_MS });
const publicProblem = [
  { $lookup: { from: Problem.collection.name, localField: '_id.problem', foreignField: '_id', as: 'problem' } },
  { $unwind: '$problem' },
  { $match: { 'problem.status': { $in: ['published', 'Active', 'active'] }, $or: [{ 'problem.visibility': 'public' }, { 'problem.visibility': { $exists: false } }] } },
];

export const emptyFacts = () => ({ solves: [], wrong: [], activeDays: [], logins: [], challenges: [], sheets: [], badgeLevels: [], milestones: [], allocations: new Map() });

const sharedDifficulty = (question) => question?.difficulty || question?.questionData?.problemDataSnapshot?.difficulty || '';
const sharedTopics = (question) => question?.tags || question?.questionData?.tags || [];

/**
 * Map(studentId -> facts) for points.js. `coding`: Prep Coding is licensed (solves, wrong
 * submissions and practice days only count then). `sharedCatalog`: published shared coding questions.
 */
export async function loadPointFacts(studentIds, { coding = true, sharedCatalog = [] } = {}) {
  const ids = [...new Set(studentIds.map(String))].filter((id) => mongoose.isValidObjectId(id)).map(objectId);
  const facts = new Map(ids.map((id) => [String(id), emptyFacts()]));
  if (!ids.length) return facts;
  const sharedIds = sharedCatalog.map((question) => objectId(question._id));
  const sharedMap = new Map(sharedCatalog.map((question) => [String(question._id), question]));
  const practice = { user: { $in: ids }, mode: 'submit', assessmentId: null };
  const sharedPractice = { studentId: { $in: ids }, source: 'shared', questionType: 'coding', questionId: { $in: sharedIds } };

  if (coding) await ensureReadinessIndexes(PrepScoreAllocation);
  const [localSolves, sharedSolves, localWrong, sharedWrong, localDays, sharedDays, logins, challenges, sheets, badgeLevels, milestones, allocations] = await Promise.all([
    coding ? aggregate(Submission, [
      { $match: { ...practice, status: { $in: ACCEPTED } } },
      { $group: { _id: { user: '$user', problem: '$problem' }, at: { $min: createdAt } } },
      ...publicProblem,
      { $project: { at: 1, difficulty: '$problem.difficulty', tags: '$problem.tags', sourceNumber: '$problem.sourceNumber' } },
    ]) : [],
    coding && sharedIds.length ? aggregate(QuestionPracticeAttempt, [
      { $match: { ...sharedPractice, result: 'correct' } },
      { $group: { _id: { user: '$studentId', question: '$questionId' }, at: { $min: createdAt } } },
    ]) : [],
    coding ? aggregate(Submission, [
      { $match: { ...practice, status: { $in: WRONG }, $or: [{ status: { $ne: 'RE' } }, { totalTestCases: { $gt: 0 } }] } },
      { $group: { _id: { user: '$user', problem: '$problem', day: istDayOf() }, count: { $sum: 1 } } },
      ...publicProblem,
      { $project: { count: 1 } },
    ]) : [],
    coding && sharedIds.length ? aggregate(QuestionPracticeAttempt, [
      { $match: { ...sharedPractice, result: 'incorrect', failureStatus: { $ne: 'CE' } } },
      { $group: { _id: { user: '$studentId', question: '$questionId', day: istDayOf() }, count: { $sum: 1 } } },
    ]) : [],
    coding ? aggregate(Submission, [
      { $match: practice },
      { $group: { _id: { user: '$user', day: istDayOf() } } },
    ]) : [],
    coding && sharedIds.length ? aggregate(QuestionPracticeAttempt, [
      { $match: { studentId: { $in: ids }, source: 'shared', questionType: 'coding' } },
      { $group: { _id: { user: '$studentId', day: istDayOf() } } },
    ]) : [],
    StudentDailyLogin.find({ studentId: { $in: ids } }).select('studentId day').maxTimeMS(QUERY_TIMEOUT_MS).lean(),
    coding ? MissionAssignment.find({ studentId: { $in: ids }, kind: 'daily', earnedAt: { $ne: null } }).select('studentId periodKey').maxTimeMS(QUERY_TIMEOUT_MS).lean() : [],
    QuestEnrollment.find({ studentId: { $in: ids }, completedAt: { $ne: null } }).select('studentId questId completedAt').maxTimeMS(QUERY_TIMEOUT_MS).lean(),
    BadgeLevelAward.find({ studentId: { $in: ids } }).select('studentId month track level earnedAt').maxTimeMS(QUERY_TIMEOUT_MS).lean(),
    LifetimeBadgeAward.find({ studentId: { $in: ids } }).select('studentId badgeId tier earnedAt').maxTimeMS(QUERY_TIMEOUT_MS).lean(),
    coding ? PrepScoreAllocation.find({ studentId: { $in: ids } }).select('studentId problemKey points parts fullTags day').maxTimeMS(QUERY_TIMEOUT_MS).lean() : [],
  ]);

  const of = (id) => facts.get(String(id));
  for (const row of localSolves) {
    of(row._id.user)?.solves.push({ key: `local:${row._id.problem}`, problemKey: canonicalProblemKey({ source: 'local', id: row._id.problem, sourceNumber: row.sourceNumber }), at: row.at, difficulty: row.difficulty, topics: row.tags });
  }
  for (const row of sharedSolves) {
    const question = sharedMap.get(String(row._id.question));
    of(row._id.user)?.solves.push({ key: `shared:${row._id.question}`, problemKey: canonicalProblemKey({ source: 'shared', id: row._id.question, sourceNumber: question?.sourceNumber }), at: row.at, difficulty: sharedDifficulty(question), topics: sharedTopics(question) });
  }
  for (const row of allocations) of(row.studentId)?.allocations.set(row.problemKey, row);
  for (const row of localWrong) of(row._id.user)?.wrong.push({ key: `local:${row._id.problem}`, day: row._id.day, count: row.count });
  for (const row of sharedWrong) of(row._id.user)?.wrong.push({ key: `shared:${row._id.question}`, day: row._id.day, count: row.count });
  for (const row of [...localDays, ...sharedDays]) of(row._id.user)?.activeDays.push(row._id.day);
  for (const row of logins) of(row.studentId)?.logins.push(row.day);
  for (const row of challenges) of(row.studentId)?.challenges.push(row.periodKey);
  for (const row of sheets) of(row.studentId)?.sheets.push({ key: `sheet:${row.questId}`, at: row.completedAt });
  for (const row of badgeLevels) of(row.studentId)?.badgeLevels.push({ key: `${row.month}:${row.track}:${row.level}`, at: row.earnedAt, level: row.level });
  for (const row of milestones) of(row.studentId)?.milestones.push({ key: row.badgeId, at: row.earnedAt, tier: row.tier });
  return facts;
}
