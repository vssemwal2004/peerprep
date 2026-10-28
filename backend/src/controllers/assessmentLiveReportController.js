import mongoose from 'mongoose';
import Assessment from '../models/Assessment.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import User from '../models/User.js';
import { sharedAssessment } from '../platform/sharedContent.js';
import { evaluatedScoreExpression } from '../services/assessmentReportSummaryService.js';
import { studentFeatureQuery } from '../services/studentFeatureAccess.js';
import {
  ASSESSMENT_EDIT_PERMISSION, AssessmentAccessError, authorizeAssessmentReportAccess,
} from '../services/assessmentReportAccess.js';
import { notifyAssessmentReportChanged } from '../services/assessmentReportRealtime.js';
import { normalizeAssessmentSettings } from './assessmentController.js';
import { logActivity } from './adminActivityController.js';

// A roster is one exam's candidates; the cap only bounds a pathological request.
export const ROSTER_ROW_LIMIT = 3000;
// Deltas re-read this much before the cursor. updatedAt is stamped by app
// servers before the write commits (and clocks differ slightly), so a small
// overlap prevents missed rows; clients merge rows by `key`, idempotently.
export const ROSTER_CURSOR_OVERLAP_MS = 5000;
const TERMINAL_STATUSES = ['submitted', 'violation', 'expired'];
const FLAG_RISK_LEVELS = new Set(['high', 'critical']);

function respondAccessError(res, error) {
  if (error instanceof AssessmentAccessError || (error?.status && error?.code)) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  console.error('Live assessment report failed:', error);
  return res.status(500).json({ error: 'Failed to load the live report.' });
}

const finiteOrNull = (value) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null);
const round2 = (value) => Math.round(value * 100) / 100;
const isoOrNull = (value) => (value ? new Date(value).toISOString() : null);

function passPercentageOf(settings = {}) {
  const configured = Number(settings?.passPercentage);
  return Number.isFinite(configured) ? Math.min(100, Math.max(0, configured)) : 40;
}

function assessmentStatus(assessment, now) {
  if (assessment.lifecycleStatus === 'draft') return 'Draft';
  if (assessment.manuallyCompletedAt) return 'Completed';
  if (assessment.startTime && now < new Date(assessment.startTime)) return 'Upcoming';
  if (assessment.endTime && now > new Date(assessment.endTime)) return 'Completed';
  return 'Active';
}

const questionCountExpression = (path) => ({
  $sum: { $map: { input: { $ifNull: [path, []] }, as: 'section', in: { $size: { $ifNull: ['$$section.questions', []] } } } },
});

// Only metadata: question bodies, answers and candidate lists stay in MongoDB.
async function loadRosterAssessment(assessmentId) {
  const [local] = await Assessment.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(assessmentId) } },
    { $project: {
      title: 1, totalMarks: 1, startTime: 1, endTime: 1, duration: 1, lifecycleStatus: 1, manuallyCompletedAt: 1,
      targetType: 1, passPercentage: '$settings.passPercentage',
      assignedCount: { $size: { $ifNull: ['$assignedStudents', []] } },
      totalQuestions: questionCountExpression('$sections'),
    } },
  ]).option({ maxTimeMS: 5000 });
  if (local) return { ...local, shared: false };
  const shared = await sharedAssessment(assessmentId);
  if (!shared) return null;
  return {
    _id: shared._id, title: shared.title, totalMarks: shared.totalMarks, startTime: shared.startTime, endTime: shared.endTime,
    duration: shared.duration, lifecycleStatus: shared.lifecycleStatus, manuallyCompletedAt: shared.manuallyCompletedAt,
    targetType: shared.targetType, passPercentage: shared.settings?.passPercentage,
    assignedCount: (shared.assignedStudents || []).length, assignedStudents: shared.assignedStudents || [],
    totalQuestions: (shared.sections || []).reduce((sum, section) => sum + (section?.questions || []).length, 0),
    shared: true,
  };
}

const answeredExpression = {
  $size: { $filter: {
    input: { $ifNull: ['$answers', []] },
    as: 'answer',
    cond: { $or: [
      { $and: [
        { $ne: [{ $ifNull: ['$$answer.answer', null] }, null] },
        { $ne: ['$$answer.answer', ''] },
        { $ne: ['$$answer.answer', []] },
      ] },
      { $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ['$$answer.code', ''] } } } }, 0] },
    ] },
  } },
};

