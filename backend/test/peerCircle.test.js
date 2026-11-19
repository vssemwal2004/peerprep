import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Problem from '../src/models/Problem.js';
import Submission from '../src/models/Submission.js';
import Notification from '../src/models/Notification.js';
import { PrepMate, PrepMateNudge } from '../src/models/PeerNetwork.js';
import { BadgeLevelAward } from '../src/models/MonthlyBadge.js';
import { STANDARD_STUDENT_FEATURES } from '../src/services/studentFeatureAccess.js';
import { compareWithMate, getCircle, getFeed, istWeekStart, nudgeMate, streaks } from '../src/services/peerCircleService.js';

let mongo;
const id = () => new mongoose.Types.ObjectId();
const NOW = new Date('2026-11-19T08:00:00Z'); // Thursday 13:30 IST
const originalRole = process.env.PEERPREP_DEPLOYMENT_ROLE;
const hoursAgo = (hours) => new Date(NOW.getTime() - hours * 3_600_000);

before(async () => {
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongo.getUri(), { dbName: 'peer_circle_test' });
  await Promise.all([PrepMate.createIndexes(), PrepMateNudge.createIndexes()]);
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  if (originalRole === undefined) delete process.env.PEERPREP_DEPLOYMENT_ROLE;
  else process.env.PEERPREP_DEPLOYMENT_ROLE = originalRole;
});
beforeEach(async () => {
  await Promise.all([User, Problem, Submission, Notification, PrepMate, PrepMateNudge, BadgeLevelAward].map((model) => model.deleteMany({})));
});

async function student(name, college = 'GEU') {
  const doc = { _id: id(), role: 'student', name, email: `${name}@secret.test`, college, isActive: true, accessScope: 'full',
    featureAccess: { mode: 'custom', features: [...STANDARD_STUDENT_FEATURES, 'peers'] } };
  await User.collection.insertOne(doc);
  return User.findById(doc._id).lean();
}
async function mates(a, b, status = 'accepted') {
  await PrepMate.create({ pairKey: [String(a._id), String(b._id)].sort().join(':'), fromId: a._id, toId: b._id, status, requestedAt: NOW, respondedAt: NOW });
}
async function solve(user, { difficulty = 'Easy', tags = ['Array'], at = hoursAgo(1) } = {}) {
  const problemId = id();
  await Problem.collection.insertOne({ _id: problemId, title: `P-${problemId}`, difficulty, tags, status: 'published', visibility: 'public' });
  await Submission.collection.insertOne({ user: user._id, problem: problemId, mode: 'submit', status: 'AC', language: 'python', createdAt: at });
}

test('streaks and IST weeks', () => {
  const days = new Set(['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-19', '2026-11-10']);
  assert.deepEqual(streaks(days, '2026-11-19'), { current: 1, best: 3 });
  assert.deepEqual(streaks(new Set(['2026-11-17', '2026-11-18']), '2026-11-19'), { current: 2, best: 2 }, 'today not yet practised keeps yesterday\'s run');
  assert.equal(istWeekStart(NOW), '2026-11-16');
  assert.equal(istWeekStart(new Date('2026-11-15T19:00:00Z')), '2026-11-16', 'Monday 00:30 IST is already the new week');
});

test('the circle ranks you with accepted Prep Mates only, practice-only and private', async () => {
  const [asha, ravi, pending, other] = await Promise.all([student('Asha'), student('Ravi'), student('Pending'), student('Other', 'Elsewhere')]);
  await mates(asha, ravi);
  await mates(asha, pending, 'pending');
  await mates(asha, other);
  await Promise.all([solve(ravi), solve(ravi, { difficulty: 'Hard', tags: ['Graph'] }), solve(ravi), solve(asha), solve(ravi, { at: new Date('2026-10-01T08:00:00Z') })]);
  const circle = await getCircle(asha, 'week', NOW);
  assert.deepEqual(circle.rows.map((row) => row.name), ['Ravi', 'Asha'], 'pending requests and other colleges never appear');
  assert.deepEqual(circle.rows.map((row) => [row.rank, row.solved, row.totalSolved]), [[1, 3, 4], [2, 1, 1]]);
  assert.equal(circle.rows[1].isYou, true);
  assert.equal(circle.rows[0].practisedToday, true);
  assert.equal(circle.rows[0].canNudge, false, 'someone who practised today needs no nudge');
  assert.equal((await getCircle(asha, 'all', NOW)).rows[0].solved, 4);
  const raw = JSON.stringify(circle);
  for (const secret of ['@secret.test', 'GEU', 'featureAccess', 'college']) assert.ok(!raw.includes(secret), `circle must not expose ${secret}`);
});

