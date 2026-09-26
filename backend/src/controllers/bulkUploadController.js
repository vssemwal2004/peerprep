import mongoose from 'mongoose';
import StudentUploadBatch from '../models/StudentUploadBatch.js';
import User from '../models/User.js';
import QuestionLibrary from '../models/QuestionLibrary.js';
import Assessment from '../models/Assessment.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import { deleteAssessmentAttemptData } from '../services/assessmentDataCleanupService.js';
import Submission from '../models/Submission.js';
import Event from '../models/Event.js';
import Progress from '../models/Progress.js';
import StudentActivity from '../models/StudentActivity.js';
import Resume from '../models/Resume.js';
import Notification from '../models/Notification.js';
import StudentAnalytics from '../models/StudentAnalytics.js';
import StudentAnalyticsSnapshot from '../models/StudentAnalyticsSnapshot.js';
import AssessmentFeedback from '../models/AssessmentFeedback.js';
import EventParticipant from '../models/EventParticipant.js';
import ExecutionJob from '../models/ExecutionJob.js';
import MailJob from '../models/MailJob.js';
import Feedback from '../models/Feedback.js';
import Pair from '../models/Pair.js';
import SlotProposal from '../models/SlotProposal.js';
import AIInterview from '../models/AIInterview.js';
import AIInterviewResource from '../models/AIInterviewResource.js';
import { logActivity } from './adminActivityController.js';

const ENTITY_TYPES = new Set(['student', 'coordinator', 'question_mcq', 'question_short', 'question_one_line', 'question_coding', 'question_mixed']);
const STATUSES = new Set(['active', 'archived', 'deleted']);

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const validObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

function batchQuery(req) {
  const query = {};
  const clauses = [];
  const search = String(req.query.search || '').trim().slice(0, 120);
  if (search) query.$or = [
    { name: new RegExp(escapeRegex(search), 'i') },
    { originalFileName: new RegExp(escapeRegex(search), 'i') },
    { uploadedByEmail: new RegExp(escapeRegex(search), 'i') },
  ];
  if (ENTITY_TYPES.has(req.query.entityType)) {
    clauses.push(req.query.entityType === 'student'
      ? { $or: [{ entityType: 'student' }, { entityType: { $exists: false } }] }
      : { entityType: req.query.entityType });
  }
  if (STATUSES.has(req.query.status)) {
    clauses.push(req.query.status === 'active'
      ? { $or: [{ status: 'active' }, { status: { $exists: false } }] }
      : { status: req.query.status });
  }
  if (validObjectId(req.query.uploadedBy)) query.uploadedBy = req.query.uploadedBy;
  const createdAt = {};
  if (req.query.dateFrom && !Number.isNaN(new Date(req.query.dateFrom).getTime())) createdAt.$gte = new Date(req.query.dateFrom);
  if (req.query.dateTo && !Number.isNaN(new Date(req.query.dateTo).getTime())) {
    const end = new Date(req.query.dateTo);
    end.setHours(23, 59, 59, 999);
    createdAt.$lte = end;
  }
  if (Object.keys(createdAt).length) query.createdAt = createdAt;
  if (clauses.length) query.$and = clauses;
  return query;
}

function serializeBatch(batch) {
  const recordIds = batch.recordIds?.length ? batch.recordIds : batch.studentIds || [];
  return {
    ...batch,
    entityType: batch.entityType || 'student',
    status: batch.status || 'active',
    recordCount: recordIds.length,
    createdRecordCount: batch.createdRecordIds?.length || 0,
    updatedRecordCount: batch.updatedRecordIds?.length || 0,
    provenanceReady: Array.isArray(batch.createdRecordIds),
  };
}

export async function listBulkUploads(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
  const query = batchQuery(req);
  const [batches, total, typeCounts, statusCounts, uploaders] = await Promise.all([
    StudentUploadBatch.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('uploadedBy', 'name email role coordinatorId').lean(),
    StudentUploadBatch.countDocuments(query),
    StudentUploadBatch.aggregate([{ $group: { _id: { $ifNull: ['$entityType', 'student'] }, count: { $sum: 1 } } }]),
    StudentUploadBatch.aggregate([{ $group: { _id: { $ifNull: ['$status', 'active'] }, count: { $sum: 1 } } }]),
    StudentUploadBatch.aggregate([
      { $match: { uploadedBy: { $exists: true } } },
      { $group: { _id: '$uploadedBy', email: { $first: '$uploadedByEmail' }, count: { $sum: 1 } } },
      { $sort: { email: 1 } },
    ]),
  ]);
  res.json({
    batches: batches.map(serializeBatch),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    facets: {
      types: typeCounts.map((entry) => ({ value: entry._id, count: entry.count })),
      statuses: statusCounts.map((entry) => ({ value: entry._id, count: entry.count })),
      uploaders: uploaders.map((entry) => ({ id: entry._id, email: entry.email, count: entry.count })),
    },
  });
}

