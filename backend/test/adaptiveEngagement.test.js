import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Problem from '../src/models/Problem.js';
import Submission from '../src/models/Submission.js';
import Semester from '../src/models/Subject.js';
import Progress from '../src/models/Progress.js';
import Assessment from '../src/models/Assessment.js';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';
import Pair from '../src/models/Pair.js';
import Feedback from '../src/models/Feedback.js';
import StudentChallenge from '../src/models/StudentChallenge.js';
import Notification from '../src/models/Notification.js';
import { adaptiveModels, MissionAssignment, EngagementReward, EngagementActivity, EngagementPolicy, StudentProgression, AchievementEvent, MonthlyProgressSnapshot } from '../src/models/AdaptiveEngagement.js';
import { refreshAdaptiveEngagement, claimAchievement, acknowledgeAchievement, createAchievement, engagementScope, acceptChallenge } from '../src/services/adaptiveEngagementService.js';
import { getStudentUniversityRanking } from '../src/services/studentDashboardService.js';
import { DEFAULT_POLICY, enabledDomains, selectDailyMissions, selectPeriodGoals, abilityFrom, periodsAt, evaluateGoals, assignmentComplete } from '../src/services/adaptiveEngagementRules.js';
import { validatePolicy } from '../src/services/engagementPolicyService.js';
import { observeVerifiedInterview } from '../src/services/interviewEngagementService.js';

const at = new Date('2026-10-15T08:00:00Z');
const oid = () => new mongoose.Types.ObjectId();
const models = [User, Problem, Submission, Semester, Progress, Assessment, AssessmentSubmission, Pair, Feedback, StudentChallenge, Notification, ...adaptiveModels];
const keys = ['NODE_ENV', 'PEERPREP_DEPLOYMENT_ROLE', 'PEERPREP_UNIVERSITY_ID', 'PEERPREP_CONTROL_URL'];
const oldEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const oldFetch = globalThis.fetch;
let mongo, student, problems;
before(async () => {
  process.env.NODE_ENV = 'test'; process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'adaptive_engagement_isolated' });
  await Promise.all(models.map((model) => model.init()));
});
beforeEach(async () => {
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
  globalThis.fetch = async () => { throw new Error('Unexpected external request'); };
  await Promise.all(models.map((model) => model.deleteMany({})));
  student = { _id: oid(), role: 'student', accessScope: 'full', college: 'Test University', semester: 1 };
  await User.collection.insertOne(student);
  problems = Array.from({ length: 18 }, (_, i) => ({ _id: oid(), title: `Problem ${i}`, difficulty: ['Easy', 'Medium', 'Hard'][i % 3], visibility: 'public', status: 'published' }));
  await Problem.collection.insertMany(problems);
});
after(async () => {
  await mongoose.disconnect(); await mongo?.stop(); globalThis.fetch = oldFetch;
  keys.forEach((key) => { if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key]; });
});
const solve = (problem, when, extra = {}) => Submission.collection.insertOne({ user: student._id, problem, mode: 'submit', status: 'AC', createdAt: when, updatedAt: when, completedAt: when, ...extra });

