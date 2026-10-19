import mongoose from 'mongoose';
import Problem from '../models/Problem.js';
import User from '../models/User.js';
import QuestionLibrary from '../models/QuestionLibrary.js';
import Submission from '../models/Submission.js';
import QuestionPracticeAttempt from '../models/QuestionPracticeAttempt.js';
import { Quest, QuestEnrollment, StudentBadge, EngagementReward } from '../models/AdaptiveEngagement.js';
import { engagementScope, createAchievement } from './adaptiveEngagementService.js';
import { engagementTenant, engagementPermissions } from './engagementPolicyService.js';
import { getSharedCodingCatalog, publicProblemMatch } from './studentDashboardService.js';
import { notifyOnce } from './notificationService.js';
import { HttpError } from '../utils/errors.js';
import { isControlPlane, isUniversity } from '../platform/deployment.js';
import { sharedQuestions, sharedQuests } from '../platform/sharedContent.js';
import { CENTRAL_QUESTION_FILTER } from '../platform/centralQuestions.js';

const ACCEPTED = ['AC', 'ACCEPTED', 'ACCEPT'];
const CATEGORIES = ['company', 'topic', 'study-plan', 'difficulty'];
const THEMES = ['sky', 'violet', 'emerald', 'amber', 'rose', 'indigo'];
const MAX_ITEMS = 300;
const MAX_LIBRARY_PICK = 1000;
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

// Who may design QuickPreps: the super admin on the central platform, or the admin of a standalone install
// (which is its own catalog). University deployments only receive them from the central feed.
export const quickPrepAuthoringAllowed = () => !isUniversity();
function assertAuthor() {
  if (!quickPrepAuthoringAllowed()) throw new HttpError(403, 'QuickPreps are managed by the super admin.');
}

// On the central platform a QuickPrep may use only central library questions, under the same id universities
// see them by (the library row id), so students open and are credited on exactly that question.
const linkedProblemId = (row) => row.sourceProblemId || row.questionData?.problemId || row.questionData?.coding?.problemId
  || row.questionData?.problemDataSnapshot?._id || row.questionData?.problemDataSnapshot?.id || null;
async function centralLibraryIndex(problemFilter = {}) {
  const rows = await QuestionLibrary.find({ ...CENTRAL_QUESTION_FILTER, questionType: 'coding' })
    .select('questionText difficulty tags keywords displayOrder sourceProblemId questionData.problemId questionData.coding.problemId questionData.problemDataSnapshot._id questionData.problemDataSnapshot.id questionData.problemDataSnapshot.title questionData.problemDataSnapshot.difficulty questionData.problemDataSnapshot.companyTags')
    .maxTimeMS(8000).lean();
  // Universities judge through the linked problem, so a row without a real one is not offered.
  const linked = rows.map((row) => String(linkedProblemId(row) || '')).filter((id) => mongoose.isObjectIdOrHexString(id));
  const existing = new Set((linked.length ? await Problem.find({ ...problemFilter, _id: { $in: linked } }).select('_id').maxTimeMS(8000).lean() : []).map((problem) => String(problem._id)));
  const entries = rows.filter((row) => existing.has(String(linkedProblemId(row) || ''))).map((row) => ({
    source: 'shared', problemId: String(row._id), localProblemId: String(linkedProblemId(row)), title: row.questionData?.problemDataSnapshot?.title || row.questionText,
    difficulty: row.difficulty || row.questionData?.problemDataSnapshot?.difficulty || 'Easy', tags: row.tags || [],
    companies: row.keywords?.length ? row.keywords : row.questionData?.problemDataSnapshot?.companyTags || [],
    order: Number(row.displayOrder) || 2147483647, href: `/problems/shared/${row._id}`,
  }));
  return new Map(entries.map((entry) => [itemKey(entry), { ...entry, key: itemKey(entry) }]));
}

