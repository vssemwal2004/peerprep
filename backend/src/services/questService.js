import mongoose from 'mongoose';
import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import QuestionPracticeAttempt from '../models/QuestionPracticeAttempt.js';
import { Quest, QuestEnrollment, StudentBadge, EngagementReward } from '../models/AdaptiveEngagement.js';
import { engagementScope, createAchievement } from './adaptiveEngagementService.js';
import { engagementTenant, engagementPermissions } from './engagementPolicyService.js';
import { getSharedCodingCatalog, invalidateChallengeRanking, publicProblemMatch } from './studentDashboardService.js';
import { notifyOnce } from './notificationService.js';
import { HttpError } from '../utils/errors.js';
import { isUniversity } from '../platform/deployment.js';

const ACCEPTED = ['AC', 'ACCEPTED', 'ACCEPT'];
const CATEGORIES = ['company', 'topic', 'study-plan', 'difficulty'];
const THEMES = ['sky', 'violet', 'emerald', 'amber', 'rose', 'indigo'];
const MAX_ITEMS = 300;
const objectId = (value) => new mongoose.Types.ObjectId(String(value));
const itemKey = (item) => `${item.source === 'shared' ? 'coding:shared' : 'coding:local'}:${item.problemId}`;
// Quests are built from the deployment's shared library, so they belong to the deployment, not to the college on
// the admin's account (admins usually have none). A university database holds one university; a standalone
// database is one catalog shared by every college in it.
const questTenant = () => engagementTenant({});
const questScope = () => (isUniversity() ? { tenantKey: questTenant() } : {});
const text = (value, max) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

export function slugify(title) {
  return text(title, 80).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-|-$/g, '') || 'quest';
}

// ---------------------------------------------------------------------------------------------
// Library: the questions a quest may use, read live so titles and difficulty never go stale.
// ---------------------------------------------------------------------------------------------

async function libraryIndex() {
  const [local, shared] = await Promise.all([
    Problem.find(publicProblemMatch).select('_id title difficulty tags companyTags displayOrder').maxTimeMS(8000).lean(),
    getSharedCodingCatalog(),
  ]);
  const entries = [
    ...local.map((problem) => ({ source: 'university', problemId: String(problem._id), title: problem.title, difficulty: problem.difficulty || 'Easy',
      tags: problem.tags || [], companies: problem.companyTags || [], order: Number(problem.displayOrder) || 2147483647, href: `/problems/${problem._id}` })),
    ...shared.map((question) => ({ source: 'shared', problemId: String(question._id),
      title: question.questionData?.problemDataSnapshot?.title || question.questionText, difficulty: question.difficulty || question.questionData?.problemDataSnapshot?.difficulty || 'Easy',
      tags: question.tags || [], companies: question.keywords || question.questionData?.problemDataSnapshot?.companyTags || [], order: Number(question.displayOrder) || 2147483647,
      href: `/problems/shared/${question._id}` })),
  ];
  return new Map(entries.map((entry) => [itemKey(entry), { ...entry, key: itemKey(entry) }]));
}

/** Admin question picker: search and filter the library, with topic and company facets. */
export async function searchQuestLibrary({ search = '', difficulty = '', topic = '', company = '', page = 1, limit = 30 } = {}) {
  const index = await libraryIndex();
  const query = text(search, 100).toLowerCase();
  const all = [...index.values()];
  const matches = all.filter((entry) => (!difficulty || entry.difficulty === difficulty)
    && (!topic || entry.tags.includes(topic))
    && (!company || entry.companies.some((name) => String(name).toLowerCase() === company.toLowerCase()))
    && (!query || [entry.title, ...entry.tags, ...entry.companies].some((value) => String(value).toLowerCase().includes(query))))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  const size = Math.min(100, Math.max(1, Number(limit) || 30));
  const current = Math.max(1, Number(page) || 1);
  const tally = (pick) => Object.entries(all.flatMap(pick).reduce((acc, value) => { acc[value] = (acc[value] || 0) + 1; return acc; }, {}))
    .map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 200);
  return {
    items: matches.slice((current - 1) * size, current * size).map(({ order, ...entry }) => entry),
    pagination: { page: current, limit: size, total: matches.length, pages: Math.max(1, Math.ceil(matches.length / size)) },
    facets: { topics: tally((entry) => entry.tags), companies: tally((entry) => entry.companies.map(String)) },
  };
}

// ---------------------------------------------------------------------------------------------
// Admin: create, edit, publish and archive quests for one university.
// ---------------------------------------------------------------------------------------------

