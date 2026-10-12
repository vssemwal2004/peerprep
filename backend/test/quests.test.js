import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Problem from '../src/models/Problem.js';
import Submission from '../src/models/Submission.js';
import Notification from '../src/models/Notification.js';
import { adaptiveModels, EngagementReward, Quest, QuestEnrollment, StudentBadge } from '../src/models/AdaptiveEngagement.js';
import {
  createQuest, getStudentQuest, latestQuestResume, listAdminQuests, listStudentQuests, recordQuestView, removeQuest,
  searchQuestLibrary, slugify, startQuest, updateQuest,
} from '../src/services/questService.js';
import { refreshAdaptiveEngagement, engagementScope } from '../src/services/adaptiveEngagementService.js';

// Test-owned in-memory database only; no backend .env, network or real accounts are used.
const at = new Date('2026-10-15T08:00:00Z');
const oid = () => new mongoose.Types.ObjectId();
const models = [User, Problem, Submission, Notification, ...adaptiveModels];
const oldRole = process.env.PEERPREP_DEPLOYMENT_ROLE;
let mongo, admin, student, problems;

before(async () => {
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongo.getUri(), { dbName: 'quests_isolated' });
  await Promise.all(models.map((model) => model.init()));
});
beforeEach(async () => {
  await Promise.all(models.map((model) => model.deleteMany({})));
  // Like real admin accounts, the admin has no college; students do. Quests must still reach them.
  admin = { _id: oid(), role: 'admin' };
  student = { _id: oid(), role: 'student', accessScope: 'full', college: 'Test University', semester: 3 };
  await User.collection.insertMany([admin, student]);
  problems = ['Two Sum', 'Valid Anagram', 'LRU Cache', 'Draft Problem'].map((title, index) => ({ _id: oid(), title, difficulty: ['Easy', 'Easy', 'Hard', 'Medium'][index],
    tags: index < 2 ? ['Array', 'Hash Table'] : ['Design'], companyTags: index === 2 ? ['Amazon'] : ['Google'], visibility: 'public', status: index === 3 ? 'draft' : 'published', displayOrder: index + 1 }));
  await Problem.collection.insertMany(problems);
});
after(async () => {
  await mongoose.disconnect(); await mongo?.stop();
  if (oldRole === undefined) delete process.env.PEERPREP_DEPLOYMENT_ROLE; else process.env.PEERPREP_DEPLOYMENT_ROLE = oldRole;
});

const item = (problem, section = '') => ({ source: 'university', problemId: String(problem._id), section });
const solve = (problem, when, extra = {}) => Submission.collection.insertOne({ user: student._id, problem: problem._id, mode: 'submit', status: 'AC', language: 'python', createdAt: when, updatedAt: when, ...extra });
const publish = (overrides = {}) => createQuest(admin, undefined, { title: 'Amazon Top 3', category: 'company', company: 'Amazon', rewardXp: 60, status: 'published',
  items: [item(problems[0], 'Warm up'), item(problems[1], 'Warm up'), item(problems[2], 'Design')], ...overrides });

test('admins build quests only from published library questions, with clean slugs and validation', async () => {
  assert.equal(slugify('  Amazon: Top 50 (Hard)! '), 'amazon-top-50-hard');
  await assert.rejects(createQuest(admin, undefined, { title: 'Empty', items: [] }), /at least one question/);
  await assert.rejects(createQuest(admin, undefined, { title: 'Dup', items: [item(problems[0]), item(problems[0])] }), /appears twice/);
  await assert.rejects(createQuest(admin, undefined, { title: 'Draft', items: [item(problems[3])] }), /no longer published/);
  await assert.rejects(createQuest(admin, undefined, { title: 'Too generous', rewardXp: 5000, items: [item(problems[0])] }), /Reward XP/);
  await assert.rejects(createQuest(admin, undefined, { title: 'XP', items: [item(problems[0])] }), /at least 3 characters/);
  const first = await publish();
  const second = await publish();
  assert.equal(first.slug, 'amazon-top-3');
  assert.equal(second.slug, 'amazon-top-3-2', 'Slugs stay unique per university');
  assert.equal(first.questionCount, 3);
  assert.deepEqual(first.items.map((entry) => entry.title), ['Two Sum', 'Valid Anagram', 'LRU Cache'], 'Admin order is preserved');
  assert.ok(first.publishedAt);
  const collegeAdmin = { ...admin, _id: oid(), college: 'Another College' };
  assert.equal((await listAdminQuests(collegeAdmin)).length, 2, 'Quests belong to the deployment, not to the college on an admin account');

  const library = await searchQuestLibrary({ company: 'Amazon' });
  assert.deepEqual(library.items.map((entry) => entry.title), ['LRU Cache']);
  assert.ok(library.facets.topics.some((facet) => facet.name === 'Array' && facet.count === 2));
  assert.ok(!(await searchQuestLibrary({ search: 'Draft' })).items.length, 'Unpublished problems are not offered');
});

