import mongoose from 'mongoose';
import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import User from '../models/User.js';
import Assessment from '../models/Assessment.js';
import StudentUploadBatch from '../models/StudentUploadBatch.js';
import MasterData from '../models/MasterData.js';
import { HttpError } from '../utils/errors.js';
import { sanitizeSearchQuery, validateObjectId } from '../utils/validators.js';

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

function buildLastNDates(days) {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (days - 1));

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return date;
  });
}

function parseDateRange(query) {
  const dateFrom = query.dateFrom ? new Date(query.dateFrom) : null;
  const dateTo = query.dateTo ? new Date(query.dateTo) : null;

  if (dateFrom && Number.isNaN(dateFrom.getTime())) {
    throw new HttpError(400, 'Invalid dateFrom filter.');
  }
  if (dateTo && Number.isNaN(dateTo.getTime())) {
    throw new HttpError(400, 'Invalid dateTo filter.');
  }

  if (dateFrom) {
    dateFrom.setHours(0, 0, 0, 0);
  }
  if (dateTo) {
    dateTo.setHours(23, 59, 59, 999);
  }

  return { dateFrom, dateTo };
}

function buildSubmissionMatch({ studentId = '', problemId = '', assessmentId = '', dateFrom = null, dateTo = null }) {
  const match = {
    mode: 'submit',
  };

  if (studentId) {
    ensureObjectId(studentId, 'Student ID');
    match.user = new mongoose.Types.ObjectId(studentId);
  }

  if (problemId) {
    ensureObjectId(problemId, 'Problem ID');
    match.problem = new mongoose.Types.ObjectId(problemId);
  }

  if (assessmentId) {
    ensureObjectId(assessmentId, 'Assessment ID');
    match.assessmentId = new mongoose.Types.ObjectId(assessmentId);
  }

  if (dateFrom || dateTo) {
    match.createdAt = {};
    if (dateFrom) match.createdAt.$gte = dateFrom;
    if (dateTo) match.createdAt.$lte = dateTo;
  }

  return match;
}

function parseMultiFilter(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values
    .flatMap((item) => String(item || '').split(','))
    .map((item) => item.trim())
    .filter(Boolean))];
}

function parseObjectIdFilter(value, fieldName) {
  return parseMultiFilter(value).map((id) => {
    ensureObjectId(id, fieldName);
    return new mongoose.Types.ObjectId(id);
  });
}

function uniqueTextValues(values) {
  const unique = new Map();
  values.forEach((value) => {
    const display = String(value || '').trim();
    const key = display.toLowerCase();
    if (display && !unique.has(key)) unique.set(key, display);
  });
  return [...unique.values()].sort((left, right) => left.localeCompare(right));
}

function buildDateSeries(days, aggregation) {
  const map = new Map(aggregation.map((entry) => [entry._id, entry.count]));
  return buildLastNDates(days).map((date) => {
    const key = date.toISOString().slice(0, 10);
    return {
      date: key,
      count: map.get(key) || 0,
    };
  });
}

