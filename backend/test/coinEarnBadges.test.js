import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Problem from '../src/models/Problem.js';
import Submission from '../src/models/Submission.js';
import Notification from '../src/models/Notification.js';
import StudentActivity from '../src/models/StudentActivity.js';
import { BadgeLadder, BadgeLevelAward, StudentDailyLogin } from '../src/models/MonthlyBadge.js';
import { PrepScoreSolve, PrepScoreTopicDay } from '../src/models/PrepScoreTopicQuota.js';
import { PlatformAudit, PlatformCoinMovement, PlatformCoinPricing, PlatformCoinWallet } from '../src/platform/models.js';
import { PLATFORM_WALLET_SCOPE } from '../src/platform/coins.js';
import { clearEarningCache, creditEarning, DEFAULT_EARNING, normalizeEarning, saveEarningConfig } from '../src/platform/coinEarn.js';
import { dailyCheckIn } from '../src/services/dailyCheckIn.js';
import { buildLadder, evaluateMonthlyBadges, levelFor, monthOf, tierOf } from '../src/services/monthlyBadges.js';
import { clearPrepScorePolicyCache } from '../src/services/prepScore/policy.js';

let mongo;
let skipped = false;
const id = () => new mongoose.Types.ObjectId();
const NOW = new Date('2026-11-15T06:00:00Z');
const originalRole = process.env.PEERPREP_DEPLOYMENT_ROLE;

before(async () => {
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
  try { mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: '127.0.0.1' } }); }
  catch (error) { if (error?.code === 'EPERM') { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri());
  await Promise.all([PlatformCoinWallet, PlatformCoinMovement, PlatformCoinPricing, BadgeLadder, BadgeLevelAward, StudentDailyLogin, PrepScoreSolve, PrepScoreTopicDay].map((model) => model.createIndexes()));
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  if (originalRole === undefined) delete process.env.PEERPREP_DEPLOYMENT_ROLE;
  else process.env.PEERPREP_DEPLOYMENT_ROLE = originalRole;
});
beforeEach(async () => {
  if (skipped) return;
  await Promise.all([User, Problem, Submission, Notification, StudentActivity, BadgeLadder, BadgeLevelAward, StudentDailyLogin, PrepScoreSolve, PrepScoreTopicDay,
    PlatformCoinWallet, PlatformCoinMovement, PlatformCoinPricing, PlatformAudit].map((model) => model.deleteMany({})));
  clearEarningCache();
  clearPrepScorePolicyCache();
});

async function student(extra = {}) {
  const studentId = id();
  await User.collection.insertOne({ _id: studentId, role: 'student', name: 'S', email: `${studentId}@x.invalid`, isActive: true, accessScope: 'full', ...extra });
  return User.findById(studentId).lean();
}
const balanceOf = async (userId) => (await PlatformCoinWallet.findOne({ universityId: PLATFORM_WALLET_SCOPE, userId }).lean())?.balance || 0;

test('ladders: floors for new students, strictly rising levels, day badges within the month, growth from history', () => {
  const fresh = buildLadder([], '2026-11');
  // Five badges, all practice (2026-11-21: harder, plus the monthly daily-challenge badge).
  assert.deepEqual(fresh.map((track) => track.key), ['solver', 'medium', 'hard', 'consistent', 'challenger']);
  const solver = fresh.find((track) => track.key === 'solver');
  assert.equal(solver.baseline, 20);
  assert.deepEqual(solver.targets, [20, 26, 32, 40, 48, 58, 70, 84, 100, 120]);
  assert.ok(solver.targets.every((target, index) => !index || target > solver.targets[index - 1]), 'each level asks more');
  const days = fresh.find((track) => track.key === 'consistent');
  assert.deepEqual(days.targets, [15, 20, 23, 24, 25, 26, 27, 28, 29, 30], 'practice days never exceed the days in November');
  assert.deepEqual(fresh.find((track) => track.key === 'hard').targets.slice(0, 3), [4, 6, 7]);
  assert.equal(fresh.find((track) => track.key === 'challenger').targets[0], 12);
  // A strong student's targets are built from their own months and rise above the average.
  const strong = buildLadder([{ solver: 100, consistent: 30 }, { solver: 90, consistent: 29 }, { solver: 110, consistent: 30 }], '2026-11');
  const strongSolver = strong.find((track) => track.key === 'solver');
  assert.equal(strongSolver.baseline, 125, 'average 100 × 1.25');
  assert.equal(strongSolver.targets[0], 125, 'level 1 = clearly beating your own recent month');
  assert.equal(strongSolver.targets[9], 750);
  const strongDays = strong.find((track) => track.key === 'consistent').targets;
  assert.equal(new Set(strongDays).size, 10);
  assert.ok(strongDays.at(-1) <= 30);
  assert.equal(levelFor([1, 2, 3], 2), 2);
  assert.equal(levelFor([1, 2, 3], 0), 0);
  assert.deepEqual([tierOf(1), tierOf(5), tierOf(10)], ['Bronze', 'Gold', 'Legend']);
});

