// Daily per-topic Prep Score quota.
//
// - Every problem counts against ONE topic: the admin's override (Problem.scoreTopic) when set,
//   otherwise its rarest tag across the catalogue (so "Array", on over half the problems, does not
//   swallow everything). Problems without tags use GENERAL_TOPIC.
// - Per student, topic and IST calendar day, only `dailyTopicLimit` first solves count toward the
//   Prep Score. Later solves are saved normally; they just never add to the score.
// - The decision is taken once, at the first accepted solve, and stored (PrepScoreSolve). Solves
//   made before this feature existed have no row and keep counting.
import mongoose from 'mongoose';
import Problem from '../../models/Problem.js';
import { PrepScoreSolve, PrepScoreTopicDay } from '../../models/PrepScoreTopicQuota.js';
import { isUniversity } from '../../platform/deployment.js';
import { sharedQuestions } from '../../platform/sharedContent.js';
import { currentTenant } from '../../platform/tenantContext.js';
import { getActivePrepScorePolicy } from './policy.js';

export const GENERAL_TOPIC = 'General';
// India Standard Time has no daylight saving, so a fixed offset is exact.
const IST_OFFSET_MS = 330 * 60_000;
const FREQUENCY_CACHE_MS = 60 * 60_000;
const DUPLICATE_KEY = 11000;

const objectId = (value) => new mongoose.Types.ObjectId(String(value));

/** IST calendar day (YYYY-MM-DD) of a moment. */
export function istDay(date = new Date()) {
  return new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The next IST midnight after `date`, when the quota resets. */
export function nextResetAt(date = new Date()) {
  const [year, month, day] = istDay(date).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1) - IST_OFFSET_MS);
}

export function cleanTags(tags) {
  const seen = new Set();
  return (Array.isArray(tags) ? tags : [])
    .map((tag) => String(tag ?? '').trim())
    .filter((tag) => tag && !seen.has(tag.toLowerCase()) && seen.add(tag.toLowerCase()));
}

/**
 * The topic a problem's solve counts against. An override must be one of the problem's own tags;
 * otherwise the rarest tag wins (ties broken alphabetically so every server agrees).
 */
export function pickPrimaryTopic(tags, override, frequencies = new Map()) {
  const list = cleanTags(tags);
  const wanted = String(override ?? '').trim().toLowerCase();
  const chosen = wanted && list.find((tag) => tag.toLowerCase() === wanted);
  if (chosen) return chosen;
  if (!list.length) return GENERAL_TOPIC;
  return [...list].sort((a, b) => (frequencies.get(a) || 0) - (frequencies.get(b) || 0) || a.localeCompare(b))[0];
}

const frequencyCache = new Map();