test('allocation intersection cannot be expanded by a university policy', () => {
  assert.deepEqual(enabledDomains({ questions: false, learning: true, interviews: false }, DEFAULT_POLICY), ['learning']);
  assert.deepEqual(enabledDomains({ questions: true }, { ...DEFAULT_POLICY, domains: ['learning'] }), []);
  assert.throws(() => validatePolicy({ dailyXp: 99999 }), /dailyXp/);
  assert.throws(() => validatePolicy({ domains: ['invented'] }), /domains/);
  assert.throws(() => validatePolicy({ customBadges: [null] }), /Invalid custom badge/);
});
test('new students get a stable easy core; capable students get stronger missions', () => {
  const candidates = problems.map((p) => ({ key: String(p._id), domain: 'coding', difficulty: p.difficulty, minutes: p.difficulty === 'Easy' ? 10 : 20 }));
  const ability = abilityFrom([], at);
  const first = selectDailyMissions(candidates, ability, DEFAULT_POLICY, 'seed');
  assert.equal(first[0].difficulty, 'Easy');
  assert.deepEqual(first, selectDailyMissions(candidates, ability, DEFAULT_POLICY, 'seed'));
  assert.ok(first.filter((g) => g.slot !== 'stretch').every((g) => g.difficulty === 'Easy'));
  const capable = { coding: { mastery: 70, samples: 10, band: 'Hard' } };
  assert.ok(Array.from({ length: 12 }, (_, i) => selectDailyMissions(candidates, capable, DEFAULT_POLICY, String(i))[0]).some((g) => g.difficulty === 'Hard'));
});
test('late-month goals fit remaining time and actual content', () => {
  const now = new Date('2026-10-31T14:00:00Z');
  const goals = selectPeriodGoals('monthly', [{ domain: 'learning', key: 'a', href: '/student/learning' }], { learning: { band: 'Hard' } }, DEFAULT_POLICY, now, 'x');
  assert.ok(goals.every((goal) => goal.target === 1));
  assert.equal(periodsAt(new Date('2026-10-31T20:30:00Z')).monthly.periodKey, '2026-11');
});
test('choice alternatives and optional stretch cannot block an otherwise complete plan', () => {
  const assignment = { kind: 'daily', goals: [{ slot: 'core' }, { slot: 'choice' }, { slot: 'choice' }, { slot: 'stretch' }] };
  assert.equal(assignmentComplete(assignment, [{ slot: 'core', completed: true }, { slot: 'choice', completed: true }, { slot: 'choice', paused: true }]), true);
  assert.equal(assignmentComplete(assignment, [{ slot: 'core', completed: true }]), false);
});
test('first visit creates personalized frozen assignments without invented credit', async () => {
  const first = await refreshAdaptiveEngagement(student, at);
  assert.equal(first.version, 2); assert.equal(first.lifetime.points, 0); assert.equal(first.daily.completed, false);
  assert.equal(first.daily.goals.find((g) => g.slot === 'core').difficulty, 'Easy');
  const second = await refreshAdaptiveEngagement(student, at);
  assert.deepEqual(second.daily.goals, first.daily.goals);
  assert.equal(await MissionAssignment.countDocuments({ studentId: student._id }), 1, 'Only the daily challenge is assigned');
  assert.equal(await EngagementReward.countDocuments({}), 0);
});

test('accepting daily, weekly and monthly plans is persistent and idempotent, never an XP reward', async () => {
  const initial = await refreshAdaptiveEngagement(student, at);
  for (const plan of [initial.daily, ...initial.periods]) {
    const kind = plan.kind;
    const [first, second] = await Promise.all([
      acceptChallenge(student, kind, plan.periodKey, at), acceptChallenge(student, kind, plan.periodKey, at),
    ]);
    assert.equal(first.acceptedAt.toISOString(), at.toISOString());
    assert.equal(second.acceptedAt.toISOString(), first.acceptedAt.toISOString());
  }
  const refreshed = await refreshAdaptiveEngagement(student, at);
  assert.equal(refreshed.daily.acceptedAt.toISOString(), at.toISOString());
  assert.ok(refreshed.periods.every(plan => plan.acceptedAt));
  assert.equal(refreshed.lifetime.points, 0);
  assert.equal(await EngagementReward.countDocuments({}), 0);
  assert.equal(refreshed.month.key, '2026-10');
  assert.equal(refreshed.month.dailyPlans[0].completed, false);
  assert.equal(refreshed.month.dailyPlans[0].dayKey, initial.daily.periodKey);
});

test('acceptance rejects expired, foreign and disabled plans without changing rewards', async () => {
  const initial = await refreshAdaptiveEngagement(student, at);
  const { periodKey } = initial.daily;
  await assert.rejects(acceptChallenge(student, 'yearly', periodKey, at), /Invalid challenge/);
  await assert.rejects(acceptChallenge(student, 'daily', '2020-01-01', at), /ended/);
  await assert.rejects(acceptChallenge({ ...student, _id: oid() }, 'daily', periodKey, at), /No assigned/);
  await assert.rejects(acceptChallenge({ ...student, college: 'Other University' }, 'daily', periodKey, at), /No assigned/);
  const { tenantKey } = engagementScope(student);
  await EngagementPolicy.create({ tenantKey, cohort: 'all', settings: { enabled: false } });
  await assert.rejects(acceptChallenge(student, 'daily', periodKey, at), /paused/);
  await EngagementPolicy.updateOne({ tenantKey }, { $set: { settings: { domains: ['learning'] } } });
  await assert.rejects(acceptChallenge(student, 'daily', periodKey, at), /access has changed/);
  assert.equal(await EngagementReward.countDocuments({}), 0);
  assert.equal(await MissionAssignment.countDocuments({ acceptedAt: { $ne: null } }), 0);
});