async function libraryIndex() {
  if (isControlPlane()) return centralLibraryIndex();
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

/**
 * The questions students can open from a QuickPrep. A university opens central ("shared") items through its
 * central feed at /problems/shared/<row id>. Elsewhere there is no feed: a shared item is a central library row
 * in this database, which students open and are judged on through its linked problem, at /problems/<problem id>,
 * exactly as the All Questions page opens it. `routeId` is the id in the item's link.
 */
async function studentLibraryIndex(quests = []) {
  if (isUniversity()) return libraryIndex();
  const needsCentral = isControlPlane() || quests.some((quest) => (quest.items || []).some((item) => item.source === 'shared'));
  const [index, central] = await Promise.all([isControlPlane() ? new Map() : libraryIndex(), needsCentral ? centralLibraryIndex(publicProblemMatch) : new Map()]);
  for (const [key, entry] of central) index.set(key, { ...entry, routeId: entry.localProblemId, href: `/problems/${entry.localProblemId}` });
  return index;
}

// Query values may arrive as "a,b", repeated params or arrays; all become a clean list.
const list = (value) => [...new Set((Array.isArray(value) ? value : String(value ?? '').split(',')).map((entry) => text(entry, 60)).filter(Boolean))];
const tally = (entries, pick) => Object.entries(entries.flatMap(pick).reduce((acc, value) => { acc[value] = (acc[value] || 0) + 1; return acc; }, {}))
  .map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

/** Companies, topics and difficulties that exist in the published library: the only choices admins are offered. */
export async function questTaxonomy() {
  assertAuthor();
  const all = [...(await libraryIndex()).values()];
  return {
    companies: tally(all, (entry) => [...new Set(entry.companies.map(String).filter(Boolean))]).slice(0, 500),
    topics: tally(all, (entry) => [...new Set(entry.tags.map(String).filter(Boolean))]).slice(0, 500),
    difficulties: ['Easy', 'Medium', 'Hard'].map((name) => ({ name, count: all.filter((entry) => entry.difficulty === name).length })),
    total: all.length,
  };
}

/** Admin question picker: search and filter the library. Several topics or companies match any of them. */
export async function searchQuestLibrary({ search = '', difficulty = '', topic = '', company = '', topics, companies, source = '', page = 1, limit = 30 } = {}) {
  assertAuthor();
  const index = await libraryIndex();
  const query = text(search, 100).toLowerCase();
  const difficulties = list(difficulty);
  const topicSet = new Set([...list(topics), ...list(topic)].map((value) => value.toLowerCase()));
  const companySet = new Set([...list(companies), ...list(company)].map((value) => value.toLowerCase()));
  const all = [...index.values()];
  const matches = all.filter((entry) => (!difficulties.length || difficulties.includes(entry.difficulty))
    && (!['university', 'shared'].includes(source) || entry.source === source)
    && (!topicSet.size || entry.tags.some((name) => topicSet.has(String(name).toLowerCase())))
    && (!companySet.size || entry.companies.some((name) => companySet.has(String(name).toLowerCase())))
    && (!query || [entry.title, ...entry.tags, ...entry.companies].some((value) => String(value).toLowerCase().includes(query))))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  const size = Math.min(100, Math.max(1, Number(limit) || 30));
  const current = Math.max(1, Number(page) || 1);
  return {
    items: matches.slice((current - 1) * size, current * size).map(({ order, ...entry }) => entry),
    pagination: { page: current, limit: size, total: matches.length, pages: Math.max(1, Math.ceil(matches.length / size)) },
    facets: { topics: tally(all, (entry) => entry.tags).slice(0, 200), companies: tally(all, (entry) => entry.companies.map(String)).slice(0, 200) },
  };
}

// ---------------------------------------------------------------------------------------------
// Admin: create, edit, publish and archive quests for one university.
// ---------------------------------------------------------------------------------------------

function validateItems(rawItems, index, { keepUnavailable = new Set() } = {}) {
  if (rawItems.length > MAX_ITEMS) throw new HttpError(400, `A QuickPrep can hold up to ${MAX_ITEMS} questions.`);
  const seen = new Set();
  return rawItems.map((item) => {
    if (!['university', 'shared'].includes(item?.source) || !mongoose.isValidObjectId(item?.problemId)) throw new HttpError(400, 'One of the questions is not valid.');
    const normalized = { source: item.source, problemId: String(item.problemId), section: text(item.section, 60) };
    const key = itemKey(normalized);
    // New picks must be central questions. Items saved before the central rule stay listed as unavailable,
    // so the QuickPrep can still be edited, unpublished or archived instead of being locked.
    if (isControlPlane() && normalized.source !== 'shared' && !keepUnavailable.has(key)) throw new HttpError(400, 'Central QuickPreps can only use questions from the central library.');
    if (seen.has(key)) throw new HttpError(400, 'A question appears twice in this QuickPrep.');
    // A question already saved may later be unpublished; it stays listed (flagged) instead of blocking every edit.
    if (!index.has(key) && !keepUnavailable.has(key)) throw new HttpError(400, 'One of the questions is no longer published in the library.');
    seen.add(key);
    return normalized;
  });
}

const labels = (value, max) => [...new Set((Array.isArray(value) ? value : []).map((entry) => text(entry, 60)).filter(Boolean))].slice(0, max);

/** Drafts may be saved before any question is added; publishing needs at least one available question. */
async function validateQuest(input, index, existing = null) {
  const title = text(input.title, 80);
  if (title.length < 3) throw new HttpError(400, 'Give the QuickPrep a name of at least 3 characters.');
  const category = CATEGORIES.includes(input.category) ? input.category : 'study-plan';
  const rewardXp = Number(input.rewardXp ?? 50);
  if (!Number.isInteger(rewardXp) || rewardXp < 0 || rewardXp > 1000) throw new HttpError(400, 'Reward XP must be a whole number from 0 to 1000.');
  const items = validateItems(Array.isArray(input.items) ? input.items : [], index, { keepUnavailable: new Set((existing?.items || []).map(itemKey)) });
  const status = ['draft', 'published', 'archived'].includes(input.status) ? input.status : 'draft';
  if (status === 'published' && !items.some((item) => index.has(itemKey(item)))) throw new HttpError(400, 'Add at least one question before publishing.');
  const semesters = [...new Set((Array.isArray(input.semesters) ? input.semesters : []).map(Number))].filter((value) => Number.isInteger(value) && value >= 1 && value <= 16).sort((a, b) => a - b);
  const companies = labels(Array.isArray(input.companies) ? input.companies : [input.company], 20);
  return {
    title, category, rewardXp, items, semesters, status, companies,
    company: companies[0] || '',
    description: text(input.description, 600),
    topics: labels(input.topics, 20),
    difficulties: labels(input.difficulties, 3).filter((value) => ['Easy', 'Medium', 'Hard'].includes(value)),
    theme: THEMES.includes(input.theme) ? input.theme : 'sky',
    badgeTitle: text(input.badgeTitle, 60),
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

const questCompanies = (quest) => (quest.companies?.length ? quest.companies : quest.company ? [quest.company] : []);
const difficultyMix = (items) => items.reduce((mix, item) => { if (item.available !== false && mix[item.difficulty] !== undefined) mix[item.difficulty] += 1; return mix; }, { Easy: 0, Medium: 0, Hard: 0 });

/** Full-access, active students per semester: who a QuickPrep reaches once it is published. */
async function audienceCounts() {
  // Students live in each university's own database, never on the central platform.
  if (isControlPlane()) return null;
  const rows = await User.aggregate([
    { $match: { role: 'student', isActive: { $ne: false }, accessScope: { $ne: 'assessment_only' } } },
    { $group: { _id: '$semester', count: { $sum: 1 } } },
  ]).option({ maxTimeMS: 8000 });
  return { total: rows.reduce((sum, row) => sum + row.count, 0), bySemester: new Map(rows.map((row) => [Number(row._id) || 0, row.count])) };
}
const audienceFor = (quest, audience) => (!audience ? null : quest.semesters?.length
  ? quest.semesters.reduce((sum, semester) => sum + (audience.bySemester.get(semester) || 0), 0) : audience.total);

function adminShape(quest, index, stats, audience) {
  const items = quest.items.map((item) => ({ ...item, problemId: String(item.problemId), ...(index.get(itemKey(item)) || { title: 'Unavailable question', difficulty: '', tags: [], companies: [] }), available: index.has(itemKey(item)) }));
  return { id: String(quest._id), slug: quest.slug, title: quest.title, description: quest.description, category: quest.category,
    company: quest.company, companies: questCompanies(quest), topics: quest.topics || [], difficulties: quest.difficulties || [],
    theme: quest.theme, rewardXp: quest.rewardXp, badgeTitle: quest.badgeTitle, semesters: quest.semesters, status: quest.status, publishedAt: quest.publishedAt,
    createdAt: quest.createdAt, updatedAt: quest.updatedAt, items, questionCount: items.filter((item) => item.available).length,
    unavailableCount: items.filter((item) => !item.available).length, difficulty: difficultyMix(items),
    audience: audience ? audienceFor(quest, audience) : null, central: isControlPlane(),
    stats: stats || { enrolled: 0, completed: 0, averageProgress: 0 } };
}

async function questStats(questIds) {
  const rows = questIds.length ? await QuestEnrollment.aggregate([
    { $match: { questId: { $in: questIds } } },
    { $group: { _id: '$questId', enrolled: { $sum: 1 }, completed: { $sum: { $cond: [{ $ne: ['$completedAt', null] }, 1, 0] } },
      progress: { $avg: { $cond: [{ $gt: ['$totalCount', 0] }, { $divide: ['$solvedCount', '$totalCount'] }, 0] } },
      lastActivity: { $max: '$lastViewedAt' } } },
  ]).option({ maxTimeMS: 8000 }) : [];
  return new Map(rows.map((row) => [String(row._id), { enrolled: row.enrolled, completed: row.completed, averageProgress: Math.round((row.progress || 0) * 100), lastActivity: row.lastActivity || null }]));
}

async function findAdminQuest(id, select) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'QuickPrep not found');
  const query = Quest.findOne({ _id: id, ...questScope() });
  const quest = await (select ? query.select(select) : query).maxTimeMS(8000).lean();
  if (!quest) throw new HttpError(404, 'QuickPrep not found');
  return quest;
}

/** Every QuickPrep (archived included, so they can be restored), newest change first. */
export async function listAdminQuests() {
  assertAuthor();
  const quests = await Quest.find(questScope()).sort({ updatedAt: -1 }).limit(300).maxTimeMS(8000).lean();
  const [index, stats, audience] = await Promise.all([libraryIndex(), questStats(quests.map((quest) => quest._id)), audienceCounts()]);
  return quests.map((quest) => adminShape(quest, index, stats.get(String(quest._id)), audience));
}

export async function getAdminQuest(admin, college, id) {
  assertAuthor();
  const quest = await findAdminQuest(id);
  const [index, stats, audience] = await Promise.all([libraryIndex(), questStats([quest._id]), audienceCounts()]);
  return adminShape(quest, index, stats.get(String(quest._id)), audience);
}

export async function createQuest(admin, college, input) {
  assertAuthor();
  const index = await libraryIndex();
  const fields = await validateQuest(input, index);
  const quest = await Quest.create({ ...fields, tenantKey: questTenant(), slug: await uniqueSlug(fields.title),
    publishedAt: fields.status === 'published' ? new Date() : null, createdBy: admin._id, updatedBy: admin._id });
  return adminShape(quest.toObject(), index, null, await audienceCounts());
}

export async function updateQuest(admin, college, id, input) {
  assertAuthor();
  const existing = await findAdminQuest(id);
  const index = await libraryIndex();
  const fields = await validateQuest({ ...existing, ...input }, index, existing);
  const slug = fields.title !== existing.title ? await uniqueSlug(fields.title, existing._id) : existing.slug;
  const publishedAt = fields.status === 'published' ? existing.publishedAt || new Date() : existing.publishedAt;
  const quest = await Quest.findOneAndUpdate({ _id: id, ...questScope() }, { $set: { ...fields, slug, publishedAt, updatedBy: admin._id } }, { new: true }).lean();
  const [stats, audience] = await Promise.all([questStats([quest._id]), audienceCounts()]);
  return adminShape(quest, index, stats.get(String(quest._id)), audience);
}

/**
 * Appends items only if, at write time, none of them is already in the QuickPrep and the cap still holds.
 * Two overlapping adds (two tabs, a retried request) can then never duplicate a question or overfill the
 * set, either of which would block every later save. Returns null when the guard did not match.
 */
function pushQuestItems(questId, incoming, admin) {
  return Quest.findOneAndUpdate({
    _id: questId, ...questScope(),
    items: { $not: { $elemMatch: { $or: incoming.map((item) => ({ source: item.source, problemId: objectId(item.problemId) })) } } },
    [`items.${MAX_ITEMS - incoming.length}`]: { $exists: false },
  }, { $push: { items: { $each: incoming } }, $set: { updatedBy: admin._id } }, { new: true }).lean();
}
const changedMeanwhile = () => new HttpError(409, 'This QuickPrep changed while adding questions. Please try again.');

/** Adds library items given as {source, problemId}; ones already present are skipped. */
export async function addQuestItems(admin, id, rawItems) {
  assertAuthor();
  const existing = await findAdminQuest(id);
  const index = await libraryIndex();
  const present = new Set(existing.items.map(itemKey));
  const incoming = validateItems((Array.isArray(rawItems) ? rawItems : []).filter((item) => !present.has(itemKey({ source: item?.source, problemId: item?.problemId }))), index);
  if (existing.items.length + incoming.length > MAX_ITEMS) throw new HttpError(400, `A QuickPrep can hold up to ${MAX_ITEMS} questions.`);
  let quest = existing;
  if (incoming.length) {
    quest = await pushQuestItems(existing._id, incoming, admin);
    if (!quest) { await findAdminQuest(id); throw changedMeanwhile(); }
  }
  const [stats, audience] = await Promise.all([questStats([quest._id]), audienceCounts()]);
  return { quest: adminShape(quest, index, stats.get(String(quest._id)), audience), added: incoming.length, skipped: (rawItems?.length || 0) - incoming.length };
}

// A library row is not itself the practice problem: on a standalone install university rows point at a coding
// Problem; shared and central rows are the question itself. These are the ids students open and are credited on.
const libraryRowTitle = (row) => text(row.questionData?.problemDataSnapshot?.title || row.sourceProblemTitle || row.questionText || 'Untitled question', 120);
export const LIBRARY_SKIP_REASONS = {
  already_in: 'Already in this QuickPrep',
  not_found: 'No longer in the library',
  not_coding: 'Not a coding question',
  no_linked_problem: 'Has no runnable coding problem',
  problem_draft: 'Its coding problem is still a draft',
  problem_not_public: 'Its coding problem is not visible to students',
  shared_unavailable: 'Not available to students from the shared catalog',
  question_draft: 'Still a draft in the library',
  question_private: 'Private in the library, so universities cannot see it',
  assessment_only: 'Used only inside an assessment, so universities cannot see it',
  limit: `The QuickPrep is full (${MAX_ITEMS} questions)`,
};

// Central platform: why a library row is not in the catalog universities receive.
function centralRowReason(row) {
  if (row.status !== 'published') return 'question_draft';
  if (row.visibility === 'private') return 'question_private';
  if (row.sourceType === 'assessment') return 'assessment_only';
  return 'no_linked_problem';
}

/**
 * "Add to QuickPrep" from the Question Library. The client sends library row ids only; each row is re-read
 * here and mapped to the problem students open. Rows students cannot open are skipped with a reason, and
 * the rest are added in the order selected. With dryRun nothing is written: the same plan is returned so the
 * admin can review every pick (and why any is blocked) before confirming.
 */
export async function addQuestLibraryItems(admin, id, rawIds, { dryRun = false } = {}) {
  assertAuthor();
  await findAdminQuest(id, '_id');
  const central = isControlPlane();
  const ids = [...new Set((Array.isArray(rawIds) ? rawIds : []).map((value) => String(value ?? '').trim()).filter(Boolean))];
  if (!ids.length) throw new HttpError(400, 'Select at least one question from the library.');
  if (ids.length > MAX_LIBRARY_PICK) throw new HttpError(400, `Select at most ${MAX_LIBRARY_PICK} questions at a time.`);
  const localIds = ids.filter((value) => mongoose.isObjectIdOrHexString(value));
  const [index, rows, shared] = await Promise.all([
    libraryIndex(),
    localIds.length ? QuestionLibrary.find({ _id: { $in: localIds } })
      .select('questionType questionText status visibility sourceType sourceProblemId sourceProblemTitle questionData.problemId questionData.coding.problemId questionData.problemDataSnapshot._id questionData.problemDataSnapshot.id questionData.problemDataSnapshot.title')
      .maxTimeMS(8000).lean() : [],
    sharedQuestions().catch(() => null),
  ]);
  const local = new Map(rows.map((row) => [String(row._id), row]));
  const sharedRows = new Map((shared || []).map((row) => [String(row._id), row]));

  const mapped = ids.map((rowId) => {
    const row = local.get(rowId);
    if (row) {
      if (row.questionType !== 'coding') return { id: rowId, title: libraryRowTitle(row), reason: 'not_coding' };
      // The super admin's library rows are the central questions themselves: universities know them by this id.
      if (central) return { id: rowId, title: libraryRowTitle(row), row, item: { source: 'shared', problemId: rowId, section: '' } };
      // questionData is untyped, so a link there may be a number or junk: only a real ObjectId counts.
      const linked = linkedProblemId(row);
      const problemId = linked ? String(linked) : '';
      if (!mongoose.isObjectIdOrHexString(problemId)) return { id: rowId, title: libraryRowTitle(row), reason: 'no_linked_problem' };
      return { id: rowId, title: libraryRowTitle(row), item: { source: 'university', problemId, section: '' } };
    }
    const sharedRow = sharedRows.get(rowId);
    if (sharedRow) {
      if (sharedRow.questionType !== 'coding') return { id: rowId, title: libraryRowTitle(sharedRow), reason: 'not_coding' };
      return { id: rowId, title: libraryRowTitle(sharedRow), item: { source: 'shared', problemId: rowId, section: '' } };
    }
    return { id: rowId, title: 'Unknown question', reason: 'not_found' };
  });

  // Why a linked problem is not open to students: one lookup for every candidate missing from the index.
  const hidden = mapped.filter((entry) => entry.item?.source === 'university' && !index.has(itemKey(entry.item)));
  const problems = hidden.length ? await Problem.find({ _id: { $in: hidden.map((entry) => entry.item.problemId) } }).select('status visibility').maxTimeMS(8000).lean() : [];
  const problemState = new Map(problems.map((problem) => [String(problem._id), problem]));

  // Visibility is the lasting blocker, so it is reported before draft status (publishing alone won't help).
  const unavailableReason = (item, row) => {
    if (central && row) return centralRowReason(row);
    if (item.source === 'shared') return 'shared_unavailable';
    const problem = problemState.get(item.problemId);
    if (!problem) return 'no_linked_problem';
    if (problem.visibility !== undefined && problem.visibility !== null && problem.visibility !== 'public') return 'problem_not_public';
    return ['published', 'Active', 'active'].includes(problem.status) ? 'problem_not_public' : 'problem_draft';
  };

  // Duplicates and the cap are judged against the QuickPrep as it is when the write happens. If another
  // add lands first, the plan is recomputed once from the fresh document.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existing = await findAdminQuest(id);
    const present = new Set(existing.items.map(itemKey));
    const incoming = [];
    const skipped = [];
    const plan = [];
    for (const entry of mapped) {
      let reason = entry.reason;
      if (!reason) {
        const key = itemKey(entry.item);
        if (present.has(key)) reason = 'already_in';
        else if (!index.has(key)) reason = unavailableReason(entry.item, entry.row);
        else if (existing.items.length + incoming.length >= MAX_ITEMS) reason = 'limit';
        else { present.add(key); incoming.push(entry.item); }
      }
      if (reason) skipped.push({ id: entry.id, title: entry.title, reason, message: LIBRARY_SKIP_REASONS[reason] });
      plan.push({ id: entry.id, title: entry.title, ok: !reason, ...(reason ? { reason, message: LIBRARY_SKIP_REASONS[reason] } : {}) });
    }
    if (dryRun) return { preview: true, items: plan, added: incoming.length, skipped, currentTotal: existing.items.length, max: MAX_ITEMS };
    const quest = incoming.length ? await pushQuestItems(existing._id, incoming, admin) : existing;
    if (!quest) continue;
    const [stats, audience] = await Promise.all([questStats([quest._id]), audienceCounts()]);
    return { quest: adminShape(quest, index, stats.get(String(quest._id)), audience), added: incoming.length, skipped };
  }
  await findAdminQuest(id);
  throw changedMeanwhile();
}

