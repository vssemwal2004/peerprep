// Prep Mates circle: a ranking of you and your Prep Mates (with your standing summarised), a
// directory, classmate suggestions, friendly "Prep Ping" nudges, and a head-to-head comparison.
//
// Privacy: only ACCEPTED Prep Mates who are still discoverable in your university (peerScope) ever
// appear. Everything is practice-only (practice problems solved, practice days, topics, monthly
// badge levels): never Prep Score, Prep Coins, assessments, interviews, logins or code.
import mongoose from 'mongoose';
import User from '../models/User.js';
import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import QuestionPracticeAttempt from '../models/QuestionPracticeAttempt.js';
import { PrepMate, PrepMateNudge } from '../models/PeerNetwork.js';
import { BadgeLevelAward } from '../models/MonthlyBadge.js';
import { HttpError } from '../utils/errors.js';
import { getIo } from '../utils/io.js';
import { personalRoom } from '../utils/realtime.js';
import { notifyOnce } from './notificationService.js';
import { discoverableFilter, peerCard, peerProgressFor, peerScope } from './peerNetworkService.js';
import { getSharedCodingCatalog } from './studentDashboardService.js';
import { istDay } from './prepScore/topicQuota.js';
import { sharedSummaryFor } from './prepReadiness/readiness.js';
import { TRACKS, tierOf } from './monthlyBadges.js';
import { prepStreaks } from './prepStreak.js';

const QUERY_TIMEOUT_MS = 8_000;
const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;
// Prep Mates read per request (ids and card fields only); counts run in the database.
const MATES_CAP = 5_000;
const LEADERBOARD_PAGE = 10;
const DIRECTORY_PAGE = 12;
const WEEKS = 8;
const TOPIC_LIMIT = 8;
const NUDGES_PER_DAY = 20;
const ACCEPTED = ['AC', 'Accepted', 'ACCEPTED', 'ACCEPT'];
const PERIODS = new Set(['week', 'month', 'all']);

const objectId = (value) => new mongoose.Types.ObjectId(String(value));
const idString = (value) => String(value?._id ?? value ?? '');
const pairKeyOf = (a, b) => [idString(a), idString(b)].sort().join(':');
const difficultyLabel = (value) => ({ easy: 'Easy', medium: 'Medium', hard: 'Hard' }[String(value || '').toLowerCase()] || null);

function validPeerId(value) {
  const id = String(value || '');
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new HttpError(404, 'Student not found');
  return id;
}

// ---------------------------------------------------------------- IST calendar helpers

const istDate = (date) => new Date(new Date(date).getTime() + IST_OFFSET_MS);
/** Monday (IST) of the week containing `date`, as YYYY-MM-DD. */
export function istWeekStart(date) {
  const local = istDate(date);
  const weekday = (local.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - weekday)).toISOString().slice(0, 10);
}
const shiftDay = (day, delta) => new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);

/** Longest run of consecutive days, and the run ending today (or yesterday if today is empty). */
export function streaks(days, today) {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let previous = null;
  for (const day of sorted) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  let current = 0;
  while (days.has(cursor)) { current += 1; cursor = shiftDay(cursor, -1); }
  return { current, best };
}

// ---------------------------------------------------------------- practice facts

/**
 * Per student: first accepted practice solves (with difficulty, tags, title) and IST practice days.
 * Map(studentId -> { solves: [{ at, difficulty, tags, title }], days: Set<YYYY-MM-DD> }).
 */
