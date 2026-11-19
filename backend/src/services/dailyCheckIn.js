// Daily login: the first time a student opens PeerPrep on an IST calendar day (a live session
// counts, not only a password login). It marks the day on the activity heatmap, pays the daily
// login coin once, and re-checks monthly badges ("Daily Visitor").
import mongoose from 'mongoose';
import StudentActivity from '../models/StudentActivity.js';
import { StudentDailyLogin } from '../models/MonthlyBadge.js';
import { creditEarningSafely, getEarningConfig } from '../platform/coinEarn.js';
import { evaluateMonthlyBadgesQuietly } from './monthlyBadges.js';
import { istDay } from './prepScore/topicQuota.js';

const DUPLICATE_KEY = 11000;

/** Consecutive login days ending today (or yesterday, if today is not yet recorded). */
export async function loginStreak(studentId, now = new Date()) {
  const rows = await StudentDailyLogin.find({ studentId, day: { $gte: istDay(new Date(now.getTime() - 400 * 86_400_000)) } })
    .select('day').sort({ day: -1 }).limit(400).lean();
  const days = new Set(rows.map((row) => row.day));
  let cursor = new Date(now);
  if (!days.has(istDay(cursor))) cursor = new Date(cursor.getTime() - 86_400_000);
  let streak = 0;
  while (days.has(istDay(cursor))) { streak += 1; cursor = new Date(cursor.getTime() - 86_400_000); }
  return streak;
}

/**
 * Records today's first open. Returns { day, firstToday, coins: { amount, balance } | null, streak }.
 * Safe to call on every app open: only the first call of the day writes or pays anything.
 */
export async function dailyCheckIn(user, now = new Date()) {
  if (!user || user.role !== 'student' || user.accessScope === 'assessment_only') return null;
  const studentId = new mongoose.Types.ObjectId(String(user._id));
  const day = istDay(now);
  let firstToday = false;
  try {
    await StudentDailyLogin.create({ studentId, day, at: now });
    firstToday = true;
  } catch (error) {
    if (error?.code !== DUPLICATE_KEY) throw error;
  }
  if (firstToday) {
    // The heatmap and streaks read LOGIN activity; one row per day keeps them honest.
    await StudentActivity.create({ studentId, studentModel: 'User', activityType: 'LOGIN', metadata: { source: 'daily-checkin', day }, date: now })
      .catch((error) => console.warn('[checkin] activity log failed:', error.message));
  }
  // Paying is idempotent per day, so a credit that failed earlier today is retried on the next open.
  const { earning } = await getEarningConfig();
  const paid = await creditEarningSafely({ user, kind: 'login', key: day, amount: earning.login, note: 'Daily login' });
  const coins = paid && !paid.duplicate ? { amount: paid.amount, balance: paid.balance } : null;
  if (firstToday) void evaluateMonthlyBadgesQuietly(user);
  return { day, firstToday, coins, streak: await loginStreak(studentId, now) };
}
