// Loads Prep Assessment evidence: the tests an admin can see and each student's
// graded submissions in the period. A coordinator sees only their own tests
// (same rule as the assessment reports); admins also see centrally shared tests.
// A student "passes" a test at 40% of the marks, the platform-wide rule.

import mongoose from 'mongoose';
import Assessment from '../../models/Assessment.js';
import AssessmentSubmission from '../../models/AssessmentSubmission.js';
import { sharedAssessments } from '../../platform/sharedContent.js';
import { authorizedOwnedFilter } from '../adminAnalytics/adminAnalytics.authorization.js';
import { ATTEMPT_BUCKETS, FINISHED_STATUSES, attemptBucketOf } from '../../services/assessmentAttemptCounts.js';

export const PASS_PERCENT = 40;
const MAX_QUERY_MS = 30000;
const IN_LIST_LIMIT = 5000;
const MAX_DEFINITIONS = 5000;
const MAX_SUBMISSIONS = 200000;
const FINAL_STATUSES = ['submitted', 'violation', 'expired']; // graded rows (see TERMINAL_STATUSES)

const isEnded = (test, now) => Boolean(test.manuallyCompletedAt) || (test.endTime && new Date(test.endTime) <= now);

export async function loadAssessmentDefinitions(user, now = new Date(), kind = 'assessment') {
  const local = await Assessment.find({ $and: [authorizedOwnedFilter(user), { kind: kind === 'mock' ? 'mock' : { $ne: 'mock' } }] })
    .select('_id kind title assessmentType lifecycleStatus mockHasHistory isVisible manuallyCompletedAt startTime endTime totalMarks assignedStudents targetType')
    .limit(MAX_DEFINITIONS)
    .maxTimeMS(MAX_QUERY_MS)
    .lean();
  const shared = user?.role === 'admin' ? (await sharedAssessments(kind === 'mock' ? 'mock' : 'assessment', { includeHistorical: kind === 'mock' })) || [] : [];
  return new Map([...local, ...shared]
    .filter((test) => (test.lifecycleStatus !== 'draft' || (kind === 'mock' && test.mockHasHistory)) && (kind === 'mock' ? test.kind === 'mock' : test.kind !== 'mock'))
    .map((test) => [String(test._id), {
      id: String(test._id),
      title: String(test.title || 'Test').trim(),
      type: test.assessmentType || 'mixed',
      visible: test.isVisible !== false,
      ended: isEnded(test, now),
      startTime: test.startTime || null,
      // When the test closed (the moment a student who did not take it has missed it).
      endedAt: test.manuallyCompletedAt || test.endTime || null,
      forEveryone: test.targetType !== 'selected',
      assigned: new Set((test.assignedStudents || []).map(String)),
    }]));
}

/** True when a test was meant for this student. */
export const testAssignedTo = (test, studentId) => test.visible && (test.forEveryone || test.assigned.has(String(studentId)));

/**
 * Narrows the visible tests to the requested ids. Unknown or invisible ids are dropped, never an
 * error. The result keeps the visible map's order so a scoped analysis is deterministic.
 */
export function scopeAssessmentDefinitions(definitions, assessmentIds) {
  const wanted = new Set((assessmentIds || []).map(String));
  return new Map([...definitions].filter(([id]) => wanted.has(id)));
}

const gradedMatch = (tests) => ({
  assessmentId: { $in: [...tests.keys()].map((id) => new mongoose.Types.ObjectId(id)) },
  status: { $in: FINAL_STATUSES },
  evaluationStatus: 'completed',
  score: { $type: 'number' },
  maxMarks: { $gt: 0 },
});

/**
 * The students a scoped analysis is about: assigned to at least one of `tests`, or who started or
 * finished one, graded or not (in any period, so the cohort does not change with the date range).
 * Counting only graded attempts left out everyone whose answers were still being evaluated.
 */
