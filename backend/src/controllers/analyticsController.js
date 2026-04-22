import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import User from '../models/User.js';
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

function buildSubmissionMatch({ studentId = '', problemId = '', dateFrom = null, dateTo = null }) {
  const match = {
    mode: 'submit',
  };

  if (studentId) {
    ensureObjectId(studentId, 'Student ID');
    match.user = studentId;
  }

  if (problemId) {
    ensureObjectId(problemId, 'Problem ID');
    match.problem = problemId;
  }

  if (dateFrom || dateTo) {
    match.createdAt = {};
    if (dateFrom) match.createdAt.$gte = dateFrom;
    if (dateTo) match.createdAt.$lte = dateTo;
  }

  return match;
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
    .select('_id name email studentId createdAt')
    .sort({ name: 1 })
    .lean();
}

async function getControlledProblems(req) {
  const query = req?.user?.role === 'coordinator' ? { createdBy: req.user._id } : {};
  return Problem.find(query)
    .select('_id title difficulty status createdAt')
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
  const studentId = String(req.query.studentId || '').trim();
  const problemId = String(req.query.problemId || '').trim();
  const submissionMatch = buildSubmissionMatch({ studentId, problemId, dateFrom, dateTo });
  const controlledStudents = await getControlledStudents();
  const controlledStudentIds = controlledStudents.map((student) => student._id);

  const problems = await getControlledProblems(req);
  if (req?.user?.role === 'coordinator') {
    submissionMatch.problem = { $in: problems.map((p) => p._id) };
  }

  const [studentPerformanceRows, studentLastActivity, problemAnalysisAgg, submissionTimelineAgg, difficultyAgg, statusAgg] = await Promise.all([
    Submission.aggregate([
      { $match: { ...submissionMatch, user: studentId ? submissionMatch.user : { $in: controlledStudentIds } } },
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
      { $match: { ...submissionMatch, user: studentId ? submissionMatch.user : { $in: controlledStudentIds } } },
      {
        $group: {
          _id: '$user',
          lastActive: { $max: '$createdAt' },
        },
      },
    ]),
    Submission.aggregate([
      { $match: { ...submissionMatch, user: studentId ? submissionMatch.user : { $in: controlledStudentIds } } },
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
      { $match: { ...submissionMatch, user: studentId ? submissionMatch.user : { $in: controlledStudentIds } } },
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
      { $match: { ...submissionMatch, user: studentId ? submissionMatch.user : { $in: controlledStudentIds } } },
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
      { $match: { ...submissionMatch, user: studentId ? submissionMatch.user : { $in: controlledStudentIds } } },
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
  ]);

  const lastActivityMap = new Map(studentLastActivity.map((entry) => [String(entry._id), entry.lastActive]));
  const studentPerformanceMap = new Map(studentPerformanceRows.map((row) => [String(row._id), row]));

  const studentPerformance = controlledStudents
    .filter((student) => !studentId || String(student._id) === studentId)
    .map((student) => {
      const row = studentPerformanceMap.get(String(student._id));
      return {
        studentId: student._id,
        name: student.name || 'Student',
        totalAttempts: row?.totalAttempts || 0,
        problemsSolved: row?.problemsSolved || 0,
        acceptanceRate: round(row?.acceptanceRate || 0),
        lastActive: row?.lastActive || lastActivityMap.get(String(student._id)) || null,
      };
    })
    .sort((left, right) => right.totalAttempts - left.totalAttempts || String(left.name).localeCompare(String(right.name)));

  const problemAggMap = new Map(problemAnalysisAgg.map((entry) => [String(entry._id), entry]));
  const problemAnalysis = problems
    .filter((problem) => !problemId || String(problem._id) === problemId)
    .map((problem) => {
      const row = problemAggMap.get(String(problem._id));
      return {
        problemId: problem._id,
        title: problem.title,
        difficulty: problem.difficulty,
        totalAttempts: row?.totalAttempts || 0,
        studentsSolved: row?.studentsSolved || 0,
        failureRate: round(row?.failureRate || 0),
      };
    })
    .sort((left, right) => right.totalAttempts - left.totalAttempts || String(left.title).localeCompare(String(right.title)));

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

  res.json({
    filters: {
      students: controlledStudents.map((student) => ({
        _id: student._id,
        name: student.name || 'Student',
      })),
      problems: problems.map((problem) => ({
        _id: problem._id,
        title: problem.title,
      })),
      applied: {
        studentId: studentId || '',
        problemId: problemId || '',
        dateFrom: dateFrom ? dateFrom.toISOString().slice(0, 10) : '',
        dateTo: dateTo ? dateTo.toISOString().slice(0, 10) : '',
      },
    },
    studentPerformance,
    problemAnalysis,
    charts: {
      submissionsOverTime: lineChart,
      difficultyVsSuccessRate: difficultyChart,
      verdictDistribution: pieChart,
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
