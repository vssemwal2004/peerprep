import mongoose from 'mongoose';
import Assessment from '../models/Assessment.js';
import AssessmentFeedback from '../models/AssessmentFeedback.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import User from '../models/User.js';
import { HttpError } from '../utils/errors.js';

const COMPLETED_SUBMISSION_STATUSES = new Set(['submitted', 'expired', 'violation', 'incomplete']);

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDateBoundary(value, endOfDay = false) {
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isStudentAssigned(assessment = {}, student = {}) {
  const studentObjectId = String(student?._id || '');
  const studentCode = String(student?.studentId || '').trim().toLowerCase();
  const assignedStudents = Array.isArray(assessment.assignedStudents) ? assessment.assignedStudents : [];

  if (assessment.targetType === 'all' && assignedStudents.length === 0) return true;

  return assignedStudents.some((entry) => {
    const entryId = String(entry?._id || entry || '');
    const entryStudentCode = String(entry?.studentId || '').trim().toLowerCase();
    return entryId === studentObjectId
      || Boolean(studentCode && (entryId.toLowerCase() === studentCode || entryStudentCode === studentCode));
  });
}

function getAssessmentSummary(assessment = {}, submissionStats = {}, feedbackStats = {}) {
  const completedStudents = Number(submissionStats.completedStudents || 0);
  const feedbackCount = Number(feedbackStats.feedbackCount || 0);
  const averageRating = feedbackStats.averageRating == null
    ? null
    : Number(Number(feedbackStats.averageRating).toFixed(2));

  return {
    _id: assessment._id,
    title: assessment.title || 'Untitled Assessment',
    description: assessment.description || '',
    assessmentType: assessment.assessmentType || 'mixed',
    lifecycleStatus: assessment.lifecycleStatus || 'published',
    startTime: assessment.startTime || null,
    endTime: assessment.endTime || null,
    duration: Number(assessment.duration || 0),
    totalMarks: Number(assessment.totalMarks || 0),
    completedStudents,
    totalSubmissions: Number(submissionStats.totalSubmissions || 0),
    feedbackCount,
    pendingFeedback: Math.max(0, completedStudents - feedbackCount),
    averageRating,
    latestFeedbackAt: feedbackStats.latestFeedbackAt || null,
  };
}

function buildDateFilter(from, to) {
  const filter = {};
  const start = parseDateBoundary(from);
  const end = parseDateBoundary(to, true);
  if (start || end) {
    if (start) filter.$gte = start;
    if (end) filter.$lte = end;
  }
  return filter;
}

async function getStudentAssessmentContext(req, assessmentId) {
  if (!mongoose.Types.ObjectId.isValid(assessmentId)) {
    throw new HttpError(400, 'Invalid assessment id.');
  }

  const assessment = await Assessment.findById(assessmentId)
    .select('_id title description assessmentType startTime endTime duration totalMarks targetType assignedStudents lifecycleStatus')
    .lean();
  if (!assessment) throw new HttpError(404, 'Assessment not found.');
  if (assessment.lifecycleStatus === 'draft') throw new HttpError(403, 'Assessment is not published yet.');
  if (!isStudentAssigned(assessment, req.user)) throw new HttpError(403, 'Not assigned to this assessment.');

  const submission = await AssessmentSubmission.findOne({
    assessmentId: assessment._id,
    studentId: req.user._id,
  })
    .select('_id status score maxMarks accuracy startedAt submittedAt timeTakenSec')
    .lean();

  if (!submission || !COMPLETED_SUBMISSION_STATUSES.has(submission.status) || !submission.submittedAt) {
    throw new HttpError(403, 'Assessment feedback is available after you finish the assessment.');
  }

  return { assessment, submission };
}

export async function getStudentAssessmentFeedback(req, res) {
  const { assessment, submission } = await getStudentAssessmentContext(req, req.params.assessmentId);
  const feedback = await AssessmentFeedback.findOne({
    assessmentId: assessment._id,
    studentId: req.user._id,
  }).lean();

  res.json({ assessment, submission, feedback });
}

export async function submitStudentAssessmentFeedback(req, res) {
  const { assessment, submission } = await getStudentAssessmentContext(req, req.params.assessmentId);
  const rating = Number(req.body?.rating);
  const comments = String(req.body?.comments || '').trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new HttpError(400, 'Please select a rating from 1 to 5.');
  }
  if (comments.length > 2000) {
    throw new HttpError(400, 'Feedback comments must be 2000 characters or fewer.');
  }

  const existing = await AssessmentFeedback.findOne({
    assessmentId: assessment._id,
    studentId: req.user._id,
  }).select('_id').lean();
  if (existing) throw new HttpError(409, 'Feedback has already been submitted for this assessment.');

  try {
    const feedback = await AssessmentFeedback.create({
      assessmentId: assessment._id,
      studentId: submission.studentId || req.user._id,
      rating,
      comments,
    });

    res.status(201).json({
      message: 'Assessment feedback submitted successfully.',
      feedback: {
        _id: feedback._id,
        assessmentId: feedback.assessmentId,
        studentId: feedback.studentId,
        rating: feedback.rating,
        comments: feedback.comments,
        createdAt: feedback.createdAt,
      },
    });
  } catch (error) {
    if (error?.code === 11000) throw new HttpError(409, 'Feedback has already been submitted for this assessment.');
    throw error;
  }
}