function submissionRow(doc, student, assessment, passPercentage) {
  const graded = TERMINAL_STATUSES.includes(doc.status) && (doc.evaluationStatus ?? 'completed') === 'completed'
    && Number.isFinite(doc.score);
  const maxMarks = graded ? (finiteOrNull(doc.maxMarks) ?? finiteOrNull(assessment.totalMarks)) : null;
  const percentage = graded && maxMarks > 0 ? round2(Math.min(100, Math.max(0, (doc.score / maxMarks) * 100))) : null;
  const tabSwitches = Number(doc.tabSwitches || 0);
  const fullscreenExits = Number(doc.fullscreenExits || 0);
  const cameraFlags = Number(doc.cameraFlags || 0);
  const violationScore = Number(doc.violationScore || 0);
  return {
    key: String(doc._id),
    submissionId: String(doc._id),
    studentId: String(doc.studentId),
    name: student?.name || '',
    email: student?.email || '',
    rollNo: student?.studentId || '',
    status: doc.status || 'not_started',
    evaluationStatus: TERMINAL_STATUSES.includes(doc.status) ? (doc.evaluationStatus || 'completed') : null,
    score: graded ? doc.score : null,
    maxMarks,
    percentage,
    passed: percentage === null ? null : percentage >= passPercentage,
    startedAt: isoOrNull(doc.startedAt),
    submittedAt: isoOrNull(doc.submittedAt),
    lastSavedAt: isoOrNull(doc.lastSavedAt),
    timeTakenSec: finiteOrNull(doc.timeTakenSec),
    answeredCount: Number(doc.answeredCount || 0),
    totalQuestions: finiteOrNull(doc.deliveredQuestions) ?? Number(assessment.totalQuestions || 0),
    violationScore,
    tabSwitches,
    fullscreenExits,
    cameraFlags,
    aiViolationCount: Number(doc.aiViolationCount || 0),
    flagged: violationScore > 0 || tabSwitches + fullscreenExits + cameraFlags + Number(doc.copyPasteCount || 0) > 0
      || FLAG_RISK_LEVELS.has(doc.aiRiskLevel) || Number(doc.inconsistentHeartbeatCount || 0) > 0,
    isLate: Boolean(doc.isLate),
    updatedAt: isoOrNull(doc.updatedAt),
  };
}

function notStartedRow(student, assessment) {
  return {
    key: `student:${student._id}`,
    submissionId: null,
    studentId: String(student._id),
    name: student.name || '',
    email: student.email || '',
    rollNo: student.studentId || '',
    status: 'not_started',
    evaluationStatus: null,
    score: null,
    maxMarks: null,
    percentage: null,
    passed: null,
    startedAt: null,
    submittedAt: null,
    lastSavedAt: null,
    timeTakenSec: null,
    answeredCount: 0,
    totalQuestions: Number(assessment.totalQuestions || 0),
    violationScore: 0,
    tabSwitches: 0,
    fullscreenExits: 0,
    cameraFlags: 0,
    aiViolationCount: 0,
    flagged: false,
    isLate: false,
    updatedAt: null,
  };
}

function parseCursor(value) {
  if (value === undefined || value === null || value === '') return { since: null };
  if (typeof value !== 'string' || value.length > 64) return { invalid: true };
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? { invalid: true } : { since: date };
}

async function assignedStudentsWithoutAttempt(assessment, attemptedIds, remaining) {
  if (remaining <= 0) return [];
  const projection = '_id name email studentId';
  if (assessment.targetType === 'all' && !assessment.assignedCount) {
    return User.find({
      role: 'student', accessScope: { $ne: 'assessment_only' }, ...studentFeatureQuery('assessments'),
      _id: { $nin: [...attemptedIds].map((id) => new mongoose.Types.ObjectId(id)) },
    }).select(projection).sort({ name: 1, _id: 1 }).limit(remaining).maxTimeMS(5000).lean();
  }
  const assigned = assessment.shared
    ? assessment.assignedStudents
    : (await Assessment.findById(assessment._id).select('assignedStudents').lean())?.assignedStudents || [];
  const missing = [...new Set(assigned.map((id) => String(id?._id || id)))]
    .filter((id) => mongoose.isValidObjectId(id) && !attemptedIds.has(id))
    .slice(0, remaining);
  if (!missing.length) return [];
  return User.find({ _id: { $in: missing }, role: 'student' }).select(projection).maxTimeMS(5000).lean();
}

/**
 * GET /admin/assessment/:id/report/roster[?since=<cursor>]
 * Live report rows. Without `since`: every attempt plus assigned students with
 * no attempt (status 'not_started', submissionId null). With `since`: only
 * attempts whose updatedAt >= since - overlap (full:false).
 */