test('nudges: Prep Mates only, not after practising, once per day, and the mate is notified', async () => {
  const [asha, ravi, idle, stranger] = await Promise.all([student('Asha'), student('Ravi'), student('Idle'), student('Stranger')]);
  await Promise.all([mates(asha, ravi), mates(idle, asha)]);
  await solve(ravi);
  await assert.rejects(() => nudgeMate(asha, ravi._id, NOW), /already practised today/);
  await assert.rejects(() => nudgeMate(asha, stranger._id, NOW), /Only your Prep Mates/);
  assert.deepEqual(await nudgeMate(asha, idle._id, NOW), { nudged: true });
  await assert.rejects(() => nudgeMate(asha, idle._id, NOW), /already sent Idle a Prep Ping/);
  const notice = await Notification.findOne({ userId: idle._id }).lean();
  assert.equal(notice.type, 'PREP_MATE_NUDGE');
  assert.match(notice.title, /Asha sent you a Prep Ping/);
  const circle = await getCircle(asha, 'week', NOW);
  assert.equal(circle.rows.find((row) => row.name === 'Idle').nudged, true);
  // A new day allows a new nudge.
  assert.deepEqual(await nudgeMate(asha, idle._id, new Date(NOW.getTime() + 86_400_000)), { nudged: true });
});

test('the feed shows Prep Mates\' recent solves and badge levels, grouped per day', async () => {
  const [asha, ravi, stranger] = await Promise.all([student('Asha'), student('Ravi'), student('Stranger')]);
  await mates(asha, ravi);
  await Promise.all([solve(ravi), solve(ravi), solve(ravi, { at: hoursAgo(30) }), solve(stranger), solve(asha), solve(ravi, { at: new Date('2026-09-01T08:00:00Z') })]);
  await BadgeLevelAward.create([
    { studentId: ravi._id, month: '2026-11', track: 'solver', level: 1, earnedAt: hoursAgo(2) },
    { studentId: ravi._id, month: '2026-11', track: 'solver', level: 2, earnedAt: hoursAgo(2) },
  ]);
  const { items } = await getFeed(asha, NOW);
  assert.ok(items.every((item) => item.mate.name === 'Ravi'), 'only Prep Mates, never yourself or strangers');
  const solved = items.filter((item) => item.type === 'solved');
  assert.deepEqual(solved.map((item) => item.count).sort(), [1, 2], 'one card per day');
  const badges = items.filter((item) => item.type === 'badge');
  assert.equal(badges.length, 1, 'only the highest new level is shown');
  assert.equal(badges[0].badge.level, 2);
});

test('compare: head-to-head numbers for you and one Prep Mate', async () => {
  const [asha, ravi, stranger] = await Promise.all([student('Asha'), student('Ravi'), student('Stranger')]);
  await mates(asha, ravi);
  await Promise.all([solve(asha, { difficulty: 'Medium', tags: ['DP'] }), solve(ravi, { difficulty: 'Hard', tags: ['Graph', 'DP'] }), solve(ravi, { tags: ['Graph'] })]);
  await assert.rejects(() => compareWithMate(asha, stranger._id, NOW), /Only your Prep Mates/);
  const result = await compareWithMate(asha, ravi._id, NOW);
  assert.deepEqual(result.you.totals, { easy: 0, medium: 1, hard: 0, total: 1 });
  assert.deepEqual(result.mate.totals, { easy: 1, medium: 0, hard: 1, total: 2 });
  assert.equal(result.you.weekly.length, 8);
  assert.equal(result.mate.weekly.at(-1).solved, 2);
  assert.deepEqual(result.topics.map((topic) => [topic.tag, topic.you, topic.mate]), [['DP', 1, 1], ['Graph', 0, 2]]);
  assert.equal(result.badges.length, 6);
  assert.deepEqual([result.you.rank.allTime, result.mate.rank.allTime, result.you.rank.of], [2, 1, 2], 'rank in your circle');
  assert.equal(result.you.days30.length, 30);
  assert.equal(result.you.days30.at(-1).active, true, 'practised today');
  assert.ok('level' in result.mate && 'badgesEarned' in result.mate);
  assert.ok(!JSON.stringify(result).includes('@secret.test'));
});
