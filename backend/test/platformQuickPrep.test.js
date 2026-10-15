import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Problem from '../src/models/Problem.js';
import QuestionLibrary from '../src/models/QuestionLibrary.js';
import QuestionPracticeAttempt from '../src/models/QuestionPracticeAttempt.js';
import Submission from '../src/models/Submission.js';
import Notification from '../src/models/Notification.js';
import { University } from '../src/platform/models.js';
import { adaptiveModels, EngagementReward, Quest, QuestEnrollment, StudentBadge } from '../src/models/AdaptiveEngagement.js';
import { CENTRAL_QUESTION_FILTER } from '../src/platform/centralQuestions.js';
import { resetSharedQuestCache } from '../src/platform/sharedContent.js';
import {
  addQuestLibraryItems, createQuest, getStudentQuest, latestQuestResume, listAdminQuests, listStudentQuests, publishedQuestDefinitions, questInsights, questionQuickPreps,
  recordQuestView, removeQuest, searchQuestLibrary, startQuest, updateQuest,
} from '../src/services/questService.js';

// Test-owned in-memory database and a stubbed central service only; no .env, network or real accounts.
const ENV_KEYS = ['PEERPREP_DEPLOYMENT_ROLE', 'PEERPREP_UNIVERSITY_ID', 'PEERPREP_CONTROL_URL', 'PEERPREP_SHARED_API_KEY'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const savedFetch = globalThis.fetch;
const oid = () => new mongoose.Types.ObjectId();
const models = [User, Problem, QuestionLibrary, QuestionPracticeAttempt, Submission, Notification, University, ...adaptiveModels];
let mongo, admin, problems, rows;

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongo.getUri(), { dbName: 'platform_quickprep' });
  await Promise.all(models.map((model) => model.init()));
});
beforeEach(async () => {
  await Promise.all(models.map((model) => model.deleteMany({})));
  resetSharedQuestCache();
  asControl();
  admin = { _id: oid(), role: 'admin' };
  problems = [oid(), oid(), oid()].map((_id, index) => ({ _id, title: `Problem ${index}`, difficulty: 'Easy', status: 'published', visibility: 'public' }));
  await Problem.collection.insertMany(problems);
  const row = (key, extra = {}) => ({ _id: oid(), sourceKey: key, sourceType: 'compiler', questionType: 'coding', questionText: key, difficulty: 'Easy', tags: ['Array'],
    status: 'published', visibility: 'public', updatedAt: new Date(), ...extra });
  rows = {
    twoSum: row('Two Sum', { sourceProblemId: problems[0]._id }),
    anagram: row('Valid Anagram', { sourceProblemId: problems[1]._id, difficulty: 'Medium' }),
    draft: row('Draft Row', { sourceProblemId: problems[2]._id, status: 'draft' }),
    privateRow: row('Private Row', { sourceProblemId: problems[2]._id, visibility: 'private' }),
    examRow: row('Exam Row', { sourceProblemId: problems[2]._id, sourceType: 'assessment' }),
    unlinked: row('Unlinked Row', { sourceType: 'manual' }),
    mcq: row('MCQ Row', { questionType: 'mcq' }),
  };
  await QuestionLibrary.collection.insertMany(Object.values(rows));
});
after(async () => {
  await mongoose.disconnect(); await mongo?.stop();
  globalThis.fetch = savedFetch;
  for (const key of ENV_KEYS) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
});

function asControl() {
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'control';
  delete process.env.PEERPREP_UNIVERSITY_ID;
  globalThis.fetch = async () => { throw new Error('Unexpected external request'); };
}
/** A university whose central service serves the given QuickPrep feed and shared questions. */
function asUniversity(central) {
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'university';
  process.env.PEERPREP_UNIVERSITY_ID = 'test-campus';
  process.env.PEERPREP_CONTROL_URL = 'http://127.0.0.1';
  process.env.PEERPREP_SHARED_API_KEY = 'k'.repeat(40);
  resetSharedQuestCache();
  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/quests') && central.down) throw new Error('connection refused');
    const body = path.endsWith('/policy') ? { active: true, permissions: { questions: true }, sources: {} }
      : path.endsWith('/quests') ? { quests: central.quests } : path.endsWith('/questions') ? { questions: central.questions } : {};
    return { ok: true, json: async () => structuredClone(body) };
  };
}
const ids = (...names) => names.map((name) => String(rows[name]._id));

