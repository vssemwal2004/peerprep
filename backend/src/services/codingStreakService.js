import crypto from 'node:crypto';
import CodingStreak from '../models/CodingStreak.js';
import DailyChallengeConfig from '../models/DailyChallengeConfig.js';
import Problem from '../models/Problem.js';
import { createNotification } from './notificationService.js';

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

  const pool = config.difficultyPool?.length ? config.difficultyPool : DEFAULT_CONFIG.difficultyPool;
  const preferredDifficulty = pool[hashNumber(`difficulty:${dateKey}`) % pool.length];
  let problems = await Problem.find({
    status: { $in: ['published', 'Active', 'active'] },
    $or: [{ visibility: 'public' }, { visibility: { $exists: false } }],
    difficulty: preferredDifficulty,
  }).select('_id title difficulty tags stats').sort({ _id: 1 }).lean();

  if (!problems.length) {
    problems = await Problem.find({
      status: { $in: ['published', 'Active', 'active'] },
      $or: [{ visibility: 'public' }, { visibility: { $exists: false } }],
    }).select('_id title difficulty tags stats').sort({ _id: 1 }).lean();
  }

  let problem = null;
  if (problems.length) {
    let problemIndex = hashNumber(`problem:${dateKey}`) % problems.length;
    if (problems.length > 1) {
      const previousDateKey = getCodingDayDateKey(new Date(date.getTime() - 86400000), config);
      const previousIndex = hashNumber(`problem:${previousDateKey}`) % problems.length;
      if (problemIndex === previousIndex) problemIndex = (problemIndex + 1) % problems.length;
    }
    problem = problems[problemIndex];
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
    currentStreak: streak?.currentStreak || 0,
    bestStreak: streak?.bestStreak || 0,
    lastCompletedAt: streak?.lastCompletedAt || null,
  };
}

export async function recordDailyChallengeCompletion({ userId, problemId, completedAt = new Date() }) {
  const { config, dateKey, problem } = await resolveDailyChallenge(completedAt);
  if (!config.enabled || !problem || String(problem._id) !== String(problemId)) return null;

  const previous = await CodingStreak.findOne({ user: userId }).lean();
  const yesterdayKey = getCodingDayDateKey(new Date(completedAt.getTime() - 86400000), config);
  const next = calculateNextStreak(previous, dateKey, yesterdayKey);
  if (next.alreadyCompleted) return previous;
  const { currentStreak, bestStreak } = next;
  const completedDateKeys = [...new Set([...(previous?.completedDateKeys || []), dateKey])].slice(-400);
  const streak = await CodingStreak.findOneAndUpdate(
    { user: userId },
    { $set: { currentStreak, bestStreak, lastCompletedDateKey: dateKey, lastCompletedAt: completedAt, completedDateKeys } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  if (!streak) return CodingStreak.findOne({ user: userId }).lean();

  await createNotification({
    userId,
    title: `${currentStreak}-day coding streak`,
    message: `Daily challenge completed. Your coding streak is now ${currentStreak} day${currentStreak === 1 ? '' : 's'}.`,
    type: 'STREAK',
    referenceId: problem._id,
    actionUrl: `/problems/${problem._id}`,
    dedupeKey: `coding-streak:${dateKey}`,
  }).catch(() => {});
  return streak;
}
