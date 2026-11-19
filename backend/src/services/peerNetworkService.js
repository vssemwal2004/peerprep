import mongoose from 'mongoose';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { PrepMate, PrepMateNudge } from '../models/PeerNetwork.js';
import { Quest, QuestEnrollment } from '../models/AdaptiveEngagement.js';
import Submission from '../models/Submission.js';
import Progress from '../models/Progress.js';
import QuestionPracticeAttempt from '../models/QuestionPracticeAttempt.js';
import { HttpError } from '../utils/errors.js';
import { currentTenant } from '../platform/tenantContext.js';
import { getIo } from '../utils/io.js';
import { personalRoom } from '../utils/realtime.js';
import { notifyOnce } from './notificationService.js';
import { studentFeatureQuery, studentHasFeature } from './studentFeatureAccess.js';
import { getPeerProgressSnapshot, publicCodingProblemStages } from './studentDashboardService.js';
import { engagementTenant } from './engagementPolicyService.js';

export const MATE_REQUEST_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const SEARCH_LIMIT = 8;
const LIST_LIMIT = 30;
const QUERY_TIMEOUT_MS = 6_000;
const PROGRESS_CACHE_MS = 60_000;
const PROGRESS_CACHE_MAX = 500;

// The only User fields that ever leave this module for another student. Email, phone, roll number
// (studentId), section, group, college and coordinator links are deliberately absent.
const CARD_FIELDS = '_id name avatarUrl course branch semester';
const PROFILE_FIELDS = `${CARD_FIELDS} bio linkedinUrl githubUrl portfolioUrl featureAccess accessScope role isActive visibleToPeers`;

const objectId = (value) => new mongoose.Types.ObjectId(String(value));
const idString = (value) => String(value?._id ?? value ?? '');
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * "Same university" filter. Inside a university database the database itself is the university.
 * In the shared main database students are grouped by their institution-managed `college` (the same
 * rule rankings use): exact, case- and space-insensitive. No college means no cohort.
 */
export function collegeCohort(college) {
  if (currentTenant()) return {};
  const name = String(college || '').trim();
  if (!name) return null;
  return { college: { $regex: `^\\s*${escapeRegex(name)}\\s*$`, $options: 'i' } };
}

/** Students other students may find: active, full access, peers enabled, not hidden, same cohort. */
export function discoverableFilter(cohort = {}) {
  return {
    role: 'student',
    isActive: { $ne: false },
    accessScope: { $ne: 'assessment_only' },
    visibleToPeers: { $ne: false },
    ...studentFeatureQuery('peers'),
    ...cohort,
  };
}

/** The signed-in student, read fresh, and the cohort every peer query of this request is limited to. */
export async function peerScope(viewer) {
  const self = await User.findById(objectId(idString(viewer))).select(`${CARD_FIELDS} role college`).maxTimeMS(QUERY_TIMEOUT_MS).lean();
  if (!self || self.role !== 'student') throw new HttpError(404, 'Student not found');
  const cohort = collegeCohort(self.college);
  if (!cohort) throw new HttpError(404, 'Your peer network opens once your institution adds your college to your profile.', { code: 'PEER_NO_COHORT' });
  return { self, cohort };
}

function validPeerId(value) {
  const id = String(value || '');
  if (!mongoose.isValidObjectId(id) || !/^[a-f0-9]{24}$/i.test(id)) throw new HttpError(404, 'Student not found');
  return id;
}

/** Only absolute http(s) links reach another student's browser. */
export function safeLink(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 300) return '';
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function peerCard(user) {
  return {
    id: idString(user),
    name: String(user?.name || 'Student').trim() || 'Student',
    avatarUrl: user?.avatarUrl || '',
    course: user?.course || '',
    branch: user?.branch || '',
    semester: Number.isInteger(user?.semester) ? user.semester : null,
  };
}

async function loadDiscoverable(id, cohort) {
  return User.findOne({ _id: objectId(id), ...discoverableFilter(cohort) }).select(PROFILE_FIELDS).maxTimeMS(QUERY_TIMEOUT_MS).lean();
}

