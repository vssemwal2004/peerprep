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
import { rewardAcceptedSolve } from '../src/services/solveRewards.js';
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
  const solver = fresh.find((track) => track.key === 'solver');
  assert.equal(solver.baseline, 8);
  assert.equal(solver.targets.length, 10);
  assert.ok(solver.targets.every((target, index) => !index || target > solver.targets[index - 1]), 'each level asks more');
  const regular = fresh.find((track) => track.key === 'regular');
  assert.ok(regular.targets.at(-1) <= 30, 'login days never exceed the days in November');
  // A strong student's targets are built from their own months and rise above the average.
  const strong = buildLadder([{ solver: 100, regular: 30, consistent: 30 }, { solver: 90, regular: 30, consistent: 29 }, { solver: 110, regular: 31, consistent: 30 }], '2026-11');
  const strongSolver = strong.find((track) => track.key === 'solver');
  assert.equal(strongSolver.baseline, 110, 'average 100 × 1.1');
  assert.equal(strongSolver.targets[3], 110, 'level 4 = baseline');
  assert.equal(strongSolver.targets[9], 440);
  const strongDays = strong.find((track) => track.key === 'consistent').targets;
  assert.equal(new Set(strongDays).size, 10);
  assert.ok(strongDays.at(-1) <= 30);
  assert.equal(levelFor([1, 2, 3], 2), 2);
  assert.equal(levelFor([1, 2, 3], 0), 0);
  assert.deepEqual([tierOf(1), tierOf(5), tierOf(10)], ['Bronze', 'Gold', 'Legend']);
});

test('earning amounts are validated and harder badge levels never pay less', () => {
  assert.deepEqual(normalizeEarning({}), { login: 1, solve: 2, badgeLevels: [...DEFAULT_EARNING.badgeLevels] });
  assert.throws(() => normalizeEarning({ badgeLevels: [5, 4, 6, 7, 8, 9, 10, 11, 12, 13] }), /cannot pay fewer/);
  assert.throws(() => normalizeEarning({ badgeLevels: [1, 2] }), /all 10/);
  assert.throws(() => normalizeEarning({ solve: -1 }), /whole number/);
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

test('solve coins: 2 for a counted first solve, nothing for re-solves or solves over the topic limit', async (t) => {
  if (skipped) return t.skip('replica set unavailable');
  const learner = await student();
  const counted = await rewardAcceptedSolve({ userId: learner._id, source: 'local', problemId: 'p1', title: 'Two Sum', outcome: { counted: true, alreadySolved: false } });
  assert.deepEqual(counted, { amount: 2, balance: 2 });
  assert.equal(await rewardAcceptedSolve({ userId: learner._id, source: 'local', problemId: 'p2', outcome: { counted: false, alreadySolved: false } }), null, 'over the daily topic limit');
  assert.equal(await rewardAcceptedSolve({ userId: learner._id, source: 'local', problemId: 'p1', outcome: { counted: true, alreadySolved: true } }), null, 're-solve');
  await saveEarningConfig({ earning: { solve: 5 }, expectedVersion: 0, reason: 'test', actorId: id() });
  assert.equal((await rewardAcceptedSolve({ userId: learner._id, source: 'local', problemId: 'p3', outcome: { counted: true, alreadySolved: false } })).amount, 5, 'Master Admin amount');
});

test('monthly badges: reached levels are awarded once with their coins and a bell notice', async (t) => {
  if (skipped) return t.skip('replica set unavailable');
  const learner = await student();
  // 10 Easy problems first solved this month: the new-student ladder for "Problem Solver" is 2, 4, 6, 8, 10 …
  const problems = Array.from({ length: 10 }, () => id());
  await Problem.collection.insertMany(problems.map((problemId, index) => ({ _id: problemId, title: `P${index}`, difficulty: 'Easy', status: 'published', visibility: 'public', tags: [`T${index % 4}`] })));
  await Submission.collection.insertMany(problems.map((problemId) => ({ user: learner._id, problem: problemId, mode: 'submit', status: 'AC', language: 'python', createdAt: new Date('2026-11-10T06:00:00Z') })));
  const view = await evaluateMonthlyBadges(learner, NOW);
  assert.equal(view.month, monthOf(NOW));
  const solver = view.tracks.find((track) => track.key === 'solver');
  assert.deepEqual(solver.targets.slice(0, 5), [2, 4, 6, 8, 10]);
  assert.equal(solver.value, 10);
  assert.equal(solver.level, 5);
  assert.equal(solver.next.level, 6);
  const explorer = view.tracks.find((track) => track.key === 'explorer');
  assert.equal(explorer.value, 4, 'four distinct topics');
  const levels = await BadgeLevelAward.find({ studentId: learner._id }).lean();
  const paid = levels.reduce((sum, award) => sum + award.coins, 0);
  assert.equal(await balanceOf(learner._id), paid, 'every awarded level paid its coins');
  assert.ok(paid >= 1 + 2 + 3 + 4 + 6, 'levels 1-5 of Problem Solver at least');
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
