import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Problem from '../src/models/Problem.js';
import Submission from '../src/models/Submission.js';
import Progress from '../src/models/Progress.js';
import Semester from '../src/models/Subject.js';
import StudentChallenge from '../src/models/StudentChallenge.js';
import DailyChallengeDay from '../src/models/DailyChallengeDay.js';
import DailyChallengeConfig from '../src/models/DailyChallengeConfig.js';
import CodingStreak from '../src/models/CodingStreak.js';
import QuestionPracticeAttempt from '../src/models/QuestionPracticeAttempt.js';
import StudentActivity from '../src/models/StudentActivity.js';
import Notification from '../src/models/Notification.js';
import { engagementPeriods, challengeGoals, goalProgress, refreshStudentEngagement, listStudentChallengeBadges } from '../src/services/studentEngagementService.js';
import { refreshStudentChallenges } from '../src/controllers/studentDashboardController.js';
import { getStudentUniversityRanking, scoreStudentProgress } from '../src/services/studentDashboardService.js';
import { resolveDailyChallenge, recordDailyChallengeCompletion, getCodingStreakStatus } from '../src/services/codingStreakService.js';
import { requireEngagementUniqueIndex } from '../src/utils/engagementIndexes.js';
import { getLearnerLevel } from '../../frontend/src/student/profileBadge.js';

// All writes are to a new, isolated local database; no .env or application bootstrap is loaded.
const now = new Date('2026-10-15T12:00:00Z');
const id = () => new mongoose.Types.ObjectId();
const originalRole = process.env.PEERPREP_DEPLOYMENT_ROLE;
const originalNodeEnv = process.env.NODE_ENV;
const originalFetch = globalThis.fetch;
const originalControlUrl = process.env.PEERPREP_CONTROL_URL;
let mongo, student, problems, topics, semesterId, subjectId, chapterId;
const models = [User, Problem, Submission, Progress, Semester, StudentChallenge, DailyChallengeDay, DailyChallengeConfig, CodingStreak, QuestionPracticeAttempt, StudentActivity, Notification];