/** How many catalogue problems carry each tag (local published problems + shared coding questions). */
export async function tagFrequencies() {
  const key = currentTenant()?.universityId || 'platform';
  const hit = frequencyCache.get(key);
  if (hit && Date.now() - hit.at < FREQUENCY_CACHE_MS) return hit.value;
  const [local, shared] = await Promise.all([
    Problem.aggregate([
      { $match: { status: { $in: ['published', 'Active', 'active'] }, $or: [{ visibility: 'public' }, { visibility: { $exists: false } }] } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
    ]).option({ maxTimeMS: 8_000 }),
    isUniversity() ? sharedQuestions().catch(() => []) : [],
  ]);
  const value = new Map();
  for (const row of local) {
    const tag = String(row._id ?? '').trim();
    if (tag) value.set(tag, (value.get(tag) || 0) + row.count);
  }
  for (const question of shared || []) {
    if (question.questionType !== 'coding') continue;
    for (const tag of cleanTags(question.tags)) value.set(tag, (value.get(tag) || 0) + 1);
  }
  frequencyCache.set(key, { at: Date.now(), value });
  return value;
}

export function clearTagFrequencyCache() { frequencyCache.clear(); }

export function topicLimitOf(policy) {
  const limit = Number(policy?.config?.modules?.coding?.dailyTopicLimit);
  return Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : 0;
}

/** Tags and admin override of a local problem or a shared coding question, or null if unknown. */
export async function problemTopicSource(source, id) {
  if (!mongoose.isValidObjectId(String(id))) return null;
  if (source === 'shared') {
    const question = (await sharedQuestions().catch(() => []) || []).find((row) => String(row._id) === String(id));
    if (!question) return null;
    return { problemKey: `shared:${id}`, tags: question.tags || question.questionData?.tags, override: question.questionData?.scoreTopic };
  }
  const problem = await Problem.findById(id).select('tags scoreTopic').lean();
  if (!problem) return null;
  return { problemKey: `local:${id}`, tags: problem.tags, override: problem.scoreTopic };
}

function quotaShape({ topic, used, limit, now, counted }) {
  return {
    topic, limit, used: limit ? Math.min(used, limit) : used,
    remaining: limit ? Math.max(0, limit - used) : null,
    unlimited: !limit, resetsAt: nextResetAt(now).toISOString(),
    ...(counted === undefined ? {} : { counted }),
  };
}

/** Today's quota for one problem's topic, plus whether this student already solved it. */
export async function quotaForProblem(studentId, source, id, now = new Date()) {
  const info = await problemTopicSource(source, id);
  if (!info) return null;
  const [frequencies, policy, solve] = await Promise.all([
    tagFrequencies(), getActivePrepScorePolicy(),
    PrepScoreSolve.findOne({ studentId: objectId(studentId), problemKey: info.problemKey }).select('topic counted day').lean(),
  ]);
  const topic = pickPrimaryTopic(info.tags, info.override, frequencies);
  const limit = topicLimitOf(policy);
  const row = limit ? await PrepScoreTopicDay.findOne({ studentId: objectId(studentId), day: istDay(now), topic }).select('used').lean() : null;
  return {
    ...quotaShape({ topic, used: Number(row?.used) || 0, limit, now }),
    solve: solve ? { counted: solve.counted, topic: solve.topic, day: solve.day } : null,
  };
}

async function takeSlot(studentId, day, topic, limit) {
  try {
    await PrepScoreTopicDay.updateOne({ studentId, day, topic }, { $setOnInsert: { used: 0 } }, { upsert: true });
  } catch (error) {
    if (error?.code !== DUPLICATE_KEY) throw error;
  }
  const row = await PrepScoreTopicDay.findOneAndUpdate(
    { studentId, day, topic, used: { $lt: limit } }, { $inc: { used: 1 } }, { new: true },
  ).select('used').lean();
  if (row) return { counted: true, used: row.used };
  const full = await PrepScoreTopicDay.findOne({ studentId, day, topic }).select('used').lean();
  return { counted: false, used: Number(full?.used) || limit };
}

/**
 * Records a student's accepted practice solve and decides whether it counts toward the Prep Score.
 * `alreadySolved`: the student had an accepted solve of this problem before this one (any time), in
 * which case nothing is recorded: a problem only ever counts once.
 * Returns the quota outcome for the student's result screen, or null when nothing applies.
 */
export async function recordAcceptedSolve({ studentId, source, problemId, alreadySolved = false, now = new Date() }) {
  if (!studentId || !problemId) return null;
  const info = await problemTopicSource(source, problemId);
  if (!info) return null;
  const student = objectId(studentId);
  const existing = await PrepScoreSolve.findOne({ studentId: student, problemKey: info.problemKey }).lean();
  const [frequencies, policy] = await Promise.all([tagFrequencies(), getActivePrepScorePolicy()]);
  const limit = topicLimitOf(policy);
  if (existing || alreadySolved) {
    const topic = existing?.topic || pickPrimaryTopic(info.tags, info.override, frequencies);
    const row = limit ? await PrepScoreTopicDay.findOne({ studentId: student, day: istDay(now), topic }).select('used').lean() : null;
    return { ...quotaShape({ topic, used: Number(row?.used) || 0, limit, now }), alreadySolved: true, counted: existing ? existing.counted : null };
  }
  const topic = pickPrimaryTopic(info.tags, info.override, frequencies);
  const day = istDay(now);
  const slot = limit ? await takeSlot(student, day, topic, limit) : { counted: true, used: 0 };
  try {
    await PrepScoreSolve.create({ studentId: student, problemKey: info.problemKey, topic, day, counted: slot.counted, limit, solvedAt: now });
  } catch (error) {
    if (error?.code !== DUPLICATE_KEY) throw error;
    // The same problem was accepted twice at once: the other request recorded it; give the slot back.
    if (limit && slot.counted) await PrepScoreTopicDay.updateOne({ studentId: student, day, topic }, { $inc: { used: -1 } });
    const [winner, row] = await Promise.all([
      PrepScoreSolve.findOne({ studentId: student, problemKey: info.problemKey }).lean(),
      limit ? PrepScoreTopicDay.findOne({ studentId: student, day, topic }).select('used').lean() : null,
    ]);
    return { ...quotaShape({ topic, used: Number(row?.used) || 0, limit, now }), alreadySolved: true, counted: winner?.counted ?? null };
  }
  return { ...quotaShape({ topic, used: slot.used, limit, now, counted: slot.counted }), alreadySolved: false };
}

/** Recorded solves that did NOT count, keyed by student id: [{ problemKey }]. */
export async function uncountedSolvesFor(studentIds) {
  if (!studentIds.length) return new Map();
  const rows = await PrepScoreSolve.find({ studentId: { $in: studentIds.map(objectId) }, counted: false })
    .select('studentId problemKey').maxTimeMS(8_000).lean();
  const byStudent = new Map();
  for (const row of rows) {
    const key = String(row.studentId);
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push(row.problemKey);
  }
  return byStudent;
}