test('verified challenge completion adds rank points once and marks the monthly calendar', async () => {
  const first = await refreshAdaptiveEngagement(student, at);
  const before = await getStudentUniversityRanking(student, null, at);
  await acceptChallenge(student, 'daily', first.daily.periodKey, at);
  const accepted = await getStudentUniversityRanking(student, null, at);
  assert.equal(accepted.score, before.score);
  const core = first.daily.goals.find(goal => goal.slot === 'core');
  const completedAt = new Date(at.getTime() + 60000);
  await solve(new mongoose.Types.ObjectId(core.key.split(':').at(-1)), completedAt);
  const done = await refreshAdaptiveEngagement(student, completedAt);
  const after = await getStudentUniversityRanking(student, null, completedAt);
  assert.equal(after.scoreBreakdown.challenges, first.daily.rewardPoints);
  assert.ok(after.score >= before.score + first.daily.rewardPoints);
  assert.equal(done.month.dailyPlans[0].completed, true);
  await acceptChallenge(student, 'daily', first.daily.periodKey, completedAt);
  await refreshAdaptiveEngagement(student, completedAt);
  assert.equal((await getStudentUniversityRanking(student, null, completedAt)).score, after.score);
});
test('verified solutions complete missions once under concurrent refreshes; runs and other students do not', async () => {
  const first = await refreshAdaptiveEngagement(student, at);
  const core = first.daily.goals.find((g) => g.slot === 'core');
  const problem = new mongoose.Types.ObjectId(core.key.split(':').at(-1));
  const completedAt = new Date(at.getTime() + 60000);
  await solve(problem, completedAt, { mode: 'run' });
  await solve(problem, completedAt, { user: oid() });
  assert.equal((await refreshAdaptiveEngagement(student, completedAt)).lifetime.points, 0);
  await solve(problem, completedAt);
  const results = await Promise.all(Array.from({ length: 6 }, () => refreshAdaptiveEngagement(student, completedAt)));
  assert.ok(results.every((result) => result.daily.completed));
  assert.equal(results[0].lifetime.points, 20);
  assert.equal(await EngagementReward.countDocuments({ kind: 'daily' }), 1);
  assert.equal(await EngagementActivity.countDocuments({ domain: 'coding' }), 1);
  await solve(problem, new Date(completedAt.getTime() + 1000));
  assert.equal((await refreshAdaptiveEngagement(student, new Date(completedAt.getTime() + 2000))).lifetime.points, 20);
});
const noticesFor = (studentId = student._id) => Notification.find({ userId: studentId }).sort({ createdAt: 1, title: 1 }).lean();

test('only a daily challenge is assigned: one personal coding problem, different across classmates', async () => {
  const classmates = Array.from({ length: 6 }, () => ({ ...student, _id: oid() }));
  await User.collection.insertMany(classmates);
  const picks = [];
  for (const learner of [student, ...classmates]) {
    const result = await refreshAdaptiveEngagement(learner, at);
    assert.deepEqual(result.periods, [], 'Weekly and monthly targets are no longer offered');
    assert.equal(result.daily.goals.length, 1);
    assert.equal(result.daily.goals[0].domain, 'coding');
    assert.equal(result.daily.goals[0].slot, 'core');
    picks.push(result.daily.goals[0].key);
  }
  assert.ok(new Set(picks).size > 1, 'Students are not all handed the same problem');
  assert.equal((await refreshAdaptiveEngagement(student, new Date(at.getTime() + 60000))).daily.goals[0].key, picks[0], 'A refresh never reshuffles the day');
  assert.equal(await MissionAssignment.countDocuments({ kind: { $ne: 'daily' } }), 0);
  assert.ok((await noticesFor()).every((notice) => !/target/i.test(notice.title)), 'No weekly or monthly target notices');
});