async function practiceFacts(studentIds, now = new Date()) {
  const ids = [...new Set(studentIds.map(idString))].map(objectId);
  const facts = new Map(ids.map((id) => [idString(id), { solves: [], days: new Set() }]));
  if (!ids.length) return facts;
  const yearAgo = new Date(now.getTime() - 400 * DAY_MS);
  const istDayOf = (field) => ({ $dateToString: { format: '%Y-%m-%d', date: field, timezone: 'Asia/Kolkata' } });
  const catalog = await getSharedCodingCatalog().catch(() => []);
  const catalogIds = catalog.map((question) => objectId(question._id));
  const [localFirsts, sharedFirsts, localDays, sharedDays] = await Promise.all([
    Submission.aggregate([
      { $match: { user: { $in: ids }, mode: 'submit', assessmentId: null, status: { $in: ACCEPTED } } },
      { $group: { _id: { user: '$user', problem: '$problem' }, at: { $min: '$createdAt' } } },
    ]).option({ maxTimeMS: QUERY_TIMEOUT_MS }),
    catalogIds.length ? QuestionPracticeAttempt.aggregate([
      { $match: { studentId: { $in: ids }, source: 'shared', questionType: 'coding', result: 'correct', questionId: { $in: catalogIds } } },
      { $group: { _id: { user: '$studentId', problem: '$questionId' }, at: { $min: '$createdAt' } } },
    ]).option({ maxTimeMS: QUERY_TIMEOUT_MS }) : [],
    Submission.aggregate([
      { $match: { user: { $in: ids }, mode: 'submit', assessmentId: null, createdAt: { $gte: yearAgo, $lte: now } } },
      { $group: { _id: { user: '$user', day: istDayOf('$createdAt') } } },
    ]).option({ maxTimeMS: QUERY_TIMEOUT_MS }),
    QuestionPracticeAttempt.aggregate([
      { $match: { studentId: { $in: ids }, source: 'shared', questionType: 'coding', createdAt: { $gte: yearAgo, $lte: now } } },
      { $group: { _id: { user: '$studentId', day: istDayOf('$createdAt') } } },
    ]).option({ maxTimeMS: QUERY_TIMEOUT_MS }),
  ]);
  const problemIds = [...new Set(localFirsts.map((row) => idString(row._id.problem)).filter((id) => mongoose.isValidObjectId(id)))];
  // Same rule as the dashboard: only published, public problems count as solved practice.
  const problems = problemIds.length ? await Problem.find({
    _id: { $in: problemIds.map(objectId) }, status: { $in: ['published', 'Active', 'active'] }, $or: [{ visibility: 'public' }, { visibility: { $exists: false } }],
  }).select('title difficulty tags').maxTimeMS(QUERY_TIMEOUT_MS).lean() : [];
  const problemById = new Map(problems.map((row) => [idString(row), row]));
  const sharedById = new Map(catalog.map((question) => [idString(question), question]));
  for (const row of localFirsts) {
    const problem = problemById.get(idString(row._id.problem));
    if (!problem) continue;
    facts.get(idString(row._id.user))?.solves.push({ at: row.at, difficulty: difficultyLabel(problem.difficulty), tags: problem.tags || [], title: String(problem.title || '').slice(0, 120) });
  }
  for (const row of sharedFirsts) {
    const question = sharedById.get(idString(row._id.problem));
    if (!question) continue;
    const snapshot = question.questionData?.problemDataSnapshot || {};
    facts.get(idString(row._id.user))?.solves.push({
      at: row.at, difficulty: difficultyLabel(question.difficulty || snapshot.difficulty), tags: question.tags || snapshot.tags || [],
      title: String(question.title || snapshot.title || 'Practice problem').slice(0, 120),
    });
  }
  for (const row of [...localDays, ...sharedDays]) facts.get(idString(row._id.user))?.days.add(row._id.day);
  // The streak shown everywhere is the Prep Streak (daily challenges in a row), 2026-11-21.
  const prep = await prepStreaks(ids, now).catch(() => new Map());
  for (const [id, fact] of facts) if (prep.has(id)) fact.prepStreak = { current: prep.get(id).current, best: prep.get(id).best };
  return facts;
}

/** The numbers the circle and the comparison show for one student. */
export function summarizeFacts(fact, now = new Date()) {
  const today = istDay(now);
  const weekStart = istWeekStart(now);
  const month = today.slice(0, 7);
  const totals = { easy: 0, medium: 0, hard: 0, total: 0 };
  let thisWeek = 0;
  let thisMonth = 0;
  const weekStarts = Array.from({ length: WEEKS }, (_, index) => shiftDay(weekStart, -7 * (WEEKS - 1 - index)));
  const weekly = new Map(weekStarts.map((start) => [start, 0]));
  const topics = new Map();
  for (const solve of fact.solves) {
    totals.total += 1;
    if (solve.difficulty) totals[solve.difficulty.toLowerCase()] += 1;
    const day = istDay(solve.at);
    if (day >= weekStart) thisWeek += 1;
    if (day.startsWith(month)) thisMonth += 1;
    const week = istWeekStart(solve.at);
    if (weekly.has(week)) weekly.set(week, weekly.get(week) + 1);
    for (const raw of solve.tags || []) {
      const tag = String(raw || '').trim();
      if (tag) topics.set(tag, (topics.get(tag) || 0) + 1);
    }
  }
  const since30 = shiftDay(today, -29);
  return {
    totals, thisWeek, thisMonth,
    streak: fact.prepStreak || streaks(fact.days, today),
    practisedToday: fact.days.has(today),
    activeDays30: [...fact.days].filter((day) => day >= since30 && day <= today).length,
    topicsCovered: topics.size,
    weekly: weekStarts.map((start) => ({ weekStart: start, solved: weekly.get(start) })),
    topics,
  };
}

