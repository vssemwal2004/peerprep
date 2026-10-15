import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Problem from '../src/models/Problem.js';
import Submission from '../src/models/Submission.js';
import Notification from '../src/models/Notification.js';
import QuestionLibrary from '../src/models/QuestionLibrary.js';
import { adaptiveModels, EngagementReward, Quest, QuestEnrollment, StudentBadge } from '../src/models/AdaptiveEngagement.js';
import {
  createQuest, getStudentQuest, latestQuestResume, listAdminQuests, listStudentQuests, recordQuestView, removeQuest,
  searchQuestLibrary, slugify, startQuest, updateQuest, questTaxonomy, addQuestItems, addQuestLibraryItems, duplicateQuest, questInsights, questOverview,
  questionQuickPreps,
} from '../src/services/questService.js';
import { refreshAdaptiveEngagement, engagementScope } from '../src/services/adaptiveEngagementService.js';

// Test-owned in-memory database only; no backend .env, network or real accounts are used.
const at = new Date('2026-10-15T08:00:00Z');
const oid = () => new mongoose.Types.ObjectId();
const models = [User, Problem, Submission, Notification, QuestionLibrary, ...adaptiveModels];
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
  assert.equal((await createQuest(admin, undefined, { title: 'Empty draft', items: [] })).questionCount, 0, 'Drafts can be saved before questions are added');
  await assert.rejects(createQuest(admin, undefined, { title: 'Empty', status: 'published', items: [] }), /before publishing/);
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
  assert.equal((await listAdminQuests(collegeAdmin)).length, 3, 'Quests belong to the deployment, not to the college on an admin account');

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
  assert.match(detail.items[0].href, /\?quest=amazon-top-3&item=coding%3Alocal%3A[0-9a-f]{24}$/, 'Questions open inside the quest, naming the item');
  await assert.rejects(getStudentQuest(student, 'draft-quest', at), /not found/);
});

