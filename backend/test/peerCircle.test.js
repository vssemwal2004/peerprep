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
import { PrepScoreSolve } from '../src/models/PrepScoreTopicQuota.js';
import { STANDARD_STUDENT_FEATURES } from '../src/services/studentFeatureAccess.js';
import { compareWithMate, getCircle, getMateDirectory, getSuggestions, istWeekStart, nudgeMate, streaks } from '../src/services/peerCircleService.js';

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
  await Promise.all([User, Problem, Submission, Notification, PrepMate, PrepMateNudge, BadgeLevelAward, PrepScoreSolve].map((model) => model.deleteMany({})));
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
  // The first-solve ledger the activity feed reads (written on every accepted first solve).
  await PrepScoreSolve.collection.insertOne({ studentId: user._id, problemKey: `local:${problemId}`, topic: tags[0] || 'General', day: at.toISOString().slice(0, 10), counted: true, solvedAt: at });
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

test('a big circle: the podium, your own row, paged ranks with name search, and the directory', async () => {
  const asha = await student('Asha');
  const mates = await Promise.all(Array.from({ length: 23 }, (_, index) => student(`Mate ${String(index).padStart(2, '0')}`)));
  await Promise.all(mates.map((mate) => (async () => { await PrepMate.create({ pairKey: [String(asha._id), String(mate._id)].sort().join(':'), fromId: asha._id, toId: mate._id, status: 'accepted', requestedAt: NOW, respondedAt: NOW }); })()));
  // Mate 00 solves 3, Mate 01 solves 2, Asha 1, everyone else 0.
  await Promise.all([solve(mates[0]), solve(mates[0]), solve(mates[0]), solve(mates[1]), solve(mates[1]), solve(asha)]);
  const first = await getCircle(asha, { period: 'week', page: 1, limit: 10 }, NOW);
  assert.equal(first.total, 24);
  assert.deepEqual(first.podium.map((row) => [row.name, row.rank]), [['Mate 00', 1], ['Mate 01', 2], ['Asha', 3]]);
  assert.deepEqual([first.you.rank, first.you.solved], [3, 1]);
  assert.equal(first.rows.length, 10);
  assert.equal(first.pages, 3);
  assert.equal(first.practisedToday, 2, 'two Prep Mates practised today');
  const third = await getCircle(asha, { period: 'week', page: 3, limit: 10 }, NOW);
  assert.equal(third.rows.length, 4);
  assert.ok(third.rows.every((row) => row.rank === 4), 'ties share a rank');
  // Standing: Mate 01 (2) is the nearest above Asha (1); passing needs 2 more; 21 mates on 0 below.
  assert.deepEqual([first.ahead.name, first.ahead.toPass, first.behind.lead, first.youPage], ['Mate 01', 2, 1, 1]);
  assert.equal(first.topPercent, 13, 'rank 3 of 24 is the top 13%');
  assert.equal(first.median, 0);
  assert.deepEqual(first.distribution.bins.map((bin) => bin.count), [21, 1, 1, 1]);
  assert.equal(first.distribution.youBin, 1);
  const search = await getCircle(asha, { q: 'mate 01' }, NOW);
  assert.deepEqual(search.rows.map((row) => [row.name, row.rank]), [['Mate 01', 2]], 'search keeps the global rank');

  const directory = await getMateDirectory(asha, { sort: 'active' }, NOW);
  assert.equal(directory.total, 23);
  assert.equal(directory.items.length, 12);
  assert.equal(directory.pages, 2);
  assert.deepEqual(directory.items.slice(0, 2).map((row) => [row.name, row.thisWeek]), [['Mate 00', 3], ['Mate 01', 2]]);
  const byName = await getMateDirectory(asha, { sort: 'name', q: 'mate 2' }, NOW);
  assert.deepEqual(byName.items.map((row) => row.name), ['Mate 20', 'Mate 21', 'Mate 22']);
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
  assert.equal(result.badges.length, 4);
  assert.deepEqual([result.you.rank.allTime, result.mate.rank.allTime, result.you.rank.of], [2, 1, 2], 'rank in your circle');
  assert.equal(result.you.days30.length, 30);
  assert.equal(result.you.days30.at(-1).active, true, 'practised today');
  assert.ok('level' in result.mate && 'badgesEarned' in result.mate);
  assert.deepEqual(result.leaders.map((row) => [row.name, row.solved, row.isYou, row.isMate]), [['Ravi', 2, false, true], ['Asha', 1, true, false]]);
  assert.deepEqual(result.others, [], 'no other Prep Mates with solves');
  assert.ok(!JSON.stringify(result).includes('@secret.test'));
});

test('compare adds the circle leaders; suggestions skip anyone already linked', async () => {
  const [asha, ravi, top, pending, fresh, elsewhere] = await Promise.all([student('Asha'), student('Ravi'), student('Top'), student('Pending'), student('Fresh'), student('Far', 'Elsewhere')]);
  await Promise.all([mates(asha, ravi), mates(asha, top), mates(asha, pending, 'pending')]);
  await Promise.all([solve(top), solve(top), solve(ravi), solve(fresh)]);
  const result = await compareWithMate(asha, ravi._id, NOW);
  assert.deepEqual(result.leaders.map((row) => row.name), ['Top', 'Ravi', 'Asha']);
  assert.deepEqual(result.others.map((row) => [row.name, row.total, row.weekly.length]), [['Top', 2, 8]]);
  const { items } = await getSuggestions(asha, NOW);
  assert.deepEqual(items.map((row) => [row.name, row.thisWeek]), [['Fresh', 1]], 'not mates, not pending, same university only');
});