// ---------------------------------------------------------------- mates

/**
 * The viewer's accepted Prep Mates who are still discoverable in their university, most recently
 * added first (each with `since`). Scales to thousands: only ids and card fields are read.
 */
async function circleMates(viewerId, cohort, limit = MATES_CAP) {
  const id = objectId(viewerId);
  const links = await PrepMate.find({ status: 'accepted', $or: [{ fromId: id }, { toId: id }] })
    .sort({ respondedAt: -1 }).limit(limit).select('fromId toId respondedAt').maxTimeMS(QUERY_TIMEOUT_MS).lean();
  const sinceById = new Map(links.map((doc) => [idString(idString(doc.fromId) === idString(id) ? doc.toId : doc.fromId), doc.respondedAt]));
  if (!sinceById.size) return [];
  const people = await User.find({ _id: { $in: [...sinceById.keys()].map(objectId) }, ...discoverableFilter(cohort) })
    .select('_id name avatarUrl course branch semester').maxTimeMS(QUERY_TIMEOUT_MS).lean();
  const byId = new Map(people.map((person) => [idString(person), person]));
  return [...sinceById.keys()].filter((key) => byId.has(key)).map((key) => ({ ...byId.get(key), since: sinceById.get(key) }));
}

// ---------------------------------------------------------------- counts that scale

const PUBLIC_PROBLEM = { status: { $in: ['published', 'Active', 'active'] }, $or: [{ visibility: 'public' }, { visibility: { $exists: false } }] };
const istMidnight = (day) => new Date(Date.parse(`${day}T00:00:00+05:30`));
function periodStart(period, now) {
  if (period === 'week') return istMidnight(istWeekStart(now));
  if (period === 'month') return istMidnight(`${istDay(now).slice(0, 7)}-01`);
  return null;
}

/**
 * Practice problems first solved per student (since `since`, or all time), counted in the database:
 * Map(studentId -> count). Same rule as everywhere else: published public problems + shared catalogue.
 */
export async function solvedCounts(studentIds, since = null) {
  const ids = studentIds.map(objectId);
  const counts = new Map();
  if (!ids.length) return counts;
  const catalog = await getSharedCodingCatalog().catch(() => []);
  const catalogIds = catalog.map((question) => objectId(question._id));
  const sinceStage = since ? [{ $match: { at: { $gte: since } } }] : [];
  const [local, shared] = await Promise.all([
    Submission.aggregate([
      { $match: { user: { $in: ids }, mode: 'submit', assessmentId: null, status: { $in: ACCEPTED } } },
      { $group: { _id: { user: '$user', problem: '$problem' }, at: { $min: '$createdAt' } } },
      ...sinceStage,
      { $lookup: { from: Problem.collection.name, localField: '_id.problem', foreignField: '_id', as: 'problem', pipeline: [{ $match: PUBLIC_PROBLEM }, { $project: { _id: 1 } }] } },
      { $match: { 'problem.0': { $exists: true } } },
      { $group: { _id: '$_id.user', solved: { $sum: 1 } } },
    ]).option({ maxTimeMS: QUERY_TIMEOUT_MS, allowDiskUse: true }),
    catalogIds.length ? QuestionPracticeAttempt.aggregate([
      { $match: { studentId: { $in: ids }, source: 'shared', questionType: 'coding', result: 'correct', questionId: { $in: catalogIds } } },
      { $group: { _id: { user: '$studentId', problem: '$questionId' }, at: { $min: '$createdAt' } } },
      ...sinceStage,
      { $group: { _id: '$_id.user', solved: { $sum: 1 } } },
    ]).option({ maxTimeMS: QUERY_TIMEOUT_MS, allowDiskUse: true }) : [],
  ]);
  for (const row of [...local, ...shared]) counts.set(idString(row._id), (counts.get(idString(row._id)) || 0) + row.solved);
  return counts;
}