export async function buildDeletePreview(batch) {
  const provenanceReady = Array.isArray(batch.createdRecordIds);
  const createdIds = (batch.createdRecordIds || []).map(String).filter(validObjectId);
  const linkedIds = (batch.recordIds?.length ? batch.recordIds : batch.studentIds || [])
    .map(String)
    .filter(validObjectId);
  const preview = {
    batchId: batch._id,
    name: batch.name,
    entityType: batch.entityType || 'student',
    linkedRecords: linkedIds.length,
    createdRecords: createdIds.length,
    deletableRecords: createdIds.length,
    retainedSharedRecords: 0,
    blockers: [],
    warnings: [],
    linkedStudentAccounts: 0,
    assessmentOnlyAccounts: 0,
    linkedStudentBlockers: [],
    linkedStudentWarnings: [],
  };
  if ((batch.entityType || 'student') === 'student' && linkedIds.length) {
    const now = new Date();
    const [linkedStudents, activeAssessments, assessmentAttempts, codingSubmissions] = await Promise.all([
      User.find({ _id: { $in: linkedIds }, role: 'student' }).select('_id accessScope').lean(),
      Assessment.countDocuments({
        assignedStudents: { $in: linkedIds },
        lifecycleStatus: 'published',
        $and: [
          { $or: [{ manuallyCompletedAt: { $exists: false } }, { manuallyCompletedAt: null }] },
          { $or: [{ endTime: { $gt: now } }, { endTime: { $exists: false } }, { endTime: null }] },
        ],
      }),
      AssessmentSubmission.countDocuments({ studentId: { $in: linkedIds } }),
      Submission.countDocuments({ user: { $in: linkedIds } }),
    ]);
    preview.linkedStudentAccounts = linkedStudents.length;
    preview.assessmentOnlyAccounts = linkedStudents.filter((student) => student.accessScope === 'assessment_only').length;
    if (activeAssessments) {
      preview.linkedStudentBlockers.push({
        code: 'active_assessments',
        count: activeAssessments,
        message: `${activeAssessments} active or upcoming assessment(s) still use students from this list. Complete them before deleting accounts.`,
      });
    }
    if (assessmentAttempts || codingSubmissions) {
      preview.linkedStudentWarnings.push(`Permanent account deletion will also remove ${assessmentAttempts} assessment attempt(s) and ${codingSubmissions} coding submission(s).`);
    }
    const fullAccounts = linkedStudents.length - preview.assessmentOnlyAccounts;
    if (fullAccounts) preview.linkedStudentWarnings.push(`${fullAccounts} linked account(s) have full platform access and will also be permanently deleted.`);
  }
  if (!provenanceReady) {
    preview.deletableRecords = 0;
    preview.blockers.push({ code: 'missing_provenance', count: 1, message: 'This legacy list does not identify which records it created. Created-record deletion is unavailable, but the list itself can still be deleted safely.' });
    return preview;
  }
  if (!createdIds.length) {
    preview.warnings.push('This list did not create any records. Deleting the list will preserve every linked record.');
    return preview;
  }
  if ((batch.entityType || 'student') === 'student') {
    const [assessmentAttempts, codingSubmissions, students] = await Promise.all([
      AssessmentSubmission.countDocuments({ studentId: { $in: createdIds } }),
      Submission.countDocuments({ user: { $in: createdIds }, mode: 'submit' }),
      User.find({ _id: { $in: createdIds }, role: 'student' }).select('_id uploadBatchIds').lean(),
    ]);
    const shared = students.filter((student) => (student.uploadBatchIds || []).some((id) => String(id) !== String(batch._id)));
    preview.retainedSharedRecords = shared.length;
    preview.deletableRecords = Math.max(0, students.length - shared.length);
    if (assessmentAttempts) preview.blockers.push({ code: 'assessment_submissions', count: assessmentAttempts, message: `${assessmentAttempts} assessment submission(s) depend on these students.` });
    if (codingSubmissions) preview.blockers.push({ code: 'coding_submissions', count: codingSubmissions, message: `${codingSubmissions} coding submission(s) depend on these students.` });
    if (shared.length) preview.warnings.push(`${shared.length} student account(s) also belong to another upload and will only be unlinked.`);
  } else if (batch.entityType === 'coordinator') {
    const coordinators = await User.find({ _id: { $in: createdIds }, role: 'coordinator' }).select('_id coordinatorId').lean();
    const coordinatorIds = coordinators.map((entry) => entry.coordinatorId).filter(Boolean);
    const [assignedStudents, assessments, events] = await Promise.all([
      User.countDocuments({ role: 'student', teacherIds: { $in: coordinatorIds } }),
      Assessment.countDocuments({ createdBy: { $in: createdIds } }),
      Event.countDocuments({ createdBy: { $in: createdIds } }),
    ]);
    if (assignedStudents) preview.blockers.push({ code: 'assigned_students', count: assignedStudents, message: `${assignedStudents} student(s) are assigned to these coordinators.` });
    if (assessments) preview.blockers.push({ code: 'owned_assessments', count: assessments, message: `${assessments} assessment(s) are owned by these coordinators.` });
    if (events) preview.blockers.push({ code: 'owned_events', count: events, message: `${events} event(s) are owned by these coordinators.` });
  } else if (String(batch.entityType).startsWith('question_')) {
    const sourceIds = createdIds.map(String);
    const publishedUsage = await Assessment.countDocuments({
      lifecycleStatus: 'published',
      $or: [
        { 'sections.questions.librarySourceId': { $in: sourceIds } },
        { 'questionSets.sections.questions.librarySourceId': { $in: sourceIds } },
      ],
    });
    if (publishedUsage) preview.blockers.push({ code: 'published_assessments', count: publishedUsage, message: `${publishedUsage} published assessment(s) use questions from this upload.` });
  }
  return preview;
}