async function validateQuest(input, index) {
  const title = text(input.title, 80);
  if (title.length < 3) throw new HttpError(400, 'Give the quest a title of at least 3 characters.');
  const category = CATEGORIES.includes(input.category) ? input.category : 'study-plan';
  const rewardXp = Number(input.rewardXp ?? 50);
  if (!Number.isInteger(rewardXp) || rewardXp < 0 || rewardXp > 1000) throw new HttpError(400, 'Reward XP must be a whole number from 0 to 1000.');
  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (!rawItems.length) throw new HttpError(400, 'Add at least one question to the quest.');
  if (rawItems.length > MAX_ITEMS) throw new HttpError(400, `A quest can hold up to ${MAX_ITEMS} questions.`);
  const seen = new Set();
  const items = rawItems.map((item) => {
    if (!['university', 'shared'].includes(item?.source) || !mongoose.isValidObjectId(item?.problemId)) throw new HttpError(400, 'One of the questions is not valid.');
    const normalized = { source: item.source, problemId: String(item.problemId), section: text(item.section, 60) };
    const key = itemKey(normalized);
    if (seen.has(key)) throw new HttpError(400, 'A question appears twice in this quest.');
    if (!index.has(key)) throw new HttpError(400, 'One of the questions is no longer published in the library.');
    seen.add(key);
    return normalized;
  });
  const semesters = [...new Set((Array.isArray(input.semesters) ? input.semesters : []).map(Number))].filter((value) => Number.isInteger(value) && value >= 1 && value <= 16).sort((a, b) => a - b);
  return {
    title, category, rewardXp, items, semesters,
    description: text(input.description, 600),
    company: text(input.company, 60),
    topics: [...new Set((Array.isArray(input.topics) ? input.topics : []).map((topic) => text(topic, 40)).filter(Boolean))].slice(0, 10),
    theme: THEMES.includes(input.theme) ? input.theme : 'sky',
    badgeTitle: text(input.badgeTitle, 60),
    status: ['draft', 'published', 'archived'].includes(input.status) ? input.status : 'draft',
  };
}