/** Students (of `studentIds`) who submitted practice code today (IST). */
async function practisedToday(studentIds, now) {
  const ids = studentIds.map(objectId);
  if (!ids.length) return new Set();
  const start = istMidnight(istDay(now));
  const [local, shared] = await Promise.all([
    Submission.distinct('user', { user: { $in: ids }, mode: 'submit', assessmentId: null, createdAt: { $gte: start } }).maxTimeMS(QUERY_TIMEOUT_MS),
    QuestionPracticeAttempt.distinct('studentId', { studentId: { $in: ids }, source: 'shared', questionType: 'coding', createdAt: { $gte: start } }).maxTimeMS(QUERY_TIMEOUT_MS),
  ]);
  return new Set([...local, ...shared].map(idString));
}

/** Current Prep Streak for a few students (the rows on screen): Map(studentId -> days). */
async function currentStreaks(studentIds, now) {
  const result = new Map();
  for (const [id, streak] of await prepStreaks(studentIds.map(idString), now)) result.set(id, streak.current);
  return result;
}

/** Competition ranks (ties share a rank) by solved, then name: rows are sorted in place. */
function rankRows(rows) {
  rows.sort((a, b) => b.solved - a.solved || a.name.localeCompare(b.name));
  let rank = 0;
  let previous = null;
  rows.forEach((row, index) => {
    if (previous === null || row.solved !== previous) rank = index + 1;
    previous = row.solved;
    row.rank = rank;
  });
  return rows;
}

async function requireMate(viewer, rawId, cohort) {
  const id = validPeerId(rawId);
  if (id === idString(viewer)) throw new HttpError(400, 'That is you.');
  const [link, mate] = await Promise.all([
    PrepMate.findOne({ pairKey: pairKeyOf(viewer._id, id), status: 'accepted' }).select('_id').lean(),
    User.findOne({ _id: objectId(id), ...discoverableFilter(cohort) }).select('_id name avatarUrl course branch semester').lean(),
  ]);
  if (!link || !mate) throw new HttpError(404, 'Only your Prep Mates can be compared or sent a Prep Ping.', { code: 'NOT_PREP_MATE' });
  return mate;
}

// ---------------------------------------------------------------- leaderboard

/** Adds streak, today's status, all-time solved and the Prep Ping state to the rows on screen. */
async function enrichRows(rows, viewerId, now) {
  if (!rows.length) return rows;
  const ids = rows.map((row) => row.id);
  const [streakById, today, allTime, pinged] = await Promise.all([
    currentStreaks(ids, now), practisedToday(ids, now), solvedCounts(ids),
    PrepMateNudge.find({ fromId: objectId(viewerId), day: istDay(now), toId: { $in: ids.map(objectId) } }).select('toId').lean(),
  ]);
  const pingedIds = new Set(pinged.map((row) => idString(row.toId)));
  for (const row of rows) {
    row.streak = streakById.get(row.id) || 0;
    row.practisedToday = today.has(row.id);
    row.totalSolved = allTime.get(row.id) || 0;
    row.nudged = !row.isYou && pingedIds.has(row.id);
    row.canNudge = !row.isYou && !row.practisedToday && !row.nudged;
  }
  return rows;
}

/**
 * The race between you and ALL your Prep Mates for a period, ranked in the database (scales to
 * thousands). Returns the podium (top 3), your own row, one page of the ranking (optionally filtered
 * by name; ranks stay global) and how many Prep Mates practised today.
 */
