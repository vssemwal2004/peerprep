// Readiness evidence: the first verified accepted practice solve of each canonical problem, with
// one primary readiness topic fixed when the row is first written.
//
// Eligible: practice submissions only (mode 'submit', no assessment), accepted by the judge on the
// server (Submission.status AC, shared attempt result 'correct'), on a published public problem.
// Excluded: runs, rejected submissions, assessment attempts, repeat solves, manual reports.
// Local and shared copies merge when both carry the same LeetCode number (sourceNumber), the one
// trusted link between the catalogues; two different problems with the same title stay separate.
import mongoose from 'mongoose';
import Problem from '../../models/Problem.js';
import Submission from '../../models/Submission.js';
import QuestionPracticeAttempt from '../../models/QuestionPracticeAttempt.js';
import { ensureReadinessIndexes, ReadinessEvidence, ReadinessTopicMapping } from '../../models/PrepReadiness.js';
import { canonicalProblemKey, normaliseDifficulty, primaryTopic, topicIndex } from './engine.js';

export { canonicalProblemKey };

const QUERY_TIMEOUT_MS = 8_000;
const ACCEPTED = ['AC', 'ACCEPTED', 'ACCEPT'];
// Written this long after the solve = rebuilt from history, not recorded live.
const RECONSTRUCTED_AFTER_MS = 36 * 3_600_000;
const createdAt = { $ifNull: ['$createdAt', { $toDate: '$_id' }] };
const objectId = (value) => new mongoose.Types.ObjectId(String(value));

const sharedDifficulty = (question) => question?.difficulty || question?.questionData?.problemDataSnapshot?.difficulty || '';
const sharedTags = (question) => question?.tags?.length ? question.tags : question?.questionData?.tags || [];
const sharedTitle = (question) => question?.questionData?.problemDataSnapshot?.title || question?.title || String(question?.questionText || '').slice(0, 120);

/** A catalogue entry in one shape: { sourceKey, problemKey, source, id, title, difficulty, tags, primary, order } */
export function localEntry(problem) {
  return {
    sourceKey: `local:${problem._id}`, source: 'local', id: String(problem._id),
    problemKey: canonicalProblemKey({ source: 'local', id: problem._id, sourceNumber: problem.sourceNumber }),
    title: problem.title || '', difficulty: normaliseDifficulty(problem.difficulty), tags: problem.tags || [],
    primary: problem.scoreTopic || null, order: Number(problem.displayOrder) || Number.MAX_SAFE_INTEGER,
  };
}
export function sharedEntry(question) {
  return {
    sourceKey: `shared:${question._id}`, source: 'shared', id: String(question._id),
    problemKey: canonicalProblemKey({ source: 'shared', id: question._id, sourceNumber: question.sourceNumber }),
    title: sharedTitle(question), difficulty: normaliseDifficulty(sharedDifficulty(question)), tags: sharedTags(question),
    primary: question?.questionData?.scoreTopic || null, order: Number(question.displayOrder) || Number.MAX_SAFE_INTEGER,
  };
}

/**
 * First accepted practice solves: Map(studentId → [{ ...entry, at }]), one per canonical problem
 * (the earliest copy wins).
 */
export async function loadFirstSolves(studentIds, { sharedCatalog = [] } = {}) {
  const ids = [...new Set(studentIds.map(String))].filter((id) => mongoose.isValidObjectId(id)).map(objectId);
  const result = new Map(ids.map((id) => [String(id), []]));
  if (!ids.length) return result;
  const sharedMap = new Map(sharedCatalog.map((question) => [String(question._id), question]));
  const sharedIds = sharedCatalog.map((question) => objectId(question._id));
  const [local, shared] = await Promise.all([
    Submission.aggregate([
      { $match: { user: { $in: ids }, mode: 'submit', assessmentId: null, status: { $in: ACCEPTED } } },
      { $group: { _id: { user: '$user', problem: '$problem' }, at: { $min: createdAt } } },
      { $lookup: { from: Problem.collection.name, localField: '_id.problem', foreignField: '_id', as: 'problem' } },
      { $unwind: '$problem' },
      { $match: { 'problem.status': { $in: ['published', 'Active', 'active'] }, $or: [{ 'problem.visibility': 'public' }, { 'problem.visibility': { $exists: false } }] } },
      { $project: { at: 1, problem: { _id: 1, title: 1, difficulty: 1, tags: 1, scoreTopic: 1, sourceNumber: 1, displayOrder: 1 } } },
    ]).option({ maxTimeMS: QUERY_TIMEOUT_MS }),
    sharedIds.length ? QuestionPracticeAttempt.aggregate([
      { $match: { studentId: { $in: ids }, source: 'shared', questionType: 'coding', questionId: { $in: sharedIds }, result: 'correct' } },
      { $group: { _id: { user: '$studentId', question: '$questionId' }, at: { $min: createdAt } } },
    ]).option({ maxTimeMS: QUERY_TIMEOUT_MS }) : [],
  ]);
  const add = (user, entry, at) => {
    if (!entry?.difficulty) return;
    const list = result.get(String(user));
    if (!list) return;
    const existing = list.find((item) => item.problemKey === entry.problemKey);
    if (!existing) { list.push({ ...entry, at: new Date(at), sourceKeys: [entry.sourceKey] }); return; }
    if (!existing.sourceKeys.includes(entry.sourceKey)) existing.sourceKeys.push(entry.sourceKey);
    if (new Date(at) < existing.at) Object.assign(existing, { ...entry, at: new Date(at), sourceKeys: existing.sourceKeys });
  };
  for (const row of local) add(row._id.user, localEntry(row.problem), row.at);
  for (const row of shared) {
    const question = sharedMap.get(String(row._id.question));
    if (question) add(row._id.user, sharedEntry(question), row.at);
  }
  return result;
}