async function publishCentralQuickPrep(overrides = {}) {
  const quest = await createQuest(admin, undefined, { title: 'Central Arrays', category: 'topic', rewardXp: 40, items: [], ...overrides });
  await addQuestLibraryItems(admin, quest.id, ids('twoSum', 'anagram'));
  return updateQuest(admin, undefined, quest.id, { status: 'published' });
}

test('the super admin builds QuickPreps only from central questions, under the ids universities know them by', async () => {
  await assert.rejects(createQuest(admin, undefined, { title: 'Local pick', items: [{ source: 'university', problemId: String(problems[0]._id) }] }), /central library/);
  const quest = await createQuest(admin, undefined, { title: 'Central Arrays', items: [] });
  assert.deepEqual([quest.central, quest.audience], [true, null], 'No students live on the central platform');
  const result = await addQuestLibraryItems(admin, quest.id, ids('twoSum', 'anagram', 'draft', 'privateRow', 'examRow', 'unlinked', 'mcq'));
  assert.equal(result.added, 2);
  assert.deepEqual(result.quest.items.map((item) => [item.source, item.problemId]), [['shared', String(rows.twoSum._id)], ['shared', String(rows.anagram._id)]]);
  assert.deepEqual(result.skipped.map((entry) => [entry.title, entry.reason]), [
    ['Draft Row', 'question_draft'], ['Private Row', 'question_private'], ['Exam Row', 'assessment_only'], ['Unlinked Row', 'no_linked_problem'], ['MCQ Row', 'not_coding'],
  ]);
  assert.deepEqual((await searchQuestLibrary({})).items.map((item) => item.source), ['shared', 'shared'], 'The picker offers only what universities receive');

  await updateQuest(admin, undefined, quest.id, { status: 'published' });
  const feed = await publishedQuestDefinitions();
  assert.equal(feed.length, 1);
  assert.equal(feed[0].createdBy, undefined, 'The feed carries definitions, not authors');
  await updateQuest(admin, undefined, quest.id, { status: 'draft' });
  assert.deepEqual(await removeQuest(admin, undefined, quest.id), { archived: true }, 'Once published, universities may hold progress, so it is archived');
});

test('universities receive every published QuickPrep, cannot author, and keep student progress local', async () => {
  const published = await publishCentralQuickPrep({ semesters: [3] });
  const central = {
    quests: JSON.parse(JSON.stringify(await publishedQuestDefinitions())),
    questions: JSON.parse(JSON.stringify(await QuestionLibrary.find(CENTRAL_QUESTION_FILTER).lean())),
  };
  // The university database has no central documents, only a stray local one that must be ignored.
  await Quest.deleteMany({});
  await Quest.create({ tenantKey: 'university:test-campus', slug: 'local-set', title: 'Local Set', status: 'published', publishedAt: new Date(), items: [{ source: 'university', problemId: problems[0]._id }] });
  asUniversity(central);

  await assert.rejects(createQuest(admin, undefined, { title: 'Campus set', items: [] }), /managed by the super admin/);
  await assert.rejects(listAdminQuests(), /managed by the super admin/);
  await assert.rejects(questInsights(admin, published.id), /managed by the super admin/);

  const student = { _id: oid(), role: 'student', accessScope: 'full', semester: 3, name: 'Aditi' };
  const otherSemester = { _id: oid(), role: 'student', accessScope: 'full', semester: 5 };
  await User.collection.insertMany([student, otherSemester]);
  const { quests } = await listStudentQuests(student);
  assert.deepEqual(quests.map((quest) => [quest.title, quest.total]), [['Central Arrays', 2]], 'Only the central QuickPrep is shown');
  assert.deepEqual((await listStudentQuests(otherSemester)).quests, [], 'Semester targeting still applies');

  await QuestionPracticeAttempt.collection.insertMany(['twoSum', 'anagram'].map((name) => ({ studentId: student._id, source: 'shared', questionType: 'coding', questionId: rows[name]._id, result: 'correct', createdAt: new Date() })));
  const done = (await startQuest(student, published.slug)).quest;
  assert.ok(done.completedAt, 'Solving the shared questions completes it');
  await startQuest(student, published.slug);
  assert.deepEqual((await EngagementReward.find({ kind: 'quest' }).lean()).map((reward) => [reward.tenantKey, reward.points]), [['university:test-campus', 40]], 'XP is awarded once, locally');
  assert.ok(await StudentBadge.exists({ studentId: student._id, badgeId: `quest-${published.id}` }));

  // If only the QuickPrep feed fails while the rest of the central service answers, the last good copy is served.
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 120_000;
    central.down = true;
    assert.equal((await listStudentQuests(student)).quests.length, 1);
  } finally { Date.now = realNow; }
});

