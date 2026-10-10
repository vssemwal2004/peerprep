import crypto from 'node:crypto';
import CodingStreak from '../models/CodingStreak.js';
import DailyChallengeConfig from '../models/DailyChallengeConfig.js';
import Problem from '../models/Problem.js';
import DailyChallengeDay from '../models/DailyChallengeDay.js';
import StudentChallenge from '../models/StudentChallenge.js';
import Submission from '../models/Submission.js';
import QuestionPracticeAttempt from '../models/QuestionPracticeAttempt.js';
import { invalidateChallengeRanking, getSharedCodingCatalog } from './studentDashboardService.js';
import { createNotification } from './notificationService.js';
import { requireEngagementUniqueIndex } from '../utils/engagementIndexes.js';

const CONFIG_KEY = 'coding-daily-challenge';
const DEFAULT_CONFIG = {
  enabled: true,
  timezone: 'Asia/Kolkata',
  rolloverHour: 2,
  difficultyPool: ['Easy', 'Medium', 'Hard'],
};

export function getCodingDayDateKey(date = new Date(), config = DEFAULT_CONFIG) {
  const shifted = new Date(date.getTime() - (Number(config.rolloverHour ?? 2) * 60 * 60 * 1000));
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone || 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(shifted);
}

function hashNumber(value) {
  return Number.parseInt(crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12), 16);
}

export function calculateNextStreak(previous, dateKey, yesterdayKey) {
  if (previous?.lastCompletedDateKey === dateKey) {
    return { currentStreak: Number(previous.currentStreak || 0), bestStreak: Number(previous.bestStreak || 0), alreadyCompleted: true };
  }
  const currentStreak = previous?.lastCompletedDateKey === yesterdayKey ? Number(previous.currentStreak || 0) + 1 : 1;
  return { currentStreak, bestStreak: Math.max(currentStreak, Number(previous?.bestStreak || 0)), alreadyCompleted: false };
}

export async function getDailyChallengeConfig() {
  const stored = await DailyChallengeConfig.findOne({ key: CONFIG_KEY }).lean();
  return { ...DEFAULT_CONFIG, ...(stored || {}), difficultyPool: stored?.difficultyPool?.length ? stored.difficultyPool : DEFAULT_CONFIG.difficultyPool };
}

