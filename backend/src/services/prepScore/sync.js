// Keeps StudentPrepScore rows current for the university in the request/job context.
//
// - First use builds every student's row inline (once), so ranks are never read from an empty store.
// - Each maintenance pass folds in students whose activity changed since the watermark.
// - A newly published policy, a licence change or the periodic refresh starts a batched rebuild. Ranks keep reading the serving version until the rebuild completes, so a
//   student never sees a mix of old and new scores.
import mongoose from 'mongoose';
import User from '../../models/User.js';
import Submission from '../../models/Submission.js';
import Progress from '../../models/Progress.js';
import AssessmentSubmission from '../../models/AssessmentSubmission.js';
import Feedback from '../../models/Feedback.js';
import QuestionPracticeAttempt from '../../models/QuestionPracticeAttempt.js';
import { InterviewEngagementReceipt } from '../../models/AdaptiveEngagement.js';
import { PrepScoreState, StudentPrepScore } from '../../models/StudentPrepScore.js';
import { isUniversity } from '../../platform/deployment.js';
import { currentTenant } from '../../platform/tenantContext.js';
import { getActivePrepScorePolicy, getPrepScorePolicyVersion } from './policy.js';
import { computePrepScoreRows, dashboardPermissions } from '../studentDashboardService.js';

const QUERY_TIMEOUT_MS = 8_000;
const BATCH_SIZE = 300;
// More changed students than this in one pass is cheaper as a rebuild.
const INCREMENTAL_LIMIT = 2_000;
// Clock skew between app servers and MongoDB: re-read a little before the watermark.
const WATERMARK_OVERLAP_MS = 5_000;
// Edited content (a problem's difficulty, a topic's level, a test's questions) is folded in by a
// periodic rebuild: content documents also change for unrelated reasons (submission stats), so
// their timestamps cannot signal a scoring change.
const FULL_REBUILD_MS = 6 * 60 * 60_000;
const REBUILD_BUDGET_MS = 5_000;

const PERMISSION_KEYS = ['questions', 'learning', 'assessments', 'interviews', 'events'];
const STUDENT_FIELDS = '_id role semester college isActive accessScope';
// [model, student field, extra filter]. Runs and live-test heartbeats never change a score.
const ACTIVITY_SOURCES = [
  [Submission, 'user', { mode: 'submit' }], [QuestionPracticeAttempt, 'studentId'], [Progress, 'studentId'],
  [AssessmentSubmission, 'studentId', { status: 'submitted' }], [Feedback, 'to'], [InterviewEngagementReceipt, 'studentId'],
];

const tenantKey = () => currentTenant()?.universityId || 'platform';
const builds = new Map();

export function cohortKeyFor(student = {}) {
  if (isUniversity()) return 'university';
  return String(student.college || '').trim().toLowerCase();
}

const eligible = (student) => student.role === 'student' && student.isActive !== false && student.accessScope !== 'assessment_only';

async function tenantScope() {
  const permissions = await dashboardPermissions({});
  return { permissions, permissionsKey: JSON.stringify(PERMISSION_KEYS.map((key) => permissions[key] === true)) };
}

/** Admin-only module detail kept beside the total. */
function moduleDetail(score) {
  return Object.fromEntries(Object.entries(score.features).map(([key, value]) => [key, { score: value.score, counts: value.counts }]));
}

export function storedRow(student, score, version, now = new Date()) {
  return {
    studentId: new mongoose.Types.ObjectId(String(student._id)), policyVersion: version,
    cohortKey: cohortKeyFor(student), eligible: eligible(student), hasProgress: Boolean(score.hasProgress),
    total: Number(score.total) || 0, modules: moduleDetail(score), computedAt: now,
  };
}

async function writeRows(rows) {
  if (!rows.length) return;
  await StudentPrepScore.bulkWrite(rows.map((row) => ({
    updateOne: { filter: { policyVersion: row.policyVersion, studentId: row.studentId }, update: { $set: row }, upsert: true },
  })), { ordered: false });
}

async function recomputeStudents(students, permissions, policy, now = new Date()) {
  const rows = [];
  for (let index = 0; index < students.length; index += BATCH_SIZE) {
    const batch = students.slice(index, index + BATCH_SIZE);
    const scores = await computePrepScoreRows(batch, permissions, policy, now);
    const byId = new Map(scores.map((row) => [String(row.studentId), row.score]));
    rows.push(...batch.map((student) => storedRow(student, byId.get(String(student._id)) || { total: 0, features: {}, hasProgress: false }, policy.version, now)));
  }
  await writeRows(rows);
  return rows.length;
}

