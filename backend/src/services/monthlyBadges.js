// Monthly badges: the same badges for every student, levels 1-10 each month, with targets built
// from the student's OWN last three months, so they keep rising as the student improves and never
// run out. Levels are hard on purpose; from level 3 a level pays Prep Coins once (harder levels pay
// more, Master Admin sets the amounts).
//
// - Months are IST calendar months. A month's ladder is created on first use and then frozen.
// - Solves count as they do for the Prep Score: the first accepted solve of a problem, within the
//   daily topic limit (services/prepScore/topicQuota.js).
// - A level is awarded once (unique BadgeLevelAward); its coins use a deterministic request ID.
import mongoose from 'mongoose';
import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import QuestionPracticeAttempt from '../models/QuestionPracticeAttempt.js';
import User from '../models/User.js';
import { BadgeLadder, BadgeLevelAward } from '../models/MonthlyBadge.js';
import { MissionAssignment } from '../models/AdaptiveEngagement.js';
import { PrepScoreSolve } from '../models/PrepScoreTopicQuota.js';
import { BADGE_LEVELS, creditEarningSafely, getEarningConfig } from '../platform/coinEarn.js';
import { currentTenant } from '../platform/tenantContext.js';
import { getIo } from '../utils/io.js';
import { personalRoom } from '../utils/realtime.js';
import { notifyOnce } from './notificationService.js';
import { getSharedCodingCatalog } from './studentDashboardService.js';
import { istDay } from './prepScore/topicQuota.js';

const IST_OFFSET_MS = 330 * 60_000;
const QUERY_TIMEOUT_MS = 8_000;
const HISTORY_MONTHS = 3;
const ACCEPTED = ['AC', 'Accepted', 'ACCEPTED', 'ACCEPT'];
// Each next month asks more than the recent average.
const GROWTH = 1.25;
// Badges are meant to be precious (2026-11-19): level 1 already means beating your own recent
// month (baseline = 110% of your 3-month average, never below the badge's floor), and level 10
// asks for four times that. Level k's target = baseline × MULTIPLIERS[k - 1].
// 2026-11-21: harder again (user: badges were too easy). Level 1 = 125% of your 3-month average,
// level 10 = six times that.
const MULTIPLIERS = Object.freeze([1, 1.3, 1.6, 2, 2.4, 2.9, 3.5, 4.2, 5, 6]);
// Bumped when the rules change, so this month's ladder is rebuilt under the new rules once.
export const LADDER_RULES = 'precious-2';

// Only four badges, all earned by practice (opening the app, or touching many topics with easy
// solves, no longer earns a badge).
export const TRACKS = Object.freeze([
  { key: 'solver', title: 'Problem Solver', unit: 'problems solved', description: 'New problems solved this month', floor: 20 },
  { key: 'medium', title: 'Medium Master', unit: 'Medium problems', description: 'New Medium problems solved this month', floor: 8 },
  { key: 'hard', title: 'Hard Hitter', unit: 'Hard problems', description: 'New Hard problems solved this month', floor: 4 },
  { key: 'consistent', title: 'Consistency', unit: 'practice days', description: 'Days you submitted code this month', floor: 15, days: true },
  // The monthly active badge: daily challenges completed this month (2026-11-21).
  { key: 'challenger', title: 'Daily Challenger', unit: 'daily challenges', description: 'Daily challenges completed this month', floor: 12, days: true },
].map(Object.freeze));
const TRACK_BY_KEY = new Map(TRACKS.map((track) => [track.key, track]));

/** Tier name for a level: 1-2 Bronze … 9 Diamond, 10 Legend. */
export function tierOf(level) {
  return ['Bronze', 'Bronze', 'Silver', 'Silver', 'Gold', 'Gold', 'Platinum', 'Platinum', 'Diamond', 'Legend'][Math.max(1, Math.min(10, level)) - 1];
}

export const monthOf = (date = new Date()) => istDay(date).slice(0, 7);
export function monthStart(month) {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 1, 1) - IST_OFFSET_MS);
}
export function shiftMonth(month, delta) {
  const [year, index] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, index - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
export function daysInMonth(month) {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index, 0)).getUTCDate();
}

/**
 * The month's ladder from the student's previous months (values per track, missing = 0).
 * Targets strictly rise level to level; day badges stay within the month's days.
 */
