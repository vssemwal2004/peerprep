// Lifetime milestone badges: permanent, all-time thresholds (100 problems solved, 50 active days,
// a 30-day Prep Streak ...). Harder than the old starter badges by design (2026-11-21).
//
// - Awarded once per student and badge (LifetimeBadgeAward is unique), dated when the threshold was
//   actually crossed, so the Prep Score history shows it on the right day.
// - Each badge adds Prep Score points by tier (the points ledger reads the awards) and Prep Coins
//   by tier. Milestones crossed before this feature existed (backfill) pay points but no coins and
//   send no notification, so launch day does not flood the platform with coins.
import mongoose from 'mongoose';
import { LifetimeBadgeAward } from '../models/LifetimeBadge.js';
import { creditEarningSafely, getEarningConfig } from '../platform/coinEarn.js';
import { getIo } from '../utils/io.js';
import { personalRoom } from '../utils/realtime.js';
import { notifyOnce } from './notificationService.js';
import { loadPointFacts } from './prepScore/pointFacts.js';
import { istDay } from './prepScore/points.js';
import { prepStreakFor } from './prepStreak.js';

// [track, title, unit, [[threshold, tier], ...]]
export const LIFETIME_TRACKS = Object.freeze([
  { key: 'solved', title: 'Problems solved', unit: 'problems', steps: [[50, 1], [100, 2], [200, 2], [300, 3], [500, 4], [750, 4], [1000, 5]] },
  { key: 'hard', title: 'Hard problems', unit: 'Hard problems', steps: [[25, 2], [50, 3], [100, 4]] },
  { key: 'active', title: 'Active days', unit: 'active days', steps: [[50, 1], [100, 2], [200, 3], [365, 4], [500, 5]] },
  { key: 'streak', title: 'Prep Streak', unit: 'day streak', steps: [[7, 1], [30, 2], [60, 3], [100, 4], [365, 5]] },
  { key: 'challenge', title: 'Daily challenges', unit: 'challenges', steps: [[25, 1], [50, 2], [100, 3], [250, 4], [365, 5]] },
  { key: 'sheets', title: 'Sheets completed', unit: 'sheets', steps: [[5, 1], [10, 2], [25, 3]] },
]);
export const TIER_NAMES = Object.freeze(['Bronze', 'Silver', 'Gold', 'Platinum', 'Legend']);
// Coins per tier unless the Master Admin set others (Prep Coin earning settings).
export const DEFAULT_MILESTONE_COINS = Object.freeze([2, 3, 5, 8, 12]);
// Crossed this long before the award is made: a backfilled milestone (points, no coins, no notice).
const BACKFILL_MS = 36 * 3_600_000;

const badgeId = (track, threshold) => `${track}-${threshold}`;

/**
 * When each threshold was crossed: Map(badgeId -> { track, threshold, tier, at, value }).
 * `series` per track: sorted moments (Date) at which the count went up by one; streak gives its best.
 */
export function crossedMilestones({ solveTimes = [], hardTimes = [], activeDays = [], challengeDays = [], sheetTimes = [], bestStreak = 0, now = new Date() }) {
  const asDates = (list) => list.map((value) => new Date(value)).filter((date) => Number.isFinite(date.getTime())).sort((a, b) => a - b);
  const dayDate = (day) => new Date(`${day}T12:00:00+05:30`);
  const series = {
    solved: asDates(solveTimes),
    hard: asDates(hardTimes),
    active: [...new Set(activeDays)].sort().map(dayDate),
    challenge: [...new Set(challengeDays)].sort().map(dayDate),
    sheets: asDates(sheetTimes),
  };
  // The day a Prep Streak first reached each length, from the completed challenge days.
  const streakReached = new Map();
  let run = 0;
  let previous = null;
  for (const day of [...new Set(challengeDays)].sort()) {
    run = previous && Date.parse(`${day}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`) === 86_400_000 ? run + 1 : 1;
    if (!streakReached.has(run)) streakReached.set(run, dayDate(day));
    previous = day;
  }
  const result = new Map();
  for (const track of LIFETIME_TRACKS) {
    for (const [threshold, tier] of track.steps) {
      if (track.key === 'streak') {
        const at = streakReached.get(threshold) || (bestStreak >= threshold ? now : null);
        if (at) result.set(badgeId(track.key, threshold), { track: track.key, threshold, tier, at, value: Math.max(bestStreak, ...streakReached.keys(), 0) });
        continue;
      }
      const list = series[track.key] || [];
      if (list.length >= threshold) result.set(badgeId(track.key, threshold), { track: track.key, threshold, tier, at: list[threshold - 1], value: list.length });
    }
  }
  return result;
}

async function studentCounts(student, { coding = true, sharedCatalog = [] } = {}) {
  const facts = (await loadPointFacts([student._id], { coding, sharedCatalog })).get(String(student._id));
  const streak = await prepStreakFor(student._id);
  return {
    solveTimes: facts.solves.map((solve) => solve.at),
    hardTimes: facts.solves.filter((solve) => String(solve.difficulty).toLowerCase() === 'hard').map((solve) => solve.at),
    activeDays: facts.activeDays,
    challengeDays: facts.challenges,
    sheetTimes: facts.sheets.map((sheet) => sheet.at),
    bestStreak: streak.best,
  };
}