export async function duplicateQuest(admin, id) {
  assertAuthor();
  const source = await findAdminQuest(id);
  const index = await libraryIndex();
  const title = text(`${source.title} (copy)`, 80);
  const quest = await Quest.create({
    ...Object.fromEntries(['description', 'category', 'company', 'companies', 'topics', 'difficulties', 'theme', 'rewardXp', 'badgeTitle', 'semesters'].map((key) => [key, source[key]])),
    items: source.items.filter((item) => index.has(itemKey(item))).map(({ source: from, problemId, section }) => ({ source: from, problemId, section })),
    title, status: 'draft', tenantKey: questTenant(), slug: await uniqueSlug(title), createdBy: admin._id, updatedBy: admin._id,
  });
  return adminShape(quest.toObject(), index, null, await audienceCounts());
}

/**
 * Drafts nobody started are deleted; anything students touched is archived so history stays intact. Centrally,
 * student progress lives in the universities, so any QuickPrep that was ever published is archived instead.
 */
export async function removeQuest(admin, college, id) {
  assertAuthor();
  const quest = await findAdminQuest(id, '_id status publishedAt');
  const touched = isControlPlane() ? Boolean(quest.publishedAt) : await QuestEnrollment.exists({ questId: quest._id });
  if (quest.status === 'draft' && !touched) {
    await Quest.deleteOne({ _id: quest._id, ...questScope() });
    return { deleted: true };
  }
  await Quest.updateOne({ _id: quest._id, ...questScope() }, { $set: { status: 'archived', updatedBy: admin._id } });
  return { archived: true };
}