test('streak badges follow the best run of consecutive days and are kept after a break', async () => {
  const scope = engagementScope(student);
  await StudentProgression.create({ ...scope, level: 1, joinedAt: new Date('2026-09-01T00:00:00Z'), legacyImportedAt: at });
  await EngagementActivity.insertMany(problems.slice(0, 7).map((problem, index) => ({ ...scope, sourceKey: `coding:local:${problem._id}`, contentKey: `coding:local:${problem._id}`,
    domain: 'coding', difficulty: problem.difficulty, occurredAt: new Date(`2026-10-0${index + 1}T06:00:00Z`), dayKey: `2026-10-0${index + 1}` })));
  const result = await refreshAdaptiveEngagement(student, at);
  const earned = new Set(result.badges.filter((badge) => badge.earned).map((badge) => badge.id));
  for (const id of ['streak-3', 'streak-7', 'code-streak-7']) assert.ok(earned.has(id), `${id} is earned from a 7-day run`);
  assert.ok(!earned.has('streak-14'));
  assert.equal(result.badges.find((badge) => badge.id === 'streak-14').progress, 50);
  assert.ok((await refreshAdaptiveEngagement(student, new Date('2026-10-30T08:00:00Z'))).badges.find((badge) => badge.id === 'streak-7').earned, 'A later break keeps the badge');
});

test('a completed daily plan and its badges notify once and appear on the heatmap as challenge activity', async () => {
  const first = await refreshAdaptiveEngagement(student, at);
  const core = first.daily.goals.find((g) => g.slot === 'core');
  const completedAt = new Date(at.getTime() + 60000);
  await solve(new mongoose.Types.ObjectId(core.key.split(':').at(-1)), completedAt);
  const results = await Promise.all(Array.from({ length: 5 }, () => refreshAdaptiveEngagement(student, completedAt)));
  await refreshAdaptiveEngagement(student, new Date(completedAt.getTime() + 1000));
  const notices = await noticesFor();
  const titles = notices.map((notice) => notice.title);
  assert.equal(titles.filter((title) => title === 'Daily challenge complete').length, 1);
  assert.match(notices.find((notice) => notice.title === 'Daily challenge complete').message, /^\+20 XP earned/);
  assert.ok(titles.includes('Badge earned: Code Initiate') && titles.includes('Badge earned: Daily Debut'));
  assert.equal(new Set(notices.map((notice) => notice.dedupeKey)).size, notices.length, 'No duplicate notices under concurrent refreshes');
  assert.ok(notices.filter((notice) => notice.type === 'BADGE').every((notice) => notice.actionUrl === '/student/profile#badges'));

  const day = results[0].daily.periodKey;
  const { breakdownByDate, activityByDate } = results.at(-1).activity;
  assert.equal(breakdownByDate[day].coding, 1, 'The verified solve still counts once as coding');
  assert.equal(breakdownByDate[day].challenges, 3, 'Plan completion and two badges are challenge milestones');
  assert.equal(activityByDate[day], 4);
});


test('badges recognised from work before joining are added quietly', async () => {
  await solve(problems[0]._id, new Date(at.getTime() - 86400000));
  await refreshAdaptiveEngagement(student, at);
  assert.ok((await noticesFor()).every((notice) => notice.type !== 'BADGE'), 'Historical badges are not announced as new');
});