async function uniqueSlug(title, excludeId) {
  const base = slugify(title);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const slug = attempt ? `${base}-${attempt + 1}` : base;
    if (!await Quest.exists({ ...questScope(), slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function adminShape(quest, index, stats) {
  const items = quest.items.map((item) => ({ ...item, problemId: String(item.problemId), ...(index.get(itemKey(item)) || { title: 'Unavailable question', available: false }), available: index.has(itemKey(item)) }));
  return { id: String(quest._id), slug: quest.slug, title: quest.title, description: quest.description, category: quest.category, company: quest.company, topics: quest.topics,
    theme: quest.theme, rewardXp: quest.rewardXp, badgeTitle: quest.badgeTitle, semesters: quest.semesters, status: quest.status, publishedAt: quest.publishedAt,
    updatedAt: quest.updatedAt, items, questionCount: items.filter((item) => item.available).length,
    stats: stats || { enrolled: 0, completed: 0, averageProgress: 0 } };
}

async function questStats(questIds) {
  const rows = questIds.length ? await QuestEnrollment.aggregate([
    { $match: { questId: { $in: questIds } } },
    { $group: { _id: '$questId', enrolled: { $sum: 1 }, completed: { $sum: { $cond: [{ $ne: ['$completedAt', null] }, 1, 0] } },
      progress: { $avg: { $cond: [{ $gt: ['$totalCount', 0] }, { $divide: ['$solvedCount', '$totalCount'] }, 0] } } } },
  ]).option({ maxTimeMS: 8000 }) : [];
  return new Map(rows.map((row) => [String(row._id), { enrolled: row.enrolled, completed: row.completed, averageProgress: Math.round((row.progress || 0) * 100) }]));
}

export async function listAdminQuests() {
  const quests = await Quest.find({ ...questScope(), status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).limit(200).maxTimeMS(8000).lean();
  const [index, stats] = await Promise.all([libraryIndex(), questStats(quests.map((quest) => quest._id))]);
  return quests.map((quest) => adminShape(quest, index, stats.get(String(quest._id))));
}

export async function getAdminQuest(admin, college, id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Quest not found');
  const quest = await Quest.findOne({ _id: id, ...questScope() }).maxTimeMS(8000).lean();
  if (!quest) throw new HttpError(404, 'Quest not found');
  const [index, stats] = await Promise.all([libraryIndex(), questStats([quest._id])]);
  return adminShape(quest, index, stats.get(String(quest._id)));
}

export async function createQuest(admin, college, input) {
  const index = await libraryIndex();
  const fields = await validateQuest(input, index);
  const quest = await Quest.create({ ...fields, tenantKey: questTenant(), slug: await uniqueSlug(fields.title),
    publishedAt: fields.status === 'published' ? new Date() : null, createdBy: admin._id, updatedBy: admin._id });
  return adminShape(quest.toObject(), index);
}

export async function updateQuest(admin, college, id, input) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Quest not found');
  const existing = await Quest.findOne({ _id: id, ...questScope() }).maxTimeMS(8000).lean();
  if (!existing) throw new HttpError(404, 'Quest not found');
  const index = await libraryIndex();
  const fields = await validateQuest({ ...existing, ...input }, index);
  const slug = fields.title !== existing.title ? await uniqueSlug(fields.title, existing._id) : existing.slug;
  const publishedAt = fields.status === 'published' ? existing.publishedAt || new Date() : existing.publishedAt;
  const quest = await Quest.findOneAndUpdate({ _id: id, ...questScope() }, { $set: { ...fields, slug, publishedAt, updatedBy: admin._id } }, { new: true }).lean();
  const stats = await questStats([quest._id]);
  return adminShape(quest, index, stats.get(String(quest._id)));
}

/** Drafts nobody started are deleted; anything students touched is archived so history stays intact. */
export async function removeQuest(admin, college, id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Quest not found');
  const quest = await Quest.findOne({ _id: id, ...questScope() }).select('_id status').lean();
  if (!quest) throw new HttpError(404, 'Quest not found');
  if (quest.status === 'draft' && !await QuestEnrollment.exists({ questId: quest._id })) {
    await Quest.deleteOne({ _id: quest._id, ...questScope() });
    return { deleted: true };
  }
  await Quest.updateOne({ _id: quest._id, ...questScope() }, { $set: { status: 'archived', updatedBy: admin._id } });
  return { archived: true };
}

// ---------------------------------------------------------------------------------------------
// Students: browse, start, track and complete quests.
// ---------------------------------------------------------------------------------------------

async function requireCoding(student) {
  if (!(await engagementPermissions(student)).questions) throw new HttpError(403, 'Coding questions are not enabled for your university.');
}

const visibleFilter = (student) => ({ ...questScope(), status: 'published',
  ...(Number(student.semester) > 0 ? { $or: [{ semesters: { $size: 0 } }, { semesters: Number(student.semester) }] } : { semesters: { $size: 0 } }) });

/** Solved and attempted state for the given library keys, from verified submissions and attempts. */
async function questionStates(studentId, keys) {
  const local = keys.filter((key) => key.startsWith('coding:local:')).map((key) => objectId(key.split(':').at(-1)));
  const shared = keys.filter((key) => key.startsWith('coding:shared:')).map((key) => objectId(key.split(':').at(-1)));
  const [solvedLocal, triedLocal, solvedShared, triedShared] = await Promise.all([
    local.length ? Submission.distinct('problem', { user: studentId, problem: { $in: local }, mode: 'submit', assessmentId: null, status: { $in: ACCEPTED } }) : [],
    local.length ? Submission.distinct('problem', { user: studentId, problem: { $in: local }, assessmentId: null }) : [],
    shared.length ? QuestionPracticeAttempt.distinct('questionId', { studentId, source: 'shared', questionType: 'coding', questionId: { $in: shared }, result: 'correct' }) : [],
    shared.length ? QuestionPracticeAttempt.distinct('questionId', { studentId, source: 'shared', questionType: 'coding', questionId: { $in: shared } }) : [],
  ]);
  const states = new Map();
  for (const value of triedLocal) states.set(`coding:local:${value}`, 'attempted');
  for (const value of triedShared) states.set(`coding:shared:${value}`, 'attempted');
  for (const value of solvedLocal) states.set(`coding:local:${value}`, 'solved');
  for (const value of solvedShared) states.set(`coding:shared:${value}`, 'solved');
  return states;
}

const questBadge = (quest, total) => ({
  id: `quest-${quest._id}`, title: quest.badgeTitle || `${quest.title} Finisher`, category: 'quests', metric: 'quest', target: 1, minimumLevel: 1, rewardXp: quest.rewardXp,
  rarity: total > 50 ? 'Epic' : total > 15 ? 'Rare' : 'Uncommon', description: `Solve every question in the ${quest.title} quest.`,
});

/**
 * Completion is settled once per student and quest: the conditional update wins exactly once, so
 * XP, the quest badge, the celebration and the notification are issued a single time.
 */
async function settleEnrollment(scope, quest, enrollment, solved, total, now) {
  if (!enrollment) return enrollment;
  const counts = { solvedCount: solved, totalCount: total };
  if (enrollment.completedAt || !total || solved < total) {
    if (enrollment.solvedCount !== solved || enrollment.totalCount !== total) await QuestEnrollment.updateOne({ _id: enrollment._id }, { $set: counts });
    return { ...enrollment, ...counts };
  }
  const result = await QuestEnrollment.updateOne({ _id: enrollment._id, completedAt: null }, { $set: { ...counts, completedAt: now } });
  if (!result.modifiedCount) return { ...enrollment, ...counts, completedAt: enrollment.completedAt || now };
  const badge = questBadge(quest, total);
  try {
    const reward = await EngagementReward.updateOne({ ...scope, key: `quest:${quest._id}` }, { $setOnInsert: { points: quest.rewardXp, kind: 'quest', earnedAt: now } }, { upsert: true });
    if (reward.upsertedCount) invalidateChallengeRanking();
  } catch (error) { if (error.code !== 11000) throw error; }
  try { await StudentBadge.updateOne({ ...scope, badgeId: badge.id }, { $setOnInsert: { definition: badge, earnedAt: now, evidence: { questId: String(quest._id), total } } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  await createAchievement(scope, `badge:${badge.id}`, { type: 'badge', award: { ...badge, earned: true } });
  await notifyOnce({ userId: scope.studentId, dedupeKey: `quest:${scope.tenantKey}:${quest._id}`, type: 'QUEST', actionUrl: `/student/quests/${quest.slug}`, now,
    title: `Quest complete: ${quest.title}`, message: `All ${total} questions solved. +${quest.rewardXp} XP and the ${badge.title} badge.` }).catch(() => {});
  return { ...enrollment, ...counts, completedAt: now };
}

function studentCard(quest, index, states, enrollment) {
  const items = quest.items.map((item) => index.get(itemKey(item))).filter(Boolean);
  const solved = items.filter((item) => states.get(item.key) === 'solved').length;
  const difficulty = { Easy: 0, Medium: 0, Hard: 0 };
  for (const item of items) difficulty[item.difficulty] = (difficulty[item.difficulty] || 0) + 1;
  const last = enrollment?.lastProblemKey ? index.get(enrollment.lastProblemKey) : null;
  return {
    id: String(quest._id), slug: quest.slug, title: quest.title, description: quest.description, category: quest.category, company: quest.company,
    topics: quest.topics, theme: quest.theme, rewardXp: quest.rewardXp, badge: questBadge(quest, items.length),
    total: items.length, solved, difficulty, started: Boolean(enrollment), startedAt: enrollment?.startedAt || null,
    completedAt: enrollment?.completedAt || null, lastViewedAt: enrollment?.lastViewedAt || null,
    lastProblem: last ? { key: last.key, title: last.title, href: `${last.href}?quest=${encodeURIComponent(quest.slug)}` } : null,
  };
}

async function loadStudentQuests(student, filter = {}) {
  const scope = engagementScope(student);
  const quests = await Quest.find({ ...visibleFilter(student), ...filter }).sort({ publishedAt: -1, _id: -1 }).limit(100).maxTimeMS(8000).lean();
  const [index, enrollments] = await Promise.all([libraryIndex(),
    quests.length ? QuestEnrollment.find({ ...scope, questId: { $in: quests.map((quest) => quest._id) } }).maxTimeMS(8000).lean() : []]);
  const keys = [...new Set(quests.flatMap((quest) => quest.items.map(itemKey)).filter((key) => index.has(key)))];
  const states = await questionStates(scope.studentId, keys);
  return { scope, quests, index, states, enrollments: new Map(enrollments.map((row) => [String(row.questId), row])) };
}

export async function listStudentQuests(student, now = new Date()) {
  await requireCoding(student);
  const { scope, quests, index, states, enrollments } = await loadStudentQuests(student);
  const cards = [];
  for (const quest of quests) {
    let card = studentCard(quest, index, states, enrollments.get(String(quest._id)));
    if (!card.total) continue;
    if (card.started && !card.completedAt) {
      const settled = await settleEnrollment(scope, quest, enrollments.get(String(quest._id)), card.solved, card.total, now);
      card = { ...card, completedAt: settled.completedAt };
    }
    cards.push(card);
  }
  return { quests: cards };
}

async function findStudentQuest(student, slug) {
  const loaded = await loadStudentQuests(student, { slug: text(slug, 120) });
  const quest = loaded.quests[0];
  if (!quest) throw new HttpError(404, 'Quest not found');
  return { ...loaded, quest };
}

export async function getStudentQuest(student, slug, now = new Date()) {
  await requireCoding(student);
  const { scope, quest, index, states, enrollments } = await findStudentQuest(student, slug);
  let enrollment = enrollments.get(String(quest._id));
  const card = studentCard(quest, index, states, enrollment);
  if (enrollment && !enrollment.completedAt) enrollment = await settleEnrollment(scope, quest, enrollment, card.solved, card.total, now);
  const items = quest.items.map((item) => ({ item, entry: index.get(itemKey(item)) })).filter(({ entry }) => entry).map(({ item, entry }) => ({
    key: entry.key, source: entry.source, problemId: entry.problemId, title: entry.title, difficulty: entry.difficulty, tags: entry.tags.slice(0, 4),
    section: item.section || '', status: states.get(entry.key) || 'none', href: `${entry.href}?quest=${encodeURIComponent(quest.slug)}`,
  }));
  return { quest: { ...card, completedAt: enrollment?.completedAt || null, items } };
}

/** Starting records intent. If every question is already solved, the quest completes at once. */
export async function startQuest(student, slug, now = new Date()) {
  await requireCoding(student);
  const { scope, quest, index, states } = await findStudentQuest(student, slug);
  const card = studentCard(quest, index, states, null);
  if (!card.total) throw new HttpError(409, 'This quest has no questions available right now.');
  let enrollment;
  try {
    enrollment = await QuestEnrollment.findOneAndUpdate({ ...scope, questId: quest._id },
      { $setOnInsert: { startedAt: now, solvedCount: card.solved, totalCount: card.total } }, { upsert: true, new: true }).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    enrollment = await QuestEnrollment.findOne({ ...scope, questId: quest._id }).lean();
  }
  await settleEnrollment(scope, quest, enrollment, card.solved, card.total, now);
  return getStudentQuest(student, slug, now);
}

/** Opening a question from a quest starts the quest and remembers it for "Continue where you left off". */
export async function recordQuestView(student, slug, problemKey, now = new Date()) {
  await requireCoding(student);
  const { scope, quest, index } = await findStudentQuest(student, slug);
  const key = text(problemKey, 120);
  if (!quest.items.some((item) => itemKey(item) === key) || !index.has(key)) throw new HttpError(400, 'That question is not part of this quest.');
  const total = quest.items.filter((item) => index.has(itemKey(item))).length;
  await QuestEnrollment.updateOne({ ...scope, questId: quest._id },
    { $set: { lastProblemKey: key, lastViewedAt: now }, $setOnInsert: { startedAt: now, totalCount: total } }, { upsert: true });
  return { recorded: true };
}

/** The student's most recently viewed unfinished quest, for the dashboard's resume card. */
export async function latestQuestResume(student) {
  if (!(await engagementPermissions(student)).questions) return null;
  const scope = engagementScope(student);
  const enrollment = await QuestEnrollment.findOne({ ...scope, completedAt: null, lastViewedAt: { $ne: null } }).sort({ lastViewedAt: -1 }).maxTimeMS(8000).lean();
  if (!enrollment) return null;
  const quest = await Quest.findOne({ _id: enrollment.questId, ...visibleFilter(scope, student) }).maxTimeMS(8000).lean();
  if (!quest) return null;
  const index = await libraryIndex();
  const keys = quest.items.map(itemKey).filter((key) => index.has(key));
  if (!keys.length) return null;
  const states = await questionStates(scope.studentId, keys);
  const last = index.get(enrollment.lastProblemKey);
  return {
    id: `quest:${quest._id}`, type: 'quest', title: quest.title, subtitle: last ? last.title : `${keys.length} questions`,
    href: last ? `${last.href}?quest=${encodeURIComponent(quest.slug)}` : `/student/quests/${quest.slug}`, questHref: `/student/quests/${quest.slug}`,
    theme: quest.theme, solved: keys.filter((key) => states.get(key) === 'solved').length, total: keys.length,
    lastProblemTitle: last?.title || null, lastProblemDifficulty: last?.difficulty || null, updatedAt: enrollment.lastViewedAt,
  };
}