export async function getAssessmentRoster(req, res) {
  try {
    const { assessmentId } = await authorizeAssessmentReportAccess(req.user, req.params.id);
    res.set('Cache-Control', 'no-store');
    const cursor = parseCursor(req.query?.since);
    if (cursor.invalid) return res.status(400).json({ error: 'Invalid cursor.', code: 'INVALID_CURSOR' });
    const now = new Date();
    const assessment = await loadRosterAssessment(assessmentId);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found.', code: 'ASSESSMENT_NOT_FOUND' });
    const passPercentage = passPercentageOf({ passPercentage: assessment.passPercentage });

    const match = { assessmentId: new mongoose.Types.ObjectId(assessmentId) };
    if (cursor.since) match.updatedAt = { $gte: new Date(cursor.since.getTime() - ROSTER_CURSOR_OVERLAP_MS) };
    const docs = await AssessmentSubmission.aggregate([
      { $match: match },
      { $sort: { updatedAt: 1, _id: 1 } },
      { $limit: ROSTER_ROW_LIMIT + 1 },
      { $project: {
        studentId: 1, status: 1, evaluationStatus: 1, startedAt: 1, submittedAt: 1, lastSavedAt: 1, timeTakenSec: 1,
        violationScore: 1, tabSwitches: 1, fullscreenExits: 1, cameraFlags: 1, copyPasteCount: 1, isLate: 1,
        updatedAt: 1, maxMarks: 1, inconsistentHeartbeatCount: 1,
        score: evaluatedScoreExpression,
        aiViolationCount: { $ifNull: ['$aiProctoringSummary.totalViolations', 0] },
        aiRiskLevel: '$aiProctoringSummary.riskLevel',
        answeredCount: answeredExpression,
        deliveredQuestions: { $cond: [
          { $gt: [{ $size: { $ifNull: ['$deliverySections', []] } }, 0] },
          questionCountExpression('$deliverySections'),
          null,
        ] },
      } },
    ]).option({ maxTimeMS: 5000 });
    const truncated = docs.length > ROSTER_ROW_LIMIT;
    const page = truncated ? docs.slice(0, ROSTER_ROW_LIMIT) : docs;

    const studentIds = [...new Set(page.map((doc) => String(doc.studentId)))];
    const students = studentIds.length
      ? await User.find({ _id: { $in: studentIds } }).select('_id name email studentId').maxTimeMS(5000).lean()
      : [];
    const byId = new Map(students.map((student) => [String(student._id), student]));
    const rows = page.map((doc) => submissionRow(doc, byId.get(String(doc.studentId)), assessment, passPercentage));

    if (!cursor.since) {
      const attempted = new Set((truncated ? docs : page).map((doc) => String(doc.studentId)));
      const waiting = await assignedStudentsWithoutAttempt(assessment, attempted, ROSTER_ROW_LIMIT - rows.length);
      rows.push(...waiting.map((student) => notStartedRow(student, assessment)));
    }

    const latest = page.reduce((max, doc) => (doc.updatedAt && (!max || doc.updatedAt > max) ? doc.updatedAt : max), null);
    return res.json({
      rows,
      cursor: latest ? new Date(latest).toISOString() : (cursor.since ? cursor.since.toISOString() : now.toISOString()),
      full: !cursor.since,
      truncated,
      serverTime: now.toISOString(),
      assessment: {
        _id: String(assessment._id),
        title: assessment.title || 'Untitled Assessment',
        totalMarks: finiteOrNull(assessment.totalMarks),
        passPercentage,
        totalQuestions: Number(assessment.totalQuestions || 0),
        startTime: isoOrNull(assessment.startTime),
        endTime: isoOrNull(assessment.endTime),
        duration: finiteOrNull(assessment.duration),
        status: assessmentStatus(assessment, now),
      },
    });
  } catch (error) { return respondAccessError(res, error); }
}

/**
 * POST /admin/assessment/:id/release-results { release: boolean }
 * Releases (or withdraws) graded results for every finished attempt. Releasing
 * again keeps the original release time.
 */
export async function releaseAssessmentResults(req, res) {
  try {
    const release = req.body?.release;
    if (typeof release !== 'boolean') return res.status(400).json({ error: 'release must be true or false.', code: 'INVALID_RELEASE' });
    const { assessmentId, shared } = await authorizeAssessmentReportAccess(req.user, req.params.id, { permission: ASSESSMENT_EDIT_PERMISSION });
    if (shared) return res.status(403).json({ error: 'Shared assessments are released by the platform.', code: 'FORBIDDEN' });
    const assessment = await Assessment.findById(assessmentId).select('_id title lifecycleStatus settings').lean();
    if (!assessment) return res.status(404).json({ error: 'Assessment not found.', code: 'ASSESSMENT_NOT_FOUND' });
    if (release && assessment.lifecycleStatus === 'draft') {
      return res.status(400).json({ error: 'Publish the assessment before releasing results.', code: 'ASSESSMENT_DRAFT' });
    }
    const current = normalizeAssessmentSettings(assessment.settings || {}).resultsReleasedAt;
    const resultsReleasedAt = release ? (current || new Date()) : null;
    await Assessment.updateOne({ _id: assessmentId }, { $set: { 'settings.resultsReleasedAt': resultsReleasedAt } }, { strict: false });
    notifyAssessmentReportChanged(assessmentId, 'evaluation');
    void logActivity({
      userEmail: req.user?.email,
      userRole: req.user?.role,
      actionType: release ? 'APPROVE' : 'REJECT',
      targetType: 'ASSESSMENT',
      targetId: assessmentId,
      description: `${release ? 'Released' : 'Withdrew'} results for assessment: ${assessment.title || 'Untitled'}`,
      metadata: { action: release ? 'assessment.release_results' : 'assessment.withdraw_results', assessmentId, resultsReleasedAt },
      req,
    });
    return res.json({ resultsReleasedAt: resultsReleasedAt ? resultsReleasedAt.toISOString() : null });
  } catch (error) { return respondAccessError(res, error); }
}