/** Admin mappings for these problem keys: Map(problemKey → topic). */
export async function mappingsFor(problemKeys) {
  const keys = [...new Set(problemKeys)].filter(Boolean);
  if (!keys.length) return new Map();
  const rows = await ReadinessTopicMapping.find({ problemKey: { $in: keys } }).select('problemKey topic').lean();
  return new Map(rows.map((row) => [row.problemKey, row.topic]));
}

/** Primary topic for a catalogue entry: admin mapping, then publisher primary, then the tag rule. */
export function attribute(entry, mappings, index = topicIndex()) {
  const result = primaryTopic({ primary: entry.primary, tags: entry.tags }, index);
  const mapped = mappings.get(entry.problemKey);
  if (mapped) return { ...result, topic: mapped, source: 'admin' };
  return result;
}

/**
 * Writes evidence rows for solves not stored yet ($setOnInsert, so stored attribution never
 * changes), resolves stored unmapped rows that now have an admin mapping, and returns every
 * evidence row of these students: Map(studentId → rows).
 */
export async function syncEvidence(studentIds, { sharedCatalog = [], now = new Date() } = {}) {
  await ensureReadinessIndexes(ReadinessEvidence);
  const solves = await loadFirstSolves(studentIds, { sharedCatalog });
  const ids = [...solves.keys()].map(objectId);
  const stored = ids.length ? await ReadinessEvidence.find({ studentId: { $in: ids } }).lean() : [];
  const have = new Set(stored.map((row) => `${row.studentId}:${row.problemKey}`));
  const index = topicIndex();
  const unresolved = stored.filter((row) => !row.topic);
  const missing = [];
  for (const [studentId, list] of solves) for (const entry of list) if (!have.has(`${studentId}:${entry.problemKey}`)) missing.push({ studentId, entry });
  const mappings = await mappingsFor([...missing.map((item) => item.entry.problemKey), ...unresolved.map((row) => row.problemKey)]);

  const ops = missing.map(({ studentId, entry }) => {
    const { topic, source, keys, unmapped } = attribute(entry, mappings, index);
    return {
      updateOne: {
        filter: { studentId: objectId(studentId), problemKey: entry.problemKey },
        update: { $setOnInsert: {
          studentId: objectId(studentId), problemKey: entry.problemKey, sourceKeys: entry.sourceKeys, title: entry.title,
          difficulty: entry.difficulty, topic, tags: keys, unmappedTags: unmapped, attribution: source,
          solvedAt: entry.at, reconstructed: now.getTime() - entry.at.getTime() > RECONSTRUCTED_AFTER_MS,
        } },
        upsert: true,
      },
    };
  });
  for (const row of unresolved) {
    const topic = mappings.get(row.problemKey);
    if (topic) ops.push({ updateOne: { filter: { _id: row._id, topic: null }, update: { $set: { topic, attribution: 'admin' } } } });
  }
  if (ops.length) {
    try { await ReadinessEvidence.bulkWrite(ops, { ordered: false }); } catch (error) { if (error?.code !== 11000 && !error?.writeErrors?.every?.((item) => item.code === 11000)) throw error; }
  }
  const rows = ops.length ? await ReadinessEvidence.find({ studentId: { $in: ids } }).lean() : stored;
  const byStudent = new Map(ids.map((id) => [String(id), []]));
  for (const row of rows) byStudent.get(String(row.studentId))?.push(row);
  return byStudent;
}

/** Stored evidence only (no sync), for cohort reads: Map(studentId → rows). */
export async function storedEvidence(studentIds) {
  const ids = [...new Set(studentIds.map(String))].filter((id) => mongoose.isValidObjectId(id)).map(objectId);
  const byStudent = new Map(ids.map((id) => [String(id), []]));
  if (!ids.length) return byStudent;
  await ensureReadinessIndexes(ReadinessEvidence);
  const rows = await ReadinessEvidence.find({ studentId: { $in: ids } }).select('studentId problemKey difficulty topic solvedAt reconstructed').lean();
  for (const row of rows) byStudent.get(String(row.studentId))?.push(row);
  return byStudent;
}