/** Awards newly crossed milestones. Returns the badges awarded by this call. */
export async function evaluateLifetimeBadges(student, now = new Date()) {
  if (!student?._id || (student.role && student.role !== 'student') || student.accessScope === 'assessment_only') return [];
  const { dashboardPermissions, getSharedCodingCatalog } = await import('./studentDashboardService.js');
  const permissions = await dashboardPermissions(student);
  const sharedCatalog = permissions.questions ? await getSharedCodingCatalog() : [];
  const crossed = crossedMilestones({ ...(await studentCounts(student, { coding: permissions.questions === true, sharedCatalog })), now });
  if (!crossed.size) return [];
  const studentId = new mongoose.Types.ObjectId(String(student._id));
  const existing = new Set((await LifetimeBadgeAward.find({ studentId }).select('badgeId').lean()).map((row) => row.badgeId));
  const fresh = [...crossed.entries()].filter(([id]) => !existing.has(id));
  if (!fresh.length) return [];
  const earning = (await getEarningConfig()).earning;
  const tierCoins = Array.isArray(earning.milestoneTiers) ? earning.milestoneTiers : DEFAULT_MILESTONE_COINS;
  const awarded = [];
  for (const [id, item] of fresh) {
    const backfill = now - item.at > BACKFILL_MS;
    const coins = backfill ? 0 : Number(tierCoins[item.tier - 1]) || 0;
    try {
      await LifetimeBadgeAward.create({ studentId, badgeId: id, track: item.track, threshold: item.threshold, tier: item.tier, value: item.value, coins, earnedAt: item.at });
    } catch (error) {
      if (error?.code === 11000) continue;
      throw error;
    }
    // By id: the coin service loads the student's own feature access.
    if (coins) await creditEarningSafely({ user: studentId, kind: 'milestone', key: id, amount: coins, note: `Lifetime badge: ${id}` });
    awarded.push({ id, ...item, coins, backfill });
  }
  // One notice per track, for its highest new badge reached now (not for backfilled history).
  const live = awarded.filter((item) => !item.backfill);
  const top = new Map();
  for (const item of live) if (!top.has(item.track) || top.get(item.track).threshold < item.threshold) top.set(item.track, item);
  for (const item of top.values()) {
    const track = LIFETIME_TRACKS.find((entry) => entry.key === item.track);
    getIo()?.to(personalRoom(String(student._id))).emit('milestone:earned', { id: item.id, track: item.track, threshold: item.threshold, tier: item.tier, title: track?.title, coins: item.coins });
    await notifyOnce({
      userId: studentId, type: 'ACHIEVEMENT', actionUrl: '/student/profile#badges', dedupeKey: `lifetime-badge:${item.id}`, now,
      title: `${TIER_NAMES[item.tier - 1]} badge: ${item.threshold} ${track?.unit || ''}`.trim(),
      message: `A lifetime badge for ${track?.title?.toLowerCase() || 'your work'}.${item.coins ? ` +${item.coins} Prep Coins.` : ''}`,
    }).catch(() => {});
  }
  return awarded;
}

const inFlight = new Map();
/** Fire-and-forget evaluation (one at a time per student). */
export function evaluateLifetimeBadgesQuietly(student) {
  const key = String(student?._id || '');
  if (!key || inFlight.has(key)) return inFlight.get(key) || Promise.resolve([]);
  const run = evaluateLifetimeBadges(student).catch((error) => { console.warn('[lifetime-badges]', error.message); return []; }).finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

/** Every track with the student's progress and earned badges (profile + dashboard). */
export async function lifetimeBadgeBoard(student) {
  const { dashboardPermissions, getSharedCodingCatalog } = await import('./studentDashboardService.js');
  const permissions = await dashboardPermissions(student);
  const sharedCatalog = permissions.questions ? await getSharedCodingCatalog() : [];
  const counts = await studentCounts(student, { coding: permissions.questions === true, sharedCatalog });
  const values = {
    solved: counts.solveTimes.length, hard: counts.hardTimes.length, active: new Set(counts.activeDays).size,
    streak: counts.bestStreak, challenge: new Set(counts.challengeDays).size, sheets: counts.sheetTimes.length,
  };
  const awards = await LifetimeBadgeAward.find({ studentId: new mongoose.Types.ObjectId(String(student._id)) }).select('badgeId earnedAt coins').lean();
  const earned = new Map(awards.map((row) => [row.badgeId, row]));
  return LIFETIME_TRACKS.map((track) => {
    const steps = track.steps.map(([threshold, tier]) => {
      const award = earned.get(badgeId(track.key, threshold));
      return { id: badgeId(track.key, threshold), threshold, tier, tierName: TIER_NAMES[tier - 1], earned: Boolean(award), earnedAt: award?.earnedAt || null, earnedDay: award ? istDay(award.earnedAt) : null };
    });
    const next = steps.find((step) => !step.earned) || null;
    return { key: track.key, title: track.title, unit: track.unit, value: values[track.key] || 0, steps, next, earnedCount: steps.filter((step) => step.earned).length };
  });
}
