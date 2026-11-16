import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Problem from '../src/models/Problem.js';
import Submission from '../src/models/Submission.js';
import Notification from '../src/models/Notification.js';
import QuestionLibrary from '../src/models/QuestionLibrary.js';
import { adaptiveModels, EngagementReward, Quest, QuestEnrollment } from '../src/models/AdaptiveEngagement.js';
import {
  cohortQuestProgress, createQuest, getAdminQuest, getStudentQuest, latestQuestResume, listStudentQuests, questInsights, questOverview, questRange,
  questStudents, questWindow, recordQuestView, searchQuestLibrary, startQuest, studentQuickPrepReport, updateQuest,
} from '../src/services/questService.js';
import { engagementScope } from '../src/services/adaptiveEngagementService.js';

// QuickPrep attempt windows (startsAt / endsAt), the Insights period and student search, and the staff
// per-student report. Test-owned in-memory database only.
const DAY = 86400000;
const now = new Date();
const days = (count) => new Date(now.getTime() + count * DAY);
const oid = () => new mongoose.Types.ObjectId();
const models = [User, Problem, Submission, Notification, QuestionLibrary, ...adaptiveModels];
const oldRole = process.env.PEERPREP_DEPLOYMENT_ROLE;
let mongo, admin, student, peer, problems;

before(async () => {
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', launchTimeout: 60000 } });
  await mongoose.connect(mongo.getUri(), { dbName: 'quest_window_isolated' });
  await Promise.all(models.map((model) => model.init()));
});
beforeEach(async () => {
  await Promise.all(models.map((model) => model.deleteMany({})));
  admin = { _id: oid(), role: 'admin' };
  student = { _id: oid(), role: 'student', accessScope: 'full', college: 'Test University', semester: 3, name: 'Aditi Sharma', email: 'aditi@example.edu', studentId: 'GE-101' };
  peer = { _id: oid(), role: 'student', accessScope: 'full', college: 'Test University', semester: 3, name: 'Ravi Kumar', email: 'ravi@example.edu', studentId: 'GE-202' };
  await User.collection.insertMany([admin, student, peer]);
  problems = ['Two Sum', 'Valid Anagram'].map((title, index) => ({ _id: oid(), title, difficulty: 'Easy', tags: ['Array'], companyTags: ['Google'], visibility: 'public', status: 'published', displayOrder: index + 1 }));
  await Problem.collection.insertMany(problems);
});
after(async () => {
  await mongoose.disconnect(); await mongo?.stop();
  if (oldRole === undefined) delete process.env.PEERPREP_DEPLOYMENT_ROLE; else process.env.PEERPREP_DEPLOYMENT_ROLE = oldRole;
});

const item = (problem) => ({ source: 'university', problemId: String(problem._id), section: '' });
const solve = (who, problem, when) => Submission.collection.insertOne({ user: who._id, problem: problem._id, mode: 'submit', status: 'AC', language: 'python', createdAt: when, updatedAt: when });
const sheet = (overrides = {}) => createQuest(admin, undefined, { title: 'Window sheet', status: 'published', rewardXp: 40, items: problems.map(item), ...overrides });

