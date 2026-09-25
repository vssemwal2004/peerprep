import mongoose from 'mongoose';
import StudentUploadBatch from '../models/StudentUploadBatch.js';
import User from '../models/User.js';
import QuestionLibrary from '../models/QuestionLibrary.js';
import Assessment from '../models/Assessment.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import Submission from '../models/Submission.js';
import Event from '../models/Event.js';
import Progress from '../models/Progress.js';
import StudentActivity from '../models/StudentActivity.js';
import Resume from '../models/Resume.js';
import Notification from '../models/Notification.js';
import StudentAnalytics from '../models/StudentAnalytics.js';
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
  const createdIds = (batch.createdRecordIds || []).map(String).filter(validObjectId);
  const preview = {
    batchId: batch._id,
    name: batch.name,
    entityType: batch.entityType || 'student',
    createdRecords: createdIds.length,
    deletableRecords: createdIds.length,
    retainedSharedRecords: 0,
    blockers: [],
    warnings: [],
  };
  if (!createdIds.length) {
    preview.deletableRecords = 0;
    preview.blockers.push({ code: 'missing_provenance', count: 1, message: 'This legacy list does not identify which records it created, so cascade deletion is disabled.' });
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
  const preview = await buildDeletePreview(batch.toObject());
  if (preview.blockers.length) return res.status(409).json({ error: 'Deletion is blocked by linked data.', preview });
  const createdIds = (batch.createdRecordIds || []).map(String);
  let deletedRecords = 0;
  if ((batch.entityType || 'student') === 'student') {
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
  } else if (batch.entityType === 'coordinator') {
    deletedRecords = (await User.deleteMany({ _id: { $in: createdIds }, role: 'coordinator' })).deletedCount || 0;
  } else if (String(batch.entityType).startsWith('question_')) {
    deletedRecords = (await QuestionLibrary.deleteMany({ _id: { $in: createdIds } })).deletedCount || 0;
  }
  batch.status = 'deleted';
  batch.deletedAt = new Date();
  batch.deletedBy = req.user._id;
  batch.deletionSummary = { deletedRecords, retainedSharedRecords: preview.retainedSharedRecords || 0 };
  await batch.save();
  await logActivity({
    userEmail: req.user.email,
    userRole: req.user.role,
    actionType: 'BULK_DELETE',
    targetType: 'UPLOAD_BATCH',
    targetId: String(batch._id),
    description: `Deleted upload batch “${batch.name}” and ${deletedRecords} created record(s)`,
    metadata: batch.deletionSummary,
    req,
  });
  res.json({ message: `Upload deleted. ${deletedRecords} created record${deletedRecords === 1 ? '' : 's'} removed.`, deletedRecords, retainedSharedRecords: preview.retainedSharedRecords || 0 });
}