export async function getCircle(viewer, options = {}, now = new Date()) {
  const { period: rawPeriod = 'week', page: rawPage = 1, limit: rawLimit = LEADERBOARD_PAGE, q = '' } = typeof options === 'string' ? { period: options } : options;
  const period = PERIODS.has(rawPeriod) ? rawPeriod : 'week';
  const limit = Math.min(50, Math.max(1, Number.parseInt(rawLimit, 10) || LEADERBOARD_PAGE));
  const { self, cohort } = await peerScope(viewer);
  const mates = await circleMates(self._id, cohort);
  const people = [self, ...mates];
  const [counts, today] = await Promise.all([
    solvedCounts(people.map((person) => person._id), periodStart(period, now)),
    practisedToday(mates.map((mate) => mate._id), now),
  ]);
  const all = rankRows(people.map((person) => ({ ...peerCard(person), isYou: idString(person) === idString(self), solved: counts.get(idString(person)) || 0 })));
  const query = String(q || '').trim().toLowerCase().slice(0, 40);
  const filtered = query ? all.filter((row) => row.name.toLowerCase().includes(query)) : all;
  const pages = Math.max(1, Math.ceil(filtered.length / limit));
  const page = Math.min(pages, Math.max(1, Number.parseInt(rawPage, 10) || 1));
  const rows = filtered.slice((page - 1) * limit, page * limit);
  const podium = all.slice(0, 3);
  const youIndex = all.findIndex((row) => row.isYou);
  const you = all[youIndex];
  // One enrichment pass for every row shown (podium, page and you), shared by reference.
  await enrichRows([...new Set([...podium, ...rows, you])], self._id, now);
  return {
    period, day: istDay(now), total: all.length, mates: mates.length, practisedToday: today.size, you, podium, rows, page, pages, limit, q: query,
    youPage: Math.floor(youIndex / limit) + 1,
    ...standing(all, youIndex),
  };
}

const pointer = (row) => (row ? { id: row.id, name: row.name, avatarUrl: row.avatarUrl, rank: row.rank, solved: row.solved } : null);

/**
 * Where you stand in a big circle, summarised without listing everyone: the nearest Prep Mate above
 * you (and how many solves pass them), the nearest below, your top percentage, the median and a
 * histogram of everyone's solved count for the period.
 */
export function standing(all, youIndex) {
  const you = all[youIndex];
  if (!you) return { ahead: null, behind: null, topPercent: null, median: 0, distribution: { bins: [], youBin: -1 } };
  let ahead = null;
  for (let index = youIndex - 1; index >= 0; index -= 1) if (all[index].solved > you.solved) { ahead = all[index]; break; }
  const behind = all.slice(youIndex + 1).find((row) => row.solved < you.solved) || null;
  const values = all.map((row) => row.solved).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  const max = values.at(-1) || 0;
  const binCount = Math.max(1, Math.min(12, max + 1));
  const width = Math.max(1, Math.ceil((max + 1) / binCount));
  const bins = Array.from({ length: Math.ceil((max + 1) / width) }, (_, index) => ({ from: index * width, to: index * width + width - 1, count: 0 }));
  for (const value of values) bins[Math.floor(value / width)].count += 1;
  return {
    ahead: ahead && { ...pointer(ahead), toPass: ahead.solved - you.solved + 1 },
    behind: behind && { ...pointer(behind), lead: you.solved - behind.solved },
    topPercent: all.length > 1 ? Math.max(1, Math.ceil((you.rank / all.length) * 100)) : null,
    median,
    distribution: { bins, youBin: Math.floor(you.solved / width) },
  };
}

// ---------------------------------------------------------------- suggestions

// Suggestions per page ("Show more" loads the next page).
const SUGGESTIONS = 10;
const SUGGESTIONS_MAX_PAGE = 50;
const activeCache = new Map();

/** Students with the most practice submissions in the last 7 days (whole database, cached 10 min). */
async function recentlyActive(now) {
  const key = istDay(now);
  const cached = activeCache.get(key);
  if (cached && cached.at > Date.now() - 600_000) return cached.ids;
  const rows = await Submission.aggregate([
    { $match: { mode: 'submit', assessmentId: null, createdAt: { $gte: new Date(now.getTime() - 7 * DAY_MS), $lte: now } } },
    { $group: { _id: '$user', submissions: { $sum: 1 } } },
    { $sort: { submissions: -1 } },
    { $limit: 400 },
  ]).option({ maxTimeMS: QUERY_TIMEOUT_MS, allowDiskUse: true }).catch(() => []);
  const ids = rows.map((row) => idString(row._id));
  activeCache.clear();
  activeCache.set(key, { at: Date.now(), ids });
  return ids;
}

