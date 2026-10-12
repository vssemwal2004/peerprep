import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { University } from './models.js';
import { HttpError } from '../utils/errors.js';

export const GLOBAL_RANK_VERSION = 1;
export const SNAPSHOT_MAX_AGE = 30 * 60_000;
const schema = new mongoose.Schema({
  _id: String, // Authenticated university ID, never a student ID.
  version: Number,
  generatedAt: Date,
  receivedAt: Date,
  policyKey: String,
  buckets: [{ _id: false, score: Number, count: Number }],
}, { versionKey: false });
export const GlobalRankSnapshot = mongoose.models.GlobalRankSnapshot || mongoose.model('GlobalRankSnapshot', schema);

export function rankingPolicyKey(policy) {
  const modules = ['questions', 'learning', 'assessments', 'interviews', 'events'];
  return crypto.createHash('sha256').update(JSON.stringify([
    modules.map((key) => policy.permissions?.[key] === true),
    policy.sources?.questions || 'university', policy.sources?.learning || 'university',
  ])).digest('hex');
}

export function validateRankSnapshot(body, now = new Date()) {
  const generatedAt = new Date(body?.generatedAt);
  if (body?.version !== GLOBAL_RANK_VERSION || !Number.isFinite(generatedAt.getTime()) ||
      generatedAt > new Date(now.getTime() + 60_000) || now - generatedAt > SNAPSHOT_MAX_AGE ||
      !/^[a-f0-9]{64}$/.test(body?.policyKey || '') || !Array.isArray(body?.buckets) || body.buckets.length > 20_000) {
    throw new HttpError(400, 'Invalid ranking snapshot');
  }
  const seen = new Set();
  const buckets = body.buckets.map((row) => {
    if (!Number.isSafeInteger(row?.score) || row.score < 0 || row.score > 1_000_000_000 ||
        !Number.isSafeInteger(row?.count) || row.count < 1 || row.count > 10_000_000 || seen.has(row.score)) {
      throw new HttpError(400, 'Invalid ranking bucket');
    }
    seen.add(row.score);
    return { score: row.score, count: row.count };
  });
  if (buckets.reduce((sum, row) => sum + row.count, 0) > 10_000_000) throw new HttpError(400, 'Ranking population too large');
  // Explicit allowlist drops names, emails, IDs and all unrelated input fields.
  return { version: GLOBAL_RANK_VERSION, generatedAt, policyKey: body.policyKey, buckets: buckets.sort((a, b) => a.score - b.score) };
}

export async function saveRankSnapshot(university, body, now = new Date()) {
  const value = validateRankSnapshot(body, now);
  if (value.policyKey !== rankingPolicyKey(university)) throw new HttpError(409, 'University policy changed; resync rankings');
  try {
    const saved = await GlobalRankSnapshot.findOneAndUpdate(
      { _id: university.universityId, $or: [{ generatedAt: { $lt: value.generatedAt } }, { generatedAt: { $exists: false } }] },
      { $set: { ...value, receivedAt: now } }, { upsert: true, new: true, runValidators: true },
    ).lean();
    return { generatedAt: saved.generatedAt };
  } catch (error) {
    if (error.code === 11000) {
      const existing = await GlobalRankSnapshot.findById(university.universityId).lean();
      if (+existing?.generatedAt === +value.generatedAt && existing.policyKey === value.policyKey &&
          existing.version === value.version && JSON.stringify(existing.buckets) === JSON.stringify(value.buckets)) {
        return { generatedAt: existing.generatedAt };
      }
      throw new HttpError(409, 'A newer ranking snapshot exists');
    }
    throw error;
  }
}

export function summarizeGlobalRank(snapshots, score) {
  let totalStudents = 0, higher = 0, equal = 0;
  for (const snapshot of snapshots) for (const bucket of snapshot.buckets) {
    totalStudents += bucket.count;
    if (bucket.score > score) higher += bucket.count;
    if (bucket.score === score) equal += bucket.count;
  }
  return { rank: higher + 1, totalStudents, tied: equal > 1 };
}

export async function readGlobalRank(university, query, now = new Date()) {
  const score = Number(query.score), generatedAt = new Date(query.generatedAt);
  if (!Number.isSafeInteger(score) || score < 0 || score > 1_000_000_000 || !Number.isFinite(+generatedAt)) throw new HttpError(400, 'Invalid ranking query');
  const universities = await University.find({ active: true, deletedAt: null }).select('universityId permissions sources').maxTimeMS(8000).lean();
  const policies = new Map(universities.map((row) => [row.universityId, rankingPolicyKey(row)]));
  const snapshots = (await GlobalRankSnapshot.find({
    _id: { $in: [...policies.keys()] }, version: GLOBAL_RANK_VERSION,
    generatedAt: { $gte: new Date(now.getTime() - SNAPSHOT_MAX_AGE), $lte: new Date(now.getTime() + 60_000) },
  }).maxTimeMS(8000).lean()).filter((row) => row.policyKey === policies.get(row._id));
  const own = snapshots.find((row) => row._id === university.universityId);
  if (!own || +own.generatedAt !== +generatedAt || !own.buckets.some((row) => row.score === score)) {
    return { status: 'syncing', rank: null };
  }
  return {
    status: 'ready', ...summarizeGlobalRank(snapshots, score), score,
    universities: snapshots.length, totalUniversities: universities.length,
    updatedAt: own.generatedAt, oldestSnapshotAt: new Date(Math.min(...snapshots.map((row) => +row.generatedAt))),
    partial: snapshots.length < universities.length,
  };
}