test('the central QuickPrep feed needs a valid university key, the coding module, and serves published sets only', async () => {
  await publishCentralQuickPrep();
  await createQuest(admin, undefined, { title: 'Still drafting', items: [] });
  const express = (await import('express')).default;
  const router = (await import('../src/platform/routes.js')).default;
  const app = express(); app.use(express.json()); app.use(router);
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  globalThis.fetch = savedFetch;
  try {
    const key = 'only-a-local-test-key-123456789012345';
    const campus = await University.create({ universityId: 'campus-a', name: 'Campus A', apiKeyHash: crypto.createHash('sha256').update(key).digest('hex'),
      permissions: { questions: true }, sources: { questions: 'shared', learning: 'university' } });
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { 'X-PeerPrep-University': 'campus-a', 'X-PeerPrep-Key': key };
    assert.equal((await fetch(`${base}/tenant/quests`)).status, 401);
    assert.equal((await fetch(`${base}/tenant/quests`, { headers: { ...headers, 'X-PeerPrep-Key': 'x'.repeat(40) } })).status, 401);
    const response = await fetch(`${base}/tenant/quests`, { headers });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).quests.map((quest) => quest.title), ['Central Arrays'], 'Drafts are never delivered');
    await University.updateOne({ _id: campus._id }, { $set: { 'permissions.questions': false } });
    assert.equal((await fetch(`${base}/tenant/quests`, { headers })).status, 403, 'Without coding, a university receives no QuickPreps');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('a central QuickPrep saved before the central rule can still be archived, and its local ids never reach universities', async () => {
  const legacy = await Quest.create({ tenantKey: 'standalone', slug: 'legacy-set', title: 'Legacy Set', status: 'published', publishedAt: new Date(),
    items: [{ source: 'university', problemId: problems[0]._id }, { source: 'shared', problemId: rows.twoSum._id }] });
  const [definition] = await publishedQuestDefinitions();
  assert.deepEqual(definition.items.map((item) => item.source), ['shared'], 'Only central questions are delivered');
  const archived = await updateQuest(admin, undefined, String(legacy._id), { status: 'archived' });
  assert.equal(archived.status, 'archived');
  assert.deepEqual(archived.items.map((item) => item.available), [false, true], 'The old local item stays listed as unavailable');
  await assert.rejects(addQuestLibraryItems(admin, String(legacy._id), []), /Select at least one/);
  await assert.rejects(updateQuest(admin, undefined, String(legacy._id), { items: [{ source: 'university', problemId: String(problems[1]._id) }] }), /central library/, 'New local picks are still refused');
});

test('the dashboard resume card skips QuickPreps the student can no longer see', async () => {
  const published = await publishCentralQuickPrep();
  const central = { quests: JSON.parse(JSON.stringify(await publishedQuestDefinitions())), questions: JSON.parse(JSON.stringify(await QuestionLibrary.find(CENTRAL_QUESTION_FILTER).lean())) };
  await Quest.deleteMany({});
  asUniversity(central);
  const student = { _id: oid(), role: 'student', accessScope: 'full', semester: 3 };
  await User.collection.insertOne(student);
  await recordQuestView(student, published.slug, `coding:shared:${rows.twoSum._id}`);
  // A retired local QuickPrep opened more recently must not hide the central one in progress.
  await QuestEnrollment.collection.insertOne({ tenantKey: 'university:test-campus', studentId: student._id, questId: oid(), startedAt: new Date(), lastViewedAt: new Date(Date.now() + 60_000), completedAt: null, solvedCount: 0, totalCount: 3 });
  const resume = await latestQuestResume(student);
  assert.equal(resume?.title, 'Central Arrays');
  assert.equal(resume.href, `/problems/shared/${rows.twoSum._id}?quest=${published.slug}&item=${encodeURIComponent(`coding:shared:${rows.twoSum._id}`)}`);
});

test('off a university, central QuickPrep questions open, are credited and show membership through their linked problems', async () => {
  const published = await publishCentralQuickPrep();
  const student = { _id: oid(), role: 'student', accessScope: 'full', semester: 3 };
  await User.collection.insertOne(student);
  const { items } = (await getStudentQuest(student, published.slug)).quest;
  // There is no shared feed here, so /problems/shared/<row> would 404 ("Problem unavailable").
  assert.deepEqual(items.map((item) => [item.key, item.routeId, item.href]), [
    [`coding:shared:${rows.twoSum._id}`, String(problems[0]._id), `/problems/${problems[0]._id}?quest=${published.slug}&item=${encodeURIComponent(`coding:shared:${rows.twoSum._id}`)}`],
    [`coding:shared:${rows.anagram._id}`, String(problems[1]._id), `/problems/${problems[1]._id}?quest=${published.slug}&item=${encodeURIComponent(`coding:shared:${rows.anagram._id}`)}`],
  ]);

  await Submission.collection.insertMany([
    { user: student._id, problem: problems[0]._id, mode: 'submit', status: 'AC', language: 'c', createdAt: new Date() },
    { user: student._id, problem: problems[1]._id, mode: 'run', status: 'WA', language: 'c', createdAt: new Date() },
  ]);
  assert.deepEqual((await getStudentQuest(student, published.slug)).quest.items.map((item) => item.status), ['solved', 'attempted']);
  await recordQuestView(student, published.slug, `coding:shared:${rows.anagram._id}`);
  assert.equal((await latestQuestResume(student)).href, `/problems/${problems[1]._id}?quest=${published.slug}&item=${encodeURIComponent(`coding:shared:${rows.anagram._id}`)}`);

  const sheets = await questionQuickPreps(student, 'university', problems[0]._id);
  assert.deepEqual(sheets.map((sheet) => [sheet.slug, sheet.href, sheet.started, sheet.total]), [[published.slug, `/student/quickprep/${published.slug}`, true, 2]]);
  assert.deepEqual(await questionQuickPreps(student, 'university', problems[2]._id), [], 'Draft, private and exam rows put a problem in no sheet');

  // A standalone install holding these central rows (and an older local pick) shows every question too.
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
  await Quest.updateOne({ slug: published.slug }, { $push: { items: { source: 'university', problemId: problems[2]._id } } });
  assert.deepEqual((await getStudentQuest(student, published.slug)).quest.items.map((item) => item.href.split('?')[0]),
    [`/problems/${problems[0]._id}`, `/problems/${problems[1]._id}`, `/problems/${problems[2]._id}`]);
});

test('a failing QuickPrep lookup never breaks the problem page that shows membership', async () => {
  const student = { _id: oid(), role: 'student', accessScope: 'full', semester: 3 };
  asUniversity({ quests: [], questions: [], down: true });
  const savedWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    assert.deepEqual(await questionQuickPreps(student, 'shared', rows.twoSum._id), []);
  } finally { console.warn = savedWarn; }
  assert.match(warnings.join('\n'), /QuickPrep\] Membership lookup failed/);
});