async function deleteLinkedStudentAccounts(batch) {
  const linkedIds = (batch.recordIds?.length ? batch.recordIds : batch.studentIds || [])
    .map(String)
    .filter(validObjectId);
  const students = await User.find({ _id: { $in: linkedIds }, role: 'student' }).select('_id').lean();
  const studentIds = students.map((student) => student._id);
  if (!studentIds.length) return 0;
  const pairIds = (await Pair.find({
    $or: [{ interviewer: { $in: studentIds } }, { interviewee: { $in: studentIds } }],
  }).select('_id').lean()).map((pair) => pair._id);

  await Promise.all([
    deleteAssessmentAttemptData({ studentId: { $in: studentIds } }),
    AssessmentFeedback.deleteMany({ studentId: { $in: studentIds } }),
    Submission.deleteMany({ user: { $in: studentIds } }),
    ExecutionJob.deleteMany({ userId: { $in: studentIds } }),
    Progress.deleteMany({ studentId: { $in: studentIds } }),
    StudentActivity.deleteMany({ studentId: { $in: studentIds } }),
    Resume.deleteMany({ student: { $in: studentIds } }),
    Notification.deleteMany({ userId: { $in: studentIds } }),
    StudentAnalytics.deleteMany({ studentId: { $in: studentIds } }),
    StudentAnalyticsSnapshot.deleteMany({ studentId: { $in: studentIds } }),
    EventParticipant.deleteMany({ studentId: { $in: studentIds } }),
    MailJob.deleteMany({ recipientId: { $in: studentIds } }),
    Feedback.deleteMany({ $or: [{ from: { $in: studentIds } }, { to: { $in: studentIds } }] }),
    Pair.deleteMany({ $or: [{ interviewer: { $in: studentIds } }, { interviewee: { $in: studentIds } }] }),
    SlotProposal.deleteMany({ $or: [{ user: { $in: studentIds } }, { pair: { $in: pairIds } }] }),
    AIInterview.deleteMany({ ownerId: { $in: studentIds } }),
    AIInterviewResource.deleteMany({ ownerId: { $in: studentIds } }),
    Event.updateMany(
      { $or: [{ allowedParticipants: { $in: studentIds } }, { participants: { $in: studentIds } }, { excludedParticipants: { $in: studentIds } }] },
      { $pull: { allowedParticipants: { $in: studentIds }, participants: { $in: studentIds }, excludedParticipants: { $in: studentIds } } },
    ),
    Assessment.updateMany(
      { assignedStudents: { $in: studentIds } },
      { $pull: { assignedStudents: { $in: studentIds }, candidateSetAssignments: { student: { $in: studentIds } } } },
    ),
    StudentUploadBatch.updateMany(
      { _id: { $ne: batch._id } },
      [
        { $set: {
          studentIds: { $filter: { input: { $ifNull: ['$studentIds', []] }, as: 'id', cond: { $not: [{ $in: ['$$id', studentIds] }] } } },
          recordIds: { $filter: { input: { $ifNull: ['$recordIds', []] }, as: 'id', cond: { $not: [{ $in: ['$$id', studentIds] }] } } },
          createdRecordIds: { $filter: { input: { $ifNull: ['$createdRecordIds', []] }, as: 'id', cond: { $not: [{ $in: ['$$id', studentIds] }] } } },
          updatedRecordIds: { $filter: { input: { $ifNull: ['$updatedRecordIds', []] }, as: 'id', cond: { $not: [{ $in: ['$$id', studentIds] }] } } },
        } },
        { $set: {
          createdCount: { $size: '$createdRecordIds' },
          updatedCount: { $size: '$updatedRecordIds' },
        } },
      ],
    ),
  ]);
  return (await User.deleteMany({ _id: { $in: studentIds }, role: 'student' })).deletedCount || 0;
}