/** Per-student and per-question solve state for a set of students, from verified submissions and attempts. */
async function cohortStates(studentIds, keys) {
  const local = keys.filter((key) => key.startsWith('coding:local:')).map((key) => objectId(key.split(':').at(-1)));
  const shared = keys.filter((key) => key.startsWith('coding:shared:')).map((key) => objectId(key.split(':').at(-1)));
  const [localRows, sharedRows] = await Promise.all([
    local.length && studentIds.length ? Submission.aggregate([
      { $match: { user: { $in: studentIds }, problem: { $in: local }, assessmentId: null } },
      { $group: { _id: { student: '$user', question: '$problem' }, solved: { $max: { $cond: [{ $and: [{ $eq: ['$mode', 'submit'] }, { $in: ['$status', ACCEPTED] }] }, 1, 0] } } } },
    ]).option({ maxTimeMS: 10000 }) : [],
    shared.length && studentIds.length ? QuestionPracticeAttempt.aggregate([
      { $match: { studentId: { $in: studentIds }, source: 'shared', questionType: 'coding', questionId: { $in: shared } } },
      { $group: { _id: { student: '$studentId', question: '$questionId' }, solved: { $max: { $cond: [{ $eq: ['$result', 'correct'] }, 1, 0] } } } },
    ]).option({ maxTimeMS: 10000 }) : [],
  ]);
  const states = new Map();
  for (const [prefix, rows] of [['coding:local', localRows], ['coding:shared', sharedRows]]) {
    for (const row of rows) states.set(`${String(row._id.student)}|${prefix}:${String(row._id.question)}`, row.solved ? 'solved' : 'attempted');
  }
  return states;
}