/**
 * Classmates to add: discoverable students of your university you have no Prep Mate link with
 * (accepted, pending or declined), most active this week first, then newest accounts.
 */
/**
 * Classmates you may want as Prep Mates, a page at a time: everyone discoverable at your university
 * who is not yet linked to you, the most active this week first, then the rest (newest accounts
 * first). → { items, total, nextOffset (null on the last page) }
 */
export async function getSuggestions(viewer, now = new Date(), { offset = 0, limit = SUGGESTIONS } = {}) {
  const start = Math.max(0, Math.floor(Number(offset)) || 0);
  const size = Math.min(SUGGESTIONS_MAX_PAGE, Math.max(1, Math.floor(Number(limit)) || SUGGESTIONS));
  const { self, cohort } = await peerScope(viewer);
  const id = objectId(self._id);
  const links = await PrepMate.find({ $or: [{ fromId: id }, { toId: id }] }).select('fromId toId').limit(MATES_CAP * 2).maxTimeMS(QUERY_TIMEOUT_MS).lean();
  const excluded = new Set([idString(id), ...links.flatMap((doc) => [idString(doc.fromId), idString(doc.toId)])]);
  const active = (await recentlyActive(now)).filter((key) => !excluded.has(key));
  const fields = '_id name avatarUrl course branch semester';
  const activePeople = active.length ? await User.find({ _id: { $in: active.map(objectId) }, ...discoverableFilter(cohort) })
    .select(fields).maxTimeMS(QUERY_TIMEOUT_MS).lean() : [];
  const order = new Map(active.map((key, index) => [key, index]));
  activePeople.sort((a, b) => order.get(idString(a)) - order.get(idString(b)));
  // One extra row tells whether another page exists.
  const picked = activePeople.slice(start, start + size + 1);
  const restFilter = { _id: { $nin: [...excluded, ...activePeople.map(idString)].map(objectId) }, ...discoverableFilter(cohort) };
  if (picked.length < size + 1) {
    const more = await User.find(restFilter).select(fields).sort({ _id: -1 })
      .skip(Math.max(0, start - activePeople.length)).limit(size + 1 - picked.length).maxTimeMS(QUERY_TIMEOUT_MS).lean();
    picked.push(...more);
  }
  const restCount = await User.countDocuments(restFilter).maxTimeMS(QUERY_TIMEOUT_MS);
  const page = picked.slice(0, size);
  const week = await solvedCounts(page.map((person) => person._id), periodStart('week', now));
  return {
    items: page.map((person) => ({ ...peerCard(person), thisWeek: week.get(idString(person)) || 0, relation: { mate: 'none', requestId: null } })),
    total: activePeople.length + restCount,
    nextOffset: picked.length > size ? start + size : null,
  };
}

/**
 * Your Prep Mates as a searchable, sortable, paged directory with quick practice stats.
 * sort: recent (newest Prep Mates first) | name | active (most solved this week).
 */
export async function getMateDirectory(viewer, { q = '', sort = 'recent', page: rawPage = 1 } = {}, now = new Date()) {
  const { self, cohort } = await peerScope(viewer);
  const mates = await circleMates(self._id, cohort);
  const query = String(q || '').trim().toLowerCase().slice(0, 40);
  let list = mates.map((mate) => ({ ...peerCard(mate), since: mate.since }));
  if (query) list = list.filter((row) => row.name.toLowerCase().includes(query));
  const week = sort === 'active' || list.length <= DIRECTORY_PAGE ? await solvedCounts(list.map((row) => row.id), periodStart('week', now)) : null;
  if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'active') list.sort((a, b) => (week.get(b.id) || 0) - (week.get(a.id) || 0) || a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(list.length / DIRECTORY_PAGE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(rawPage, 10) || 1));
  const items = list.slice((page - 1) * DIRECTORY_PAGE, page * DIRECTORY_PAGE);
  const weekCounts = week || await solvedCounts(items.map((row) => row.id), periodStart('week', now));
  await enrichRows(items, self._id, now);
  for (const item of items) item.thisWeek = weekCounts.get(item.id) || 0;
  return { total: mates.length, matching: list.length, items, page, pages, sort, q: query };
}

// ---------------------------------------------------------------- nudges