test('question details can list every visible QuickPrep containing the question', async () => {
  const first = await publish();
  const second = await createQuest(admin, undefined, { title: 'Third semester sprint', status: 'published', semesters: [3], items: [item(problems[0])] });
  await createQuest(admin, undefined, { title: 'Hidden draft', status: 'draft', items: [item(problems[0])] });
  await createQuest(admin, undefined, { title: 'Final year only', status: 'published', semesters: [7], items: [item(problems[0])] });

  const memberships = await questionQuickPreps(student, 'university', problems[0]._id);
  assert.deepEqual(memberships.map((sheet) => sheet.title).sort(), ['Amazon Top 3', 'Third semester sprint']);
  assert.deepEqual(memberships.map((sheet) => sheet.href).sort(), [
    `/student/quickprep/${first.slug}`,
    `/student/quickprep/${second.slug}`,
  ].sort());
  assert.deepEqual(await questionQuickPreps(student, 'university', problems[3]._id), []);
  assert.deepEqual(await questionQuickPreps(student, 'unknown', problems[0]._id), []);
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
  assert.match(notices[0].title, /QuickPrep complete: Amazon Top 3/);
  assert.equal(notices[0].actionUrl, '/student/quickprep/amazon-top-3');

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
  await assert.rejects(recordQuestView(student, quest.slug, `coding:local:${problems[3]._id}`, at), /not part of this QuickPrep/);
  await recordQuestView(student, quest.slug, `coding:local:${problems[1]._id}`, at);
  const resume = await latestQuestResume(student);
  assert.equal(resume.type, 'quest');
  assert.equal(resume.title, 'Amazon Top 3');
  assert.equal(resume.lastProblemTitle, 'Valid Anagram');
  assert.equal(resume.href, `/problems/${problems[1]._id}?quest=amazon-top-3&item=${encodeURIComponent(`coding:local:${problems[1]._id}`)}`);
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

test('the builder offers only library companies and topics, and library picks join a draft once', async () => {
  const taxonomy = await questTaxonomy();
  assert.deepEqual(taxonomy.companies.map((entry) => [entry.name, entry.count]), [['Google', 2], ['Amazon', 1]], 'Only published questions count');
  assert.ok(taxonomy.topics.some((entry) => entry.name === 'Design' && entry.count === 1));
  assert.deepEqual(taxonomy.difficulties.map((entry) => entry.count), [2, 0, 1]);
  const picked = await searchQuestLibrary({ companies: 'Amazon,Google', difficulty: 'Easy,Hard' });
  assert.equal(picked.pagination.total, 3, 'Several companies or difficulties match any of them');

  const draft = await createQuest(admin, undefined, { title: 'Amazon prep', companies: ['Amazon', 'Google'], topics: ['Design'], items: [] });
  assert.deepEqual([draft.status, draft.companies, draft.company], ['draft', ['Amazon', 'Google'], 'Amazon']);
  const first = await addQuestItems(admin, draft.id, [item(problems[0]), item(problems[2])]);
  const again = await addQuestItems(admin, draft.id, [item(problems[2]), item(problems[1])]);
  assert.deepEqual([first.added, again.added, again.skipped], [2, 1, 1], 'Questions already in the QuickPrep are skipped');
  assert.deepEqual(again.quest.items.map((entry) => entry.title), ['Two Sum', 'LRU Cache', 'Valid Anagram'], 'New picks join the end');
  await assert.rejects(addQuestItems(admin, draft.id, [item(problems[3])]), /no longer published/);

  const copy = await duplicateQuest(admin, draft.id);
  assert.deepEqual([copy.title, copy.status, copy.questionCount, copy.slug], ['Amazon prep (copy)', 'draft', 3, 'amazon-prep-copy']);
});

test('admin insights show who started, how far each student got and how each question is going', async () => {
  const quest = await publish({ semesters: [3] });
  const peer = { _id: oid(), role: 'student', accessScope: 'full', name: 'Ravi', studentId: 'GE-2', semester: 3 };
  await User.collection.insertMany([peer, { _id: oid(), role: 'student', semester: 5 }]);
  await User.updateOne({ _id: student._id }, { $set: { name: 'Aditi', studentId: 'GE-1' } });
  await solve(problems[0], at);
  await solve(problems[1], at, { status: 'WA' });
  await startQuest(student, quest.slug, at);
  await recordQuestView(peer, quest.slug, `coding:local:${problems[0]._id}`, at);
  const insight = await questInsights(admin, quest.id);
  assert.equal(insight.summary.audience, 2, 'Semester 3 has two full-access students');
  assert.deepEqual([insight.summary.started, insight.summary.completed], [2, 0]);
  assert.deepEqual(insight.students.map((row) => [row.name, row.rollNumber, row.solved, row.attempted, row.progress]), [['Aditi', 'GE-1', 1, 1, 33], ['Ravi', 'GE-2', 0, 0, 0]]);
  assert.deepEqual(insight.questions.map((row) => [row.title, row.solvedBy, row.attemptedBy, row.solveRate]), [['Two Sum', 1, 0, 50], ['Valid Anagram', 0, 1, 0], ['LRU Cache', 0, 0, 0]]);
  const overview = await questOverview();
  assert.deepEqual([overview.totals.quickpreps, overview.totals.started, overview.leaders.length], [1, 2, 2]);
  assert.equal(overview.quests[0].audience, 2);
  assert.ok(await latestQuestResume(peer), 'A semester-targeted QuickPrep still appears in Continue where you left off');
});
test('Add to QuickPrep maps library rows to the problems students open and explains every skipped row', async () => {
  const assessmentOnly = { _id: oid(), title: 'Exam Only', difficulty: 'Medium', tags: [], companyTags: [], visibility: 'assessment', status: 'published' };
  await Problem.collection.insertOne(assessmentOnly);
  const row = (key, extra) => ({ _id: oid(), sourceKey: key, sourceType: 'compiler', questionType: 'coding', questionText: key, status: 'published', visibility: 'public', ...extra });
  const rows = {
    linked: row('linked', { sourceProblemId: problems[0]._id, sourceProblemTitle: 'Two Sum' }),
    viaData: row('via-data', { sourceType: 'manual', questionData: { problemId: problems[1]._id } }),
    draft: row('draft', { sourceProblemId: problems[3]._id }),
    examOnly: row('exam-only', { sourceType: 'assessment', sourceProblemId: assessmentOnly._id }),
    unlinked: row('unlinked', { sourceType: 'manual' }),
    mcq: row('mcq', { questionType: 'mcq' }),
    duplicate: row('duplicate', { sourceType: 'assessment', sourceProblemId: problems[0]._id }),
  };
  await QuestionLibrary.collection.insertMany(Object.values(rows));
  const draftQuest = await createQuest(admin, undefined, { title: 'Library picks', items: [item(problems[2])] });
  const ids = ['linked', 'viaData', 'draft', 'examOnly', 'unlinked', 'mcq', 'duplicate'].map((name) => String(rows[name]._id));
  // The review popup's dry run reports the same plan without writing anything.
  const preview = await addQuestLibraryItems(admin, draftQuest.id, [...ids, String(oid())], { dryRun: true });
  assert.deepEqual([preview.preview, preview.added, preview.currentTotal, preview.items.length], [true, 2, 1, 8]);
  assert.deepEqual(preview.items.filter((entry) => entry.ok).map((entry) => entry.title), ['Two Sum', 'via-data']);
  assert.ok(preview.items.filter((entry) => !entry.ok).every((entry) => entry.reason && entry.message));
  assert.equal((await Quest.findById(draftQuest.id).lean()).items.length, 1, 'A dry run writes nothing');
  const result = await addQuestLibraryItems(admin, draftQuest.id, [...ids, String(oid())]);
  assert.equal(result.added, 2);
  assert.deepEqual(result.quest.items.map((entry) => entry.title), ['LRU Cache', 'Two Sum', 'Valid Anagram'], 'Valid picks join the end in the order selected');
  assert.deepEqual(result.skipped.map((entry) => [entry.title, entry.reason]), [
    ['draft', 'problem_draft'], ['exam-only', 'problem_not_public'], ['unlinked', 'no_linked_problem'], ['mcq', 'not_coding'],
    ['duplicate', 'already_in'], ['Unknown question', 'not_found'],
  ]);
  assert.ok(result.skipped.every((entry) => entry.message), 'Every skip carries a readable reason');
  const again = await addQuestLibraryItems(admin, draftQuest.id, [String(rows.linked._id)]);
  assert.deepEqual([again.added, again.skipped[0].reason], [0, 'already_in'], 'Adding twice changes nothing');
  await assert.rejects(addQuestLibraryItems(admin, draftQuest.id, []), /Select at least one question/);
  // Students open and are credited on the linked problem, never on the library row id.
  assert.ok((await Quest.findById(draftQuest.id).lean()).items.every((entry) => !Object.values(rows).some((libraryRow) => String(libraryRow._id) === String(entry.problemId))));
});
test('overlapping library adds never duplicate a question or overfill, and odd links are skipped not fatal', async () => {
  const draftExam = { _id: oid(), title: 'Draft Exam', difficulty: 'Hard', tags: [], companyTags: [], visibility: 'assessment', status: 'draft' };
  await Problem.collection.insertOne(draftExam);
  const row = (key, extra) => ({ _id: oid(), sourceKey: key, sourceType: 'manual', questionType: 'coding', questionText: key, status: 'published', visibility: 'public', ...extra });
  const rows = [
    row('two-sum', { sourceProblemId: problems[0]._id }), row('anagram', { sourceProblemId: problems[1]._id }),
    row('numeric-link', { questionData: { problemId: 42 } }), row('draft-exam', { sourceProblemId: draftExam._id }),
  ];
  await QuestionLibrary.collection.insertMany(rows);
  const target = await createQuest(admin, undefined, { title: 'Race test', items: [] });
  const ids = rows.map((entry) => String(entry._id));
  const results = await Promise.all([addQuestLibraryItems(admin, target.id, ids), addQuestLibraryItems(admin, target.id, ids)]);
  const stored = (await Quest.findById(target.id).lean()).items.map((entry) => String(entry.problemId));
  assert.deepEqual(stored.sort(), [String(problems[0]._id), String(problems[1]._id)].sort(), 'Each question is stored once even when two adds overlap');
  assert.equal(results.reduce((sum, result) => sum + result.added, 0), 2);
  const reasons = Object.fromEntries(results[0].skipped.map((entry) => [entry.title, entry.reason]));
  assert.equal(reasons['numeric-link'], 'no_linked_problem', 'A non-ObjectId link is skipped instead of failing the whole batch');
  assert.equal(reasons['draft-exam'], 'problem_not_public', 'Visibility is reported before draft status');
  await assert.rejects(addQuestLibraryItems(admin, target.id, Array.from({ length: 1001 }, () => String(oid()))), /at most 1000/);
  await assert.rejects(addQuestLibraryItems(admin, String(oid()), ids), /not found/);
});