async function requireTarget(viewer, rawId, cohort) {
  const id = validPeerId(rawId);
  if (id === idString(viewer)) throw new HttpError(400, 'That is your own profile.');
  const peer = await loadDiscoverable(id, cohort);
  if (!peer) throw new HttpError(404, 'Student not found');
  return peer;
}

async function requireVisibleViewer(viewer, cohort) {
  const self = await User.findOne({ _id: objectId(idString(viewer)), ...discoverableFilter(cohort) }).select(CARD_FIELDS).lean();
  if (!self) throw new HttpError(403, 'Turn on "Visible to peers" in Edit Profile to connect with classmates.', { code: 'PEER_VISIBILITY_OFF' });
  return self;
}

/**
 * Realtime nudge to both students so counts and buttons refresh. `actor` (a public card) and
 * `targetId` let the target's browser show a toast for pace / request / accepted events.
 */
function pushNetworkUpdate(userIds, payload) {
  const io = getIo();
  if (!io) return;
  for (const userId of new Set(userIds.map(idString))) io.to(personalRoom(userId)).emit('peer-network-updated', payload);
}

const pairKeyOf = (a, b) => [idString(a), idString(b)].sort().join(':');

// ---------------------------------------------------------------- search

export async function searchPeers(viewer, rawQuery) {
  const query = String(rawQuery || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (query.length < 2) return { results: [] };
  const { cohort } = await peerScope(viewer);
  const words = query.split(' ').filter(Boolean).slice(0, 3);
  const nameMatch = words.map((word) => ({ name: { $regex: escapeRegex(word), $options: 'i' } }));
  const rows = await User.find({ _id: { $ne: objectId(viewer._id) }, ...discoverableFilter(cohort), $and: nameMatch })
    .select(CARD_FIELDS).sort({ name: 1 }).limit(SEARCH_LIMIT * 3).maxTimeMS(QUERY_TIMEOUT_MS).lean();
  // Names that start with the query rank first; the rest keep alphabetical order.
  const lower = query.toLowerCase();
  const ranked = rows
    .map((row, index) => ({ row, index, starts: String(row.name || '').toLowerCase().startsWith(lower) ? 0 : 1 }))
    .sort((a, b) => a.starts - b.starts || a.index - b.index)
    .slice(0, SEARCH_LIMIT)
    .map(({ row }) => row);
  const relations = await relationsFor(viewer._id, ranked.map((row) => row._id));
  return { results: ranked.map((row) => ({ ...peerCard(row), relation: relations.get(idString(row)) })) };
}

// ---------------------------------------------------------------- relations and counts

function mateRelation(doc, viewerId) {
  if (!doc) return { mate: 'none', requestId: null };
  const outgoing = idString(doc.fromId) === idString(viewerId);
  if (doc.status === 'accepted') return { mate: 'mates', requestId: idString(doc) };
  if (doc.status === 'pending') return { mate: outgoing ? 'outgoing' : 'incoming', requestId: idString(doc) };
  if (doc.status === 'declined' && outgoing && doc.declinedAt) {
    const retryAt = new Date(new Date(doc.declinedAt).getTime() + MATE_REQUEST_COOLDOWN_MS);
    if (retryAt > new Date()) return { mate: 'cooldown', requestId: null, retryAt: retryAt.toISOString() };
  }
  return { mate: 'none', requestId: null };
}

/** Map(peerId -> Prep Mate relation) as seen by the viewer. */
async function relationsFor(viewerId, peerIds) {
  if (!peerIds.length) return new Map();
  const mates = await PrepMate.find({ pairKey: { $in: peerIds.map((id) => pairKeyOf(viewerId, id)) } }).lean();
  const mateByPeer = new Map(mates.map((doc) => [idString(doc.fromId) === idString(viewerId) ? idString(doc.toId) : idString(doc.fromId), doc]));
  return new Map(peerIds.map((id) => [idString(id), mateRelation(mateByPeer.get(idString(id)), viewerId)]));
}

// Count links whose other side is still discoverable, so hidden or removed students never show up
// as a number either.
async function countVisible(model, match, otherField, cohort) {
  const [row] = await model.aggregate([
    { $match: match },
    { $lookup: { from: User.collection.name, localField: otherField, foreignField: '_id', as: 'other', pipeline: [{ $match: discoverableFilter(cohort) }, { $project: { _id: 1 } }] } },
    { $match: { 'other.0': { $exists: true } } },
    { $count: 'total' },
  ]).option({ maxTimeMS: QUERY_TIMEOUT_MS });
  return row?.total || 0;
}

/** Counts for a student, counting only discoverable students of the given cohort (default: their own). */
export async function networkCounts(userId, cohort) {
  const id = objectId(userId);
  const scope = cohort || (await peerScope(userId)).cohort;
  const [matesFrom, matesTo, incoming] = await Promise.all([
    countVisible(PrepMate, { fromId: id, status: 'accepted' }, 'toId', scope),
    countVisible(PrepMate, { toId: id, status: 'accepted' }, 'fromId', scope),
    countVisible(PrepMate, { toId: id, status: 'pending' }, 'fromId', scope),
  ]);
  return { prepMates: matesFrom + matesTo, incomingRequests: incoming };
}

export async function getNetworkSummary(viewer) {
  const { cohort } = await peerScope(viewer);
  const self = await User.findById(objectId(viewer._id)).select('visibleToPeers').lean();
  return { ...(await networkCounts(viewer._id, cohort)), visibleToPeers: self?.visibleToPeers !== false };
}

// Pending requests: received (incoming) and sent (outgoing). Private to the student.
const NETWORK_TABS = {
  incoming: { match: (id) => ({ toId: id, status: 'pending' }), other: 'fromId', sort: 'requestedAt' },
  outgoing: { match: (id) => ({ fromId: id, status: 'pending' }), other: 'toId', sort: 'requestedAt' },
};

// The only list anyone may open on a classmate's profile.
const PUBLIC_TABS = new Set(['mates']);

/**
 * A network list. Without ownerId: the viewer's own Prep Mates or requests. With ownerId: that
 * classmate's Prep Mates, only if they are discoverable in the viewer's cohort.
 */
export async function listNetwork(viewer, tab, { before, ownerId } = {}) {
  if (tab !== 'mates' && !NETWORK_TABS[tab]) throw new HttpError(400, 'Unknown network list');
  const { cohort } = await peerScope(viewer);
  let ownerKey = idString(viewer);
  if (ownerId !== undefined && idString(ownerId) !== ownerKey) {
    if (!PUBLIC_TABS.has(tab)) throw new HttpError(404, 'Not found');
    const owner = await loadDiscoverable(validPeerId(ownerId), cohort);
    if (!owner) throw new HttpError(404, 'Student not found');
    ownerKey = idString(owner);
  }
  const id = objectId(ownerKey);
  const beforeDate = before && !Number.isNaN(new Date(before).getTime()) ? new Date(before) : null;
  let links;
  if (tab === 'mates') {
    const match = { status: 'accepted', $or: [{ fromId: id }, { toId: id }], ...(beforeDate ? { respondedAt: { $lt: beforeDate } } : {}) };
    links = (await PrepMate.find(match).sort({ respondedAt: -1 }).limit(LIST_LIMIT * 2).maxTimeMS(QUERY_TIMEOUT_MS).lean())
      .map((doc) => ({ otherId: idString(doc.fromId) === idString(id) ? doc.toId : doc.fromId, at: doc.respondedAt || doc.updatedAt }));
  } else {
    const spec = NETWORK_TABS[tab];
    const match = { ...spec.match(id), ...(beforeDate ? { [spec.sort]: { $lt: beforeDate } } : {}) };
    links = (await PrepMate.find(match).sort({ [spec.sort]: -1 }).limit(LIST_LIMIT * 2).maxTimeMS(QUERY_TIMEOUT_MS).lean())
      .map((doc) => ({ otherId: doc[spec.other], at: doc[spec.sort] }));
  }
  const people = await User.find({ _id: { $in: links.map((link) => link.otherId) }, ...discoverableFilter(cohort) }).select(CARD_FIELDS).lean();
  const byId = new Map(people.map((person) => [idString(person), person]));
  const visible = links.filter((link) => byId.has(idString(link.otherId))).slice(0, LIST_LIMIT);
  const viewerKey = idString(viewer);
  const relations = await relationsFor(viewer._id, visible.map((link) => link.otherId).filter((otherId) => idString(otherId) !== viewerKey));
  return {
    tab,
    items: visible.map((link) => {
      const key = idString(link.otherId);
      return { ...peerCard(byId.get(key)), since: link.at, relation: key === viewerKey ? { self: true } : relations.get(key) };
    }),
    // Fewer than a full page means the list is complete (hidden students are filtered out above).
    nextBefore: visible.length === LIST_LIMIT ? visible.at(-1).at : null,
  };
}

// ---------------------------------------------------------------- peer profile

const progressCache = new Map();

async function quickPrepSummary(peer) {
  const [row] = await QuestEnrollment.aggregate([
    { $match: { tenantKey: engagementTenant(peer), studentId: objectId(peer._id) } },
    { $group: { _id: null, sheetsStarted: { $sum: 1 }, sheetsCompleted: { $sum: { $cond: [{ $ne: ['$completedAt', null] }, 1, 0] } }, solved: { $sum: '$solvedCount' }, total: { $sum: '$totalCount' } } },
  ]).option({ maxTimeMS: QUERY_TIMEOUT_MS });
  return { sheetsStarted: row?.sheetsStarted || 0, sheetsCompleted: row?.sheetsCompleted || 0, solved: row?.solved || 0, total: row?.total || 0 };
}

const nonNegative = (value) => (Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0);
const ACCEPTED_STATUSES = ['AC', 'ACCEPTED', 'ACCEPT'];
const RECENT_SOLVED_LIMIT = 8;
const SHEET_LIMIT = 6;

function difficultyLabel(value) {
  const key = String(value || '').toLowerCase();
  return { easy: 'Easy', medium: 'Medium', hard: 'Hard' }[key] || null;
}

/** Quick Prep sheets (admin-assigned question sets) the student started: title and solved / total. */
async function quickPrepSheets(peer) {
  const enrollments = await QuestEnrollment.find({ tenantKey: engagementTenant(peer), studentId: objectId(peer._id) })
    .sort({ lastViewedAt: -1, updatedAt: -1 }).limit(SHEET_LIMIT * 2).select('questId solvedCount totalCount completedAt').maxTimeMS(QUERY_TIMEOUT_MS).lean();
  if (!enrollments.length) return [];
  const quests = await Quest.find({ _id: { $in: enrollments.map((row) => row.questId) } }).select('title slug').maxTimeMS(QUERY_TIMEOUT_MS).lean();
  const byId = new Map(quests.map((quest) => [idString(quest), quest]));
  return enrollments.filter((row) => byId.has(idString(row.questId))).slice(0, SHEET_LIMIT).map((row) => {
    const quest = byId.get(idString(row.questId));
    const total = nonNegative(row.totalCount);
    return { title: quest.title, slug: quest.slug, solved: Math.min(nonNegative(row.solvedCount), total || Infinity), total, completed: Boolean(row.completedAt) };
  });
}

/**
 * Practice problems the student most recently got accepted (titles and difficulty only: no code,
 * no submission details, no dates). Assessment solves never appear here.
 */
async function recentSolvedProblems(peer, sharedCatalog = []) {
  const studentId = objectId(peer._id);
  const [local, shared] = await Promise.all([
    Submission.aggregate([
      { $match: { user: studentId, mode: 'submit', assessmentId: null } },
      { $match: { $expr: { $in: [{ $toUpper: { $ifNull: ['$status', ''] } }, ACCEPTED_STATUSES] } } },
      { $group: { _id: '$problem', solvedAt: { $max: '$createdAt' } } },
      { $sort: { solvedAt: -1 } },
      { $limit: RECENT_SOLVED_LIMIT * 2 },
      ...publicCodingProblemStages('_id'),
      { $project: { solvedAt: 1, title: '$codingProblem.title', difficulty: '$codingProblem.difficulty' } },
    ]).option({ maxTimeMS: QUERY_TIMEOUT_MS }),
    sharedCatalog.length ? QuestionPracticeAttempt.aggregate([
      { $match: { studentId, source: 'shared', questionType: 'coding', result: 'correct', questionId: { $in: sharedCatalog.map((row) => objectId(row._id)) } } },
      { $group: { _id: '$questionId', solvedAt: { $max: '$createdAt' } } },
      { $sort: { solvedAt: -1 } },
      { $limit: RECENT_SOLVED_LIMIT },
    ]).option({ maxTimeMS: QUERY_TIMEOUT_MS }) : [],
  ]);
  const sharedById = new Map(sharedCatalog.map((question) => [idString(question), question]));
  const rows = [
    ...local.map((row) => ({ id: idString(row._id), source: 'local', title: row.title, difficulty: difficultyLabel(row.difficulty), solvedAt: row.solvedAt })),
    ...shared.map((row) => {
      const question = sharedById.get(idString(row._id)) || {};
      const snapshot = question.questionData?.problemDataSnapshot || {};
      return { id: idString(row._id), source: 'shared', title: question.title || snapshot.title || question.questionText, difficulty: difficultyLabel(question.difficulty || snapshot.difficulty), solvedAt: row.solvedAt };
    }),
  ];
  return rows
    .filter((row) => row.title)
    .sort((a, b) => new Date(b.solvedAt) - new Date(a.solvedAt))
    .slice(0, RECENT_SOLVED_LIMIT)
    .map(({ solvedAt, ...row }) => ({ ...row, title: String(row.title).slice(0, 120) }));
}

const DAY_MS = 86_400_000;
const dayKey = (field) => ({ $dateToString: { date: field, format: '%Y-%m-%d', timezone: 'UTC' } });

/**
 * Practice-only activity for the profile heat map: { 'YYYY-MM-DD': count } over the past year.
 * Counts practice submissions, shared coding attempts and learning topics completed. Logins,
 * assessments and interview sessions are left out on purpose: those are personal records.
 */
export async function practiceActivity(peer, { coding, learning }, now = new Date()) {
  const studentId = objectId(peer._id);
  const start = new Date(now.getTime() - 364 * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);
  const byDay = (field) => [{ $group: { _id: dayKey(field), count: { $sum: 1 } } }];
  const sources = await Promise.all([
    coding ? Submission.aggregate([
      { $match: { user: studentId, mode: 'submit', assessmentId: null, createdAt: { $gte: start, $lte: now } } }, ...byDay('$createdAt'),
    ]).option({ maxTimeMS: QUERY_TIMEOUT_MS }) : [],
    coding ? QuestionPracticeAttempt.aggregate([
      { $match: { studentId, source: 'shared', questionType: 'coding', createdAt: { $gte: start, $lte: now } } }, ...byDay('$createdAt'),
    ]).option({ maxTimeMS: QUERY_TIMEOUT_MS }) : [],
    learning ? Progress.aggregate([
      { $match: { studentId, completed: true, completedAt: { $gte: start, $lte: now } } }, ...byDay('$completedAt'),
    ]).option({ maxTimeMS: QUERY_TIMEOUT_MS }) : [],
  ]);
  const byDate = {};
  for (const rows of sources) {
    for (const row of rows) byDate[row._id] = (byDate[row._id] || 0) + row.count;
  }
  return { byDate, activeDays: Object.keys(byDate).length };
}

/**
 * Practice progress another student may see: coding, learning and Quick Prep completion, level
 * and milestone badges. Personal records are never sent: no Prep Coins (wallet), no Prep Score
 * (it includes assessment marks; students see only their own), no assessment or interview
 * counts, marks or ratings, no code and no dates.
 */
async function buildPeerProgress(peer) {
  const has = (feature) => studentHasFeature(peer, feature);
  const [{ permissions, row, progress, codingTotals, sharedCatalog }, quickPrep, sheets] = await Promise.all([
    getPeerProgressSnapshot(peer),
    has('quickprep') ? quickPrepSummary(peer).catch(() => null) : null,
    has('quickprep') ? quickPrepSheets(peer).catch(() => []) : [],
  ]);
  const canCoding = has('prep_coding') && permissions.questions && Boolean(codingTotals);
  const canLearning = has('learning') && Boolean(permissions.learning);
  const [recentSolved, activity] = await Promise.all([
    canCoding ? recentSolvedProblems(peer, sharedCatalog).catch(() => []) : [],
    canCoding || canLearning ? practiceActivity(peer, { coding: canCoding, learning: canLearning }).catch(() => null) : null,
  ]);
  const modules = [];
  if (canCoding) {
    const solved = { easy: nonNegative(row.easySolved), medium: nonNegative(row.mediumSolved), hard: nonNegative(row.hardSolved) };
    modules.push({
      key: 'coding', label: 'Prep Coding', unit: 'problems',
      solved: solved.easy + solved.medium + solved.hard,
      total: codingTotals.easy + codingTotals.medium + codingTotals.hard,
      breakdown: ['easy', 'medium', 'hard'].map((level) => ({ key: level, solved: solved[level], total: codingTotals[level] })),
    });
  }
  if (canLearning) {
    modules.push({ key: 'learning', label: 'Learning Modules', unit: 'topics', solved: nonNegative(row.completedTopics), total: nonNegative(row.totalTopics) });
  }
  if (quickPrep) {
    modules.push({ key: 'quickprep', label: 'Quick Prep', unit: 'questions', solved: quickPrep.solved, total: quickPrep.total, sheetsStarted: quickPrep.sheetsStarted, sheetsCompleted: quickPrep.sheetsCompleted });
  }
  const metrics = progress.badgeMetrics || {};
  return {
    modules,
    level: progress.level ? { level: progress.level.level, title: progress.level.title } : null,
    badges: { earned: nonNegative(progress.earnedBadges), milestones: nonNegative(progress.milestoneBadges), challenges: nonNegative(progress.challengeBadges) },
    // Practice counts behind the milestone badges. The assessment and interview badges need just
    // one completion, so only earned / not earned (0 or 1) is sent, never how many were taken.
    badgeMetrics: {
      solved: nonNegative(metrics.solved), hardSolved: nonNegative(metrics.hardSolved), bestStreak: nonNegative(metrics.bestStreak),
      activeDays: nonNegative(metrics.activeDays), languages: nonNegative(metrics.languages),
      assessments: Math.min(1, nonNegative(metrics.assessments)), interviews: Math.min(1, nonNegative(metrics.interviews)),
    },
    coding: canCoding ? { attempted: nonNegative(row.attemptedProblems), recentSolved } : null,
    quickPrepSheets: sheets,
    activity,
  };
}

async function cachedPeerProgress(peer) {
  const key = `${currentTenant()?.universityId || 'platform'}:${idString(peer)}`;
  const hit = progressCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  let value;
  try {
    value = await buildPeerProgress(peer);
  } catch (error) {
    // The profile still opens when, e.g., the central question feed is down; progress shows as unavailable.
    console.warn('[Peers] progress unavailable:', error?.message);
    return { unavailable: true, modules: [], level: null, badges: null };
  }
  if (progressCache.size >= PROGRESS_CACHE_MAX) progressCache.delete(progressCache.keys().next().value);
  progressCache.set(key, { value, expiresAt: Date.now() + PROGRESS_CACHE_MS });
  return value;
}

/** The practice-only progress a classmate may see (level, milestone badges, modules): cached 60 s. */
export function peerProgressFor(student) {
  return cachedPeerProgress(student);
}

export function clearPeerProgressCache() {
  progressCache.clear();
}

export async function getPeerProfile(viewer, rawId) {
  const id = validPeerId(rawId);
  const { cohort } = await peerScope(viewer);
  const isSelf = id === idString(viewer);
  const peer = isSelf
    ? await User.findOne({ _id: objectId(id), role: 'student' }).select(PROFILE_FIELDS).lean()
    : await loadDiscoverable(id, cohort);
  if (!peer) throw new HttpError(404, 'Student not found');
  const [progress, network, relations] = await Promise.all([
    cachedPeerProgress(peer),
    networkCounts(peer._id, cohort),
    isSelf ? new Map() : relationsFor(viewer._id, [peer._id]),
  ]);
  return {
    profile: {
      ...peerCard(peer),
      bio: String(peer.bio || '').slice(0, 280),
      links: { linkedin: safeLink(peer.linkedinUrl), github: safeLink(peer.githubUrl), portfolio: safeLink(peer.portfolioUrl) },
    },
    progress,
    network: { prepMates: network.prepMates },
    relation: isSelf ? { self: true } : relations.get(id),
  };
}

// ---------------------------------------------------------------- Prep Mates (two-way, by request)
// Undo actions (withdraw, remove) only touch the caller's own pair, so they work even after either
// student changed college, hid their profile or lost access.

async function notifyMateRequest(doc, requester) {
  await notifyOnce({
    userId: doc.toId,
    dedupeKey: `prep-mate-request:${idString(doc)}:${new Date(doc.requestedAt).getTime()}`,
    type: 'PREP_MATE_REQUEST',
    title: 'Prep Mate request',
    message: `${peerCard(requester).name} wants to be your Prep Mate.`,
    referenceId: doc._id,
    actionUrl: `/student/peers/${idString(requester)}`,
  }).catch(() => false);
}

async function notifyMateAccepted(doc, accepter) {
  await notifyOnce({
    userId: doc.fromId,
    dedupeKey: `prep-mate-accepted:${idString(doc)}:${new Date(doc.respondedAt).getTime()}`,
    type: 'PREP_MATE_ACCEPTED',
    title: 'You have a new Prep Mate',
    message: `${peerCard(accepter).name} accepted your Prep Mate request.`,
    referenceId: doc._id,
    actionUrl: `/student/peers/${idString(accepter)}`,
  }).catch(() => false);
}

// Once a request is answered or withdrawn, its "Prep Mate request" notification is no longer
// something to act on, so it stops counting as unread for the student who received it.
async function closeRequestNotice(doc) {
  await Notification.updateMany(
    { userId: doc.toId, type: 'PREP_MATE_REQUEST', referenceId: doc._id, isRead: false },
    { $set: { isRead: true } },
  ).catch(() => null);
}

async function relationWith(viewerId, peerId) {
  return (await relationsFor(viewerId, [peerId])).get(idString(peerId));
}

async function acceptPending(doc, accepter) {
  const now = new Date();
  const updated = await PrepMate.findOneAndUpdate(
    { _id: doc._id, status: 'pending', toId: objectId(accepter._id) },
    { $set: { status: 'accepted', respondedAt: now, declinedAt: null } },
    { new: true },
  ).lean();
  if (!updated) throw new HttpError(409, 'This request is no longer open.');
  await Promise.all([notifyMateAccepted(updated, accepter), closeRequestNotice(updated)]);
  pushNetworkUpdate([updated.fromId, updated.toId], { kind: 'mate-accepted', requestId: idString(updated), actor: peerCard(accepter), targetId: idString(updated.fromId) });
  return updated;
}

export async function requestPrepMate(viewer, rawId, now = new Date()) {
  const { cohort } = await peerScope(viewer);
  const [self, peer] = await Promise.all([requireVisibleViewer(viewer, cohort), requireTarget(viewer, rawId, cohort)]);
  const pairKey = pairKeyOf(self._id, peer._id);
  const fresh = { fromId: objectId(self._id), toId: objectId(peer._id), status: 'pending', requestedAt: now, respondedAt: null, declinedAt: null };
  let doc = await PrepMate.findOne({ pairKey }).lean();

  if (!doc) {
    try {
      doc = (await PrepMate.create({ pairKey, ...fresh })).toObject();
      await notifyMateRequest(doc, self);
      pushNetworkUpdate([self._id, peer._id], { kind: 'mate-request', requestId: idString(doc), actor: peerCard(self), targetId: idString(peer) });
      return { relation: await relationWith(self._id, peer._id) };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      doc = await PrepMate.findOne({ pairKey }).lean();
      if (!doc) throw new HttpError(409, 'Please try again.');
    }
  }

  const outgoing = idString(doc.fromId) === idString(self);
  if (doc.status === 'accepted') return { relation: await relationWith(self._id, peer._id) };
  if (doc.status === 'pending') {
    // They already asked you: asking back accepts.
    if (!outgoing) await acceptPending(doc, self);
    return { relation: await relationWith(self._id, peer._id) };
  }
  if (doc.status === 'declined' && outgoing && doc.declinedAt && now.getTime() - new Date(doc.declinedAt).getTime() < MATE_REQUEST_COOLDOWN_MS) {
    const retryAt = new Date(new Date(doc.declinedAt).getTime() + MATE_REQUEST_COOLDOWN_MS);
    throw new HttpError(429, 'You can send this student another request later.', { code: 'PREP_MATE_COOLDOWN', retryAt: retryAt.toISOString() });
  }
  // Reopen a closed pair as a new request, only if nobody changed it in between.
  const reopened = await PrepMate.findOneAndUpdate(
    { _id: doc._id, status: doc.status, updatedAt: doc.updatedAt },
    { $set: fresh },
    { new: true },
  ).lean();
  if (!reopened) throw new HttpError(409, 'Please try again.');
  await notifyMateRequest(reopened, self);
  pushNetworkUpdate([self._id, peer._id], { kind: 'mate-request', requestId: idString(reopened), actor: peerCard(self), targetId: idString(peer) });
  return { relation: await relationWith(self._id, peer._id) };
}

export async function cancelPrepMateRequest(viewer, rawId) {
  const id = validPeerId(rawId);
  const updated = await PrepMate.findOneAndUpdate(
    { pairKey: pairKeyOf(viewer._id, id), status: 'pending', fromId: objectId(viewer._id) },
    { $set: { status: 'cancelled', respondedAt: new Date() } },
    { new: true },
  ).lean();
  if (updated) {
    await closeRequestNotice(updated);
    pushNetworkUpdate([viewer._id, id], { kind: 'mate-cancelled', requestId: idString(updated) });
  }
  return { relation: await relationWith(viewer._id, id) };
}

export async function respondPrepMateRequest(viewer, rawRequestId, action) {
  if (!['accept', 'decline'].includes(action)) throw new HttpError(400, 'Choose accept or decline.');
  const requestId = validPeerId(rawRequestId);
  const doc = await PrepMate.findOne({ _id: objectId(requestId), toId: objectId(viewer._id) }).lean();
  if (!doc || doc.status !== 'pending') throw new HttpError(409, 'This request is no longer open.');
  if (action === 'accept') {
    // The requester may have hidden their profile, lost access or moved college since asking.
    const { cohort } = await peerScope(viewer);
    const [self, requester] = await Promise.all([requireVisibleViewer(viewer, cohort), loadDiscoverable(doc.fromId, cohort)]);
    if (!requester) throw new HttpError(409, 'This student is no longer available.');
    await acceptPending(doc, self);
    return { peerId: idString(doc.fromId), relation: await relationWith(viewer._id, doc.fromId) };
  }
  const now = new Date();
  const updated = await PrepMate.findOneAndUpdate(
    { _id: doc._id, status: 'pending', toId: objectId(viewer._id) },
    { $set: { status: 'declined', respondedAt: now, declinedAt: now } },
    { new: true },
  ).lean();
  if (!updated) throw new HttpError(409, 'This request is no longer open.');
  // The requester is not notified of a decline; their button simply returns to a waiting state.
  await closeRequestNotice(updated);
  pushNetworkUpdate([updated.fromId, updated.toId], { kind: 'mate-declined', requestId: idString(updated) });
  return { peerId: idString(doc.fromId), relation: await relationWith(viewer._id, doc.fromId) };
}

export async function removePrepMate(viewer, rawId) {
  const id = validPeerId(rawId);
  const updated = await PrepMate.findOneAndUpdate(
    { pairKey: pairKeyOf(viewer._id, id), status: 'accepted' },
    { $set: { status: 'removed', respondedAt: new Date() } },
    { new: true },
  ).lean();
  if (updated) pushNetworkUpdate([viewer._id, id], { kind: 'mate-removed', requestId: idString(updated) });
  return { relation: await relationWith(viewer._id, id) };
}

// ---------------------------------------------------------------- indexes

// University connections never auto-build indexes, and the index migration skips collections
// that do not exist yet, so these brand-new collections build theirs on first use per database.
const indexedTenants = new Map();
export function ensurePeerIndexes() {
  const key = currentTenant()?.universityId || 'platform';
  if (!indexedTenants.has(key)) {
    const work = Promise.all([PrepMate.createIndexes(), PrepMateNudge.createIndexes()])
      .catch((error) => { indexedTenants.delete(key); throw error; });
    indexedTenants.set(key, work);
  }
  return indexedTenants.get(key);
}