export async function nudgeMate(viewer, rawId, now = new Date()) {
  const { self, cohort } = await peerScope(viewer);
  const mate = await requireMate(self, rawId, cohort);
  const day = istDay(now);
  const facts = await practiceFacts([mate._id], now);
  if (facts.get(idString(mate))?.days.has(day)) throw new HttpError(409, `${peerCard(mate).name} has already practised today.`, { code: 'ALREADY_PRACTISED' });
  if (await PrepMateNudge.countDocuments({ fromId: objectId(self._id), day }) >= NUDGES_PER_DAY) throw new HttpError(429, 'That is enough Prep Pings for today.');
  try {
    await PrepMateNudge.create({ key: `${idString(self)}:${idString(mate)}:${day}`, fromId: objectId(self._id), toId: objectId(mate._id), day, sentAt: now });
  } catch (error) {
    if (error?.code === 11000) throw new HttpError(429, `You already sent ${peerCard(mate).name} a Prep Ping today.`, { code: 'ALREADY_NUDGED' });
    throw error;
  }
  // Students see this as a "Prep Ping" (the internal names stay "nudge").
  const from = peerCard(self);
  await notifyOnce({
    userId: mate._id, dedupeKey: `prep-mate-nudge:${idString(self)}:${day}`, type: 'PREP_MATE_NUDGE',
    title: `${from.name} sent you a Prep Ping`, message: 'Your Prep Mate is cheering for you. Solve one problem today to keep your streak going.',
    actionUrl: '/problems', now,
  }).catch(() => false);
  getIo()?.to(personalRoom(idString(mate))).emit('peer-network-updated', { kind: 'mate-nudge', actor: from, targetId: idString(mate) });
  return { nudged: true };
}

// ---------------------------------------------------------------- head-to-head

async function monthlyBadgeLevels(ids, month) {
  const rows = await BadgeLevelAward.aggregate([
    { $match: { studentId: { $in: ids.map(objectId) }, month } },
    { $group: { _id: { student: '$studentId', track: '$track' }, level: { $max: '$level' } } },
  ]).option({ maxTimeMS: QUERY_TIMEOUT_MS });
  const levels = new Map();
  for (const row of rows) levels.set(`${idString(row._id.student)}:${row._id.track}`, row.level);
  return levels;
}

/** Competition rank (ties share a rank) of each id by `value`, highest first. */
function ranksBy(entries, value) {
  const sorted = [...entries].sort((a, b) => value(b) - value(a));
  const ranks = new Map();
  let rank = 0;
  let previous = null;
  sorted.forEach((entry, index) => {
    if (previous === null || value(entry) !== previous) rank = index + 1;
    previous = value(entry);
    ranks.set(entry.id, rank);
  });
  return ranks;
}

/** Practice days of the last 30 IST days, oldest first: [{ day, active }]. */
function last30(days, now) {
  const today = istDay(now);
  return Array.from({ length: 30 }, (_, index) => {
    const day = shiftDay(today, index - 29);
    return { day, active: days.has(day) };
  });
}

const publicLevel = (progress) => (progress?.level ? { level: progress.level.level, title: progress.level.title } : null);
const publicBadges = (progress) => (progress?.badges ? { earned: progress.badges.earned || 0, milestones: progress.badges.milestones || 0 } : { earned: 0, milestones: 0 });

/**
 * Head to head with one Prep Mate: profile (level, lifetime badges, rank in your circle), questions
 * (difficulty, weeks, topics), consistency (streaks, 30-day strip) and this month's badge levels.
 * Practice-only, like everything a classmate may see.
 */
