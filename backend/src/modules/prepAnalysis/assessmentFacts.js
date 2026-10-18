// Loads Prep Assessment evidence: the tests an admin can see and each student's
// graded submissions in the period. A coordinator sees only their own tests
// (same rule as the assessment reports); admins also see centrally shared tests.
// A student "passes" a test at 40% of the marks, the platform-wide rule.

import mongoose from 'mongoose';
import Assessment from '../../models/Assessment.js';
import AssessmentSubmission from '../../models/AssessmentSubmission.js';
import { sharedAssessments } from '../../platform/sharedContent.js';
import { authorizedOwnedFilter } from '../adminAnalytics/adminAnalytics.authorization.js';

export const PASS_PERCENT = 40;
const MAX_QUERY_MS = 30000;
const IN_LIST_LIMIT = 5000;
const MAX_DEFINITIONS = 5000;
const MAX_SUBMISSIONS = 200000;
const FINAL_STATUSES = ['submitted', 'violation', 'expired'];

const isEnded = (test, now) => Boolean(test.manuallyCompletedAt) || (test.endTime && new Date(test.endTime) <= now);

export async function loadAssessmentDefinitions(user, now = new Date()) {
  const local = await Assessment.find(authorizedOwnedFilter(user))
    .select('_id title assessmentType lifecycleStatus isVisible manuallyCompletedAt startTime endTime totalMarks assignedStudents targetType')
    .limit(MAX_DEFINITIONS)
    .maxTimeMS(MAX_QUERY_MS)
    .lean();
  const shared = user?.role === 'admin' ? (await sharedAssessments()) || [] : [];
  return new Map([...local, ...shared]
    .filter((test) => test.lifecycleStatus !== 'draft')
    .map((test) => [String(test._id), {
      id: String(test._id),
      title: String(test.title || 'Test').trim(),
      type: test.assessmentType || 'mixed',
      visible: test.isVisible !== false,
      ended: isEnded(test, now),
      startTime: test.startTime || null,
      forEveryone: test.targetType !== 'selected',
      assigned: new Set((test.assignedStudents || []).map(String)),
    }]));
}

/** True when a test was meant for this student. */
export const testAssignedTo = (test, studentId) => test.visible && (test.forEveryone || test.assigned.has(String(studentId)));

export async function loadAssessmentFacts({ user, studentIds, range }) {
  const cohort = new Set(studentIds);
  const tests = await loadAssessmentDefinitions(user);
  if (!studentIds.length || !tests.size) return { tests, byStudent: new Map() };
  const match = {
    assessmentId: { $in: [...tests.keys()].map((id) => new mongoose.Types.ObjectId(id)) },
    status: { $in: FINAL_STATUSES },
    evaluationStatus: 'completed',
    score: { $type: 'number' },
    maxMarks: { $gt: 0 },
  };
  if (studentIds.length <= IN_LIST_LIMIT) match.studentId = { $in: studentIds.map((id) => new mongoose.Types.ObjectId(id)) };
  if (range.from || range.to) {
    const window = { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) };
    match.$or = [{ submittedAt: window }, { status: 'expired', updatedAt: window }];
  }
  const rows = await AssessmentSubmission.find(match)
    .select('studentId assessmentId score maxMarks timeTakenSec submittedAt updatedAt createdAt')
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
    list.push({ testId: test.id, percent: Math.round(percent * 10) / 10, score: Number(row.score), maxMarks: Number(row.maxMarks), minutes: Math.round((Number(row.timeTakenSec) || 0) / 60), at });
    byStudent.set(studentId, list);
  }
  return { tests, byStudent };
}