test('feature revocation hides tasks, badges and activity and cannot grant a reward', async () => {
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'university'; process.env.PEERPREP_UNIVERSITY_ID = 'test-campus'; process.env.PEERPREP_CONTROL_URL = 'http://127.0.0.1';
  let allowed = true;
  globalThis.fetch = async (url) => ({ ok: true, json: async () => String(url).endsWith('/policy') ? { active: true, permissions: { questions: allowed }, sources: {} } : { questions: [] } });
  const first = await refreshAdaptiveEngagement(student, at);
  assert.ok(first.daily.goals.length > 0);
  const problem = new mongoose.Types.ObjectId(first.daily.goals[0].key.split(':').at(-1));
  allowed = false;
  await solve(problem, new Date(at.getTime() + 1000));
  const result = await refreshAdaptiveEngagement(student, new Date(at.getTime() + 2000));
  assert.deepEqual(result.domains, []); assert.deepEqual(result.daily.goals, []); assert.equal(result.lifetime.points, 0);
  assert.ok(result.badges.every((badge) => badge.category !== 'coding'));
  assert.deepEqual(result.activity.activityByDate, {});
});
test('receipts and celebration claims are tenant/student scoped and delivered once', async () => {
  const scope = engagementScope(student);
  await createAchievement(scope, 'level:2', { type: 'level', level: { level: 2 } });
  const result = await Promise.all(Array.from({ length: 8 }, () => claimAchievement(student)));
  const events = result.flatMap((item) => item.events);
  assert.equal(events.length, 1);
  const other = { ...student, _id: oid() };
  await acknowledgeAchievement(other, events.map((event) => event.id));
  assert.equal((await AchievementEvent.findById(events[0].id)).acknowledgedAt, null);
  await acknowledgeAchievement(student, events.map((event) => event.id));
  assert.ok((await AchievementEvent.findById(events[0].id)).acknowledgedAt);
  assert.deepEqual((await claimAchievement(student)).events, []);
});
test('policy overrides are scoped by university and semester; historical XP is preserved', async () => {
  const scope = engagementScope(student);
  await EngagementPolicy.create({ tenantKey: scope.tenantKey, cohort: 'semester:1', settings: { ...DEFAULT_POLICY, domains: ['learning'] } });
  await StudentChallenge.collection.insertOne({ studentId: student._id, kind: 'weekly', periodKey: '2026-10-01', rewardPoints: 40, earnedAt: at });
  const result = await refreshAdaptiveEngagement(student, at);
  assert.deepEqual(result.domains, ['learning']); assert.equal(result.lifetime.points, 40);
  const foreign = await refreshAdaptiveEngagement({ ...student, college: 'Other University' }, at);
  assert.ok(foreign.domains.includes('coding'));
});
test('an earned level remains when recent mastery declines', async () => {
  await StudentProgression.create({ ...engagementScope(student), joinedAt: at, level: 4 });
  const result = await refreshAdaptiveEngagement(student, new Date(at.getTime() + 40 * 86400000));
  assert.equal(result.level.level, 4); assert.equal(result.level.mastery, 0);
});
test('completion evidence must fall within the assignment period', () => {
  const assignment = { assignedAt: at, endsAt: new Date(at.getTime() + 3600000), goals: [{ id: 'core', domain: 'coding', slot: 'core', key: 'a', target: 1 }] };
  const goals = evaluateGoals(assignment, [{ domain: 'coding', contentKey: 'a', occurredAt: new Date(at.getTime() - 1), dayKey: '2026-10-15' }], ['coding'], new Set(['a']), at);
  assert.equal(goals[0].completed, false);
});

test('learning-only students receive achievable missions from their actual curriculum', async () => {
  const scope = engagementScope(student), topicId = oid();
  await EngagementPolicy.create({ tenantKey: scope.tenantKey, settings: { domains: ['learning'] } });
  await Semester.collection.insertOne({ semesterName: 'Semester 1', coordinatorId: 'teacher', subjects: [{ _id: oid(), subjectName: 'Algorithms', chapters: [{ _id: oid(), topics: [{ _id: topicId, topicName: 'Arrays', notesPDF: 'https://example.invalid/notes.pdf' }] }] }] });
  const first = await refreshAdaptiveEngagement(student, at);
  assert.equal(first.daily.goals[0].domain, 'learning');
  assert.ok(first.periods.every((period) => period.goals.every((goal) => goal.target === 1)), 'Limited catalogues must not require impossible active days');
  assert.match(first.daily.goals[0].href, new RegExp(`topicId=${topicId}`));
  const completedAt = new Date(at.getTime() + 1000);
  await Progress.collection.insertOne({ studentId: student._id, topicId, completed: true, completedAt });
  const result = await refreshAdaptiveEngagement(student, completedAt);
  assert.equal(result.daily.completed, true);
  assert.equal(result.activity.breakdownByDate['2026-10-15'].learning, 1);
  assert.ok(result.badges.find((b) => b.id === 'learning-begins').earned);
  assert.ok(!result.badges.some((b) => b.category === 'coding'));
});