/** Admin "View": how every student and every question is doing in one QuickPrep. */
export async function questInsights(admin, id) {
  assertAuthor();
  const quest = await findAdminQuest(id);
  const [index, audience] = await Promise.all([libraryIndex(), audienceCounts()]);
  const enrollments = await QuestEnrollment.find({ questId: quest._id }).sort({ lastViewedAt: -1 }).limit(2000).maxTimeMS(8000).lean();
  const studentIds = enrollments.map((row) => row.studentId);
  const keys = quest.items.map(itemKey).filter((key) => index.has(key));
  const [users, states] = await Promise.all([
    studentIds.length ? User.find({ _id: { $in: studentIds } }).select('name studentId semester').maxTimeMS(8000).lean() : [],
    cohortStates(studentIds, keys),
  ]);
  const people = new Map(users.map((user) => [String(user._id), user]));
  const students = enrollments.map((row) => {
    const person = people.get(String(row.studentId));
    const solved = keys.filter((key) => states.get(`${String(row.studentId)}|${key}`) === 'solved').length;
    const attempted = keys.filter((key) => states.get(`${String(row.studentId)}|${key}`) === 'attempted').length;
    return { id: String(row.studentId), name: person?.name || 'Former student', rollNumber: person?.studentId || '', semester: person?.semester || null,
      solved, attempted, total: keys.length, progress: keys.length ? Math.round((solved / keys.length) * 100) : 0,
      startedAt: row.startedAt, lastViewedAt: row.lastViewedAt || null, completedAt: row.completedAt || null };
  }).sort((a, b) => Boolean(b.completedAt) - Boolean(a.completedAt) || b.progress - a.progress || a.name.localeCompare(b.name));
  const questions = quest.items.map((item, position) => {
    const key = itemKey(item);
    const entry = index.get(key);
    const solvedBy = students.filter((student) => states.get(`${student.id}|${key}`) === 'solved').length;
    const attemptedBy = students.filter((student) => states.get(`${student.id}|${key}`) === 'attempted').length;
    return { key, position: position + 1, section: item.section || '', available: Boolean(entry), title: entry?.title || 'Unavailable question',
      difficulty: entry?.difficulty || '', tags: entry?.tags || [], companies: entry?.companies || [], source: item.source,
      solvedBy, attemptedBy, solveRate: students.length ? Math.round((solvedBy / students.length) * 100) : 0 };
  });
  const completed = students.filter((student) => student.completedAt).length;
  return {
    quest: adminShape(quest, index, null, audience), students, questions,
    summary: { audience: audienceFor(quest, audience), started: students.length, completed, inProgress: students.length - completed,
      completionRate: students.length ? Math.round((completed / students.length) * 100) : 0,
      averageProgress: students.length ? Math.round(students.reduce((sum, student) => sum + student.progress, 0) / students.length) : 0,
      xpAwarded: completed * (quest.rewardXp || 0) },
  };
}