export function buildLadder(history = [], month) {
  const cap = daysInMonth(month);
  return TRACKS.map((track) => {
    const values = Array.from({ length: HISTORY_MONTHS }, (_, index) => Number(history[index]?.[track.key]) || 0);
    const average = values.reduce((sum, value) => sum + value, 0) / HISTORY_MONTHS;
    // Rounded first so float noise (100 × 1.1 = 110.00000000000001) cannot add a whole unit.
    const baseline = Math.max(track.floor, Math.ceil(Math.round(average * GROWTH * 1e6) / 1e6));
    const limit = track.days ? cap : Infinity;
    const targets = [];
    MULTIPLIERS.forEach((multiplier, index) => {
      const raw = Math.max(1, Math.ceil(Math.round(baseline * multiplier * 1e6) / 1e6));
      const rising = Math.max(raw, (targets[index - 1] || 0) + 1);
      targets.push(Math.min(rising, limit - (BADGE_LEVELS - 1 - index)));
    });
    return { key: track.key, baseline, targets };
  });
}

/** Highest level whose target the value reaches (0 = none yet). */
export function levelFor(targets, value) {
  let level = 0;
  targets.forEach((target, index) => { if (value >= target) level = index + 1; });
  return level;
}

const objectId = (value) => new mongoose.Types.ObjectId(String(value));
const emptyValues = () => Object.fromEntries(TRACKS.map((track) => [track.key, 0]));

/** Per-month track values for months [from, to] (inclusive), keyed by YYYY-MM. */
export async function monthlyValues(studentId, fromMonth, toMonth) {
  const student = objectId(studentId);
  const from = monthStart(fromMonth);
  const to = monthStart(shiftMonth(toMonth, 1));
  const [localFirsts, sharedFirsts, uncounted, localDays, sharedDays, challenges, catalog] = await Promise.all([
    Submission.aggregate([
      { $match: { user: student, mode: 'submit', assessmentId: null, status: { $in: ACCEPTED } } },
      { $group: { _id: '$problem', firstAt: { $min: '$createdAt' } } },
      { $match: { firstAt: { $gte: from, $lt: to } } },
    ]).option({ maxTimeMS: QUERY_TIMEOUT_MS }),
    QuestionPracticeAttempt.aggregate([
      { $match: { studentId: student, source: 'shared', questionType: 'coding', result: 'correct' } },
      { $group: { _id: '$questionId', firstAt: { $min: '$createdAt' } } },
      { $match: { firstAt: { $gte: from, $lt: to } } },
    ]).option({ maxTimeMS: QUERY_TIMEOUT_MS }),
    PrepScoreSolve.find({ studentId: student, counted: false, solvedAt: { $gte: from, $lt: to } }).select('problemKey').maxTimeMS(QUERY_TIMEOUT_MS).lean(),
    Submission.aggregate([
      { $match: { user: student, mode: 'submit', assessmentId: null, createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } } } },
    ]).option({ maxTimeMS: QUERY_TIMEOUT_MS }),
    QuestionPracticeAttempt.aggregate([
      { $match: { studentId: student, source: 'shared', questionType: 'coding', createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } } } },
    ]).option({ maxTimeMS: QUERY_TIMEOUT_MS }),
    MissionAssignment.find({ studentId: student, kind: 'daily', earnedAt: { $ne: null }, periodKey: { $gte: `${fromMonth}-01`, $lte: `${toMonth}-31` } }).select('periodKey').maxTimeMS(QUERY_TIMEOUT_MS).lean(),
    sharedFirstsNeedCatalog(),
  ]);
  const skipped = new Set(uncounted.map((row) => row.problemKey));
  const problems = localFirsts.length
    ? new Map((await Problem.find({ _id: { $in: localFirsts.map((row) => row._id).filter(Boolean) } }).select('difficulty tags').maxTimeMS(QUERY_TIMEOUT_MS).lean()).map((row) => [String(row._id), row]))
    : new Map();
  const sharedById = new Map((catalog || []).map((question) => [String(question._id), question]));
  const result = {};
  const bucket = (month) => { result[month] ||= { ...emptyValues(), topics: new Set(), days: new Set() }; return result[month]; };
  const addSolve = (firstAt, difficulty, tags) => {
    const row = bucket(monthOf(firstAt));
    row.solver += 1;
    const level = String(difficulty || '').toLowerCase();
    if (level === 'medium') row.medium += 1;
    if (level === 'hard') row.hard += 1;
    for (const tag of tags || []) if (String(tag || '').trim()) row.topics.add(String(tag).trim().toLowerCase());
  };
  for (const row of localFirsts) {
    if (!row._id || skipped.has(`local:${row._id}`)) continue;
    const problem = problems.get(String(row._id));
    if (problem) addSolve(row.firstAt, problem.difficulty, problem.tags);
  }
  for (const row of sharedFirsts) {
    if (!row._id || skipped.has(`shared:${row._id}`)) continue;
    const question = sharedById.get(String(row._id));
    if (question) addSolve(row.firstAt, question.difficulty || question.questionData?.problemDataSnapshot?.difficulty, question.tags);
  }
  for (const row of [...localDays, ...sharedDays]) bucket(row._id.slice(0, 7)).days.add(row._id);
  for (const row of challenges) bucket(row.periodKey.slice(0, 7)).challenger += 1;
  for (const row of Object.values(result)) {
    row.explorer = row.topics.size;
    row.consistent = row.days.size;
    delete row.topics;
    delete row.days;
  }
  return result;
}