before(async () => {
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
  process.env.NODE_ENV = 'test';
  globalThis.fetch = async () => { throw new Error('Unexpected external request in engagement test'); };
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'student_engagement_isolated_test' });
  await Promise.all(models.map((model) => model.init()));
});
beforeEach(async () => {
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
  process.env.NODE_ENV = 'test';
  globalThis.fetch = async () => { throw new Error('Unexpected external request in engagement test'); };
  await Promise.all(models.map((model) => model.deleteMany({})));
  student = { _id: id(), role: 'student', accessScope: 'full', college: 'Engagement Test University', semester: 1 };
  await User.collection.insertOne(student);
  problems = Array.from({ length: 12 }, (_, index) => ({ _id: id(), title: `Practice ${index + 1}`, status: 'published', visibility: 'public', difficulty: ['Easy', 'Medium', 'Hard'][index % 3] }));
  await Problem.collection.insertMany(problems);
  topics = Array.from({ length: 6 }, (_, index) => ({ _id: id(), topicName: `Lesson ${index + 1}`, topicVideoLink: 'https://example.invalid/lesson' }));
  semesterId = id(); subjectId = id(); chapterId = id();
  await Semester.collection.insertOne({ _id: semesterId, semesterName: 'Semester 1', coordinatorId: 'teacher', subjects: [{ _id: subjectId, subjectName: 'Algorithms', chapters: [{ _id: chapterId, chapterName: 'Foundations', topics }] }] });
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  globalThis.fetch = originalFetch;
  for (const [key, value] of [['PEERPREP_DEPLOYMENT_ROLE', originalRole], ['NODE_ENV', originalNodeEnv], ['PEERPREP_CONTROL_URL', originalControlUrl]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

const accepted = (problem, when, extras = {}) => ({ _id: id(), user: student._id, problem, status: 'AC', mode: 'submit', language: 'python', sourceCode: 'test', createdAt: new Date(when), completedAt: new Date(when), ...extras });
const completed = (topic, when) => ({ _id: id(), studentId: student._id, semesterId, subjectId, chapterId, topicId: topic, coordinatorId: 'teacher', completed: true, completedAt: new Date(when) });

test('daily, Monday-weekly and calendar-month resets use 2 AM IST across year and leap-month boundaries', () => {
  const beforeReset = engagementPeriods(new Date('2026-10-11T20:29:59Z'));
  const afterReset = engagementPeriods(new Date('2026-10-11T20:30:00Z'));
  assert.equal(beforeReset.daily.periodKey, '2026-10-11');
  assert.equal(beforeReset.weekly.periodKey, '2026-10-05');
  assert.equal(afterReset.daily.periodKey, '2026-10-12');
  assert.equal(afterReset.weekly.periodKey, '2026-10-12');
  assert.equal(afterReset.daily.startsAt.toISOString(), '2026-10-11T20:30:00.000Z');
  assert.equal(engagementPeriods(new Date('2026-12-31T20:29:59Z')).monthly.periodKey, '2026-12');
  assert.equal(engagementPeriods(new Date('2026-12-31T20:30:00Z')).monthly.periodKey, '2027-01');
  assert.equal(engagementPeriods(new Date('2028-02-15')).monthly.endsAt.toISOString(), '2028-02-29T20:30:00.000Z');
});

test('goals adapt to actual available content and disabled goals cannot silently grant a badge', () => {
  assert.deepEqual(challengeGoals('weekly', {}), []);
  assert.deepEqual(challengeGoals('weekly', { codingCount: 1, learningCount: 0 }), [{ metric: 'coding', target: 1 }, { metric: 'activeDays', target: 2 }]);
  const goals = goalProgress([{ metric: 'coding', target: 3 }], { coding: 99 }, { permissions: { questions: false }, codingCount: 0 });
  assert.equal(goals[0].paused, true);
  assert.equal(goals[0].completed, false);
  assert.equal(goals[0].href, null);
});

test('verified challenge points feed rank once and the same level formula is used on the profile', () => {
  const scored = scoreStudentProgress({ easySolved: 1, challengePoints: 650, challengeBadges: 3 }, now);
  assert.equal(scored.score, 685); // 10 coding + 25 milestone + 650 challenge; no second badge bonus.
  assert.equal(scored.earnedBadges, 4);
  assert.equal(scored.milestoneBadges, 1);
  assert.equal(scored.challengeBadges, 3);
  assert.equal(scored.level.level, getLearnerLevel(scored.levelMetrics).level);
  assert.equal(scored.level.level, 2);
});

test('first login has real challenge destinations, locked goals and no invented rewards; assignments remain stable', async () => {
  const first = await refreshStudentEngagement(student, now);
  assert.equal(first.daily.completed, false);
  assert.ok(first.daily.problem.href.startsWith('/problems/'));
  assert.equal(first.periods.length, 2);
  assert.ok(first.periods.every((period) => !period.earned && period.progress === 0));
  assert.deepEqual(first.lifetime, { points: 0, badges: 0, dailyCompleted: 0 });
  assert.deepEqual(first.badges, []);
  await Problem.collection.insertOne({ _id: id(), title: 'New catalog entry', status: 'published', visibility: 'public', difficulty: 'Easy' });
  const second = await refreshStudentEngagement(student, now);
  assert.equal(second.daily.problem.id, first.daily.problem.id);
  assert.equal(await StudentChallenge.countDocuments({ studentId: student._id }), 3);
  assert.deepEqual(second.periods.map((period) => period.goals.map((goal) => goal.target)), first.periods.map((period) => period.goals.map((goal) => goal.target)));
});

test('views, logins, runs, failed, private, draft, other-user, future and assessment work earn no challenge credit', async () => {
  const privateId = id(), draftId = id();
  await Problem.collection.insertMany([{ _id: privateId, title: 'Private', status: 'published', visibility: 'private' }, { _id: draftId, title: 'Draft', status: 'draft', visibility: 'public' }]);
  await Submission.collection.insertMany([
    accepted(problems[0]._id, '2026-10-13', { mode: 'run' }), accepted(problems[0]._id, '2026-10-13', { status: 'WA' }),
    accepted(privateId, '2026-10-13'), accepted(draftId, '2026-10-13'), accepted(problems[1]._id, '2026-10-13', { user: id() }),
    accepted(problems[2]._id, '2026-10-13', { assessmentId: id() }), accepted(problems[3]._id, '2026-10-16'),
  ]);
  await Progress.collection.insertOne({ ...completed(topics[0]._id, '2026-10-13'), completed: false, videoWatchedSeconds: 500 });
  await StudentActivity.collection.insertOne({ studentId: student._id, activityType: 'LOGIN', date: now });
  const result = await refreshStudentEngagement(student, now);
  assert.ok(result.periods.every((period) => period.goals.every((goal) => goal.value === 0)));
  assert.equal(result.lifetime.points, 0);
});

test('distinct accepted work and completed lessons earn one weekly edition under concurrent refreshes', async () => {
  const initial = await refreshStudentEngagement(student, now);
  const practice = problems.filter((problem) => String(problem._id) !== initial.daily.problem.id).slice(0, 3);
  await Submission.collection.insertMany([
    ...practice.map((problem, index) => accepted(problem._id, `2026-10-${12 + index}T10:00:00Z`)),
    ...Array.from({ length: 8 }, () => accepted(practice[0]._id, '2026-10-12T10:30:00Z')),
  ]);
  await Progress.collection.insertMany([completed(topics[0]._id, '2026-10-12'), completed(topics[1]._id, '2026-10-13')]);
  const responses = await Promise.all(Array.from({ length: 6 }, () => refreshStudentEngagement(student, now)));
  const result = responses[0];
  assert.equal(result.periods.find((period) => period.kind === 'weekly').earned, true);
  assert.deepEqual(result.periods[0].goals.map((goal) => goal.value), [3, 2, 2]); // Completed quota is capped at its target.
  assert.equal(result.lifetime.points, 40);
  assert.equal(result.lifetime.badges, 1);
  assert.equal(await StudentChallenge.countDocuments({ studentId: student._id, kind: 'weekly', earnedAt: { $ne: null } }), 1);
  const repeated = await refreshStudentEngagement(student, now);
  assert.deepEqual(repeated.newAwards, []);
  assert.equal(repeated.lifetime.points, 40);
  const rank = await getStudentUniversityRanking(student, null, now);
  assert.equal(rank.scoreBreakdown.challenges, 40);
  assert.equal(rank.challengeBadges, 1);
  assert.equal(rank.earnedBadges, rank.milestoneBadges + 1);
});

test('a partial week does not grant a badge and the previous assigned week is reconciled after rollover', async () => {
  await refreshStudentEngagement(student, now);
  await Submission.collection.insertMany(problems.slice(0, 3).map((problem, index) => accepted(problem._id, `2026-10-${12 + index}T10:00:00Z`)));
  let result = await refreshStudentEngagement(student, now);
  assert.equal(result.periods[0].earned, false);
  await Progress.collection.insertMany([completed(topics[0]._id, '2026-10-12'), completed(topics[1]._id, '2026-10-13')]);
  result = await refreshStudentEngagement(student, new Date('2026-10-19T10:00:00Z'));
  assert.equal(result.periods[0].periodKey, '2026-10-19');
  assert.equal(result.periods[0].earned, false);
  assert.equal(result.badges[0].periodKey, '2026-10-12');
  assert.equal(result.lifetime.badges, 1);
});

test('monthly goals reset while the earned edition and rating bonus stay permanent', async () => {
  await refreshStudentEngagement(student, now);
  await Submission.collection.insertMany(problems.slice(0, 10).map((problem, index) => accepted(problem._id, `2026-10-${String(index + 1).padStart(2, '0')}T10:00:00Z`)));
  await Progress.collection.insertMany(topics.map((topic, index) => completed(topic._id, `2026-10-0${index + 1}T10:00:00Z`)));
  const october = await refreshStudentEngagement(student, now);
  assert.equal(october.periods.find((period) => period.kind === 'monthly').earned, true);
  assert.equal(october.lifetime.points, 150);
  assert.equal(october.badges[0].id, 'monthly:2026-10');
  await Submission.deleteMany({ user: student._id });
  const november = await refreshStudentEngagement(student, new Date('2026-11-02T12:00:00Z'));
  assert.equal(november.periods.find((period) => period.kind === 'monthly').periodKey, '2026-11');
  assert.equal(november.periods.find((period) => period.kind === 'monthly').progress, 0);
  assert.equal(november.lifetime.points, 150);
  assert.equal(november.badges[0].id, 'monthly:2026-10');
});

test('daily reward requires acceptance in the assigned day, tolerates a submission crossing reset and is idempotent', async () => {
  const first = await refreshStudentEngagement(student, now);
  const problemId = new mongoose.Types.ObjectId(first.daily.problem.id);
  await Submission.collection.insertOne(accepted(problemId, '2026-10-13T10:00:00Z'));
  assert.equal((await refreshStudentEngagement(student, now)).daily.completed, false);
  await Submission.collection.insertOne(accepted(problemId, '2026-10-14T20:29:00Z', { completedAt: new Date('2026-10-14T20:31:00Z') }));
  const result = await refreshStudentEngagement(student, now);
  assert.equal(result.daily.completed, true);
  assert.equal(result.lifetime.dailyCompleted, 1);
  assert.equal(result.lifetime.points, 10);
  await Promise.all(Array.from({ length: 3 }, () => recordDailyChallengeCompletion({ userId: student._id, problemId, completedAt: now })));
  assert.equal(await StudentChallenge.countDocuments({ studentId: student._id, kind: 'daily', earnedAt: { $ne: null } }), 1);
  assert.equal((await refreshStudentEngagement(student, now)).lifetime.points, 10);
});

test('daily completion is persisted by the compiler path even without opening the dashboard', async () => {
  const daily = await resolveDailyChallenge(now);
  await Submission.collection.insertOne(accepted(daily.problem._id, '2026-10-15T11:00:00Z'));
  await recordDailyChallengeCompletion({ userId: student._id, problemId: daily.problem._id, completedAt: now });
  assert.equal(await StudentChallenge.countDocuments({ studentId: student._id, earnedAt: { $ne: null } }), 1);
  const later = await refreshStudentEngagement(student, new Date('2026-10-16T12:00:00Z'));
  assert.equal(later.lifetime.points, 10);
  assert.equal(later.daily.completed, false);
  const status = await getCodingStreakStatus(student._id, new Date('2026-10-18T12:00:00Z'));
  assert.equal(status.currentStreak, 0);
  assert.equal(status.bestStreak, 1);
});

test('shared-only universities receive a pinned daily question and only judged correct attempts earn its reward', async () => {
  await Problem.deleteMany({});
  const question = { _id: String(id()), questionType: 'coding', status: 'published', visibility: 'public', sourceType: 'compiler', difficulty: 'Easy', questionText: 'Shared Arrays' };
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'university';
  process.env.PEERPREP_CONTROL_URL = 'http://127.0.0.1';
  globalThis.fetch = async (url) => {
    const payload = String(url).endsWith('/policy') ? { permissions: { questions: true, learning: false, events: false, assessments: false }, sources: {} } : String(url).endsWith('/questions') ? { questions: [question] } : null;
    assert.ok(payload, `Unexpected external URL: ${url}`);
    return { ok: true, json: async () => payload };
  };
  let result = await refreshStudentEngagement(student, now);
  assert.equal(result.daily.problem.href, `/problems/shared/${question._id}`);
  await QuestionPracticeAttempt.collection.insertOne({ studentId: student._id, questionId: new mongoose.Types.ObjectId(question._id), source: 'shared', questionType: 'coding', result: 'incorrect', createdAt: now });
  assert.equal((await refreshStudentEngagement(student, now)).daily.completed, false);
  await QuestionPracticeAttempt.collection.insertOne({ studentId: student._id, questionId: new mongoose.Types.ObjectId(question._id), source: 'shared', questionType: 'coding', result: 'correct', createdAt: now });
  result = await refreshStudentEngagement(student, now);
  assert.equal(result.daily.completed, true);
  assert.equal(result.lifetime.points, 10);
  assert.equal(result.periods[0].goals.find((goal) => goal.metric === 'coding').value, 1);
});

test('production reward writes fail closed when uniqueness indexes are missing', async () => {
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(requireEngagementUniqueIndex({ collection: { listIndexes: () => ({ toArray: async () => [] }) } }, { dateKey: 1 }), (error) => error.status === 503);
    await requireEngagementUniqueIndex({ collection: { listIndexes: () => ({ toArray: async () => [{ unique: true, key: { dateKey: 1 } }] }) } }, { dateKey: 1 });
  } finally { process.env.NODE_ENV = 'test'; }
});

test('badge collection cursor pagination is stable for tied timestamps and never exposes another student', async () => {
  const periods = engagementPeriods(now);
  const rows = Array.from({ length: 9 }, (_, index) => ({
    _id: id(), studentId: student._id, kind: 'weekly', periodKey: `edition-${index}`,
    startsAt: periods.weekly.startsAt, endsAt: periods.weekly.endsAt, rewardPoints: 40, earnedAt: now,
  }));
  await StudentChallenge.collection.insertMany([
    ...rows, { ...rows[0], _id: id(), studentId: id(), periodKey: 'private-peer-edition' },
    { ...rows[0], _id: id(), periodKey: 'unearned-edition', earnedAt: null },
    { ...rows[0], _id: id(), periodKey: 'daily-edition', kind: 'daily' },
  ]);
  const collected = [];
  let cursor;
  do {
    const page = await listStudentChallengeBadges(student, { cursor, limit: 2 });
    assert.ok(page.badges.length <= 2);
    collected.push(...page.badges);
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(collected.length, 9);
  assert.equal(new Set(collected.map((badge) => badge.id)).size, 9);
  assert.ok(collected.every((badge) => badge.periodKey.startsWith('edition-')));
  await assert.rejects(listStudentChallengeBadges(student, { cursor: 'malformed' }), (error) => error.status === 400);
  const foreignCursor = Buffer.from(`${now.toISOString()}|${id()}`).toString('base64url');
  const foreignPage = await listStudentChallengeBadges(student, { cursor: foreignCursor });
  assert.ok(foreignPage.badges.every((badge) => badge.periodKey.startsWith('edition-')));
});

test('refresh endpoint ignores forged dates, student IDs, completion flags and reward amounts', async () => {
  const headers = {};
  let payload;
  const res = { set: (key, value) => { headers[key] = value; }, json: (value) => { payload = value; } };
  await refreshStudentChallenges({ user: student, body: { studentId: String(id()), now: '2035-01-01', completed: true, earnedAt: now, rewardPoints: 999999, lifetime: { points: 999999 } } }, res);
  assert.deepEqual(payload.lifetime, { points: 0, badges: 0, dailyCompleted: 0 });
  assert.deepEqual(payload.newAwards, []);
  assert.equal(headers['Cache-Control'], 'private, no-store');
  assert.equal(await StudentChallenge.countDocuments({ earnedAt: { $ne: null } }), 0);
});

test('earning a challenge invalidates cached cohort standing as well as the recipient’s own score', async () => {
  const peer = { ...student, _id: id() };
  await User.collection.insertOne(peer);
  await refreshStudentEngagement(peer, now);
  await Submission.collection.insertOne(accepted(problems[11]._id, now));
  const before = await getStudentUniversityRanking(student, null, now);
  assert.equal(before.rank, 1);
  await Submission.collection.insertMany(problems.slice(0, 10).map((problem, index) => accepted(problem._id, `2026-10-${String(index + 1).padStart(2, '0')}T10:00:00Z`, { user: peer._id })));
  await Progress.collection.insertMany(topics.map((topic, index) => ({ ...completed(topic._id, `2026-10-0${index + 1}T10:00:00Z`), studentId: peer._id })));
  const awarded = await refreshStudentEngagement(peer, now);
  assert.equal(awarded.lifetime.points, 150);
  const after = await getStudentUniversityRanking(student, null, now);
  assert.equal(after.rank, 2);
  assert.equal(after.score, before.score);
  const recipient = await getStudentUniversityRanking(peer, null, now);
  assert.equal(recipient.scoreBreakdown.challenges, 150);
});