test('the window is optional, validated, and shown with an Upcoming / Open / Ended status', async () => {
  await assert.rejects(sheet({ startsAt: days(2).toISOString(), endsAt: days(1).toISOString() }), /end time must be after the start time/);
  await assert.rejects(sheet({ startsAt: days(1).toISOString(), endsAt: days(1).toISOString() }), /end time must be after the start time/);
  await assert.rejects(sheet({ startsAt: 'next tuesday-ish' }), /start time is not a valid date/);

  const always = await sheet({ title: 'Always open' });
  assert.deepEqual([always.startsAt, always.endsAt, always.windowStatus], [null, null, 'open'], 'No window means always open');
  const upcoming = await sheet({ title: 'Later', startsAt: days(1).toISOString(), endsAt: days(3).toISOString() });
  assert.equal(upcoming.windowStatus, 'upcoming');
  assert.equal(new Date(upcoming.startsAt).getTime(), days(1).getTime(), 'ISO input is stored as the same instant');
  const ended = await sheet({ title: 'Earlier', startsAt: days(-3).toISOString(), endsAt: days(-1).toISOString() });
  assert.equal(ended.windowStatus, 'ended');
  const open = await sheet({ title: 'Now', endsAt: days(1).toISOString() });
  assert.equal(open.windowStatus, 'open', 'An end without a start is open until the end');

  await assert.rejects(updateQuest(admin, undefined, upcoming.id, { endsAt: days(0.5).toISOString() }), /after the start time/, 'Edits are checked against the stored start');
  const cleared = await updateQuest(admin, undefined, upcoming.id, { startsAt: null, endsAt: null });
  assert.deepEqual([cleared.startsAt, cleared.endsAt, cleared.windowStatus], [null, null, 'open'], 'Clearing both fields removes the window');
  assert.equal((await getAdminQuest(admin, undefined, ended.id)).windowStatus, 'ended');
  assert.deepEqual(questWindow({ startsAt: days(-1), endsAt: days(1) }, now).status, 'open');
});

test('students cannot start or open a sheet before it opens or after it ends', async () => {
  const upcoming = await sheet({ title: 'Opens tomorrow', startsAt: days(1).toISOString() });
  const ended = await sheet({ title: 'Ended yesterday', startsAt: days(-5).toISOString(), endsAt: days(-1).toISOString() });
  const key = `coding:local:${problems[0]._id}`;

  await assert.rejects(startQuest(student, upcoming.slug, now), (error) => error.status === 403 && /opens on/.test(error.message));
  await assert.rejects(recordQuestView(student, upcoming.slug, key, now), (error) => error.status === 403);
  await assert.rejects(startQuest(student, ended.slug, now), (error) => error.status === 403 && /ended on/.test(error.message));
  await assert.rejects(recordQuestView(student, ended.slug, key, now), (error) => error.status === 403);
  assert.equal(await QuestEnrollment.countDocuments({}), 0, 'Nothing was enrolled outside the window');

  const before = (await getStudentQuest(student, upcoming.slug, now)).quest;
  assert.deepEqual([before.windowStatus, before.items.length, before.total], ['upcoming', 0, 2], 'An upcoming sheet lists no questions to attempt yet');
  const afterEnd = (await getStudentQuest(student, ended.slug, now)).quest;
  assert.deepEqual([afterEnd.windowStatus, afterEnd.items.length], ['ended', 2], 'An ended sheet stays viewable');

  // Inside the window the same calls work.
  const started = (await startQuest(student, upcoming.slug, days(1.5))).quest;
  assert.ok(started.started);
});

test('only solves inside the window count, so completion, XP and the badge respect it', async () => {
  const quest = await sheet({ startsAt: days(-10).toISOString(), endsAt: days(-2).toISOString() });
  await solve(student, problems[0], days(-12)); // before the start: does not count
  await solve(student, problems[0], days(-1)); // after the end: does not count
  await startQuest(student, quest.slug, days(-9));
  let view = (await getStudentQuest(student, quest.slug, now)).quest;
  assert.deepEqual([view.solved, view.completedAt], [0, null], 'Solves outside the window are ignored');
  assert.equal(view.items[0].status, 'none');

  await solve(student, problems[0], days(-8));
  await solve(student, problems[1], days(-3));
  // The sheet is settled only after its end (the student opens it later): still completed, dated at the end.
  view = (await getStudentQuest(student, quest.slug, now)).quest;
  assert.equal(view.solved, 2);
  assert.equal(new Date(view.completedAt).getTime(), days(-2).getTime(), 'Completion is dated no later than the end');
  const rewards = await EngagementReward.find({ ...engagementScope(student), kind: 'quest' }).lean();
  assert.deepEqual(rewards.map((reward) => reward.points), [40]);

  const insight = await questInsights(admin, quest.id);
  assert.deepEqual(insight.students.map((row) => [row.name, row.solved, row.email]), [['Aditi Sharma', 2, 'aditi@example.edu']]);

  // Prep Analysis reads the same rule through cohortQuestProgress when it names the sheet.
  const definitions = await Quest.find({}).lean();
  const progress = await cohortQuestProgress([String(peer._id)], definitions);
  await solve(peer, problems[0], days(-1));
  const later = await cohortQuestProgress([String(peer._id)], definitions);
  const keys = later.sheets.get(quest.id).keys;
  assert.equal(keys.filter((key) => later.isSolved(peer._id, key, quest.id)).length, 0, 'A solve after the end does not count for the sheet');
  assert.equal(keys.filter((key) => later.isSolved(peer._id, key)).length, 1, 'Without a sheet id the answer is window-free');
  assert.equal(progress.sheets.get(quest.id).window.windowed, true);
});