test('earning amounts are validated and harder badge levels never pay less', () => {
  // Solving no longer pays coins (2026-11-21); the daily challenge and a finished sheet pay 5.
  assert.deepEqual(normalizeEarning({}), { login: 1, challenge: 5, sheet: 5, badgeLevels: [0, 0, 1, 1, 2, 3, 4, 5, 7, 10], milestoneTiers: [2, 3, 5, 8, 12], levelCoins: [0, 0, 0, 0, 0, 0, 0, 10, 12, 15, 20, 25] });
  // Elite learner levels: twelve amounts, never fewer coins for a higher level.
  assert.throws(() => normalizeEarning({ levelCoins: [0, 0, 0, 0, 0, 0, 0, 10, 12, 15, 20] }), /12 learner levels/);
  assert.throws(() => normalizeEarning({ levelCoins: [0, 0, 0, 0, 0, 0, 0, 20, 12, 15, 20, 25] }), /fewer/);
  assert.equal('solve' in normalizeEarning({ solve: 9 }), false, 'a stored solve amount is ignored');
  assert.throws(() => normalizeEarning({ milestoneTiers: [5, 4, 3, 2, 1] }), /fewer/);
  assert.deepEqual(normalizeEarning({}).badgeLevels, [...DEFAULT_EARNING.badgeLevels]);
  assert.throws(() => normalizeEarning({ badgeLevels: [5, 4, 6, 7, 8, 9, 10, 11, 12, 13] }), /cannot pay fewer/);
  assert.throws(() => normalizeEarning({ badgeLevels: [1, 2] }), /all 10/);
  assert.throws(() => normalizeEarning({ challenge: -1 }), /whole number/);
});

test('earned coins are minted once per key, only for students with Prep Coin on', async (t) => {
  if (skipped) return t.skip('replica set unavailable');
  const learner = await student();
  const first = await creditEarning({ user: learner, kind: 'solve', key: 'local:p1', amount: 2, note: 'Solved P1' });
  assert.deepEqual([first.amount, first.balance], [2, 2]);
  assert.deepEqual(await creditEarning({ user: learner, kind: 'solve', key: 'local:p1', amount: 2 }), { duplicate: true });
  await Promise.all([1, 2, 3].map(() => creditEarning({ user: learner, kind: 'solve', key: 'local:p2', amount: 2 })));
  assert.equal(await balanceOf(learner._id), 4, 'parallel requests pay once');
  const movement = await PlatformCoinMovement.findOne({ requestId: `earn:solve:${PLATFORM_WALLET_SCOPE}:${learner._id}:local:p1` }).lean();
  assert.equal(movement.kind, 'earn_solve');
  assert.equal(movement.note, 'Solved P1');
  const noCoins = await student({ featureAccess: { mode: 'custom', features: ['prep_coding'] } });
  assert.equal(await creditEarning({ user: noCoins, kind: 'login', key: 'd', amount: 1 }), null);
  assert.equal(await creditEarning({ user: { _id: id(), role: 'coordinator' }, kind: 'login', key: 'd', amount: 1 }), null);
});

test('without transaction support (standalone MongoDB) earnings still pay exactly once', async (t) => {
  if (skipped) return t.skip('replica set unavailable');
  const { setEarnTransactionsUnsupported } = await import('../src/platform/coinEarn.js');
  setEarnTransactionsUnsupported(true);
  try {
    const learner = await student();
    await Promise.all([1, 2, 3].map(() => creditEarning({ user: learner, kind: 'login', key: '2026-11-15', amount: 1 })));
    assert.equal(await balanceOf(learner._id), 1);
    assert.equal(await PlatformCoinMovement.countDocuments({ toUserId: learner._id }), 1);
  } finally {
    setEarnTransactionsUnsupported(false);
  }
});

test('daily check-in: first open of the IST day pays 1 coin and marks the heatmap; later opens do not', async (t) => {
  if (skipped) return t.skip('replica set unavailable');
  const learner = await student();
  const first = await dailyCheckIn(learner, NOW);
  assert.equal(first.firstToday, true);
  assert.deepEqual(first.coins, { amount: 1, balance: 1 });
  const again = await dailyCheckIn(learner, new Date(NOW.getTime() + 3_600_000));
  assert.equal(again.firstToday, false);
  assert.equal(again.coins, null);
  assert.equal(await StudentActivity.countDocuments({ studentId: learner._id, activityType: 'LOGIN' }), 1, 'one heatmap login per day');
  const tomorrow = await dailyCheckIn(learner, new Date(NOW.getTime() + 86_400_000));
  assert.equal(tomorrow.coins.balance, 2);
  assert.equal(tomorrow.streak, 2);
  assert.equal(await balanceOf(learner._id), 2);
});