test('students see only published quests for their semester, with real progress', async () => {
  await publish();
  await createQuest(admin, undefined, { title: 'Draft quest', status: 'draft', items: [item(problems[0])] });
  await createQuest(admin, undefined, { title: 'Final year only', status: 'published', semesters: [7, 8], items: [item(problems[0])] });
  await createQuest(admin, undefined, { title: 'Third semester', status: 'published', semesters: [3], items: [item(problems[1])] });
  await solve(problems[0], at);
  const { quests } = await listStudentQuests(student, at);
  assert.deepEqual(quests.map((quest) => quest.title).sort(), ['Amazon Top 3', 'Third semester']);
  const amazon = quests.find((quest) => quest.title === 'Amazon Top 3');
  assert.deepEqual([amazon.solved, amazon.total, amazon.started], [1, 3, false]);
  assert.deepEqual(amazon.difficulty, { Easy: 2, Medium: 0, Hard: 1 });
  const detail = (await getStudentQuest(student, amazon.slug, at)).quest;
  assert.deepEqual(detail.items.map((entry) => [entry.title, entry.status, entry.section]), [['Two Sum', 'solved', 'Warm up'], ['Valid Anagram', 'none', 'Warm up'], ['LRU Cache', 'none', 'Design']]);
  assert.match(detail.items[0].href, /\?quest=amazon-top-3$/, 'Questions open inside the quest');
  await assert.rejects(getStudentQuest(student, 'draft-quest', at), /not found/);
});

test('finishing every question completes the quest once: XP, badge, celebration, notification and the quest badge tier', async () => {
  const quest = await publish();
  await solve(problems[0], at);
  await solve(problems[1], at, { status: 'WA' });
  let started = (await startQuest(student, quest.slug, at)).quest;
  assert.deepEqual([started.solved, started.total, started.completedAt], [1, 3, null], 'Earlier solves count once the quest is started');
  assert.equal(started.items[1].status, 'attempted');

  await solve(problems[1], new Date(at.getTime() + 60000));
  await solve(problems[2], new Date(at.getTime() + 120000));
  const done = new Date(at.getTime() + 180000);
  const results = await Promise.all(Array.from({ length: 5 }, () => getStudentQuest(student, quest.slug, done)));
  assert.ok(results.every((result) => result.quest.completedAt));
  const scope = engagementScope(student);
  const rewards = await EngagementReward.find({ ...scope, kind: 'quest' }).lean();
  assert.deepEqual(rewards.map((reward) => reward.points), [60]);
  assert.ok(await StudentBadge.exists({ ...scope, badgeId: `quest-${quest.id}` }));
  const notices = await Notification.find({ userId: student._id, type: 'QUEST' }).lean();
  assert.equal(notices.length, 1);
  assert.match(notices[0].title, /Quest complete: Amazon Top 3/);
  assert.equal(notices[0].actionUrl, '/student/quests/amazon-top-3');

  const progress = await refreshAdaptiveEngagement(student, new Date(done.getTime() + 1000));
  assert.ok(progress.badges.find((badge) => badge.id === 'quest-1').earned, 'Completing a quest counts toward the Quests badges');
  assert.ok(progress.badges.some((badge) => badge.id === `quest-${quest.id}` && badge.earned && badge.title === 'Amazon Top 3 Finisher'));
  assert.ok(progress.lifetime.points >= 60, 'Quest XP feeds the same XP and rank total');
});

test('a quest whose questions were all solved before starting completes the moment it starts', async () => {
  const quest = await publish({ items: [item(problems[0])], rewardXp: 10 });
  await solve(problems[0], at);
  const result = (await startQuest(student, quest.slug, at)).quest;
  assert.ok(result.completedAt);
  assert.equal(await EngagementReward.countDocuments({ kind: 'quest' }), 1);
  await startQuest(student, quest.slug, at);
  assert.equal(await QuestEnrollment.countDocuments({}), 1, 'Starting twice keeps one enrollment');
});

test('opening a quest question is remembered for the dashboard and only accepts that quest’s questions', async () => {
  const quest = await publish();
  await assert.rejects(recordQuestView(student, quest.slug, `coding:local:${problems[3]._id}`, at), /not part of this quest/);
  await recordQuestView(student, quest.slug, `coding:local:${problems[1]._id}`, at);
  const resume = await latestQuestResume(student);
  assert.equal(resume.type, 'quest');
  assert.equal(resume.title, 'Amazon Top 3');
  assert.equal(resume.lastProblemTitle, 'Valid Anagram');
  assert.equal(resume.href, `/problems/${problems[1]._id}?quest=amazon-top-3`);
  assert.deepEqual([resume.solved, resume.total], [0, 3]);
  assert.ok((await getStudentQuest(student, quest.slug, at)).quest.started, 'Opening a question starts the quest');
});

test('editing keeps the slug stable unless renamed; deleting a started quest archives it instead', async () => {
  const quest = await publish();
  const edited = await updateQuest(admin, undefined, quest.id, { description: 'Top Amazon questions' });
  assert.equal(edited.slug, quest.slug);
  const renamed = await updateQuest(admin, undefined, quest.id, { title: 'Amazon Essentials' });
  assert.equal(renamed.slug, 'amazon-essentials');
  await recordQuestView(student, renamed.slug, `coding:local:${problems[0]._id}`, at);
  assert.deepEqual(await removeQuest(admin, undefined, quest.id), { archived: true });
  assert.equal((await Quest.findById(quest.id).lean()).status, 'archived');
  assert.deepEqual((await listStudentQuests(student, at)).quests, [], 'Archived quests leave the student list');
  const draft = await createQuest(admin, undefined, { title: 'Scratch', items: [item(problems[0])] });
  assert.deepEqual(await removeQuest(admin, undefined, draft.id), { deleted: true });
});