test('a solve after the end never completes a sheet that was still open', async () => {
  const quest = await sheet({ endsAt: days(-1).toISOString(), items: [item(problems[0])] });
  await startQuest(student, quest.slug, days(-2));
  await solve(student, problems[0], days(-0.5));
  const view = (await getStudentQuest(student, quest.slug, now)).quest;
  assert.deepEqual([view.solved, view.completedAt, view.windowStatus], [0, null, 'ended']);
  assert.equal(await EngagementReward.countDocuments({ kind: 'quest' }), 0, 'No XP for solves after the end');
  assert.equal(await Notification.countDocuments({ type: 'QUEST' }), 0, 'No completion notification');
});

test('sheets without a window behave as before and students see open, then upcoming, then ended', async () => {
  await sheet({ title: 'Ended', startsAt: days(-5).toISOString(), endsAt: days(-1).toISOString() });
  await sheet({ title: 'Upcoming', startsAt: days(2).toISOString() });
  await sheet({ title: 'Always' });
  await sheet({ title: 'Open window', startsAt: days(-1).toISOString(), endsAt: days(3).toISOString() });
  await solve(student, problems[0], days(-30));
  const { quests } = await listStudentQuests(student, now);
  assert.deepEqual(quests.map((quest) => [quest.title, quest.windowStatus]).slice(2), [['Upcoming', 'upcoming'], ['Ended', 'ended']]);
  assert.deepEqual(quests.slice(0, 2).map((quest) => quest.title).sort(), ['Always', 'Open window']);
  const always = quests.find((quest) => quest.title === 'Always');
  assert.equal(always.solved, 1, 'A sheet without a window counts any earlier solve, exactly as before');
  assert.equal(quests.find((quest) => quest.title === 'Open window').solved, 0, 'A windowed sheet ignores the solve made before it opened');
  // The dashboard resume card only offers sheets that can be worked on now.
  await recordQuestView(student, always.slug, `coding:local:${problems[1]._id}`, now);
  assert.equal((await latestQuestResume(student)).title, 'Always');
});