test('challenge and sheet coins use the Master Admin amounts and pay once per key', async (t) => {
  if (skipped) return t.skip('replica set unavailable');
  const learner = await student();
  await saveEarningConfig({ earning: { challenge: 7, sheet: 4 }, expectedVersion: 0, reason: 'test', actorId: id() });
  const { getEarningConfig } = await import('../src/platform/coinEarn.js');
  const { earning } = await getEarningConfig({ fresh: true });
  assert.deepEqual([earning.challenge, earning.sheet], [7, 4]);
  assert.equal((await creditEarning({ user: learner, kind: 'challenge', key: '2026-11-15', amount: earning.challenge })).amount, 7);
  assert.deepEqual(await creditEarning({ user: learner, kind: 'challenge', key: '2026-11-15', amount: earning.challenge }), { duplicate: true });
  assert.equal((await creditEarning({ user: learner, kind: 'sheet', key: 'quest-1', amount: earning.sheet })).amount, 4);
  assert.equal(await balanceOf(learner._id), 11);
  const kinds = (await PlatformCoinMovement.find({ toUserId: learner._id }).lean()).map((row) => row.kind).sort();
  assert.deepEqual(kinds, ['earn_challenge', 'earn_sheet']);
});

test('monthly badges: reached levels are awarded once with their coins and a bell notice', async (t) => {
  if (skipped) return t.skip('replica set unavailable');
  const learner = await student();
  // A ladder made under the old, easy rules this month is rebuilt once under the new rules.
  await BadgeLadder.create({ studentId: learner._id, month: monthOf(NOW), tracks: [{ key: 'solver', baseline: 8, targets: [2, 4, 6, 8, 10, 12, 16, 20, 24, 32] }] });
  // 50 Easy problems first solved this month: the new-student "Problem Solver" ladder is 20, 26, 32, 40, 48 …
  const problems = Array.from({ length: 50 }, () => id());
  await Problem.collection.insertMany(problems.map((problemId, index) => ({ _id: problemId, title: `P${index}`, difficulty: 'Easy', status: 'published', visibility: 'public', tags: [`T${index % 4}`] })));
  await Submission.collection.insertMany(problems.map((problemId) => ({ user: learner._id, problem: problemId, mode: 'submit', status: 'AC', language: 'python', createdAt: new Date('2026-11-10T06:00:00Z') })));
  const view = await evaluateMonthlyBadges(learner, NOW);
  assert.equal(view.month, monthOf(NOW));
  assert.deepEqual(view.tracks.map((track) => track.key), ['solver', 'medium', 'hard', 'consistent', 'challenger']);
  const solver = view.tracks.find((track) => track.key === 'solver');
  assert.deepEqual(solver.targets.slice(0, 5), [20, 26, 32, 40, 48]);
  assert.equal(solver.value, 50);
  assert.equal(solver.level, 5);
  assert.equal(solver.next.level, 6);
  assert.equal(view.tracks.find((track) => track.key === 'consistent').level, 0, 'one practice day is far from 15');
  const levels = await BadgeLevelAward.find({ studentId: learner._id }).lean();
  const paid = levels.reduce((sum, award) => sum + award.coins, 0);
  assert.equal(await balanceOf(learner._id), paid, 'every awarded level paid its coins');
  assert.equal(paid, 0 + 0 + 1 + 1 + 2, 'levels 1-2 are an honour only; 50 solves earn 4 badge coins');
  assert.ok(await Notification.exists({ userId: learner._id, type: 'BADGE' }));
  // Evaluating again awards and pays nothing new.
  await evaluateMonthlyBadges(learner, NOW);
  assert.equal(await BadgeLevelAward.countDocuments({ studentId: learner._id }), levels.length);
  assert.equal(await balanceOf(learner._id), paid);
  // The ladder is frozen for the month.
  assert.equal(await BadgeLadder.countDocuments({ studentId: learner._id }), 1);
});

test('solves over the daily topic limit do not count toward badges either', async (t) => {
  if (skipped) return t.skip('replica set unavailable');
  const learner = await student();
  const problems = Array.from({ length: 3 }, () => id());
  await Problem.collection.insertMany(problems.map((problemId) => ({ _id: problemId, title: 'P', difficulty: 'Hard', status: 'published', visibility: 'public', tags: ['Graph'] })));
  await Submission.collection.insertMany(problems.map((problemId) => ({ user: learner._id, problem: problemId, mode: 'submit', status: 'AC', language: 'python', createdAt: new Date('2026-11-10T06:00:00Z') })));
  await PrepScoreSolve.create({ studentId: learner._id, problemKey: `local:${problems[2]}`, topic: 'Graph', day: '2026-11-10', counted: false, solvedAt: new Date('2026-11-10T06:00:00Z') });
  const view = await evaluateMonthlyBadges(learner, NOW);
  assert.equal(view.tracks.find((track) => track.key === 'hard').value, 2);
});