test('assessment-only allocation supports onboarding and waits for server evaluation', async () => {
  const scope = engagementScope(student), assessmentId = oid();
  await EngagementPolicy.create({ tenantKey: scope.tenantKey, settings: { domains: ['assessments'] } });
  await Assessment.collection.insertOne({ _id: assessmentId, title: 'Readiness', targetType: 'all', audienceType: 'students', lifecycleStatus: 'published', startTime: new Date(at.getTime() - 1000), endTime: new Date(at.getTime() + 86400000), duration: 20 });
  const first = await refreshAdaptiveEngagement(student, at);
  assert.equal(first.daily.goals[0].domain, 'assessments');
  const submittedAt = new Date(at.getTime() + 60000);
  await AssessmentSubmission.collection.insertOne({ studentId: student._id, assessmentId, status: 'submitted', evaluationStatus: 'pending', submittedAt, score: 85, maxMarks: 100 });
  assert.equal((await refreshAdaptiveEngagement(student, submittedAt)).daily.completed, false);
  await AssessmentSubmission.collection.updateOne({ studentId: student._id }, { $set: { evaluationStatus: 'completed' } });
  const result = await refreshAdaptiveEngagement(student, submittedAt);
  assert.equal(result.daily.completed, true);
  assert.ok(result.badges.find((b) => b.id === 'accuracy-ace').earned);
});

test('peer-interview evidence must come from the assigned interviewer and event', async () => {
  const scope = engagementScope(student), pairId = oid(), interviewer = oid(), event = oid();
  await EngagementPolicy.create({ tenantKey: scope.tenantKey, settings: { domains: ['events'] } });
  await Pair.collection.insertOne({ _id: pairId, interviewee: student._id, interviewer, event, status: 'scheduled', scheduledAt: at });
  assert.equal((await refreshAdaptiveEngagement(student, at)).daily.goals[0].domain, 'events');
  const when = new Date(at.getTime() + 60000);
  const evidence = { to: student._id, from: oid(), pair: pairId, event, marks: 80, createdAt: when };
  await Feedback.collection.insertOne(evidence);
  assert.equal((await refreshAdaptiveEngagement(student, when)).daily.completed, false);
  await Feedback.collection.insertOne({ ...evidence, _id: oid(), from: interviewer });
  assert.equal((await refreshAdaptiveEngagement(student, when)).daily.completed, true);
});

test('trusted AI interview receipts deduplicate completions and reject uncorrelated sessions', async () => {
  await observeVerifiedInterview({ user: student, path: '/session/unknown', method: 'POST' }, { id: 'unknown', status: 'completed' });
  assert.equal(await EngagementActivity.countDocuments({}), 0);
  await observeVerifiedInterview({ user: student, path: '/interview-123/start', method: 'POST' }, { id: 'session-123', status: 'active' });
  for (let i = 0; i < 3; i += 1) await observeVerifiedInterview({ user: student, path: '/sessions/session-123', method: 'GET' }, { id: 'session-123', status: 'completed' });
  const rows = await EngagementActivity.find({ domain: 'interviews' }).lean();
  assert.equal(rows.length, 1); assert.equal(rows[0].contentKey, 'interviews:interview-123');
  assert.equal(String(rows[0].studentId), String(student._id));
});

test('a crash between recording completion and issuing rewards is repaired after rollover', async () => {
  const scope = engagementScope(student), yesterday = new Date(at.getTime() - 86400000), period = periodsAt(yesterday).daily;
  await MissionAssignment.create({ ...scope, ...period, assignedAt: yesterday, policyRevision: '0:0', goals: [], rewardPoints: 20, earnedAt: yesterday });
  await refreshAdaptiveEngagement(student, at);
  const receipt = await EngagementReward.findOne({ ...scope, key: `daily:${period.periodKey}` }).lean();
  assert.equal(receipt.points, 20); assert.equal(receipt.earnedAt.toISOString(), yesterday.toISOString());
  assert.ok((await MissionAssignment.findOne({ ...scope, kind: 'daily', periodKey: period.periodKey })).settledAt);
  await refreshAdaptiveEngagement(student, at);
  assert.equal(await EngagementReward.countDocuments({ ...scope, key: `daily:${period.periodKey}` }), 1);
});