async function readState() {
  return PrepScoreState.findById('state').lean();
}

/** Builds every student's row in one go (first use only; later rebuilds are batched in the background). */
async function buildAll(now = new Date()) {
  const [policy, { permissions, permissionsKey }] = await Promise.all([getActivePrepScorePolicy(), tenantScope()]);
  const students = await User.find({ role: 'student' }).select(STUDENT_FIELDS).maxTimeMS(QUERY_TIMEOUT_MS).lean();
  await recomputeStudents(students, permissions, policy, now);
  await PrepScoreState.updateOne({ _id: 'state' }, {
    $set: { servingVersion: policy.version, permissionsKey, watermark: now, lastFullAt: now },
    $unset: { rebuild: '' },
  }, { upsert: true });
  await StudentPrepScore.deleteMany({ policyVersion: { $ne: policy.version } });
  return readState();
}

/** The serving state, building the store inline if this university has never been scored. */
export async function ensurePrepScoreStore() {
  const state = await readState();
  if (state?.servingVersion) return state;
  const key = tenantKey();
  if (!builds.has(key)) builds.set(key, buildAll().finally(() => builds.delete(key)));
  return builds.get(key);
}

export async function servingPolicy(state) {
  return getPrepScorePolicyVersion(state?.servingVersion);
}

/** Writes one student's freshly computed score so their own rank reflects it at once. */
export async function saveOwnScore(student, score, version) {
  if (student.role && student.role !== 'student') return;
  await writeRows([storedRow(student, score, version)]);
}

/**
 * University rank from stored rows. `own` is the student's score at the serving version.
 * Students with no work yet are counted in the total but are never ranked.
 */
export async function rankFromStore(student, own, version, cohort) {
  const studentId = new mongoose.Types.ObjectId(String(student._id));
  const base = { policyVersion: version, cohortKey: cohortKeyFor(student), eligible: true, hasProgress: true, studentId: { $ne: studentId } };
  const [totalStudents, higher, equal] = await Promise.all([
    cohort ? User.countDocuments(cohort).maxTimeMS(QUERY_TIMEOUT_MS) : 0,
    StudentPrepScore.countDocuments({ ...base, total: { $gt: own.total } }).maxTimeMS(QUERY_TIMEOUT_MS),
    StudentPrepScore.countDocuments({ ...base, total: own.total }).maxTimeMS(QUERY_TIMEOUT_MS),
  ]);
  const lower = Math.max(0, totalStudents - higher - equal - 1);
  return {
    totalStudents, rank: higher + 1, tied: equal > 0,
    percentile: totalStudents > 1 ? Math.round((lower / (totalStudents - 1)) * 100) : 100,
  };
}

/** Rows ranked by the global snapshot: every eligible student at the serving version. */
export async function servingRows(state) {
  return StudentPrepScore.find({ policyVersion: state.servingVersion, eligible: true })
    .select('studentId total hasProgress').maxTimeMS(QUERY_TIMEOUT_MS).lean();
}

/** Stored rows for admin analysis (overall and per-module), keyed by student id. */
export async function storedScoresFor(studentIds) {
  const state = await ensurePrepScoreStore();
  const rows = await StudentPrepScore.find({ policyVersion: state.servingVersion, studentId: { $in: studentIds.map((id) => new mongoose.Types.ObjectId(String(id))) } })
    .select('studentId total hasProgress modules').maxTimeMS(QUERY_TIMEOUT_MS).lean();
  return { version: state.servingVersion, scores: new Map(rows.map((row) => [String(row.studentId), row])) };
}

async function studentsChangedSince(since) {
  const filter = { updatedAt: { $gte: since } };
  const ids = await Promise.all(ACTIVITY_SOURCES.map(([model, path, extra = {}]) => model.distinct(path, { ...extra, ...filter }).maxTimeMS(QUERY_TIMEOUT_MS)));
  return [...new Set(ids.flat().filter(Boolean).map(String))];
}

async function startRebuild(version, permissionsKey, now) {
  await PrepScoreState.updateOne({ _id: 'state' }, { $set: { rebuild: { version, permissionsKey, afterId: null, startedAt: now, processed: 0 } } });
}

