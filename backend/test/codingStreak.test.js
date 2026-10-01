import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateNextStreak, getCodingDayDateKey, getNextCodingDayBoundary } from '../src/services/codingStreakService.js';

test('coding day rolls over at 2:00 AM Asia/Kolkata', () => {
  const config = { timezone: 'Asia/Kolkata', rolloverHour: 2 };
  assert.equal(getCodingDayDateKey(new Date('2026-10-01T20:29:59.000Z'), config), '2026-10-01');
  assert.equal(getCodingDayDateKey(new Date('2026-10-01T20:30:00.000Z'), config), '2026-10-02');
});

test('next reset is the next 2:00 AM IST boundary', () => {
  assert.equal(getNextCodingDayBoundary(new Date('2026-10-01T12:00:00.000Z')).toISOString(), '2026-10-01T20:30:00.000Z');
  assert.equal(getNextCodingDayBoundary(new Date('2026-10-01T19:00:00.000Z')).toISOString(), '2026-10-01T20:30:00.000Z');
});

test('streak advances once per coding day and preserves the best value', () => {
  assert.deepEqual(calculateNextStreak(null, '2026-10-01', '2026-09-30'), { currentStreak: 1, bestStreak: 1, alreadyCompleted: false });
  assert.deepEqual(calculateNextStreak({ currentStreak: 5, bestStreak: 8, lastCompletedDateKey: '2026-10-01' }, '2026-10-02', '2026-10-01'), { currentStreak: 6, bestStreak: 8, alreadyCompleted: false });
  assert.deepEqual(calculateNextStreak({ currentStreak: 6, bestStreak: 8, lastCompletedDateKey: '2026-10-02' }, '2026-10-02', '2026-10-01'), { currentStreak: 6, bestStreak: 8, alreadyCompleted: true });
  assert.deepEqual(calculateNextStreak({ currentStreak: 6, bestStreak: 8, lastCompletedDateKey: '2026-09-28' }, '2026-10-02', '2026-10-01'), { currentStreak: 1, bestStreak: 8, alreadyCompleted: false });
});