// The shared catalogue only exists for university deployments; elsewhere it is empty.
function sharedFirstsNeedCatalog() {
  return getSharedCodingCatalog().catch(() => []);
}

async function ladderFor(studentId, month) {
  const filter = { studentId: objectId(studentId), month };
  const existing = await BadgeLadder.findOne(filter).lean();
  if (existing?.rules === LADDER_RULES) return existing;
  const first = shiftMonth(month, -HISTORY_MONTHS);
  const values = await monthlyValues(studentId, first, shiftMonth(month, -1));
  const history = [1, 2, 3].map((back) => values[shiftMonth(month, -back)] || emptyValues());
  const tracks = buildLadder(history, month);
  // A ladder made under older rules is replaced once (levels already awarded stay awarded).
  if (existing) return BadgeLadder.findOneAndUpdate({ ...filter, rules: existing.rules ?? null }, { $set: { tracks, rules: LADDER_RULES } }, { new: true }).lean().then((doc) => doc || BadgeLadder.findOne(filter).lean());
  try {
    return await BadgeLadder.findOneAndUpdate(filter, { $setOnInsert: { tracks, rules: LADDER_RULES } }, { upsert: true, new: true }).lean();
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return BadgeLadder.findOne(filter).lean();
  }
}

function trackView(track, ladderTrack, value, earned, coinsByLevel) {
  const level = levelFor(ladderTrack.targets, value);
  const nextIndex = ladderTrack.targets.findIndex((target) => value < target);
  return {
    key: track.key, title: track.title, unit: track.unit, description: track.description,
    value, level, tier: level ? tierOf(level) : null, targets: ladderTrack.targets,
    next: nextIndex === -1 ? null : { level: nextIndex + 1, target: ladderTrack.targets[nextIndex], coins: coinsByLevel[nextIndex] || 0, tier: tierOf(nextIndex + 1) },
    coinsEarned: earned.reduce((sum, award) => sum + (award.coins || 0), 0),
    levels: ladderTrack.targets.map((target, index) => ({ level: index + 1, target, coins: coinsByLevel[index] || 0, tier: tierOf(index + 1), earned: earned.some((award) => award.level === index + 1) })),
  };
}