export async function listAssessmentFeedbackAssessments(req, res) {
  const search = String(req.query?.search || '').trim();
  const assessmentFilter = { lifecycleStatus: { $ne: 'draft' } };
  const assessmentDateFilter = buildDateFilter(req.query?.from, req.query?.to);

  if (search) assessmentFilter.title = { $regex: escapeRegex(search), $options: 'i' };
  if (Object.keys(assessmentDateFilter).length) assessmentFilter.startTime = assessmentDateFilter;

  const assessments = await Assessment.find(assessmentFilter)
    .select('_id title description assessmentType lifecycleStatus startTime endTime duration totalMarks')
    .sort({ startTime: -1, createdAt: -1 })
    .lean();

  if (!assessments.length) return res.json({ assessments: [], total: 0 });

  const assessmentIds = assessments.map((assessment) => assessment._id);
  const [submissionStats, feedbackStats] = await Promise.all([
    AssessmentSubmission.aggregate([
      { $match: { assessmentId: { $in: assessmentIds } } },
      {
        $group: {
          _id: '$assessmentId',
          totalSubmissions: { $sum: 1 },
          completedStudents: {
            $sum: { $cond: [{ $in: ['$status', [...COMPLETED_SUBMISSION_STATUSES]] }, 1, 0] },
          },
        },
      },
    ]),
    AssessmentFeedback.aggregate([
      { $match: { assessmentId: { $in: assessmentIds } } },
      {
        $group: {
          _id: '$assessmentId',
          feedbackCount: { $sum: 1 },
          averageRating: { $avg: '$rating' },
          latestFeedbackAt: { $max: '$createdAt' },
        },
      },
    ]),
  ]);

  const submissionsByAssessment = new Map(submissionStats.map((entry) => [String(entry._id), entry]));
  const feedbackByAssessment = new Map(feedbackStats.map((entry) => [String(entry._id), entry]));
  const result = assessments.map((assessment) => getAssessmentSummary(
    assessment,
    submissionsByAssessment.get(String(assessment._id)),
    feedbackByAssessment.get(String(assessment._id)),
  ));

  res.json({ assessments: result, total: result.length });
}

export async function listAssessmentFeedbackForAssessment(req, res) {
  const { assessmentId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(assessmentId)) throw new HttpError(400, 'Invalid assessment id.');

  const assessment = await Assessment.findById(assessmentId)
    .select('_id title description assessmentType startTime endTime duration totalMarks lifecycleStatus')
    .lean();
  if (!assessment) throw new HttpError(404, 'Assessment not found.');

  const search = String(req.query?.search || '').trim();
  const studentQuery = { role: 'student' };
  if (search) {
    const searchRegex = { $regex: escapeRegex(search), $options: 'i' };
    studentQuery.$or = [
      { name: searchRegex },
      { email: searchRegex },
      { studentId: searchRegex },
    ];
  }

  const matchingStudentIds = search
    ? (await User.find(studentQuery).select('_id').lean()).map((student) => student._id)
    : null;
  const submissionFilter = { assessmentId: assessment._id };
  if (search) submissionFilter.studentId = { $in: matchingStudentIds };

  const feedbackDateFilter = buildDateFilter(req.query?.from, req.query?.to);
  const feedbackFilter = { assessmentId: assessment._id };
  if (search) feedbackFilter.studentId = { $in: matchingStudentIds };
  if (Object.keys(feedbackDateFilter).length) feedbackFilter.createdAt = feedbackDateFilter;

  const [submissions, feedbackList] = await Promise.all([
    AssessmentSubmission.find(submissionFilter)
      .select('_id studentId status score maxMarks accuracy submittedAt startedAt timeTakenSec')
      .populate({ path: 'studentId', select: '_id name email studentId course branch college semester group' })
      .sort({ submittedAt: -1, updatedAt: -1 })
      .lean(),
    AssessmentFeedback.find(feedbackFilter)
      .select('_id studentId rating comments createdAt')
      .lean(),
  ]);

  const feedbackByStudent = new Map(feedbackList.map((feedback) => [String(feedback.studentId), feedback]));
  let rows = submissions
    .filter((submission) => COMPLETED_SUBMISSION_STATUSES.has(submission.status))
    .map((submission) => {
      const student = submission.studentId || {};
      const feedback = feedbackByStudent.get(String(student._id || submission.studentId));
      return {
        id: submission._id,
        assessmentId: assessment._id,
        student: {
          _id: student._id || submission.studentId,
          name: student.name || 'Unknown student',
          email: student.email || '',
          studentId: student.studentId || '',
          course: student.course || '',
          branch: student.branch || '',
          college: student.college || '',
          semester: student.semester || '',
          group: student.group || '',
        },
        submissionStatus: submission.status,
        score: submission.score ?? null,
        maxMarks: submission.maxMarks ?? assessment.totalMarks ?? null,
        accuracy: submission.accuracy ?? null,
        submittedAt: submission.submittedAt || submission.startedAt || null,
        feedback: feedback ? {
          _id: feedback._id,
          rating: feedback.rating,
          comments: feedback.comments || '',
          submittedAt: feedback.createdAt,
        } : null,
        feedbackStatus: feedback ? 'Submitted' : 'Pending',
      };
    });

  if (Object.keys(feedbackDateFilter).length) rows = rows.filter((row) => row.feedback);

  const submittedFeedback = rows.filter((row) => row.feedback).map((row) => row.feedback.rating);
  const averageRating = submittedFeedback.length
    ? Number((submittedFeedback.reduce((sum, rating) => sum + rating, 0) / submittedFeedback.length).toFixed(2))
    : null;

  res.json({
    assessment,
    rows,
    total: rows.length,
    summary: {
      completedStudents: rows.length,
      feedbackCount: submittedFeedback.length,
      pendingFeedback: rows.filter((row) => row.feedbackStatus === 'Pending').length,
      averageRating,
    },
  });
}