/** Admin "Insights": every QuickPrep side by side, plus the students finishing the most. */
export async function questOverview() {
  assertAuthor();
  const quests = await Quest.find({ ...questScope(), status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).limit(300).maxTimeMS(8000).lean();
  const ids = quests.map((quest) => quest._id);
  const [index, stats, audience, leaders] = await Promise.all([libraryIndex(), questStats(ids), audienceCounts(),
    ids.length ? QuestEnrollment.aggregate([
      { $match: { questId: { $in: ids } } },
      { $group: { _id: '$studentId', started: { $sum: 1 }, completed: { $sum: { $cond: [{ $ne: ['$completedAt', null] }, 1, 0] } }, solved: { $sum: '$solvedCount' }, lastActivity: { $max: '$lastViewedAt' } } },
      { $sort: { completed: -1, solved: -1 } }, { $limit: 10 },
    ]).option({ maxTimeMS: 8000 }) : []]);
  const users = leaders.length ? await User.find({ _id: { $in: leaders.map((row) => row._id) } }).select('name studentId semester').maxTimeMS(8000).lean() : [];
  const people = new Map(users.map((user) => [String(user._id), user]));
  const rows = quests.map((quest) => adminShape(quest, index, stats.get(String(quest._id)), audience));
  const published = rows.filter((row) => row.status === 'published');
  return {
    totals: { quickpreps: rows.length, published: published.length, drafts: rows.length - published.length,
      started: rows.reduce((sum, row) => sum + row.stats.enrolled, 0), completed: rows.reduce((sum, row) => sum + row.stats.completed, 0),
      students: audience ? audience.total : null, central: isControlPlane() },
    quests: rows,
    leaders: leaders.map((row) => ({ id: String(row._id), name: people.get(String(row._id))?.name || 'Former student', rollNumber: people.get(String(row._id))?.studentId || '',
      semester: people.get(String(row._id))?.semester || null, started: row.started, completed: row.completed, solved: row.solved, lastActivity: row.lastActivity || null })),
  };
}

// ---------------------------------------------------------------------------------------------
// Students: browse, start, track and complete quests.
// ---------------------------------------------------------------------------------------------

async function requireCoding(student) {
  if (!(await engagementPermissions(student)).questions) throw new HttpError(403, 'Coding questions are not enabled for your university.');
}

const visibleFilter = (student) => ({ ...questScope(), status: 'published',
  ...(Number(student.semester) > 0 ? { $or: [{ semesters: { $size: 0 } }, { semesters: Number(student.semester) }] } : { semesters: { $size: 0 } }) });

const DEFINITION_FIELDS = '_id slug title description category company companies topics difficulties theme items rewardXp badgeTitle semesters status publishedAt updatedAt';

/** The central feed: every published QuickPrep definition (no authors, no student data). */
export async function publishedQuestDefinitions() {
  const quests = await Quest.find({ status: 'published' }).select(DEFINITION_FIELDS).sort({ publishedAt: -1, _id: -1 }).limit(300).maxTimeMS(8000).lean();
  // Universities can open only central questions; ids local to the central database are never sent.
  return quests.map((quest) => ({ ...quest, items: (quest.items || []).filter((item) => item.source === 'shared') }));
}

// A definition from the central feed arrives as JSON; ids become ObjectIds so enrollments, rewards and
// badges key on it exactly as they would on a local document.
function hydrateDefinition(quest) {
  return { ...quest, _id: objectId(quest._id), publishedAt: quest.publishedAt ? new Date(quest.publishedAt) : null,
    semesters: (quest.semesters || []).map(Number), items: (quest.items || []).map((item) => ({ source: item.source, problemId: String(item.problemId), section: item.section || '' })) };
}

/**
 * QuickPreps this student may see. University deployments read the super admin's central definitions;
 * standalone installs read their own. Semester targeting is the same either way.
 */
async function visibleQuests(student, { slug, id, limit = 100 } = {}) {
  if (isUniversity()) {
    const semester = Number(student.semester) || 0;
    return ((await sharedQuests()) || []).filter((quest) => quest && mongoose.isObjectIdOrHexString(String(quest._id)))
      .map(hydrateDefinition)
      .filter((quest) => quest.status === 'published'
        && (!quest.semesters.length || (semester > 0 && quest.semesters.includes(semester)))
        && (!slug || quest.slug === slug) && (!id || String(quest._id) === String(id)))
      .sort((a, b) => (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0) || String(b._id).localeCompare(String(a._id)))
      .slice(0, limit);
  }
  return Quest.find({ ...visibleFilter(student), ...(slug ? { slug } : {}), ...(id ? { _id: id } : {}) })
    .sort({ publishedAt: -1, _id: -1 }).limit(limit).maxTimeMS(8000).lean();
}

// Two items of one QuickPrep can open the same problem (two central rows linked to it), so the link also names the item.
const questItemHref = (href, slug, key) => `${href}?quest=${encodeURIComponent(slug)}&item=${encodeURIComponent(key)}`;

/**
 * Published QuickPreps, visible to this student, that contain a coding question, with the student's progress
 * in each. It only decorates a problem page, so a failed lookup is logged and gives an empty list.
 */
export async function questionQuickPreps(student, source, problemId) {
  if (!['university', 'shared'].includes(source) || !mongoose.isValidObjectId(problemId)) return [];
  try {
    // The central platform's QuickPreps open only central rows (studentLibraryIndex), so an old local pick there is not membership.
    const keys = new Set(isControlPlane() && source === 'university' ? [] : [itemKey({ source, problemId: String(problemId) })]);
    const visible = await visibleQuests(student, { limit: 300 });
    if (!visible.length) return [];
    // Off a university, QuickPreps hold central library rows; a problem belongs through the rows linked to it.
    // Only the visible QuickPreps' own shared rows are checked (by _id, always indexed) instead of scanning the library.
    if (!isUniversity() && source === 'university') {
      const sharedIds = [...new Set(visible.flatMap((quest) => (quest.items || [])
        .filter((item) => item.source === 'shared' && mongoose.isValidObjectId(String(item.problemId)))
        .map((item) => String(item.problemId))))];
      if (sharedIds.length) {
        const ids = [String(problemId), objectId(problemId)];
        const rows = await QuestionLibrary.find({ _id: { $in: sharedIds.map(objectId) }, ...CENTRAL_QUESTION_FILTER, questionType: 'coding',
          $or: [{ sourceProblemId: ids[1] }, { 'questionData.problemId': { $in: ids } }, { 'questionData.coding.problemId': { $in: ids } }] })
          .select('_id').maxTimeMS(8000).lean();
        for (const row of rows) keys.add(itemKey({ source: 'shared', problemId: String(row._id) }));
      }
    }
    const quests = visible.filter((quest) => (quest.items || []).some((item) => keys.has(itemKey(item))));
    if (!quests.length) return [];
    const enrollments = await QuestEnrollment.find({ ...engagementScope(student), questId: { $in: quests.map((quest) => quest._id) } })
      .select('questId solvedCount totalCount completedAt').maxTimeMS(8000).lean();
    const byQuest = new Map(enrollments.map((row) => [String(row.questId), row]));
    return quests.map((quest) => {
      const enrollment = byQuest.get(String(quest._id));
      return {
        id: String(quest._id),
        slug: quest.slug,
        title: quest.title,
        theme: quest.theme,
        href: `/student/quickprep/${quest.slug}`,
        started: Boolean(enrollment),
        completed: Boolean(enrollment?.completedAt),
        solved: enrollment?.solvedCount || 0,
        // Before a start, count what this deployment can open: universities and the central platform open only central items.
        total: enrollment?.totalCount || (quest.items || []).filter((item) => (!isUniversity() && !isControlPlane()) || item.source === 'shared').length,
      };
    });
  } catch (error) {
    console.warn(`[QuickPrep] Membership lookup failed for ${source}:${problemId}:`, error?.message || error);
    return [];
  }
}

/**
 * Solved and attempted state for the given library keys, from verified submissions and attempts. A shared
 * item judged through a local problem (`localProblemId` in the index, off a university) uses that problem's submissions.
 */
async function questionStates(studentId, keys, index = new Map()) {
  const localIdOf = (key) => (key.startsWith('coding:local:') ? key.split(':').at(-1) : index.get(key)?.localProblemId || null);
  const local = [...new Set(keys.map(localIdOf).filter(Boolean))].map(objectId);
  const shared = keys.filter((key) => key.startsWith('coding:shared:') && !localIdOf(key)).map((key) => objectId(key.split(':').at(-1)));
  const [solvedLocal, triedLocal, solvedShared, triedShared] = await Promise.all([
    local.length ? Submission.distinct('problem', { user: studentId, problem: { $in: local }, mode: 'submit', assessmentId: null, status: { $in: ACCEPTED } }) : [],
    local.length ? Submission.distinct('problem', { user: studentId, problem: { $in: local }, assessmentId: null }) : [],
    shared.length ? QuestionPracticeAttempt.distinct('questionId', { studentId, source: 'shared', questionType: 'coding', questionId: { $in: shared }, result: 'correct' }) : [],
    shared.length ? QuestionPracticeAttempt.distinct('questionId', { studentId, source: 'shared', questionType: 'coding', questionId: { $in: shared } }) : [],
  ]);
  const solved = new Set([...solvedLocal.map((value) => `local:${value}`), ...solvedShared.map((value) => `shared:${value}`)]);
  const tried = new Set([...triedLocal.map((value) => `local:${value}`), ...triedShared.map((value) => `shared:${value}`)]);
  const states = new Map();
  for (const key of keys) {
    const localId = localIdOf(key);
    const marker = localId ? `local:${localId}` : `shared:${key.split(':').at(-1)}`;
    if (solved.has(marker)) states.set(key, 'solved');
    else if (tried.has(marker)) states.set(key, 'attempted');
  }
  return states;
}

const questBadge = (quest, total) => ({
  id: `quest-${quest._id}`, title: quest.badgeTitle || `${quest.title} Finisher`, category: 'quests', metric: 'quest', target: 1, minimumLevel: 1, rewardXp: quest.rewardXp,
  rarity: total > 50 ? 'Epic' : total > 15 ? 'Rare' : 'Uncommon', description: `Solve every question in the ${quest.title} QuickPrep.`,
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
    await EngagementReward.updateOne({ ...scope, key: `quest:${quest._id}` }, { $setOnInsert: { points: quest.rewardXp, kind: 'quest', earnedAt: now } }, { upsert: true });
  } catch (error) { if (error.code !== 11000) throw error; }
  try { await StudentBadge.updateOne({ ...scope, badgeId: badge.id }, { $setOnInsert: { definition: badge, earnedAt: now, evidence: { questId: String(quest._id), total } } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  await createAchievement(scope, `badge:${badge.id}`, { type: 'badge', award: { ...badge, earned: true } });
  await notifyOnce({ userId: scope.studentId, dedupeKey: `quest:${scope.tenantKey}:${quest._id}`, type: 'QUEST', actionUrl: `/student/quickprep/${quest.slug}`, now,
    title: `QuickPrep complete: ${quest.title}`, message: `All ${total} questions solved. +${quest.rewardXp} XP and the ${badge.title} badge.` }).catch(() => {});
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
    companies: questCompanies(quest), topics: quest.topics, theme: quest.theme, rewardXp: quest.rewardXp, badge: questBadge(quest, items.length),
    total: items.length, solved, difficulty, started: Boolean(enrollment), startedAt: enrollment?.startedAt || null,
    completedAt: enrollment?.completedAt || null, lastViewedAt: enrollment?.lastViewedAt || null,
    lastProblem: last ? { key: last.key, title: last.title, href: questItemHref(last.href, quest.slug, last.key) } : null,
  };
}

async function loadStudentQuests(student, filter = {}) {
  const scope = engagementScope(student);
  const quests = await visibleQuests(student, filter);
  const [index, enrollments] = await Promise.all([studentLibraryIndex(quests),
    quests.length ? QuestEnrollment.find({ ...scope, questId: { $in: quests.map((quest) => quest._id) } }).maxTimeMS(8000).lean() : []]);
  const keys = [...new Set(quests.flatMap((quest) => quest.items.map(itemKey)).filter((key) => index.has(key)))];
  const states = await questionStates(scope.studentId, keys, index);
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
  if (!quest) throw new HttpError(404, 'QuickPrep not found');
  return { ...loaded, quest };
}

export async function getStudentQuest(student, slug, now = new Date()) {
  await requireCoding(student);
  const { scope, quest, index, states, enrollments } = await findStudentQuest(student, slug);
  let enrollment = enrollments.get(String(quest._id));
  const card = studentCard(quest, index, states, enrollment);
  if (enrollment && !enrollment.completedAt) enrollment = await settleEnrollment(scope, quest, enrollment, card.solved, card.total, now);
  const items = quest.items.map((item) => ({ item, entry: index.get(itemKey(item)) })).filter(({ entry }) => entry).map(({ item, entry }) => ({
    key: entry.key, source: entry.source, problemId: entry.problemId, routeId: entry.routeId || entry.problemId, title: entry.title, difficulty: entry.difficulty, tags: entry.tags.slice(0, 4),
    section: item.section || '', status: states.get(entry.key) || 'none', href: questItemHref(entry.href, quest.slug, entry.key),
  }));
  return { quest: { ...card, completedAt: enrollment?.completedAt || null, items } };
}

/** Starting records intent. If every question is already solved, the quest completes at once. */
export async function startQuest(student, slug, now = new Date()) {
  await requireCoding(student);
  const { scope, quest, index, states } = await findStudentQuest(student, slug);
  const card = studentCard(quest, index, states, null);
  if (!card.total) throw new HttpError(409, 'This QuickPrep has no questions available right now.');
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
  if (!quest.items.some((item) => itemKey(item) === key) || !index.has(key)) throw new HttpError(400, 'That question is not part of this QuickPrep.');
  const total = quest.items.filter((item) => index.has(itemKey(item))).length;
  await QuestEnrollment.updateOne({ ...scope, questId: quest._id },
    { $set: { lastProblemKey: key, lastViewedAt: now }, $setOnInsert: { startedAt: now, totalCount: total } }, { upsert: true });
  return { recorded: true };
}

/** The student's most recently viewed unfinished quest, for the dashboard's resume card. */
export async function latestQuestResume(student) {
  if (!(await engagementPermissions(student)).questions) return null;
  const scope = engagementScope(student);
  // Only QuickPreps the student can still see compete for the card, so an archived, retargeted or retired
  // local one opened more recently never hides one they are working through.
  const quests = await visibleQuests(student);
  if (!quests.length) return null;
  const enrollment = await QuestEnrollment.findOne({ ...scope, completedAt: null, lastViewedAt: { $ne: null }, questId: { $in: quests.map((entry) => entry._id) } })
    .sort({ lastViewedAt: -1 }).maxTimeMS(8000).lean();
  if (!enrollment) return null;
  const quest = quests.find((entry) => String(entry._id) === String(enrollment.questId));
  if (!quest) return null;
  const index = await studentLibraryIndex([quest]);
  const keys = quest.items.map(itemKey).filter((key) => index.has(key));
  if (!keys.length) return null;
  const states = await questionStates(scope.studentId, keys, index);
  const last = index.get(enrollment.lastProblemKey);
  return {
    id: `quest:${quest._id}`, type: 'quest', title: quest.title, subtitle: last ? last.title : `${keys.length} questions`,
    href: last ? questItemHref(last.href, quest.slug, last.key) : `/student/quickprep/${quest.slug}`, questHref: `/student/quickprep/${quest.slug}`,
    theme: quest.theme, solved: keys.filter((key) => states.get(key) === 'solved').length, total: keys.length,
    lastProblemTitle: last?.title || null, lastProblemDifficulty: last?.difficulty || null, updatedAt: enrollment.lastViewedAt,
  };
}