export async function getBulkUploadDeletePreview(req, res) {
  if (!validObjectId(req.params.batchId)) return res.status(400).json({ error: 'Invalid upload batch ID.' });
  const batch = await StudentUploadBatch.findById(req.params.batchId).lean();
  if (!batch) return res.status(404).json({ error: 'Upload batch not found.' });
  res.json({ preview: await buildDeletePreview(batch) });
}

export async function renameBulkUpload(req, res) {
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 120) return res.status(400).json({ error: 'Enter a name up to 120 characters.' });
  const batch = await StudentUploadBatch.findByIdAndUpdate(req.params.batchId, { name }, { new: true }).lean();
  if (!batch) return res.status(404).json({ error: 'Upload batch not found.' });
  res.json({ batch: serializeBatch(batch) });
}

export async function updateBulkUploadStatus(req, res) {
  const status = req.body?.status;
  if (!['active', 'archived'].includes(status)) return res.status(400).json({ error: 'Status must be active or archived.' });
  const batch = await StudentUploadBatch.findOneAndUpdate(
    { _id: req.params.batchId, status: { $ne: 'deleted' } },
    { status, archivedAt: status === 'archived' ? new Date() : null },
    { new: true },
  ).lean();
  if (!batch) return res.status(404).json({ error: 'Active upload batch not found.' });
  res.json({ batch: serializeBatch(batch) });
}

function csvValue(value) {
  let normalized = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@]/.test(normalized)) normalized = `'${normalized}`;
  return `"${normalized.replace(/"/g, '""')}"`;
}

export function buildBulkUploadCsv(rows = []) {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
  return `\uFEFF${[keys, ...rows.map((row) => keys.map((key) => row?.[key]))].map((row) => row.map(csvValue).join(',')).join('\r\n')}\r\n`;
}

export async function downloadBulkUpload(req, res) {
  const kind = req.query.kind === 'errors' ? 'errors' : 'data';
  const batch = await StudentUploadBatch.findById(req.params.batchId).select('+originalRows +errorRows').lean();
  if (!batch) return res.status(404).json({ error: 'Upload batch not found.' });
  const rows = kind === 'errors' ? batch.errorRows || [] : batch.originalRows || [];
  if (!rows.length) return res.status(404).json({ error: `No ${kind === 'errors' ? 'error report' : 'stored row data'} is available for this upload.` });
  const csv = buildBulkUploadCsv(rows);
  const baseName = String(batch.name || 'bulk-upload').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'bulk-upload';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${baseName}-${kind}.csv"`);
  res.send(csv);
}