function buildDateSeriesFromRange(startDate, endDate, aggregation) {
  const map = new Map(aggregation.map((entry) => [entry._id, entry.count]));
  const dates = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= endDate) {
    const key = cursor.toISOString().slice(0, 10);
    dates.push({
      date: key,
      count: map.get(key) || 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

async function getControlledStudents() {
  return User.find({ role: 'student' })
    .select('_id name email studentId semester group course branch college uploadBatchIds createdAt')
    .sort({ name: 1 })
    .lean();
}

async function getControlledProblems(req) {
  const query = req?.user?.role === 'coordinator' ? { createdBy: req.user._id } : {};
  return Problem.find(query)
    .select('_id title difficulty tags companyTags status createdAt')
    .sort({ createdAt: -1 })
    .lean();
}

export async function getAdminCompilerOverview(req, res) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setHours(0, 0, 0, 0);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setHours(0, 0, 0, 0);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const oneYearAgo = new Date();
  oneYearAgo.setHours(0, 0, 0, 0);
  oneYearAgo.setDate(oneYearAgo.getDate() - 364);
  const oneDayAgo = new Date();
  oneDayAgo.setHours(0, 0, 0, 0);
  const today = new Date();
  const students = await getControlledStudents();
  const controlledStudentIds = students.map((student) => student._id);

  const problemQuery = req?.user?.role === 'coordinator' ? { createdBy: req.user._id } : {};

  const [problems, totalSubmissions, acceptedSubmissions, activeStudents, recentSubmissions, recentProblems, recentActiveStudents, topSolved, topAccuracy, problemAttempts, submissionTrendAgg, activityHeatmapAgg, topSolvedDaily, topSolvedWeekly, problemGrowthAgg, submissionCalendarAgg, topSolvedDetailedAgg] = await Promise.all([
    getControlledProblems(req),
    Submission.countDocuments({ mode: 'submit', user: { $in: controlledStudentIds } }),
    Submission.countDocuments({ mode: 'submit', status: 'AC', user: { $in: controlledStudentIds } }),
    Submission.distinct('user', { mode: 'submit', user: { $in: controlledStudentIds }, createdAt: { $gte: sevenDaysAgo } }),
    Submission.find({ mode: 'submit', user: { $in: controlledStudentIds } })
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    Problem.find(problemQuery)
      .sort({ createdAt: -1 })
      .limit(6)
      .select('_id title difficulty status createdAt')
      .lean(),
    Submission.aggregate([
      { $match: { mode: 'submit', user: { $in: controlledStudentIds }, createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: '$user',
          name: { $first: '$userSnapshot.name' },
          attempts: { $sum: 1 },
          lastActive: { $max: '$createdAt' },
        },
      },
      { $sort: { lastActive: -1, attempts: -1 } },
      { $limit: 6 },
    ]),
    Submission.aggregate([
      { $match: { mode: 'submit', user: { $in: controlledStudentIds } } },
      {
        $group: {
          _id: '$user',
          name: { $first: '$userSnapshot.name' },
          attempts: { $sum: 1 },
          solvedProblems: {
            $addToSet: {
              $cond: [{ $eq: ['$status', 'AC'] }, '$problem', '$$REMOVE'],
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          attempts: 1,
          problemsSolved: { $size: '$solvedProblems' },
        },
      },
      { $sort: { problemsSolved: -1, attempts: 1, name: 1 } },
      { $limit: 5 },
    ]),
    Submission.aggregate([
      { $match: { mode: 'submit', user: { $in: controlledStudentIds } } },
      {
        $group: {
          _id: '$user',
          name: { $first: '$userSnapshot.name' },
          attempts: { $sum: 1 },
          accepted: {
            $sum: {
              $cond: [{ $eq: ['$status', 'AC'] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          attempts: 1,
          acceptanceRate: {
            $cond: [{ $gt: ['$attempts', 0] }, { $multiply: [{ $divide: ['$accepted', '$attempts'] }, 100] }, 0],
          },
        },
      },
      { $match: { attempts: { $gte: 3 } } },
      { $sort: { acceptanceRate: -1, attempts: -1, name: 1 } },
      { $limit: 5 },
    ]),
    Submission.aggregate([
      { $match: { mode: 'submit', user: { $in: controlledStudentIds } } },
      {
        $group: {
          _id: '$problem',
          title: { $first: '$problemSnapshot.title' },
          attempts: { $sum: 1 },
        },
      },
    ]),
    Submission.aggregate([
      {
        $match: {
          mode: 'submit',
          user: { $in: controlledStudentIds },
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Submission.aggregate([
      {
        $match: {
          mode: 'submit',
          user: { $in: controlledStudentIds },
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            day: { $dayOfWeek: { date: '$createdAt', timezone: 'UTC' } },
            hour: { $hour: { date: '$createdAt', timezone: 'UTC' } },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.day': 1, '_id.hour': 1 } },
    ]),
    Submission.aggregate([
      {
        $match: {
          mode: 'submit',
          user: { $in: controlledStudentIds },
          createdAt: { $gte: oneDayAgo, $lte: today },
        },
      },
      {
        $group: {
          _id: '$user',
          name: { $first: '$userSnapshot.name' },
          attempts: { $sum: 1 },
          solvedProblems: {
            $addToSet: {
              $cond: [{ $eq: ['$status', 'AC'] }, '$problem', '$$REMOVE'],
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          attempts: 1,
          problemsSolved: { $size: '$solvedProblems' },
        },
      },
      { $sort: { problemsSolved: -1, attempts: -1, name: 1 } },
      { $limit: 5 },
    ]),
    Submission.aggregate([
      {
        $match: {
          mode: 'submit',
          user: { $in: controlledStudentIds },
          createdAt: { $gte: sevenDaysAgo, $lte: today },
        },
      },
      {
        $group: {
          _id: '$user',
          name: { $first: '$userSnapshot.name' },
          attempts: { $sum: 1 },
          solvedProblems: {
            $addToSet: {
              $cond: [{ $eq: ['$status', 'AC'] }, '$problem', '$$REMOVE'],
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          attempts: 1,
          problemsSolved: { $size: '$solvedProblems' },
        },
      },
      { $sort: { problemsSolved: -1, attempts: -1, name: 1 } },
      { $limit: 5 },
    ]),
    Problem.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Submission.aggregate([
      {
        $match: {
          mode: 'submit',
          user: { $in: controlledStudentIds },
          createdAt: { $gte: oneYearAgo },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Submission.aggregate([
      { $match: { mode: 'submit', user: { $in: controlledStudentIds }, status: 'AC' } },
      {
        $group: {
          _id: '$user',
          name: { $first: '$userSnapshot.name' },
          attempts: { $sum: 1 },
          solvedProblems: { $addToSet: '$problem' },
          easySolved: {
            $addToSet: {
              $cond: [{ $eq: ['$problemSnapshot.difficulty', 'Easy'] }, '$problem', '$$REMOVE'],
            },
          },
          mediumSolved: {
            $addToSet: {
              $cond: [{ $eq: ['$problemSnapshot.difficulty', 'Medium'] }, '$problem', '$$REMOVE'],
            },
          },
          hardSolved: {
            $addToSet: {
              $cond: [{ $eq: ['$problemSnapshot.difficulty', 'Hard'] }, '$problem', '$$REMOVE'],
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          attempts: 1,
          problemsSolved: { $size: '$solvedProblems' },
          easySolved: { $size: '$easySolved' },
          mediumSolved: { $size: '$mediumSolved' },
          hardSolved: { $size: '$hardSolved' },
        },
      },
      { $sort: { problemsSolved: -1, attempts: 1, name: 1 } },
      { $limit: 8 },
    ]),
  ]);

  const attemptMap = new Map(problemAttempts.map((entry) => [String(entry._id), entry.attempts]));
  const problemsWithAttempts = problems.map((problem) => ({
    problemId: problem._id,
    title: problem.title,
    difficulty: problem.difficulty,
    attempts: attemptMap.get(String(problem._id)) || 0,
  }));

  const mostAttemptedProblems = [...problemsWithAttempts]
    .sort((left, right) => right.attempts - left.attempts || String(left.title).localeCompare(String(right.title)))
    .slice(0, 12);
  const leastAttemptedProblems = [...problemsWithAttempts]
    .sort((left, right) => left.attempts - right.attempts || String(left.title).localeCompare(String(right.title)))
    .slice(0, 12);
  const submissionTrend = buildDateSeries(30, submissionTrendAgg);
  const activityHeatmap = activityHeatmapAgg.map((entry) => ({
    day: entry._id.day,
    hour: entry._id.hour,
    count: entry.count || 0,
  }));
  const problemGrowthTrend = buildDateSeries(30, problemGrowthAgg);
  const submissionHeatmap = submissionCalendarAgg.reduce((acc, entry) => {
    acc[entry._id] = entry.count || 0;
    return acc;
  }, {});

  res.json({
    summary: {
      totalStudents: students.length,
      totalProblems: problems.length,
      totalSubmissions,
      activeStudentsLast7Days: activeStudents.length,
      overallAcceptanceRate: totalSubmissions > 0 ? round((acceptedSubmissions / totalSubmissions) * 100) : 0,
    },
    recentActivity: {
      latestSubmissions: recentSubmissions.map((submission) => ({
        _id: submission._id,
        studentName: submission.userSnapshot?.name || 'Student',
        problemTitle: submission.problemSnapshot?.title || 'Untitled Problem',
        status: submission.status,
        createdAt: submission.createdAt,
      })),
      recentProblems: recentProblems.map((problem) => ({
        _id: problem._id,
        title: problem.title,
        difficulty: problem.difficulty,
        status: problem.status,
        createdAt: problem.createdAt,
      })),
      recentActiveStudents: recentActiveStudents.map((student) => ({
        studentId: student._id,
        name: student.name || 'Student',
        attempts: student.attempts || 0,
        lastActive: student.lastActive,
      })),
    },
    topPerformers: {
      mostSolved: topSolved.map((student) => ({
        studentId: student._id,
        name: student.name || 'Student',
        problemsSolved: student.problemsSolved || 0,
        attempts: student.attempts || 0,
      })),
      bestAcceptanceRate: topAccuracy.map((student) => ({
        studentId: student._id,
        name: student.name || 'Student',
        attempts: student.attempts || 0,
        acceptanceRate: round(student.acceptanceRate || 0),
      })),
    },
    problemEngagement: {
      mostAttempted: mostAttemptedProblems,
      leastAttempted: leastAttemptedProblems,
    },
    charts: {
      submissionsOverTime: submissionTrend,
      activityHeatmap,
      submissionHeatmap,
      problemGrowthTrend,
      topSolversByWindow: {
        daily: topSolvedDaily.map((student) => ({
          studentId: student._id,
          name: student.name || 'Student',
          problemsSolved: student.problemsSolved || 0,
          attempts: student.attempts || 0,
        })),
        weekly: topSolvedWeekly.map((student) => ({
          studentId: student._id,
          name: student.name || 'Student',
          problemsSolved: student.problemsSolved || 0,
          attempts: student.attempts || 0,
        })),
        overall: topSolved.map((student) => ({
          studentId: student._id,
          name: student.name || 'Student',
          problemsSolved: student.problemsSolved || 0,
          attempts: student.attempts || 0,
        })),
      },
      topSolversDetailed: topSolvedDetailedAgg.map((student) => ({
        studentId: student._id,
        name: student.name || 'Student',
        attempts: student.attempts || 0,
        problemsSolved: student.problemsSolved || 0,
        easySolved: student.easySolved || 0,
        mediumSolved: student.mediumSolved || 0,
        hardSolved: student.hardSolved || 0,
      })),
      recentlyAddedProblems: (recentProblems || []).map((problem) => ({
        _id: problem._id,
        title: problem.title,
        difficulty: problem.difficulty,
        status: problem.status,
        createdAt: problem.createdAt,
      })),
    },
  });
}

export async function getAdminCompilerAnalytics(req, res) {
  const { dateFrom, dateTo } = parseDateRange(req.query);
  const selectedStudentIds = parseMultiFilter(req.query.studentId);
  const selectedProblemIds = parseMultiFilter(req.query.problemId);
  const selectedAssessmentIds = parseMultiFilter(req.query.assessmentId);
  const selectedSemesters = parseMultiFilter(req.query.semester).map(Number);
  const selectedGroups = parseMultiFilter(req.query.group).map((item) => item.toLowerCase());
  const selectedBranches = parseMultiFilter(req.query.branch).map((item) => item.toLowerCase());
  const selectedCourses = parseMultiFilter(req.query.course).map((item) => item.toLowerCase());
  const selectedColleges = parseMultiFilter(req.query.college).map((item) => item.toLowerCase());
  const selectedUploadBatchIds = parseMultiFilter(req.query.uploadBatchId);
  const selectedTopics = parseMultiFilter(req.query.topic).map((item) => item.toLowerCase());
  const selectedDifficulties = parseMultiFilter(req.query.difficulty).map((item) => item.toLowerCase());
  const selectedProblemStatuses = parseMultiFilter(req.query.problemStatus).map((item) => item.toLowerCase());
  const selectedLanguages = parseMultiFilter(req.query.language).map((item) => item.toLowerCase());
  if (selectedSemesters.some((item) => !Number.isInteger(item) || item < 1 || item > 8)) {
    throw new HttpError(400, 'Every semester must be between 1 and 8.');
  }

  const baseSubmissionMatch = buildSubmissionMatch({ dateFrom, dateTo });
  if (selectedAssessmentIds.length) {
    baseSubmissionMatch.assessmentId = { $in: parseObjectIdFilter(selectedAssessmentIds, 'Assessment ID') };
  }
  if (selectedLanguages.length) baseSubmissionMatch.language = { $in: selectedLanguages };
  const [allControlledStudents, allControlledProblems, assessments, uploadBatches, masterData] = await Promise.all([
    getControlledStudents(),
    getControlledProblems(req),
    Assessment.find(req?.user?.role === 'coordinator' ? { createdBy: req.user._id, 'sections.type': 'coding' } : { 'sections.type': 'coding' })
      .select('_id title lifecycleStatus startTime createdAt targetType assignedStudents draftTargetMode draftAssignedStudents sections.questions.problemId sections.questions.coding.problemId sections.questions.problemDataSnapshot._id sections.questions.coding.problemData._id')
      .sort({ createdAt: -1 })
      .lean(),
    StudentUploadBatch.find(req?.user?.role === 'coordinator' ? { uploadedBy: req.user._id } : {})
      .select('_id name originalFileName createdAt studentIds')
      .sort({ createdAt: -1 })
      .lean(),
    MasterData.find({ isActive: true })
      .select('_id category name code order')
      .sort({ category: 1, order: 1, name: 1 })
      .lean(),
  ]);

  const masterValues = (category) => masterData
    .filter((entry) => entry.category === category)
    .map((entry) => entry.name);
  const availableSemesters = masterValues('semester').map(Number).filter(Number.isInteger).sort((a, b) => a - b);
  const availableGroups = uniqueTextValues(allControlledStudents.map((student) => student.group));
  const availableBranches = masterValues('branch');
  const availableCourses = masterValues('course');
  const availableColleges = masterValues('campus');
  const availableDifficulties = [...new Set(allControlledProblems.map((problem) => String(problem.difficulty || '').trim()).filter(Boolean))];
  const availableProblemStatuses = [...new Set(allControlledProblems.map((problem) => String(problem.status || '').trim()).filter(Boolean))];
  const availableTopics = [...new Set(allControlledProblems.flatMap((problem) => (
    (problem.tags || []).map((tag) => String(tag || '').trim()).filter(Boolean)
  )))].sort((a, b) => a.localeCompare(b));

  const studentIdentityMap = new Map();
  allControlledStudents.forEach((student) => {
    studentIdentityMap.set(String(student._id), String(student._id));
    if (student.email) studentIdentityMap.set(String(student.email).trim().toLowerCase(), String(student._id));
    if (student.studentId) studentIdentityMap.set(String(student.studentId).trim().toLowerCase(), String(student._id));
  });
  const resolveDraftStudentId = (student) => {
    const identities = typeof student === 'object' && student !== null
      ? [student._id, student.id, student.studentId, student.email]
      : [student];
    for (const identity of identities) {
      const normalized = String(identity || '').trim().toLowerCase();
      if (normalized && studentIdentityMap.has(normalized)) return studentIdentityMap.get(normalized);
    }
    return null;
  };
  const assessmentStudentIds = (assessment) => {
    if (assessment.lifecycleStatus === 'draft') {
      if (assessment.draftTargetMode === 'all' || assessment.targetType === 'all') return null;
      return [...new Set((assessment.draftAssignedStudents || [])
        .map(resolveDraftStudentId)
        .filter(Boolean))];
    }
    if (assessment.targetType !== 'selected') return null;
    return (assessment.assignedStudents || []).map(String);
  };
  const selectedAssessments = selectedAssessmentIds.length
    ? assessments.filter((assessment) => selectedAssessmentIds.includes(String(assessment._id)))
    : [];
  let assessmentStudentScope = selectedAssessmentIds.length ? new Set() : null;
  if (selectedAssessments.length) {
    const scopedIds = new Set();
    let includesAllStudents = false;
    selectedAssessments.forEach((assessment) => {
      const ids = assessmentStudentIds(assessment);
      if (ids === null) includesAllStudents = true;
      else ids.forEach((id) => scopedIds.add(id));
    });
    if (!includesAllStudents) assessmentStudentScope = scopedIds;
  }
  const assessmentProblemIds = (assessment) => [...new Set(
    (assessment.sections || []).flatMap((section) => (section.questions || []).map((question) => (
      question?.problemId
      || question?.coding?.problemId
      || question?.problemDataSnapshot?._id
      || question?.coding?.problemData?._id
    )))
      .filter((problemId) => mongoose.isValidObjectId(problemId))
      .map(String),
  )];
  const assessmentProblemScope = selectedAssessmentIds.length ? new Set() : null;
  selectedAssessments.forEach((assessment) => {
    assessmentProblemIds(assessment).forEach((problemId) => assessmentProblemScope.add(problemId));
  });

  const cohortStudents = allControlledStudents.filter((student) => (
    (!assessmentStudentScope || assessmentStudentScope.has(String(student._id)))
    && (!selectedStudentIds.length || selectedStudentIds.includes(String(student._id)))
    && (!selectedSemesters.length || selectedSemesters.includes(Number(student.semester)))
    && (!selectedGroups.length || selectedGroups.includes(String(student.group || '').trim().toLowerCase()))
    && (!selectedBranches.length || selectedBranches.includes(String(student.branch || '').trim().toLowerCase()))
    && (!selectedCourses.length || selectedCourses.includes(String(student.course || '').trim().toLowerCase()))
    && (!selectedColleges.length || selectedColleges.includes(String(student.college || '').trim().toLowerCase()))
    && (!selectedUploadBatchIds.length || (student.uploadBatchIds || []).some((id) => selectedUploadBatchIds.includes(String(id))))
  ));
  const reportingStudents = cohortStudents;
  const reportingStudentIds = reportingStudents.map((student) => student._id);

  const topicProblems = allControlledProblems.filter((problem) => (
    (!assessmentProblemScope || assessmentProblemScope.has(String(problem._id)))
    && (!selectedTopics.length || (problem.tags || []).some((tag) => selectedTopics.includes(String(tag || '').trim().toLowerCase())))
    && (!selectedDifficulties.length || selectedDifficulties.includes(String(problem.difficulty || '').trim().toLowerCase()))
    && (!selectedProblemStatuses.length || selectedProblemStatuses.includes(String(problem.status || '').trim().toLowerCase()))
  ));
  const problems = selectedProblemIds.length
    ? topicProblems.filter((problem) => selectedProblemIds.includes(String(problem._id)))
    : topicProblems;
  const problemIds = problems.map((problem) => problem._id);
  const submissionMatch = {
    ...baseSubmissionMatch,
    user: { $in: reportingStudentIds },
    problem: { $in: problemIds },
  };

  const [studentPerformanceRows, studentLastActivity, problemAnalysisAgg, submissionTimelineAgg, difficultyAgg, statusAgg, topicStudentProblemAgg, languageAgg, assessmentAgg] = await Promise.all([
    Submission.aggregate([
      { $match: submissionMatch },
      {
        $group: {
          _id: '$user',
          name: { $first: '$userSnapshot.name' },
          totalAttempts: { $sum: 1 },
          acceptedAttempts: {
            $sum: {
              $cond: [{ $eq: ['$status', 'AC'] }, 1, 0],
            },
          },
          solvedProblems: {
            $addToSet: {
              $cond: [{ $eq: ['$status', 'AC'] }, '$problem', '$$REMOVE'],
            },
          },
          lastActive: { $max: '$createdAt' },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          totalAttempts: 1,
          problemsSolved: { $size: '$solvedProblems' },
          acceptanceRate: {
            $cond: [{ $gt: ['$totalAttempts', 0] }, { $multiply: [{ $divide: ['$acceptedAttempts', '$totalAttempts'] }, 100] }, 0],
          },
          lastActive: 1,
        },
      },
      { $sort: { totalAttempts: -1, lastActive: -1, name: 1 } },
    ]),
    Submission.aggregate([
      { $match: submissionMatch },
      {
        $group: {
          _id: '$user',
          lastActive: { $max: '$createdAt' },
        },
      },
    ]),
    Submission.aggregate([
      { $match: submissionMatch },
      {
        $group: {
          _id: '$problem',
          title: { $first: '$problemSnapshot.title' },
          totalAttempts: { $sum: 1 },
          acceptedStudents: {
            $addToSet: {
              $cond: [{ $eq: ['$status', 'AC'] }, '$user', '$$REMOVE'],
            },
          },
          failedAttempts: {
            $sum: {
              $cond: [{ $eq: ['$status', 'AC'] }, 0, 1],
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          title: 1,
          totalAttempts: 1,
          studentsSolved: { $size: '$acceptedStudents' },
          failureRate: {
            $cond: [{ $gt: ['$totalAttempts', 0] }, { $multiply: [{ $divide: ['$failedAttempts', '$totalAttempts'] }, 100] }, 0],
          },
        },
      },
      { $sort: { totalAttempts: -1, title: 1 } },
    ]),
    Submission.aggregate([
      { $match: submissionMatch },
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
      { $match: submissionMatch },
      {
        $group: {
          _id: '$problem',
          difficulty: { $first: '$problemSnapshot.difficulty' },
          attempts: { $sum: 1 },
          accepted: {
            $sum: {
              $cond: [{ $eq: ['$status', 'AC'] }, 1, 0],
            },
          },
        },
      },
      {
        $group: {
          _id: '$difficulty',
          totalAttempts: { $sum: '$attempts' },
          totalAccepted: { $sum: '$accepted' },
        },
      },
    ]),
    Submission.aggregate([
      { $match: submissionMatch },
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $eq: ['$status', 'AC'] }, then: 'Accepted' },
                { case: { $eq: ['$status', 'WA'] }, then: 'Wrong Answer' },
              ],
              default: 'Errors',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]),
    Submission.aggregate([
      { $match: submissionMatch },
      {
        $group: {
          _id: { user: '$user', problem: '$problem' },
          attempts: { $sum: 1 },
          accepted: { $max: { $cond: [{ $eq: ['$status', 'AC'] }, 1, 0] } },
        },
      },
    ]),
    Submission.aggregate([
      { $match: submissionMatch },
      {
        $group: {
          _id: '$language',
          attempts: { $sum: 1 },
          accepted: { $sum: { $cond: [{ $eq: ['$status', 'AC'] }, 1, 0] } },
        },
      },
      { $sort: { attempts: -1, _id: 1 } },
    ]),
    Submission.aggregate([
      { $match: submissionMatch },
      {
        $group: {
          _id: '$assessmentId',
          attempts: { $sum: 1 },
          accepted: { $sum: { $cond: [{ $eq: ['$status', 'AC'] }, 1, 0] } },
          students: { $addToSet: '$user' },
        },
      },
      { $sort: { attempts: -1 } },
    ]),
  ]);

  const lastActivityMap = new Map(studentLastActivity.map((entry) => [String(entry._id), entry.lastActive]));
  const studentPerformanceMap = new Map(studentPerformanceRows.map((row) => [String(row._id), row]));

  const studentPerformance = reportingStudents
    .map((student) => {
      const row = studentPerformanceMap.get(String(student._id));
      return {
        studentId: student._id,
        name: student.name || 'Student',
        email: student.email || '',
        studentCode: student.studentId || '',
        semester: student.semester || null,
        group: student.group || '',
        branch: student.branch || '',
        course: student.course || '',
        college: student.college || '',
        totalAttempts: row?.totalAttempts || 0,
        problemsSolved: row?.problemsSolved || 0,
        acceptanceRate: round(row?.acceptanceRate || 0),
        lastActive: row?.lastActive || lastActivityMap.get(String(student._id)) || null,
      };
    })
    .sort((left, right) => right.totalAttempts - left.totalAttempts || String(left.name).localeCompare(String(right.name)));

  const problemAggMap = new Map(problemAnalysisAgg.map((entry) => [String(entry._id), entry]));
  const problemAnalysis = problems
    .map((problem) => {
      const row = problemAggMap.get(String(problem._id));
      return {
        problemId: problem._id,
        title: problem.title,
        difficulty: problem.difficulty,
        topics: problem.tags || [],
        totalAttempts: row?.totalAttempts || 0,
        studentsSolved: row?.studentsSolved || 0,
        failureRate: round(row?.failureRate || 0),
      };
    })
    .sort((left, right) => right.totalAttempts - left.totalAttempts || String(left.title).localeCompare(String(right.title)));

  const problemById = new Map(problems.map((problem) => [String(problem._id), problem]));
  const topicStats = new Map();
  const getIncludedTopics = (problem) => {
    const tags = (problem.tags || []).map((tag) => String(tag || '').trim()).filter(Boolean);
    if (selectedTopics.length) {
      return tags.filter((tag) => selectedTopics.includes(tag.toLowerCase()));
    }
    return tags.length ? tags : ['Uncategorized'];
  };
  const ensureTopic = (topicName) => {
    if (!topicStats.has(topicName)) {
      topicStats.set(topicName, {
        topic: topicName,
        problemIds: new Set(),
        attemptedStudents: new Set(),
        solvedStudents: new Set(),
        attemptedPairs: 0,
        solvedPairs: 0,
        attempts: 0,
      });
    }
    return topicStats.get(topicName);
  };

  problems.forEach((problem) => {
    getIncludedTopics(problem).forEach((tag) => ensureTopic(tag).problemIds.add(String(problem._id)));
  });

  topicStudentProblemAgg.forEach((entry) => {
    const problem = problemById.get(String(entry._id?.problem || ''));
    if (!problem) return;
    getIncludedTopics(problem).forEach((tag) => {
      const stats = ensureTopic(tag);
      const userKey = String(entry._id?.user || '');
      stats.attemptedStudents.add(userKey);
      stats.attemptedPairs += 1;
      stats.attempts += Number(entry.attempts || 0);
      if (entry.accepted) {
        stats.solvedStudents.add(userKey);
        stats.solvedPairs += 1;
      }
    });
  });

  const cohortSize = reportingStudents.length;
  const topicMastery = [...topicStats.values()]
    .map((stats) => {
      const possibleStudentProblemPairs = cohortSize * stats.problemIds.size;
      return {
        topic: stats.topic,
        problemCount: stats.problemIds.size,
        attempts: stats.attempts,
        attemptedStudents: stats.attemptedStudents.size,
        solvedStudents: stats.solvedStudents.size,
        knowledgeRate: cohortSize > 0 ? round((stats.solvedStudents.size / cohortSize) * 100) : 0,
        masteryRate: possibleStudentProblemPairs > 0 ? round((stats.solvedPairs / possibleStudentProblemPairs) * 100) : 0,
        participationRate: cohortSize > 0 ? round((stats.attemptedStudents.size / cohortSize) * 100) : 0,
        successRate: stats.attemptedPairs > 0 ? round((stats.solvedPairs / stats.attemptedPairs) * 100) : 0,
      };
    })
    .sort((left, right) => right.knowledgeRate - left.knowledgeRate || right.attempts - left.attempts || left.topic.localeCompare(right.topic));

  const difficultyChart = ['Easy', 'Medium', 'Hard'].map((difficulty) => {
    const row = difficultyAgg.find((entry) => entry._id === difficulty);
    return {
      difficulty,
      successRate: row && row.totalAttempts > 0 ? round((row.totalAccepted / row.totalAttempts) * 100) : 0,
    };
  });

  const totalStatusEvents = statusAgg.reduce((sum, entry) => sum + entry.count, 0);
  const pieChart = ['Accepted', 'Wrong Answer', 'Errors'].map((label) => {
    const row = statusAgg.find((entry) => entry._id === label);
    const count = row?.count || 0;
    return {
      label,
      count,
      percentage: totalStatusEvents > 0 ? round((count / totalStatusEvents) * 100) : 0,
    };
  });

  const lineChart = dateFrom && dateTo
    ? buildDateSeriesFromRange(dateFrom, new Date(Math.min(dateTo.getTime(), dateFrom.getTime() + (89 * 24 * 60 * 60 * 1000))), submissionTimelineAgg)
    : buildDateSeries(30, submissionTimelineAgg);

  const assessmentTitleMap = new Map(assessments.map((assessment) => [String(assessment._id), assessment.title || 'Untitled assessment']));
  const assessmentPerformance = assessmentAgg.map((entry) => ({
    assessmentId: entry._id || '',
    title: entry._id ? (assessmentTitleMap.get(String(entry._id)) || 'Deleted assessment') : 'Practice / Library',
    attempts: entry.attempts || 0,
    activeStudents: Array.isArray(entry.students) ? entry.students.length : 0,
    successRate: entry.attempts > 0 ? round((entry.accepted / entry.attempts) * 100) : 0,
  }));
  const acceptedAttempts = statusAgg.find((entry) => entry._id === 'Accepted')?.count || 0;
  const totalAttempts = statusAgg.reduce((sum, entry) => sum + Number(entry.count || 0), 0);
  const averageMastery = topicMastery.length
    ? round(topicMastery.reduce((sum, entry) => sum + entry.masteryRate, 0) / topicMastery.length)
    : 0;

  res.json({
    summary: {
      cohortSize,
      activeStudents: studentPerformance.filter((student) => student.totalAttempts > 0).length,
      totalAttempts,
      acceptedAttempts,
      acceptanceRate: totalAttempts > 0 ? round((acceptedAttempts / totalAttempts) * 100) : 0,
      problemsCovered: problems.length,
      topicsCovered: topicMastery.length,
      averageMastery,
    },
    filters: {
      students: allControlledStudents.map((student) => ({
        _id: student._id,
        name: student.name || 'Student',
        email: student.email || '',
        studentId: student.studentId || '',
        semester: student.semester || null,
        group: student.group || '',
        branch: student.branch || '',
        course: student.course || '',
        college: student.college || '',
        uploadBatchIds: (student.uploadBatchIds || []).map(String),
      })),
      problems: allControlledProblems.map((problem) => ({
        _id: problem._id,
        title: problem.title,
        tags: problem.tags || [],
        difficulty: problem.difficulty || 'Easy',
        status: problem.status || 'draft',
      })),
      assessments: assessments.map((assessment) => {
        const studentIds = assessmentStudentIds(assessment);
        return {
          _id: assessment._id,
          title: assessment.title || 'Untitled assessment',
          status: assessment.lifecycleStatus || 'published',
          targetType: assessment.targetType || 'all',
          studentIds,
          studentCount: studentIds === null ? allControlledStudents.length : studentIds.length,
          problemIds: assessmentProblemIds(assessment),
        };
      }),
      semesters: availableSemesters,
      groups: availableGroups,
      branches: availableBranches,
      courses: availableCourses,
      colleges: availableColleges,
      topics: availableTopics,
      difficulties: availableDifficulties,
      problemStatuses: availableProblemStatuses,
      languages: ['c', 'cpp', 'java', 'javascript', 'python'],
      masterData: masterData.map((entry) => ({
        _id: entry._id,
        category: entry.category,
        name: entry.name,
        code: entry.code || '',
        order: entry.order || 0,
      })),
      uploadBatches: uploadBatches.map((batch) => ({
        _id: batch._id,
        name: batch.name,
        originalFileName: batch.originalFileName,
        createdAt: batch.createdAt,
        studentCount: Array.isArray(batch.studentIds) ? batch.studentIds.length : 0,
      })),
      applied: {
        studentIds: selectedStudentIds,
        problemIds: selectedProblemIds,
        assessmentIds: selectedAssessmentIds,
        semesters: selectedSemesters,
        groups: parseMultiFilter(req.query.group),
        branches: parseMultiFilter(req.query.branch),
        courses: parseMultiFilter(req.query.course),
        colleges: parseMultiFilter(req.query.college),
        uploadBatchIds: selectedUploadBatchIds,
        topics: parseMultiFilter(req.query.topic),
        difficulties: parseMultiFilter(req.query.difficulty),
        problemStatuses: parseMultiFilter(req.query.problemStatus),
        languages: selectedLanguages,
        dateFrom: dateFrom ? dateFrom.toISOString().slice(0, 10) : '',
        dateTo: dateTo ? dateTo.toISOString().slice(0, 10) : '',
      },
    },
    studentPerformance,
    problemAnalysis,
    topicMastery,
    assessmentPerformance,
    charts: {
      submissionsOverTime: lineChart,
      difficultyVsSuccessRate: difficultyChart,
      verdictDistribution: pieChart,
      languageDistribution: languageAgg.map((entry) => ({
        language: entry._id || 'unknown',
        attempts: entry.attempts || 0,
        successRate: entry.attempts > 0 ? round((entry.accepted / entry.attempts) * 100) : 0,
      })),
    },
  });
}

export async function getCompilerStudentAnalytics(req, res) {
  ensureObjectId(req.params.id, 'Student ID');

  const student = await User.findById(req.params.id)
    .select('_id name email studentId createdAt role')
    .lean();

  if (!student || student.role !== 'student') {
    throw new HttpError(404, 'Student not found.');
  }

  const matchObj = { user: student._id, mode: 'submit' };
  if (req?.user?.role === 'coordinator') {
    const controlledProblems = await getControlledProblems(req);
    matchObj.problem = { $in: controlledProblems.map((p) => p._id) };
  }

  const [attemptedProblemsAgg, solvedProblemsAgg, submissionHistory, performanceTrendAgg, activityHeatmapAgg, summaryAgg, statusBreakdownAgg] = await Promise.all([
    Submission.aggregate([
      { $match: matchObj },
      {
        $group: {
          _id: '$problem',
          title: { $first: '$problemSnapshot.title' },
          difficulty: { $first: '$problemSnapshot.difficulty' },
          attempts: { $sum: 1 },
          lastStatus: { $last: '$status' },
          lastSubmittedAt: { $max: '$createdAt' },
        },
      },
      { $sort: { lastSubmittedAt: -1 } },
    ]),
    Submission.aggregate([
      { $match: { ...matchObj, status: 'AC' } },
      {
        $group: {
          _id: '$problem',
          title: { $first: '$problemSnapshot.title' },
          difficulty: { $first: '$problemSnapshot.difficulty' },
          acceptedAt: { $min: '$createdAt' },
        },
      },
      { $sort: { acceptedAt: -1 } },
    ]),
    Submission.find(matchObj)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    Submission.aggregate([
      {
        $match: {
          ...matchObj,
          createdAt: { $gte: buildLastNDates(30)[0] },
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
          attempts: { $sum: 1 },
          accepted: {
            $sum: {
              $cond: [{ $eq: ['$status', 'AC'] }, 1, 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Submission.aggregate([
      {
        $match: {
          ...matchObj,
          createdAt: { $gte: buildLastNDates(365)[0] },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
              timezone: 'UTC',
            },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    Submission.aggregate([
      { $match: matchObj },
      {
        $group: {
          _id: null,
          totalAttempts: { $sum: 1 },
          acceptedAttempts: {
            $sum: {
              $cond: [{ $eq: ['$status', 'AC'] }, 1, 0],
            },
          },
          solvedProblems: {
            $addToSet: {
              $cond: [{ $eq: ['$status', 'AC'] }, '$problem', '$$REMOVE'],
            },
          },
          lastActive: { $max: '$createdAt' },
        },
      },
    ]),
    Submission.aggregate([
      { $match: matchObj },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1, _id: 1 } },
    ]),
  ]);

  const summary = summaryAgg[0] || {};

  res.json({
    student: {
      _id: student._id,
      name: student.name || 'Student',
      email: student.email || '',
      studentId: student.studentId || '',
    },
    summary: {
      totalAttempts: summary.totalAttempts || 0,
      problemsSolved: Array.isArray(summary.solvedProblems) ? summary.solvedProblems.length : 0,
      acceptanceRate: summary.totalAttempts > 0 ? round((summary.acceptedAttempts / summary.totalAttempts) * 100) : 0,
      lastActive: summary.lastActive || null,
    },
    attemptedProblems: attemptedProblemsAgg.map((entry) => ({
      problemId: entry._id,
      title: entry.title || 'Untitled Problem',
      difficulty: entry.difficulty || 'Easy',
      attempts: entry.attempts || 0,
      lastStatus: entry.lastStatus || 'WA',
      lastSubmittedAt: entry.lastSubmittedAt || null,
    })),
    solvedProblems: solvedProblemsAgg.map((entry) => ({
      problemId: entry._id,
      title: entry.title || 'Untitled Problem',
      difficulty: entry.difficulty || 'Easy',
      acceptedAt: entry.acceptedAt || null,
    })),
    submissionHistory: submissionHistory.map((submission) => ({
      _id: submission._id,
      problemTitle: submission.problemSnapshot?.title || 'Untitled Problem',
      status: submission.status,
      language: submission.language,
      executionTimeMs: submission.executionTimeMs || 0,
      createdAt: submission.createdAt,
    })),
    performanceTrend: buildDateSeries(30, performanceTrendAgg.map((entry) => ({
      _id: entry._id,
      count: entry.attempts,
    }))).map((entry) => {
      const original = performanceTrendAgg.find((item) => item._id === entry.date);
      return {
        ...entry,
        accepted: original?.accepted || 0,
      };
    }),
    activityHeatmap: activityHeatmapAgg.reduce((acc, entry) => {
      acc[entry._id] = entry.count || 0;
      return acc;
    }, {}),
    statusBreakdown: statusBreakdownAgg.reduce((acc, entry) => {
      acc[entry._id] = entry.count || 0;
      return acc;
    }, {}),
  });
}

export async function getCompilerAnalyticsOverview(req, res) {
  return getAdminCompilerAnalytics(req, res);
}

export async function getCompilerProblemAnalytics(req, res) {
  ensureObjectId(req.params.id, 'Problem ID');
  const search = sanitizeSearchQuery(req.query.search || '');
  const students = await getControlledStudents();
  const controlledStudentIds = students.map((student) => student._id);

  const match = {
    ...buildSubmissionMatch({ problemId: req.params.id }),
    user: { $in: controlledStudentIds },
  };
  const problem = await Problem.findById(req.params.id).select('_id title difficulty status createdBy').lean();
  
  if (!problem || (req?.user?.role === 'coordinator' && String(problem.createdBy) !== String(req.user._id))) {
    throw new HttpError(404, 'Problem not found.');
  }

  const [submissionsByStatus, recentStudents] = await Promise.all([
    Submission.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Submission.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$user',
          name: { $first: '$userSnapshot.name' },
          attempts: { $sum: 1 },
          accepted: {
            $sum: {
              $cond: [{ $eq: ['$status', 'AC'] }, 1, 0],
            },
          },
          lastActive: { $max: '$createdAt' },
        },
      },
      { $sort: { lastActive: -1 } },
    ]),
  ]);

  const filteredStudents = recentStudents.filter((student) => {
    if (!search) return true;
    return new RegExp(search, 'i').test(student.name || '');
  });

  res.json({
    problem,
    verdictDistribution: submissionsByStatus.map((entry) => ({
      status: entry._id,
      count: entry.count,
    })),
    recentStudents: filteredStudents.map((student) => ({
      studentId: student._id,
      name: student.name || 'Student',
      attempts: student.attempts || 0,
      acceptanceRate: student.attempts > 0 ? round((student.accepted / student.attempts) * 100) : 0,
      lastActive: student.lastActive || null,
    })),
  });
}