async function continueRebuild(state, permissions, now) {
  const { rebuild } = state;
  const policy = await getPrepScorePolicyVersion(rebuild.version);
  const students = await User.find({ role: 'student', ...(rebuild.afterId ? { _id: { $gt: rebuild.afterId } } : {}) })
    .sort({ _id: 1 }).limit(BATCH_SIZE).select(STUDENT_FIELDS).maxTimeMS(QUERY_TIMEOUT_MS).lean();
  await recomputeStudents(students, permissions, policy, now);
  if (students.length === BATCH_SIZE) {
    await PrepScoreState.updateOne({ _id: 'state', 'rebuild.startedAt': rebuild.startedAt }, {
      $set: { 'rebuild.afterId': students.at(-1)._id }, $inc: { 'rebuild.processed': students.length },
    });
    return { status: 'rebuilding', processed: (rebuild.processed || 0) + students.length };
  }
  // Activity during the rebuild is re-read by the next incremental pass.
  await PrepScoreState.updateOne({ _id: 'state', 'rebuild.startedAt': rebuild.startedAt }, {
    $set: { servingVersion: rebuild.version, permissionsKey: rebuild.permissionsKey, watermark: rebuild.startedAt, lastFullAt: now },
    $unset: { rebuild: '' },
  });
  // Drops the previous version and rows of students who no longer exist (untouched by this rebuild).
  await StudentPrepScore.deleteMany({ $or: [
    { policyVersion: { $ne: rebuild.version } },
    { policyVersion: rebuild.version, computedAt: { $lt: rebuild.startedAt } },
  ] });
  return { status: 'rebuilt', version: rebuild.version };
}

/** One maintenance pass for the current university. Safe to call repeatedly. */
export async function syncPrepScores(now = new Date()) {
  let state = await readState();
  if (!state?.servingVersion) {
    await ensurePrepScoreStore();
    return { status: 'built' };
  }
  const [policy, { permissions, permissionsKey }] = await Promise.all([getActivePrepScorePolicy(), tenantScope()]);
  const stale = state.servingVersion !== policy.version || state.permissionsKey !== permissionsKey;
  const rebuildTarget = state.rebuild?.startedAt && state.rebuild.version === policy.version && state.rebuild.permissionsKey === permissionsKey;
  if (!rebuildTarget && (stale || !state.lastFullAt || now - state.lastFullAt >= FULL_REBUILD_MS)) {
    await startRebuild(policy.version, permissionsKey, now);
    state = await readState();
  }
  if (state.rebuild?.startedAt) {
    // Several batches per pass, within a small time budget so other maintenance work keeps flowing.
    const started = Date.now();
    let result;
    do {
      result = await continueRebuild(state, permissions, now);
      state = await readState();
    } while (result.status === 'rebuilding' && state?.rebuild?.startedAt && Date.now() - started < REBUILD_BUDGET_MS);
    return result;
  }

  const since = new Date(new Date(state.watermark || 0).getTime() - WATERMARK_OVERLAP_MS);
  const [activityIds, userIds] = await Promise.all([
    studentsChangedSince(since),
    User.distinct('_id', { role: 'student', updatedAt: { $gte: since } }).maxTimeMS(QUERY_TIMEOUT_MS),
  ]);
  const ids = [...new Set([...activityIds, ...userIds.map(String)])];
  if (ids.length > INCREMENTAL_LIMIT) {
    await startRebuild(state.servingVersion, state.permissionsKey, now);
    return { status: 'rebuilding', processed: 0 };
  }
  if (ids.length) {
    const servingPolicyRow = await getPrepScorePolicyVersion(state.servingVersion);
    const students = await User.find({ _id: { $in: ids.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id)) }, role: 'student' })
      .select(STUDENT_FIELDS).maxTimeMS(QUERY_TIMEOUT_MS).lean();
    await recomputeStudents(students, permissions, servingPolicyRow, now);
  }
  await PrepScoreState.updateOne({ _id: 'state' }, { $set: { watermark: now } });
  return { status: 'current', updated: ids.length };
}

/** Rebuild progress for the Master Admin page (current university or platform context). */
export async function prepScoreSyncStatus() {
  const state = await readState();
  return {
    servingVersion: state?.servingVersion || null,
    rebuilding: Boolean(state?.rebuild?.startedAt),
    rebuildVersion: state?.rebuild?.version || null,
    processed: state?.rebuild?.processed || 0,
    updatedAt: state?.updatedAt || null,
  };
}