async function evaluate(student, now) {
  const studentId = objectId(student._id);
  const month = monthOf(now);
  const [ladder, values, config] = await Promise.all([
    ladderFor(studentId, month), monthlyValues(studentId, month, month), getEarningConfig(),
  ]);
  const current = values[month] || emptyValues();
  const coinsByLevel = config.earning.badgeLevels;
  const awards = await BadgeLevelAward.find({ studentId, month }).lean();
  const have = new Set(awards.map((award) => `${award.track}:${award.level}`));
  const fresh = [];
  for (const ladderTrack of ladder.tracks) {
    const track = TRACK_BY_KEY.get(ladderTrack.key);
    if (!track) continue;
    const value = current[track.key] || 0;
    const reached = levelFor(ladderTrack.targets, value);
    for (let level = 1; level <= reached; level += 1) {
      if (have.has(`${track.key}:${level}`)) continue;
      const coins = coinsByLevel[level - 1] || 0;
      try {
        const award = await BadgeLevelAward.create({ studentId, month, track: track.key, level, target: ladderTrack.targets[level - 1], value, coins, earnedAt: now });
        awards.push(award.toObject());
        fresh.push({ track, level, coins, value });
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
      have.add(`${track.key}:${level}`);
    }
  }
  // Only the highest new level of each badge is announced, so catching up never floods the bell.
  const announce = new Map();
  for (const item of fresh) if (!announce.has(item.track.key) || announce.get(item.track.key).level < item.level) announce.set(item.track.key, item);
  for (const item of fresh) {
    await creditEarningSafely({ user: student, kind: 'badge', key: `${month}:${item.track.key}:${item.level}`, amount: item.coins, note: `${item.track.title} · Level ${item.level}` });
  }
  for (const item of announce.values()) {
    const coins = fresh.filter((entry) => entry.track.key === item.track.key).reduce((sum, entry) => sum + entry.coins, 0);
    const payload = { month, track: item.track.key, title: item.track.title, level: item.level, tier: tierOf(item.level), coins, value: item.value, unit: item.track.unit };
    getIo()?.to(personalRoom(String(studentId))).emit('badge:earned', payload);
    await notifyOnce({
      userId: studentId, dedupeKey: `monthly-badge:${month}:${item.track.key}:${item.level}`, type: 'BADGE', actionUrl: '/student/dashboard#badges',
      title: `${item.track.title} · Level ${item.level} (${tierOf(item.level)})`,
      message: `${item.value} ${item.track.unit} this month${coins ? ` · +${coins} Prep Coins` : ''}`, now,
    }).catch((error) => console.warn('[badges] notification failed:', error.message));
  }
  const byTrack = (key) => awards.filter((award) => award.track === key);
  return {
    month, resetsAt: monthStart(shiftMonth(month, 1)).toISOString(),
    tracks: ladder.tracks.filter((entry) => TRACK_BY_KEY.has(entry.key))
      .map((entry) => trackView(TRACK_BY_KEY.get(entry.key), entry, current[entry.key] || 0, byTrack(entry.key), coinsByLevel)),
    newLevels: [...announce.values()].map((item) => ({ track: item.track.key, title: item.track.title, level: item.level, tier: tierOf(item.level) })),
    coinsThisMonth: awards.reduce((sum, award) => sum + (award.coins || 0), 0),
  };
}

const inFlight = new Map();

/** Evaluates (awarding any newly reached levels) and returns the student's monthly badges. */
export function evaluateMonthlyBadges(student, now = new Date()) {
  const key = `${currentTenant()?.universityId || 'platform'}:${student._id}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = evaluate(student, now).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

/** Fire-and-forget evaluation after a solve or check-in: never blocks or fails the caller. */
export async function evaluateMonthlyBadgesQuietly(studentOrId) {
  try {
    const student = studentOrId?.role ? studentOrId : await User.findById(studentOrId).select('role isActive accessScope featureAccess').lean();
    if (!student || student.role !== 'student' || student.accessScope === 'assessment_only') return null;
    return await evaluateMonthlyBadges(student);
  } catch (error) {
    console.warn(`[badges] evaluation for ${studentOrId?._id || studentOrId} failed: ${error.message}`);
    return null;
  }
}

/** Earned levels of past months, newest first: [{ month, levels, coins, best: [{ track, title, level, tier }] }]. */
export async function badgeHistory(studentId, months = 6, now = new Date()) {
  const since = shiftMonth(monthOf(now), -months);
  const awards = await BadgeLevelAward.find({ studentId: objectId(studentId), month: { $gte: since } }).sort({ month: -1 }).lean();
  const byMonth = new Map();
  for (const award of awards) {
    const row = byMonth.get(award.month) || { month: award.month, levels: 0, coins: 0, best: new Map() };
    row.levels += 1;
    row.coins += award.coins || 0;
    if ((row.best.get(award.track)?.level || 0) < award.level) row.best.set(award.track, { track: award.track, title: TRACK_BY_KEY.get(award.track)?.title || award.track, level: award.level, tier: tierOf(award.level) });
    byMonth.set(award.month, row);
  }
  return [...byMonth.values()].map((row) => ({ ...row, best: [...row.best.values()] }));
}