export async function compareWithMate(viewer, rawId, now = new Date()) {
  const { self, cohort } = await peerScope(viewer);
  const mate = await requireMate(self, rawId, cohort);
  const month = istDay(now).slice(0, 7);
  const mates = await circleMates(self._id, cohort);
  const circleIds = [self, ...mates].map((person) => person._id);
  const [selfFull, mateFull] = await Promise.all([
    User.findById(objectId(self._id)).select('_id role featureAccess accessScope semester college sharePrepReadiness').lean(),
    User.findById(objectId(mate._id)).select('_id role featureAccess accessScope semester college sharePrepReadiness').lean(),
  ]);
  // Prep Score + SBC/PBC summary, decided per person: each side is shown only if that student opted
  // in (the viewer's own numbers included), and only between accepted Prep Mates (requireMate above).
  const [youShared, mateShared] = await Promise.all([
    selfFull?.sharePrepReadiness === true ? sharedSummaryFor(selfFull).catch(() => null) : null,
    mateFull?.sharePrepReadiness === true ? sharedSummaryFor(mateFull).catch(() => null) : null,
  ]);
  // Ranks across the whole circle come from database counts; full practice detail only for the two
  // of you plus the circle's top two others (the optional extra lines on the weekly chart).
  const [allTimeCounts, weekCounts] = await Promise.all([solvedCounts(circleIds), solvedCounts(circleIds, periodStart('week', now))]);
  const circle = circleIds.map((id) => ({ id: idString(id) }));
  const allTime = ranksBy(circle, (entry) => allTimeCounts.get(entry.id) || 0);
  const weekly = ranksBy(circle, (entry) => weekCounts.get(entry.id) || 0);
  const personById = new Map([self, ...mates].map((person) => [idString(person), person]));
  const selfId = idString(self);
  const mateId = idString(mate);
  const solvedOf = (key) => allTimeCounts.get(key) || 0;
  const byAllTime = [...personById.keys()].sort((a, b) => solvedOf(b) - solvedOf(a) || personById.get(a).name.localeCompare(personById.get(b).name));
  const otherIds = byAllTime.filter((key) => key !== selfId && key !== mateId && solvedOf(key) > 0).slice(0, 2);
  const leaderIds = [...new Set([...byAllTime.slice(0, 5), selfId, mateId])]
    .sort((a, b) => solvedOf(b) - solvedOf(a) || personById.get(a).name.localeCompare(personById.get(b).name));
  const [facts, levels, selfProgress, mateProgress] = await Promise.all([
    practiceFacts([self._id, mate._id, ...otherIds], now),
    monthlyBadgeLevels([self._id, mate._id], month),
    peerProgressFor(selfFull).catch(() => null),
    peerProgressFor(mateFull).catch(() => null),
  ]);
  const empty = { solves: [], days: new Set() };
  const you = summarizeFacts(facts.get(idString(self)) || empty, now);
  const them = summarizeFacts(facts.get(idString(mate)) || empty, now);
  const tags = [...new Set([...you.topics.keys(), ...them.topics.keys()])]
    .map((tag) => ({ tag, you: you.topics.get(tag) || 0, mate: them.topics.get(tag) || 0 }))
    .sort((a, b) => (b.you + b.mate) - (a.you + a.mate) || a.tag.localeCompare(b.tag))
    .slice(0, TOPIC_LIMIT);
  const side = (person, stats, progress) => {
    const { topics, ...rest } = stats;
    return {
      ...peerCard(person), ...rest,
      days30: last30((facts.get(idString(person)) || empty).days, now),
      level: publicLevel(progress), badgesEarned: publicBadges(progress),
      rank: { allTime: allTime.get(idString(person)), thisWeek: weekly.get(idString(person)), of: circle.length },
      monthBadgeLevels: TRACKS.reduce((sum, track) => sum + (levels.get(`${idString(person)}:${track.key}`) || 0), 0),
    };
  };
  return {
    month,
    you: side(self, you, selfProgress),
    mate: side(mate, them, mateProgress),
    shared: { you: youShared, mate: mateShared, youSharing: selfFull?.sharePrepReadiness === true, mateSharing: mateFull?.sharePrepReadiness === true },
    topics: tags,
    // The top of your circle by all-time solves, always including the two of you.
    leaders: leaderIds.map((key) => ({ ...peerCard(personById.get(key)), solved: solvedOf(key), rank: allTime.get(key), isYou: key === selfId, isMate: key === mateId })),
    // Up to two more Prep Mates (the circle's leaders) for the optional chart lines.
    others: otherIds.map((key) => {
      const stats = summarizeFacts(facts.get(key) || empty, now);
      return { ...peerCard(personById.get(key)), total: stats.totals.total, weekly: stats.weekly, rank: allTime.get(key) };
    }),
    badges: TRACKS.map((track) => ({ key: track.key, title: track.title, you: levels.get(`${idString(self)}:${track.key}`) || 0, mate: levels.get(`${idString(mate)}:${track.key}`) || 0 })),
  };
}
