// Prep Streak: consecutive days on which the student completed their daily challenge (the adaptive
// daily mission; its day starts at 2 AM IST, see adaptiveEngagementRules.periodsAt). Derived from
// the completed missions themselves, so a completion settled late still counts, and nothing has to
// be stored or repaired. One streak for the whole student experience (2026-11-21).
import mongoose from 'mongoose';
import { MissionAssignment } from '../models/AdaptiveEngagement.js';
import { periodsAt } from './adaptiveEngagementRules.js';

const DAY_MS = 86_400_000;
const objectId = (value) => new mongoose.Types.ObjectId(String(value));
const shift = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * From completed challenge days (YYYY-MM-DD) and today's challenge day: the current streak (alive
 * while today's or yesterday's challenge is done), the best run, and whether today is done.
 */
export function streakFromDays(days = [], today = periodsAt().daily.periodKey) {
  const done = new Set(days.filter(Boolean));
  const sorted = [...done].sort();
  let best = 0;
  let run = 0;
  let previous = null;
  for (const day of sorted) {
    run = previous && shift(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  const todayDone = done.has(today);
  let cursor = todayDone ? today : shift(today, -1);
  let current = 0;
  while (done.has(cursor)) {
    current += 1;
    cursor = shift(cursor, -1);
  }
  return { current, best, todayDone, total: done.size, today };
}

/** Map(studentId -> { current, best, todayDone, total, today, recent: [last 14 days with done flags] }). */
export async function prepStreaks(studentIds, now = new Date()) {
  const ids = [...new Set(studentIds.map(String))].filter((id) => mongoose.isValidObjectId(id));
  const today = periodsAt(now).daily.periodKey;
  const result = new Map(ids.map((id) => [id, { ...streakFromDays([], today), recent: [] }]));
  if (!ids.length) return result;
  const rows = await MissionAssignment.find({ studentId: { $in: ids.map(objectId) }, kind: 'daily', earnedAt: { $ne: null } })
    .select('studentId periodKey').maxTimeMS(8_000).lean();
  const byStudent = new Map();
  for (const row of rows) {
    const key = String(row.studentId);
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push(row.periodKey);
  }
  for (const id of ids) {
    const days = byStudent.get(id) || [];
    const done = new Set(days);
    const recent = Array.from({ length: 14 }, (_, index) => {
      const day = shift(today, index - 13);
      return { day, done: done.has(day) };
    });
    result.set(id, { ...streakFromDays(days, today), recent });
  }
  return result;
}

export async function prepStreakFor(studentId, now = new Date()) {
  return (await prepStreaks([studentId], now)).get(String(studentId)) || { ...streakFromDays([], periodsAt(now).daily.periodKey), recent: [] };
}
