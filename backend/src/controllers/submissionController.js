import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import { HttpError } from '../utils/errors.js';
import { serializeSubmission, serializeStudentSubmission } from './compilerHelpers.js';
import { sanitizeSearchQuery, validateObjectId, validatePagination } from '../utils/validators.js';

function round(value) {
  return Number((value || 0).toFixed(2));
}

function ensureObjectId(id, fieldName) {
  try {
    return validateObjectId(id, fieldName);
  } catch (error) {
    throw new HttpError(400, error.message || `Invalid ${fieldName}`);
  }
}

export async function listSubmissions(req, res) {
  const { page, limit } = validatePagination(req.query.page, req.query.limit);
  const search = sanitizeSearchQuery(req.query.search || '');
  const status = String(req.query.status || '').trim().toUpperCase();
  const language = String(req.query.language || '').trim().toLowerCase();
  const mode = String(req.query.mode || '').trim().toLowerCase();

  const query = {};

  if (status && ['PENDING', 'RUNNING', 'AC', 'WA', 'TLE', 'RE', 'CE'].includes(status)) {
    query.status = status;
  }

  if (language && ['python', 'javascript', 'java', 'cpp', 'c'].includes(language)) {
    query.language = language;
  }

  if (mode && ['run', 'submit'].includes(mode)) {
    query.mode = mode;
  }

  if (search) {
    const regex = new RegExp(search, 'i');
    query.$or = [
      { 'userSnapshot.name': regex },
      { 'userSnapshot.email': regex },
      { 'problemSnapshot.title': regex },
    ];
  }

  const [total, submissions] = await Promise.all([
    Submission.countDocuments(query),
    Submission.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  res.json({
    submissions: submissions.map((submission) => serializeSubmission(submission, {
      includeJudgeDetails: false,
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(Math.ceil(total / limit), 1),
    },
  });
}

export async function listProblemSubmissions(req, res) {
  ensureObjectId(req.params.id, 'Problem ID');
  const { page, limit } = validatePagination(req.query.page, req.query.limit);
  const mode = String(req.query.mode || '').trim().toLowerCase();

  const problem = await Problem.findById(req.params.id).select('_id status').lean();
  if (!problem || problem.status !== 'Active') {
    throw new HttpError(404, 'Problem not found.');
  }

  const query = {
    user: req.user._id,
    problem: req.params.id,
  };

  if (mode && ['run', 'submit'].includes(mode)) {
    query.mode = mode;
  }

  const [total, submissions] = await Promise.all([
    Submission.countDocuments(query),
    Submission.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  res.json({
    submissions: submissions.map((submission) => serializeStudentSubmission(submission)),
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(Math.ceil(total / limit), 1),
    },
  });
}

export async function getCompilerAnalytics(req, res) {
  const [totalAttempts, acceptedAttempts, averageExecutionAggregation, statusDistribution, languageDistribution, attemptsByDay, problemAnalytics] = await Promise.all([
    Submission.countDocuments({ mode: 'submit' }),
    Submission.countDocuments({ mode: 'submit', status: 'AC' }),
    Submission.aggregate([
      { $match: { mode: 'submit', status: { $in: ['AC', 'WA', 'TLE', 'RE'] } } },
      { $group: { _id: null, avgExecutionTimeMs: { $avg: '$executionTimeMs' } } },
    ]),
    Submission.aggregate([
      { $match: { mode: 'submit' } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Submission.aggregate([
      { $match: { mode: 'submit' } },
      { $group: { _id: '$language', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Submission.aggregate([
      {
        $match: {
          mode: 'submit',
          createdAt: {
            $gte: (() => {
              const date = new Date();
              date.setHours(0, 0, 0, 0);
              date.setDate(date.getDate() - 6);
              return date;
            })(),
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Submission.aggregate([
      { $match: { mode: 'submit' } },
      {
        $group: {
          _id: '$problem',
          title: { $first: '$problemSnapshot.title' },
          difficulty: { $first: '$problemSnapshot.difficulty' },
          attempts: { $sum: 1 },
          successes: {
            $sum: {
              $cond: [{ $eq: ['$status', 'AC'] }, 1, 0],
            },
          },
          avgExecutionTimeMs: { $avg: '$executionTimeMs' },
        },
      },
      { $sort: { attempts: -1, title: 1 } },
      { $limit: 25 },
    ]),
  ]);

  const overallSuccessRate = totalAttempts > 0
    ? round((acceptedAttempts / totalAttempts) * 100)
    : 0;
  const averageExecutionTimeMs = round(averageExecutionAggregation[0]?.avgExecutionTimeMs || 0);

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - 6);
  const attemptsByDayMap = new Map(attemptsByDay.map((entry) => [entry._id, entry.count]));
  const attemptsTrend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    return {
      date: key,
      count: attemptsByDayMap.get(key) || 0,
    };
  });

  res.json({
    summary: {
      totalAttempts,
      overallSuccessRate,
      averageExecutionTimeMs,
    },
    statusDistribution: statusDistribution.map((entry) => ({
      status: entry._id,
      count: entry.count,
    })),
    languageDistribution: languageDistribution.map((entry) => ({
      language: entry._id,
      count: entry.count,
    })),
    attemptsTrend,
    problemAnalytics: problemAnalytics.map((entry) => ({
      problemId: entry._id,
      title: entry.title || 'Untitled Problem',
      difficulty: entry.difficulty || 'Easy',
      attempts: entry.attempts,
      successRate: entry.attempts > 0 ? round((entry.successes / entry.attempts) * 100) : 0,
      averageExecutionTimeMs: round(entry.avgExecutionTimeMs || 0),
    })),
  });
}