test('Insights: the period filters starts and completions, and the student table searches name, email and ID', async () => {
  const quest = await sheet({ items: [item(problems[0])] });
  await solve(student, problems[0], days(-40));
  await startQuest(student, quest.slug, days(-40)); // completes at once, 40 days ago
  await recordQuestView(peer, quest.slug, `coding:local:${problems[0]._id}`, days(-2));

  const all = await questOverview({});
  assert.deepEqual([all.totals.started, all.totals.completed], [2, 1]);
  const recent = await questOverview({ range: '30d' });
  assert.deepEqual([recent.totals.started, recent.totals.completed, recent.quests[0].stats.enrolled], [1, 0, 1], 'Only activity inside the last 30 days counts');
  const custom = await questOverview({ range: 'custom', from: days(-45).toISOString(), to: days(-35).toISOString() });
  assert.deepEqual([custom.totals.started, custom.totals.completed], [1, 1]);
  await assert.rejects(questOverview({ range: 'custom', from: days(-1).toISOString(), to: days(-5).toISOString() }), /start before it ends/);
  assert.equal(questRange({ range: 'custom', to: '2026-11-13' }).to.toISOString(), '2026-11-13T23:59:59.999Z', 'A bare end day covers the whole day');

  const everyone = await questStudents({});
  assert.deepEqual(everyone.students.map((row) => row.name), ['Aditi Sharma', 'Ravi Kumar'], 'Most completions first');
  assert.deepEqual((await questStudents({ search: 'ravi@' })).students.map((row) => row.name), ['Ravi Kumar'], 'Email search');
  assert.deepEqual((await questStudents({ search: 'ge-101' })).students.map((row) => row.name), ['Aditi Sharma'], 'Student ID search, any case');
  assert.deepEqual((await questStudents({ search: 'sharma' })).students.map((row) => [row.name, row.rollNumber, row.completed, row.progress]), [['Aditi Sharma', 'GE-101', 1, 100]]);
  assert.equal((await questStudents({ search: '.*' })).pagination.total, 0, 'Search text is literal, not a pattern');
  assert.deepEqual((await questStudents({ range: '30d' })).students.map((row) => row.name), ['Ravi Kumar']);
  const paged = await questStudents({ limit: 1, page: 2, sort: 'name', dir: 'asc' });
  assert.deepEqual([paged.students.map((row) => row.name), paged.pagination.total, paged.pagination.pages], [['Ravi Kumar'], 2, 2]);
});

test('the QuickPrep picker accepts comma-separated numbers and names, in typed order, and names unmatched terms', async () => {
  const result = await searchQuestLibrary({ search: '2, two sum, 999' });
  assert.deepEqual(result.items.map((entry) => entry.title), ['Valid Anagram', 'Two Sum']);
  assert.deepEqual([result.searchTerms, result.unmatchedTerms], [['2', 'two sum', '999'], ['999']]);
  const single = await searchQuestLibrary({ search: 'two' });
  assert.deepEqual([single.items.map((entry) => entry.title), single.unmatchedTerms], [['Two Sum'], undefined], 'One term behaves as before');
});

test('the staff report lists a student’s sheets with window, progress and dates; coordinators see only their students', async () => {
  const open = await sheet({ title: 'Open sheet' });
  const ended = await sheet({ title: 'Ended sheet', startsAt: days(-6).toISOString(), endsAt: days(-1).toISOString() });
  await sheet({ title: 'Upcoming sheet', startsAt: days(3).toISOString() });
  await solve(student, problems[0], days(-3));
  await startQuest(student, ended.slug, days(-4));
  await startQuest(student, open.slug, now);
  await solve(student, problems[1], now);

  const report = await studentQuickPrepReport(admin, String(student._id), now);
  assert.equal(report.enabled, true);
  const byTitle = Object.fromEntries(report.sheets.map((row) => [row.title, row]));
  assert.deepEqual([byTitle['Open sheet'].solved, byTitle['Open sheet'].total, byTitle['Open sheet'].windowStatus, byTitle['Open sheet'].state], [2, 2, 'open', 'in-progress']);
  assert.deepEqual([byTitle['Ended sheet'].solved, byTitle['Ended sheet'].windowStatus], [1, 'ended'], 'The solve after the end does not count');
  assert.deepEqual([byTitle['Upcoming sheet'].started, byTitle['Upcoming sheet'].windowStatus], [false, 'upcoming']);
  assert.deepEqual([report.summary.started, report.summary.available, report.summary.averageProgress], [2, 3, 75]);

  const coordinator = { _id: oid(), role: 'coordinator', coordinatorId: 'T-9', coordinatorDataScope: 'own' };
  await assert.rejects(studentQuickPrepReport(coordinator, String(student._id), now), /Student not found/);
  await User.updateOne({ _id: student._id }, { $set: { teacherIds: ['T-9'] } });
  assert.equal((await studentQuickPrepReport(coordinator, String(student._id), now)).sheets.length, 3);
  await assert.rejects(studentQuickPrepReport(admin, 'nope', now), /Student not found/);
});
