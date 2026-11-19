// Prep Mates circle: a leaderboard of you and your Prep Mates, an activity feed of their practice,
// friendly streak nudges, and a head-to-head comparison with one Prep Mate.
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
import { TRACKS, tierOf } from './monthlyBadges.js';

const QUERY_TIMEOUT_MS = 8_000;
const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;
const CIRCLE_LIMIT = 60;
const FEED_DAYS = 14;
const FEED_LIMIT = 30;
const WEEKS = 8;
const TOPIC_LIMIT = 8;
const NUDGES_PER_DAY = 20;
const STREAK_MILESTONES = new Set([3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365]);
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
    streak: streaks(fact.days, today),
    practisedToday: fact.days.has(today),
    activeDays30: [...fact.days].filter((day) => day >= since30 && day <= today).length,
    topicsCovered: topics.size,
    weekly: weekStarts.map((start) => ({ weekStart: start, solved: weekly.get(start) })),
    topics,
  };
}

// ---------------------------------------------------------------- mates

/** The viewer's accepted Prep Mates who are still discoverable in their university (most recent first). */
async function circleMates(viewerId, cohort) {
  const id = objectId(viewerId);
  const links = await PrepMate.find({ status: 'accepted', $or: [{ fromId: id }, { toId: id }] })
    .sort({ respondedAt: -1 }).limit(CIRCLE_LIMIT * 2).select('fromId toId').maxTimeMS(QUERY_TIMEOUT_MS).lean();
  const otherIds = links.map((doc) => (idString(doc.fromId) === idString(id) ? doc.toId : doc.fromId));
  if (!otherIds.length) return [];
  const people = await User.find({ _id: { $in: otherIds }, ...discoverableFilter(cohort) }).select('_id name avatarUrl course branch semester').maxTimeMS(QUERY_TIMEOUT_MS).lean();
  const byId = new Map(people.map((person) => [idString(person), person]));
  return otherIds.map((otherId) => byId.get(idString(otherId))).filter(Boolean).slice(0, CIRCLE_LIMIT);
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

export async function getCircle(viewer, rawPeriod = 'week', now = new Date()) {
  const period = PERIODS.has(rawPeriod) ? rawPeriod : 'week';
  const { self, cohort } = await peerScope(viewer);
  const mates = await circleMates(self._id, cohort);
  const today = istDay(now);
  const [facts, nudged] = await Promise.all([
    practiceFacts([self._id, ...mates.map((mate) => mate._id)], now),
    PrepMateNudge.find({ fromId: objectId(self._id), day: today }).select('toId').lean(),
  ]);
  const nudgedIds = new Set(nudged.map((row) => idString(row.toId)));
  const rowFor = (person, isYou) => {
    const stats = summarizeFacts(facts.get(idString(person)) || { solves: [], days: new Set() }, now);
    const solved = period === 'week' ? stats.thisWeek : period === 'month' ? stats.thisMonth : stats.totals.total;
    const wasNudged = nudgedIds.has(idString(person));
    return {
      ...peerCard(person), isYou, solved, totalSolved: stats.totals.total, streak: stats.streak.current, practisedToday: stats.practisedToday,
      nudged: !isYou && wasNudged, canNudge: !isYou && !stats.practisedToday && !wasNudged,
    };
  };
  const rows = [rowFor(self, true), ...mates.map((mate) => rowFor(mate, false))]
    .sort((a, b) => b.solved - a.solved || b.streak - a.streak || a.name.localeCompare(b.name));
  let rank = 0;
  let previous = null;
  rows.forEach((row, index) => {
    if (previous === null || row.solved !== previous) rank = index + 1;
    previous = row.solved;
    row.rank = rank;
  });
  return { period, day: today, mates: mates.length, rows };
}

// ---------------------------------------------------------------- activity feed

export async function getFeed(viewer, now = new Date()) {
  const { self, cohort } = await peerScope(viewer);
  const mates = await circleMates(self._id, cohort);
  if (!mates.length) return { items: [] };
  const since = new Date(now.getTime() - FEED_DAYS * DAY_MS);
  const [facts, badgeRows] = await Promise.all([
    practiceFacts(mates.map((mate) => mate._id), now),
    BadgeLevelAward.find({ studentId: { $in: mates.map((mate) => objectId(mate._id)) }, earnedAt: { $gte: since } })
      .sort({ earnedAt: -1 }).limit(200).lean(),
  ]);
  const titles = new Map(TRACKS.map((track) => [track.key, track.title]));
  const items = [];
  for (const mate of mates) {
    const card = peerCard(mate);
    const fact = facts.get(idString(mate));
    const byDay = new Map();
    for (const solve of fact.solves.filter((row) => new Date(row.at) >= since)) {
      const day = istDay(solve.at);
      const group = byDay.get(day) || { at: solve.at, problems: [] };
      if (new Date(solve.at) > new Date(group.at)) group.at = solve.at;
      group.problems.push({ title: solve.title, difficulty: solve.difficulty });
      byDay.set(day, group);
    }
    for (const [day, group] of byDay) {
      items.push({ id: `solved:${card.id}:${day}`, type: 'solved', mate: card, at: group.at, count: group.problems.length, problems: group.problems.slice(0, 3) });
    }
    const { current } = streaks(fact.days, istDay(now));
    if (STREAK_MILESTONES.has(current) && fact.days.has(istDay(now))) {
      items.push({ id: `streak:${card.id}:${istDay(now)}`, type: 'streak', mate: card, at: now, days: current });
    }
  }
  // Only each badge's highest new level per mate and month, so a catch-up never floods the feed.
  const bestBadge = new Map();
  for (const award of badgeRows) {
    const key = `${idString(award.studentId)}:${award.month}:${award.track}`;
    if (!bestBadge.has(key) || bestBadge.get(key).level < award.level) bestBadge.set(key, award);
  }
  const mateById = new Map(mates.map((mate) => [idString(mate), peerCard(mate)]));
  for (const award of bestBadge.values()) {
    items.push({ id: `badge:${idString(award.studentId)}:${award.month}:${award.track}:${award.level}`, type: 'badge', mate: mateById.get(idString(award.studentId)),
      at: award.earnedAt, badge: { title: titles.get(award.track) || award.track, level: award.level, tier: tierOf(award.level) } });
  }
  items.sort((a, b) => new Date(b.at) - new Date(a.at));
  return { items: items.slice(0, FEED_LIMIT) };
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
  const selfFull = await User.findById(objectId(self._id)).select('_id role featureAccess accessScope semester college').lean();
  const mateFull = await User.findById(objectId(mate._id)).select('_id role featureAccess accessScope semester college').lean();
  const [facts, levels, selfProgress, mateProgress] = await Promise.all([
    practiceFacts([self._id, ...mates.map((row) => row._id)], now),
    monthlyBadgeLevels([self._id, mate._id], month),
    peerProgressFor(selfFull).catch(() => null),
    peerProgressFor(mateFull).catch(() => null),
  ]);
  const empty = { solves: [], days: new Set() };
  const circle = [self, ...mates].map((person) => ({ id: idString(person), stats: summarizeFacts(facts.get(idString(person)) || empty, now) }));
  const allTime = ranksBy(circle, (entry) => entry.stats.totals.total);
  const weekly = ranksBy(circle, (entry) => entry.stats.thisWeek);
  const you = circle[0].stats;
  const them = circle.find((entry) => entry.id === idString(mate)).stats;
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
    topics: tags,
    badges: TRACKS.map((track) => ({ key: track.key, title: track.title, you: levels.get(`${idString(self)}:${track.key}`) || 0, mate: levels.get(`${idString(mate)}:${track.key}`) || 0 })),
  };
}