export async function scopeStudentsToAssessments(students, tests) {
  if (!tests.size || !students.length) return [];
  const rows = await AssessmentSubmission.aggregate([
    { $match: { assessmentId: { $in: [...tests.keys()].map((id) => new mongoose.Types.ObjectId(id)) } } },
    { $group: { _id: '$studentId', statuses: { $addToSet: '$status' } } },
  ]).option({ maxTimeMS: MAX_QUERY_MS });
  const started = new Set(rows
    .filter((row) => row.statuses.some((status) => attemptBucketOf(status) !== ATTEMPT_BUCKETS.NOT_STARTED))
    .map((row) => String(row._id)));
  const list = [...tests.values()];
  return students.filter((student) => {
    const id = String(student._id);
    return started.has(id) || list.some((test) => testAssignedTo(test, id));
  });
}

/**
 * Finished attempts that have no score yet (evaluation pending or failed): Map(studentId -> Set(testId)).
 * They are neither scored nor "missed", and the student did take the test.
 */
async function loadAwaitingEvaluation({ tests, studentIds, range }) {
  const match = {
    assessmentId: { $in: [...tests.keys()].map((id) => new mongoose.Types.ObjectId(id)) },
    status: { $in: FINISHED_STATUSES },
    $nor: [{ evaluationStatus: 'completed', score: { $type: 'number' }, maxMarks: { $gt: 0 } }],
  };
  if (studentIds.length <= IN_LIST_LIMIT) match.studentId = { $in: studentIds.map((id) => new mongoose.Types.ObjectId(id)) };
  if (range.from || range.to) {
    const window = { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) };
    match.$or = [{ submittedAt: window }, { submittedAt: null, updatedAt: window }];
  }
  const rows = await AssessmentSubmission.find(match).select('studentId assessmentId').limit(MAX_SUBMISSIONS).maxTimeMS(MAX_QUERY_MS).lean();
  const awaiting = new Map();
  for (const row of rows) {
    const studentId = String(row.studentId);
    if (!tests.has(String(row.assessmentId))) continue;
    if (!awaiting.has(studentId)) awaiting.set(studentId, new Set());
    awaiting.get(studentId).add(String(row.assessmentId));
  }
  return awaiting;
}

/** `tests`: already-loaded (and possibly scoped) definitions; they are loaded for `user` when omitted. */
export async function loadAssessmentFacts({ user, studentIds, range, tests: loaded = null }) {
  const cohort = new Set(studentIds);
  const tests = loaded || await loadAssessmentDefinitions(user);
  if (!studentIds.length || !tests.size) return { tests, byStudent: new Map(), awaiting: new Map() };
  const awaitingRequest = loadAwaitingEvaluation({ tests, studentIds, range });
  const match = gradedMatch(tests);
  if (studentIds.length <= IN_LIST_LIMIT) match.studentId = { $in: studentIds.map((id) => new mongoose.Types.ObjectId(id)) };
  if (range.from || range.to) {
    const window = { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) };
    match.$or = [{ submittedAt: window }, { status: 'expired', updatedAt: window }];
  }
  const rows = await AssessmentSubmission.find(match)
    .select('studentId assessmentId status score maxMarks timeTakenSec submittedAt updatedAt createdAt')
    .limit(MAX_SUBMISSIONS)
    .maxTimeMS(MAX_QUERY_MS)
    .lean();
  const byStudent = new Map();
  for (const row of rows) {
    const studentId = String(row.studentId);
    const test = tests.get(String(row.assessmentId));
    if (!cohort.has(studentId) || !test) continue;
    const at = row.submittedAt || row.updatedAt || row.createdAt;
    const percent = Math.max(0, Math.min(100, (Number(row.score) / Number(row.maxMarks)) * 100));
    const list = byStudent.get(studentId) || [];
    list.push({ testId: test.id, status: row.status, percent: Math.round(percent * 10) / 10, score: Number(row.score), maxMarks: Number(row.maxMarks), minutes: Math.round((Number(row.timeTakenSec) || 0) / 60), at });
    byStudent.set(studentId, list);
  }
  return { tests, byStudent, awaiting: await awaitingRequest };
}