export async function deleteBulkUpload(req, res) {
  const batch = await StudentUploadBatch.findById(req.params.batchId);
  if (!batch) return res.status(404).json({ error: 'Upload batch not found.' });
  if (batch.status === 'deleted') return res.status(409).json({ error: 'This upload has already been deleted.' });
  if (String(req.body?.confirmation || '') !== batch.name) return res.status(400).json({ error: 'Type the exact list name to confirm deletion.' });
  const requestedMode = String(req.body?.mode || 'created_records');
  const mode = ['list_only', 'created_records', 'linked_students'].includes(requestedMode)
    ? requestedMode
    : 'created_records';
  const preview = await buildDeletePreview(batch.toObject());
  if (mode === 'created_records' && preview.blockers.length) {
    return res.status(409).json({ error: 'Created-record deletion is blocked by linked data.', preview });
  }
  if (mode === 'linked_students' && preview.linkedStudentBlockers.length) {
    return res.status(409).json({ error: 'Student-account deletion is blocked while an assessment is active or upcoming.', preview });
  }
  const createdIds = (batch.createdRecordIds || []).map(String);
  let deletedRecords = 0;
  if (mode === 'linked_students') {
    if ((batch.entityType || 'student') !== 'student') {
      return res.status(400).json({ error: 'Linked-account deletion is available only for student lists.' });
    }
    deletedRecords = await deleteLinkedStudentAccounts(batch);
  } else if (mode === 'created_records' && (batch.entityType || 'student') === 'student') {
    const students = await User.find({ _id: { $in: createdIds }, role: 'student' }).select('_id uploadBatchIds').lean();
    const exclusiveIds = students.filter((student) => !(student.uploadBatchIds || []).some((id) => String(id) !== String(batch._id))).map((student) => student._id);
    const sharedIds = students.filter((student) => (student.uploadBatchIds || []).some((id) => String(id) !== String(batch._id))).map((student) => student._id);
    await Promise.all([
      Progress.deleteMany({ studentId: { $in: exclusiveIds } }),
      StudentActivity.deleteMany({ studentId: { $in: exclusiveIds } }),
      Resume.deleteMany({ student: { $in: exclusiveIds } }),
      Notification.deleteMany({ userId: { $in: exclusiveIds } }),
      StudentAnalytics.deleteMany({ studentId: { $in: exclusiveIds } }),
      Assessment.updateMany({ assignedStudents: { $in: exclusiveIds } }, {
        $pull: { assignedStudents: { $in: exclusiveIds }, candidateSetAssignments: { student: { $in: exclusiveIds } } },
      }),
      User.updateMany({ _id: { $in: sharedIds } }, { $pull: { uploadBatchIds: batch._id } }),
    ]);
    deletedRecords = (await User.deleteMany({ _id: { $in: exclusiveIds }, role: 'student' })).deletedCount || 0;
  } else if (mode === 'created_records' && batch.entityType === 'coordinator') {
    deletedRecords = (await User.deleteMany({ _id: { $in: createdIds }, role: 'coordinator' })).deletedCount || 0;
  } else if (mode === 'created_records' && String(batch.entityType).startsWith('question_')) {
    deletedRecords = (await QuestionLibrary.deleteMany({ _id: { $in: createdIds } })).deletedCount || 0;
  }
  // Removing a list must remove its reverse membership link even when every
  // underlying account is intentionally retained (legacy/list-only mode).
  await User.updateMany({ uploadBatchIds: batch._id }, { $pull: { uploadBatchIds: batch._id } });
  batch.status = 'deleted';
  batch.deletedAt = new Date();
  batch.deletedBy = req.user._id;
  batch.deletionSummary = { mode, deletedRecords, retainedSharedRecords: preview.retainedSharedRecords || 0 };
  await batch.save();
  await logActivity({
    userEmail: req.user.email,
    userRole: req.user.role,
    actionType: 'BULK_DELETE',
    targetType: 'UPLOAD_BATCH',
    targetId: String(batch._id),
    description: mode === 'list_only'
      ? `Deleted upload list “${batch.name}” without deleting linked records`
      : mode === 'linked_students'
        ? `Deleted upload list “${batch.name}” and ${deletedRecords} linked student account(s)`
        : `Deleted upload batch “${batch.name}” and ${deletedRecords} created record(s)`,
    metadata: batch.deletionSummary,
    req,
  });
  res.json({
    message: mode === 'list_only'
      ? 'Upload list deleted. All linked records were preserved.'
      : mode === 'linked_students'
        ? `Upload list and ${deletedRecords} linked student account${deletedRecords === 1 ? '' : 's'} deleted.`
        : `Upload deleted. ${deletedRecords} created record${deletedRecords === 1 ? '' : 's'} removed.`,
    mode,
    deletedRecords,
    retainedSharedRecords: preview.retainedSharedRecords || 0,
  });
}