test('delayed refresh attributes XP to the verified completion month, not the visit month', async () => {
  const assignedAt = new Date('2026-10-31T08:00:00Z');
  const first = await refreshAdaptiveEngagement(student, assignedAt);
  const problemId = new mongoose.Types.ObjectId(first.daily.goals.find((g) => g.slot === 'core').key.split(':').at(-1));
  const completedAt = new Date('2026-10-31T09:00:00Z');
  await solve(problemId, completedAt);
  await refreshAdaptiveEngagement(student, new Date('2026-11-01T08:00:00Z'));
  const reward = await EngagementReward.findOne({ ...engagementScope(student), key: 'daily:2026-10-31' }).lean();
  assert.equal(reward.earnedAt.toISOString(), completedAt.toISOString());
  const snapshot = await MonthlyProgressSnapshot.findOne({ ...engagementScope(student), month: '2026-10' }).lean();
  assert.equal(snapshot.summary.xp, 20, 'Daily XP only; there is no monthly bonus any more');
});

test('XP alone does not promote; proven mastery plus active days create one permanent level event', async () => {
  const scope = engagementScope(student);
  await StudentProgression.create({ ...scope, level: 1, joinedAt: at, legacyImportedAt: at });
  await EngagementReward.create({ ...scope, key: 'daily:seed', points: 120, kind: 'daily', earnedAt: at });
  assert.equal((await refreshAdaptiveEngagement(student, at)).level.level, 1);
  await EngagementActivity.insertMany(problems.slice(0, 5).map((problem, index) => ({ ...scope, sourceKey: `coding:local:${problem._id}`, contentKey: `coding:local:${problem._id}`, domain: 'coding', score: 85,
    occurredAt: new Date(at.getTime() - index * 86400000), dayKey: `2026-10-${15 - index}` })));
  const result = await refreshAdaptiveEngagement(student, at);
  assert.equal(result.level.level, 2);
  await refreshAdaptiveEngagement(student, at);
  assert.equal(await AchievementEvent.countDocuments({ ...scope, key: 'level:2' }), 1);
});

test('admin policy handlers persist audited semester settings; student writes are rejected', async () => {
  // Exercise the actual route middleware and handler against the isolated database.
  const router = (await import('../src/routes/engagement.js')).default;
  const route = router.stack.find((layer) => layer.route?.path === '/policy' && layer.route.methods.patch).route;
  assert.throws(() => route.stack[0].handle({ user: student }, {}, () => {}), /Admin only/);
  const admin = { ...student, _id: oid(), role: 'admin' };
  let result;
  const req = { user: admin, query: {}, body: { cohort: 'semester:1', settings: { dailyMinutes: 30, domains: ['learning'], customBadges: [{ id: 'campus-reader', title: 'Campus Reader', metric: 'learning', target: 3 }] } } };
  await route.stack.at(-1).handle(req, { json: (value) => { result = value; } });
  assert.equal(result.settings.dailyMinutes, 30);
  assert.equal(result.settings.customBadges[0].category, 'learning');
  assert.equal(result.settings.customBadges[0].id, 'university-campus-reader');
  const saved = await EngagementPolicy.findOne({ tenantKey: engagementScope(student).tenantKey, cohort: 'semester:1' }).lean();
  assert.equal(String(saved.updatedBy), String(admin._id));
  assert.equal(saved.history.length, 1);
  req.body.settings = { dailyMinutes: 31 };
  await route.stack.at(-1).handle(req, { json: (value) => { result = value; } });
  assert.equal(result.settings.dailyMinutes, 31);
  assert.equal(result.settings.customBadges[0].title, 'Campus Reader', 'Partial updates preserve other settings');
  const fresh = await refreshAdaptiveEngagement(student, at);
  assert.deepEqual(fresh.domains, ['learning']);
});