export async function updateDailyChallengeConfig(updates, userId) {
  const difficultyPool = [...new Set((updates.difficultyPool || []).filter((value) => ['Easy', 'Medium', 'Hard'].includes(value)))];
  return DailyChallengeConfig.findOneAndUpdate(
    { key: CONFIG_KEY },
    { $set: { enabled: updates.enabled !== false, difficultyPool: difficultyPool.length ? difficultyPool : DEFAULT_CONFIG.difficultyPool, timezone: 'Asia/Kolkata', rolloverHour: 2, updatedBy: userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
}

export async function resolveDailyChallenge(date = new Date()) {
  const config = await getDailyChallengeConfig();
  const dateKey = getCodingDayDateKey(date, config);
  if (!config.enabled) return { config, dateKey, problem: null };
  await requireEngagementUniqueIndex(DailyChallengeDay, { dateKey: 1 });

  const visibility = { status: { $in: ['published', 'Active', 'active'] }, $or: [{ visibility: 'public' }, { visibility: { $exists: false } }] };
  const pinned = await DailyChallengeDay.findOne({ dateKey }).maxTimeMS(8000).lean();
  const sharedProblem = (question) => question ? { _id: question._id, title: question.questionData?.problemDataSnapshot?.title || question.questionText, difficulty: question.difficulty || question.questionData?.problemDataSnapshot?.difficulty, source: 'shared', href: `/problems/shared/${question._id}` } : null;
  if (pinned) {
    if (pinned.source === 'shared') return { config, dateKey, problem: sharedProblem((await getSharedCodingCatalog()).find((question) => String(question._id) === String(pinned.problemId))) };
    const problem = await Problem.findOne({ _id: pinned.problemId, ...visibility }).select('_id title difficulty tags stats').maxTimeMS(8000).lean();
    return { config, dateKey, problem };
  }

  const pool = config.difficultyPool?.length ? config.difficultyPool : DEFAULT_CONFIG.difficultyPool;
  const preferredDifficulty = pool[hashNumber(`difficulty:${dateKey}`) % pool.length];
  let selection = { ...visibility, difficulty: preferredDifficulty };
  let poolSize = await Problem.countDocuments(selection).maxTimeMS(8000);
  if (!poolSize) {
    selection = visibility;
    poolSize = await Problem.countDocuments(selection).maxTimeMS(8000);
  }
  let problem = null;
  if (poolSize) {
    let problemIndex = hashNumber(`problem:${dateKey}`) % poolSize;
    if (poolSize > 1) {
      const previousDateKey = getCodingDayDateKey(new Date(date.getTime() - 86400000), config);
      const previousIndex = hashNumber(`problem:${previousDateKey}`) % poolSize;
      if (problemIndex === previousIndex) problemIndex = (problemIndex + 1) % poolSize;
    }
    problem = (await Problem.find(selection).select('_id title difficulty tags stats').sort({ _id: 1 }).skip(problemIndex).limit(1).maxTimeMS(8000).lean())[0] || null;
  }
  if (!problem) {
    const sharedCatalog = (await getSharedCodingCatalog()).sort((a, b) => String(a._id).localeCompare(String(b._id)));
    const preferred = sharedCatalog.filter((question) => (question.difficulty || question.questionData?.problemDataSnapshot?.difficulty) === preferredDifficulty);
    const candidates = preferred.length ? preferred : sharedCatalog;
    if (candidates.length) problem = sharedProblem(candidates[hashNumber(`problem:${dateKey}`) % candidates.length]);
  }
  if (problem) {
    let assignment;
    try {
      assignment = await DailyChallengeDay.findOneAndUpdate({ dateKey }, { $setOnInsert: { problemId: problem._id, source: problem.source || 'university' } }, { upsert: true, new: true }).maxTimeMS(8000).lean();
    } catch (error) {
      if (error.code !== 11000) throw error;
      assignment = await DailyChallengeDay.findOne({ dateKey }).maxTimeMS(8000).lean();
    }
    // Concurrent requests may have selected from different catalog snapshots; the unique pin wins.
    if (String(assignment.problemId) !== String(problem._id) || (assignment.source || 'university') !== (problem.source || 'university')) {
      problem = assignment.source === 'shared'
        ? sharedProblem((await getSharedCodingCatalog()).find((question) => String(question._id) === String(assignment.problemId)))
        : await Problem.findOne({ _id: assignment.problemId, ...visibility }).select('_id title difficulty tags stats').maxTimeMS(8000).lean();
    }
  }
  return { config, dateKey, problem };
}

export function getNextCodingDayBoundary(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  const currentIstHour = Number(parts.hour);
  const currentDateUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const nextDateUtc = currentDateUtc + (currentIstHour >= 2 ? 86400000 : 0);
  const boundaryDate = new Date(nextDateUtc);
  return new Date(Date.UTC(boundaryDate.getUTCFullYear(), boundaryDate.getUTCMonth(), boundaryDate.getUTCDate(), 2 - 5, -30));
}

export async function getCodingStreakStatus(userId, date = new Date()) {
  const [{ config, dateKey, problem }, streak] = await Promise.all([
    resolveDailyChallenge(date),
    CodingStreak.findOne({ user: userId }).lean(),
  ]);
  return {
    enabled: config.enabled,
    dateKey,
    rolloverHour: config.rolloverHour,
    timezone: config.timezone,
    nextResetAt: getNextCodingDayBoundary(date).toISOString(),
    challenge: problem,
    completedToday: streak?.lastCompletedDateKey === dateKey,
    currentStreak: [dateKey, getCodingDayDateKey(new Date(date.getTime() - 86400000), config)].includes(streak?.lastCompletedDateKey) ? streak?.currentStreak || 0 : 0,
    bestStreak: streak?.bestStreak || 0,
    lastCompletedAt: streak?.lastCompletedAt || null,
  };
}

export async function recordDailyChallengeCompletion({ userId, problemId, source = 'university', completedAt = new Date() }) {
  const { config, dateKey, problem } = await resolveDailyChallenge(completedAt);
  if (!config.enabled || !problem || String(problem._id) !== String(problemId) || (problem.source || 'university') !== source) return null;
  await requireEngagementUniqueIndex(StudentChallenge, { studentId: 1, kind: 1, periodKey: 1 });

  const endsAt = getNextCodingDayBoundary(completedAt);
  const startsAt = new Date(endsAt.getTime() - 86400000);
  const range = { $gte: startsAt, $lt: endsAt, $lte: completedAt };
  const accepted = source === 'shared'
    ? await QuestionPracticeAttempt.exists({ studentId: userId, questionId: problemId, source: 'shared', questionType: 'coding', result: 'correct', createdAt: range }).maxTimeMS(8000)
    : await Submission.exists({ user: userId, problem: problemId, mode: 'submit', assessmentId: null, status: { $in: ['AC', 'ACCEPTED', 'ACCEPT'] }, $or: [{ completedAt: range }, { completedAt: null, createdAt: range }] }).maxTimeMS(8000);
  if (!accepted) return null;
  try {
    const result = await StudentChallenge.updateOne({ studentId: userId, kind: 'daily', periodKey: dateKey }, { $setOnInsert: { startsAt, endsAt, problemId, problemSource: source, rewardPoints: 10, earnedAt: completedAt } }, { upsert: true }).maxTimeMS(8000);
    if (result.upsertedCount) invalidateChallengeRanking();
  } catch (error) { if (error.code !== 11000) throw error; }
  // Also award an assignment inserted concurrently by another tab or server process.
  const earned = await StudentChallenge.updateOne({ studentId: userId, kind: 'daily', periodKey: dateKey, earnedAt: null }, { $set: { earnedAt: completedAt } }).maxTimeMS(8000);
  if (earned.modifiedCount) invalidateChallengeRanking();

  const yesterdayKey = getCodingDayDateKey(new Date(completedAt.getTime() - 86400000), config);
  await requireEngagementUniqueIndex(CodingStreak, { user: 1 });
  let streak;
  // Compare-and-set prevents simultaneous or delayed jobs from dropping completion history.
  for (let retry = 0; retry < 6; retry += 1) {
    const previous = await CodingStreak.findOne({ user: userId }).maxTimeMS(8000).lean();
    if (previous?.lastCompletedDateKey > dateKey) return previous;
    const next = calculateNextStreak(previous, dateKey, yesterdayKey);
    if (next.alreadyCompleted) return previous;
    const completedDateKeys = [...new Set([...(previous?.completedDateKeys || []), dateKey])].slice(-400);
    try {
      streak = await CodingStreak.findOneAndUpdate(
        { user: userId, lastCompletedDateKey: previous?.lastCompletedDateKey ?? { $exists: false } },
        { $set: { currentStreak: next.currentStreak, bestStreak: next.bestStreak, lastCompletedDateKey: dateKey, lastCompletedAt: completedAt, completedDateKeys } },
        { new: true, upsert: !previous, setDefaultsOnInsert: true },
      ).maxTimeMS(8000).lean();
      if (streak) break;
    } catch (error) { if (error.code !== 11000) throw error; }
  }
  if (!streak) return CodingStreak.findOne({ user: userId }).lean();

  await createNotification({
    userId,
    title: `${streak.currentStreak}-day coding streak`,
    message: `Daily challenge completed. Your coding streak is now ${streak.currentStreak} day${streak.currentStreak === 1 ? '' : 's'}.`,
    type: 'STREAK',
    referenceId: problem._id,
    actionUrl: problem.href || `/problems/${problem._id}`,
    dedupeKey: `coding-streak:${dateKey}`,
  }).catch(() => {});
  return streak;
}
