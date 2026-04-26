import Pair from '../models/Pair.js';
import Progress from '../models/Progress.js';
import Submission from '../models/Submission.js';
import User from '../models/User.js';
import StudentActivity from '../models/StudentActivity.js';
import Subject from '../models/Subject.js';
import { HttpError } from '../utils/errors.js';

// Format seconds into a human-readable watch time string (e.g. "3m 45s", "1h 02m")
function formatWatchTime(seconds) {
  if (!seconds || seconds <= 0) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, '0')}m`;
  if (mins > 0 && secs > 0) return `${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m`;
  return `${secs}s`;
}

// Helper: determine learning scope (semesters/subjects/videos) for a given student
// based on their current semester. This is used for both profile stats and
// contribution calendar summary cards so that "Courses Enrolled" and
// "Videos Watched" are always computed from the learning modules actually
// assigned to the student.
async function computeLearningScopeForStudent(student) {
  // Fallback: if student or semester is missing, include all semesters
  const semesters = await Subject.find().sort('order');

  const normalizeSubjectName = (name) => {
    if (!name) return '';
    return String(name)
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const allowedSemesterIds = [];
  const subjectKeys = new Set();
  const validTopicIds = new Set(); // Track all valid topic IDs in curriculum
  let totalVideosTotal = 0;

  const hasSemesterNumber = student && typeof student.semester === 'number';

  semesters.forEach(semester => {
    // If the student has a defined semester, only include semesters up to that
    if (hasSemesterNumber) {
      const match = semester.semesterName?.match(/\d+/);
      if (match) {
        const semNum = parseInt(match[0], 10);
        if (Number.isFinite(semNum) && semNum > student.semester) {
          return; // skip higher semesters
        }
      }
    }

    allowedSemesterIds.push(semester._id);

    // Collect unique logical subjects (per semester name + normalized subject name)
    semester.subjects?.forEach(subject => {
      const key = `${semester.semesterName || ''}::${normalizeSubjectName(subject.subjectName)}`;
      subjectKeys.add(key);

      // Count total videos available in curriculum (topics with a video link)
      subject.chapters?.forEach(chapter => {
        chapter.topics?.forEach(topic => {
          // Track all valid topic IDs
          validTopicIds.add(topic._id.toString());
          
          if (topic.topicVideoLink) {
            totalVideosTotal += 1;
          }
        });
      });
    });
  });

  return {
    allowedSemesterIds,
    totalCourses: subjectKeys.size,
    totalVideosTotal,
    validTopicIds: Array.from(validTopicIds).map(id => new Subject.base.Types.ObjectId(id))
  };
}

/**
 * Log student activity for contribution calendar
 */
export async function logStudentActivity({ studentId, studentModel, activityType, metadata = {} }) {
  try {
    // Use UTC date normalized to start of day for consistent grouping
    const now = new Date();
    const activity = await StudentActivity.create({
      studentId,
      studentModel,
      activityType,
      metadata,
      date: now
    });
    console.log('[logStudentActivity] Created activity:', {
      activityType,
      studentId: studentId.toString(),
      date: now.toISOString(),
      dateOnly: now.toISOString().slice(0, 10),
      dateUTC: now.toISOString()
    });
    return activity;
  } catch (error) {
    console.error('[Log Student Activity Error]', error);
    // Non-blocking - don't throw error
  }
}

/**
 * Debug endpoint to check raw student activity data
 */
export async function debugStudentActivity(req, res) {
  const user = req.user;
  if (!user) throw new HttpError(401, 'Unauthorized');
  
  try {
    const allActivities = await StudentActivity.find({ studentId: user._id })
      .sort({ date: -1 })
      .limit(20)
      .lean();
    
    const count = await StudentActivity.countDocuments({ studentId: user._id });
    
    res.json({
      total: count,
      recentActivities: allActivities.map(a => ({
        activityType: a.activityType,
        date: a.date,
        dateString: new Date(a.date).toISOString().slice(0, 10),
        metadata: a.metadata
      }))
    });
  } catch (error) {
    console.error('[Debug Student Activity Error]', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get student activity data for contribution calendar with comprehensive stats
 */
export async function getStudentActivity(req, res) {
  const user = req.user;
  if (!user) throw new HttpError(401, 'Unauthorized');
  if (user.role !== 'student') throw new HttpError(403, 'Only students can access activity data');

  // Always use rolling 365-day window ending today
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 364); // 365 days including today
  startDate.setHours(0, 0, 0, 0);

  try {
    // Determine learning scope for this student (which semesters/subjects/videos count)
    const { allowedSemesterIds, totalCourses, totalVideosTotal, validTopicIds } = await computeLearningScopeForStudent(user);

    // 1. Get all student activities from StudentActivity collection
    console.log('[getStudentActivity] Querying StudentActivity collection');
    console.log('[getStudentActivity] User ID:', user._id.toString());
    console.log('[getStudentActivity] Date range:', startDate.toISOString(), 'to', endDate.toISOString());
    
    const activities = await StudentActivity.aggregate([
      {
        $match: {
          studentId: user._id,
          date: {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'UTC' }
          },
          count: { $sum: 1 },
          activities: { $push: '$activityType' }
        }
      }
    ]);
    
    console.log('[getStudentActivity] Activities found:', activities.length);
    if (activities.length > 0) {
      console.log('[getStudentActivity] Sample activities:', activities.slice(0, 3));
      console.log('[getStudentActivity] All activity dates:', activities.map(a => a._id));
    }

    // 2. Get scheduled sessions within range (all pairs now reference User model)
    const scheduledSessions = await Pair.aggregate([
      {
        $match: {
          $or: [
            { interviewer: user._id, interviewerModel: 'User' },
            { interviewee: user._id, intervieweeModel: 'User' }
          ],
          finalConfirmedTime: {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$finalConfirmedTime' }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // 3. Get completed topics within range
    const completedTopics = await Progress.aggregate([
      {
        $match: {
          studentId: user._id,
          completed: true,
          completedAt: {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$completedAt' }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    const compilerSubmissions = await Submission.aggregate([
      {
        $match: {
          user: user._id,
          mode: 'submit',
          createdAt: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    // 4. Merge activity data from all sources
    const activityMap = {};

    // Base activities from StudentActivity collection (videos watched, problems solved, etc.)
    activities.forEach(item => {
      activityMap[item._id] = item.count;
    });

    // Scheduled interview sessions
    scheduledSessions.forEach(item => {
      const date = item._id;
      if (!activityMap[date]) activityMap[date] = 0;
      activityMap[date] += item.count;
    });

    // Completed learning topics
    completedTopics.forEach(item => {
      const date = item._id;
      if (!activityMap[date]) activityMap[date] = 0;
      activityMap[date] += item.count;
    });

    compilerSubmissions.forEach(item => {
      const date = item._id;
      if (!activityMap[date]) activityMap[date] = 0;
      activityMap[date] += item.count;
    });

    console.log('[getStudentActivity] Activities from StudentActivity:', activities.length);
    console.log('[getStudentActivity] Scheduled sessions:', scheduledSessions.length);
    console.log('[getStudentActivity] Completed topics:', completedTopics.length);
    console.log('[getStudentActivity] Total activity dates:', Object.keys(activityMap).length);
    console.log('[getStudentActivity] Activity map keys:', Object.keys(activityMap));
    console.log('[getStudentActivity] Activity map values:', Object.values(activityMap));
    console.log('[getStudentActivity] Full activityMap:', activityMap);

    // 5. Calculate streaks based on merged activity map
    const sortedDates = Object.keys(activityMap).sort();
    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;
    const today = new Date().toISOString().split('T')[0];

    // Calculate best streak
    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) {
        tempStreak = 1;
      } else {
        const prevDate = new Date(sortedDates[i - 1]);
        const currDate = new Date(sortedDates[i]);
        const diffDays = Math.floor((currDate - prevDate) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          tempStreak++;
        } else {
          bestStreak = Math.max(bestStreak, tempStreak);
          tempStreak = 1;
        }
      }
    }
    bestStreak = Math.max(bestStreak, tempStreak);

    // Calculate current streak (working backwards from today)
    if (sortedDates.length > 0) {
      const todayOrYesterday = [today, new Date(Date.now() - 86400000).toISOString().split('T')[0]];
      if (todayOrYesterday.includes(sortedDates[sortedDates.length - 1])) {
        currentStreak = 1;
        for (let i = sortedDates.length - 2; i >= 0; i--) {
          const currDate = new Date(sortedDates[i + 1]);
          const prevDate = new Date(sortedDates[i]);
          const diffDays = Math.floor((currDate - prevDate) / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            currentStreak++;
          } else {
            break;
          }
        }
      }
    }

    // 4. Get total videos watched (all time) within the allowed semesters and valid topics only
    const videoWatchMatch = {
      studentId: user._id,
      videoWatchedSeconds: { $gt: 0 }
    };
    if (allowedSemesterIds.length > 0) {
      videoWatchMatch.semesterId = { $in: allowedSemesterIds };
    }
    // Only count videos for topics that still exist in the curriculum
    if (validTopicIds.length > 0) {
      videoWatchMatch.topicId = { $in: validTopicIds };
    }
    const videosWatchedAgg = await Progress.aggregate([
      { $match: videoWatchMatch },
      { $group: { _id: '$topicId' } },
      { $count: 'totalVideos' }
    ]);
    const videoWatchCount = videosWatchedAgg[0]?.totalVideos || 0;

    // 5. Removed PROBLEM_SOLVED count - not tracking this anymore

    // 6. Use learning scope helper for total subjects and total videos in curriculum
    const totalSubjects = totalCourses;

    res.json({
      activityByDate: activityMap,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      stats: {
        totalActiveDays: sortedDates.length,
        totalDaysInRange: 365,
        currentStreak,
        bestStreak,
        totalSubjects,
        totalVideosWatched: videoWatchCount,
        totalVideosTotal,
        totalCompilerSubmissions: compilerSubmissions.reduce((sum, item) => sum + item.count, 0),
        totalActivities: Object.values(activityMap).reduce((sum, val) => sum + val, 0)
      }
    });
  } catch (error) {
    console.error('[Get Student Activity Error]', error);
    throw new HttpError(500, 'Failed to fetch activity data');
  }
}

/**
 * Get any student's activity data (admin only)
 * Same as getStudentActivity but allows admin to view any student's data
 */
export async function getStudentActivityByAdmin(req, res) {
  const user = req.user;
  if (!user) throw new HttpError(401, 'Unauthorized');
  if (user.role !== 'admin' && user.role !== 'coordinator') {
    throw new HttpError(403, 'Only admins and coordinators can access this data');
  }

  const { studentId } = req.params;
  
  if (!studentId) throw new HttpError(400, 'Student ID is required');

  // Find the student in unified User collection
  const student = await User.findById(studentId);
  if (!student) throw new HttpError(404, 'Student not found');
  if (student.role !== 'student' && !student.isSpecialStudent) {
    throw new HttpError(400, 'Invalid student ID');
  }

  // Always use rolling 365-day window ending today
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 364);
  startDate.setHours(0, 0, 0, 0);

  try {
    // 1. Get all student activities from StudentActivity collection
    const activities = await StudentActivity.aggregate([
      {
        $match: {
          studentId: student._id,
          date: {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$date' }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Get scheduled sessions
    const scheduledSessions = await Pair.aggregate([
      {
        $match: {
          $or: [
            { interviewer: student._id, interviewerModel: 'User' },
            { interviewee: student._id, intervieweeModel: 'User' }
          ],
          finalConfirmedTime: { 
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$finalConfirmedTime' }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Get completed topics
    const completedTopics = await Progress.aggregate([
      {
        $match: {
          studentId: student._id,
          completed: true,
          completedAt: {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$completedAt' }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    const compilerSubmissions = await Submission.aggregate([
      {
        $match: {
          user: student._id,
          mode: 'submit',
          createdAt: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Merge activity data
    const activityMap = {};
    
    // Start with activities from StudentActivity collection
    activities.forEach(item => {
      activityMap[item._id] = item.count;
    });
    
    scheduledSessions.forEach(item => {
      const date = item._id;
      if (!activityMap[date]) activityMap[date] = 0;
      activityMap[date] += item.count;
    });

    completedTopics.forEach(item => {
      const date = item._id;
      if (!activityMap[date]) activityMap[date] = 0;
      activityMap[date] += item.count;
    });

    compilerSubmissions.forEach(item => {
      const date = item._id;
      if (!activityMap[date]) activityMap[date] = 0;
      activityMap[date] += item.count;
    });

    // Calculate streaks
    const calculateStreaks = () => {
      const sortedDates = Object.keys(activityMap).sort();
      if (sortedDates.length === 0) return { currentStreak: 0, bestStreak: 0 };

      let currentStreak = 0;
      let bestStreak = 0;
      let tempStreak = 0;
      
      let checkDate = new Date(endDate);
      while (checkDate >= startDate) {
        const dateStr = checkDate.toISOString().slice(0, 10);
        if (activityMap[dateStr] && activityMap[dateStr] > 0) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else if (currentStreak > 0) {
          break;
        } else {
          checkDate.setDate(checkDate.getDate() - 1);
        }
      }

      let prevDate = null;
      for (const dateStr of sortedDates) {
        const currentDate = new Date(dateStr);
        if (prevDate) {
          const dayDiff = Math.floor((currentDate - prevDate) / (1000 * 60 * 60 * 24));
          if (dayDiff === 1) {
            tempStreak++;
          } else {
            bestStreak = Math.max(bestStreak, tempStreak);
            tempStreak = 1;
          }
        } else {
          tempStreak = 1;
        }
        prevDate = currentDate;
      }
      bestStreak = Math.max(bestStreak, tempStreak);

      return { currentStreak, bestStreak };
    };

    const { currentStreak, bestStreak } = calculateStreaks();
    const totalActiveDays = Object.keys(activityMap).length;

    // Determine learning scope for this student (semesters/subjects/videos assigned)
    const { allowedSemesterIds, totalCourses, totalVideosTotal, validTopicIds } = await computeLearningScopeForStudent(student);

    // 4. Get total videos watched (all time) within the allowed semesters and valid topics only
    const videoWatchMatch = {
      studentId: student._id,
      videoWatchedSeconds: { $gt: 0 }
    };
    if (allowedSemesterIds.length > 0) {
      videoWatchMatch.semesterId = { $in: allowedSemesterIds };
    }
    // Only count videos for topics that still exist in the curriculum
    if (validTopicIds.length > 0) {
      videoWatchMatch.topicId = { $in: validTopicIds };
    }
    const videosWatchedAgg = await Progress.aggregate([
      { $match: videoWatchMatch },
      { $group: { _id: '$topicId' } },
      { $count: 'totalVideos' }
    ]);
    const videoWatchCount = videosWatchedAgg[0]?.totalVideos || 0;

    // 5. Removed PROBLEM_SOLVED count - not tracking this anymore

    // 6. Use learning scope helper for total subjects and total videos in curriculum
    const totalSubjects = totalCourses;

    res.json({
      activityByDate: activityMap,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      stats: {
        totalActiveDays,
        totalDaysInRange: 365,
        currentStreak,
        bestStreak,
        totalSubjects,
        totalVideosWatched: videoWatchCount,
        totalVideosTotal,
        totalCompilerSubmissions: compilerSubmissions.reduce((sum, item) => sum + item.count, 0),
        totalSessions: scheduledSessions.reduce((sum, item) => sum + item.count, 0),
        totalCompletions: completedTopics.reduce((sum, item) => sum + item.count, 0),
        totalActivities: Object.values(activityMap).reduce((sum, val) => sum + val, 0)
      }
    });
  } catch (error) {
    console.error('[Get Student Activity By Admin Error]', error);
    throw new HttpError(500, 'Failed to fetch activity data');
  }
}

/**
 * Get comprehensive student statistics for profile tabs
 */
export async function getStudentStats(req, res) {
  const user = req.user;
  let studentId = req.params.studentId;

  // If no studentId in params, use current user (student viewing own profile)
  if (!studentId && user.role === 'student') {
    studentId = user._id;
  }

  // Authorization check
  if (!studentId) throw new HttpError(400, 'Student ID is required');
  if (user.role !== 'admin' && user.role !== 'coordinator' && user._id.toString() !== studentId) {
    throw new HttpError(403, 'Access denied');
  }

  try {
    // Find the student in unified User collection
    const student = await User.findById(studentId);
    if (!student) throw new HttpError(404, 'Student not found');

    // Determine learning scope for this student (semesters/subjects/videos assigned)
    const { allowedSemesterIds, totalCourses, totalVideosTotal, validTopicIds } = await computeLearningScopeForStudent(student);

    // Base match for all Progress-based stats (restricted to allowed semesters when available)
    const baseMatch = {
      studentId: student._id
    };
    if (allowedSemesterIds.length > 0) {
      baseMatch.semesterId = { $in: allowedSemesterIds };
    }
    // Only count progress for topics that still exist in the curriculum
    if (validTopicIds.length > 0) {
      baseMatch.topicId = { $in: validTopicIds };
    }

    // 1. Get total courses enrolled (unique subjects within allowed semesters)
    // We already have totalCourses from the learning scope helper, which counts
    // unique logical subjects across the allowed semesters.

    // 2. Get total videos watched (topics with videoWatchedSeconds > 0) within allowed semesters
    const videosWatched = await Progress.aggregate([
      {
        $match: {
          ...baseMatch,
          videoWatchedSeconds: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: '$topicId'
        }
      },
      {
        $count: 'totalVideos'
      }
    ]);
    const totalVideosWatched = videosWatched[0]?.totalVideos || 0;

    // 3. Get total compiler problems solved and submission health
    const [compilerSummaryAgg, solvedByDifficultyAgg, attemptedProblemsAgg, statusBreakdownAgg, languageBreakdownAgg, recentSubmissionsAgg, recentSolvedProblemsAgg] = await Promise.all([
      Submission.aggregate([
        {
          $match: {
            user: student._id,
            mode: 'submit',
          },
        },
        {
          $group: {
            _id: null,
            totalSubmissions: { $sum: 1 },
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
          },
        },
      ]),
      Submission.aggregate([
        {
          $match: {
            user: student._id,
            mode: 'submit',
            status: 'AC',
          },
        },
        {
          $group: {
            _id: {
              problem: '$problem',
              difficulty: '$problemSnapshot.difficulty',
            },
          },
        },
        {
          $group: {
            _id: '$_id.difficulty',
            count: { $sum: 1 },
          },
        },
      ]),
      Submission.aggregate([
        {
          $match: {
            user: student._id,
            mode: 'submit',
          },
        },
        {
          $group: {
            _id: '$problem',
          },
        },
        {
          $count: 'count',
        },
      ]),
      Submission.aggregate([
        {
          $match: {
            user: student._id,
            mode: 'submit',
          },
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      Submission.aggregate([
        {
          $match: {
            user: student._id,
            mode: 'submit',
          },
        },
        {
          $group: {
            _id: '$language',
            count: { $sum: 1 },
          },
        },
        {
          $sort: { count: -1, _id: 1 },
        },
      ]),
      Submission.find({
        user: student._id,
        mode: 'submit',
      })
        .sort({ createdAt: -1 })
        .limit(6)
        .select('status language executionTimeMs createdAt problemSnapshot')
        .lean(),
      Submission.aggregate([
        {
          $match: {
            user: student._id,
            mode: 'submit',
            status: 'AC',
          },
        },
        {
          $sort: { createdAt: -1 },
        },
        {
          $group: {
            _id: '$problem',
            title: { $first: '$problemSnapshot.title' },
            difficulty: { $first: '$problemSnapshot.difficulty' },
            acceptedAt: { $first: '$createdAt' },
          },
        },
        {
          $sort: { acceptedAt: -1 },
        },
        {
          $limit: 5,
        },
      ]),
    ]);

    // 4. Get total watch time in hours within allowed semesters
    const watchTimeData = await Progress.aggregate([
      {
        $match: baseMatch
      },
      {
        $group: {
          _id: null,
          totalSeconds: { $sum: '$videoWatchedSeconds' }
        }
      }
    ]);
    const totalWatchTimeHours = watchTimeData[0] ? Math.round((watchTimeData[0].totalSeconds / 3600) * 10) / 10 : 0;
    const compilerSummary = compilerSummaryAgg[0] || {};
    const solvedByDifficulty = solvedByDifficultyAgg.reduce((acc, entry) => {
      const key = String(entry._id || 'Easy').toLowerCase();
      acc[key] = entry.count || 0;
      return acc;
    }, { easy: 0, medium: 0, hard: 0 });
    const statusBreakdown = statusBreakdownAgg.reduce((acc, entry) => {
      acc[entry._id] = entry.count || 0;
      return acc;
    }, {});
    const languagesUsed = languageBreakdownAgg.map((entry) => ({
      language: entry._id || 'unknown',
      count: entry.count || 0,
    }));
    const mostUsedLanguage = languagesUsed[0]?.language || null;
    const totalSubmissions = compilerSummary?.totalSubmissions || 0;
    const acceptedAttempts = compilerSummary?.acceptedAttempts || 0;
    const totalQuestionsSolved = Array.isArray(compilerSummary?.solvedProblems) ? compilerSummary.solvedProblems.length : 0;
    const totalQuestionsAttempted = attemptedProblemsAgg[0]?.count || 0;
    const attemptRate = totalQuestionsAttempted > 0
      ? Math.round((totalQuestionsSolved / totalQuestionsAttempted) * 1000) / 10
      : 0;

    res.json({
      success: true,
      stats: {
        totalCoursesEnrolled: totalCourses,
        totalVideosWatched: totalVideosWatched,
        problemsSolved: totalQuestionsSolved,
        totalQuestionsSolved,
        totalQuestionsAttempted,
        totalSubmissions,
        acceptedSubmissions: acceptedAttempts,
        acceptanceRate: totalSubmissions > 0
          ? Math.round((acceptedAttempts / totalSubmissions) * 1000) / 10
          : 0,
        questionSuccessRate: attemptRate,
        totalWatchTimeHours: totalWatchTimeHours,
        solvedByDifficulty,
        statusBreakdown,
        languagesUsed,
        mostUsedLanguage,
        recentSolvedProblems: recentSolvedProblemsAgg.map((entry) => ({
          title: entry.title || 'Untitled Problem',
          difficulty: entry.difficulty || 'Easy',
          acceptedAt: entry.acceptedAt || null,
        })),
        recentSubmissions: recentSubmissionsAgg.map((submission) => ({
          problemTitle: submission.problemSnapshot?.title || 'Untitled Problem',
          difficulty: submission.problemSnapshot?.difficulty || 'Easy',
          status: submission.status,
          language: submission.language,
          executionTimeMs: submission.executionTimeMs || 0,
          createdAt: submission.createdAt,
        })),
      }
    });
  } catch (error) {
    console.error('[Get Student Stats Error]', error);
    throw new HttpError(500, 'Failed to fetch student statistics');
  }
}

// Get detailed videos watched by a student
// Get detailed videos watched by a student
export async function getStudentVideosWatched(req, res) {
  const { studentId } = req.params;

  try {
    // Find the student
    const student = await User.findById(studentId);
    if (!student) throw new HttpError(404, 'Student not found');

    // Get learning scope for the student
    const { allowedSemesterIds, validTopicIds } = await computeLearningScopeForStudent(student);

    // Base match for Progress queries
    const baseMatch = {
      studentId: student._id,
      videoWatchedSeconds: { $gt: 0 }
    };
    if (allowedSemesterIds.length > 0) {
      baseMatch.semesterId = { $in: allowedSemesterIds };
    }
    if (validTopicIds.length > 0) {
      baseMatch.topicId = { $in: validTopicIds };
    }

    // Get all progress entries with watched videos
    const progressEntries = await Progress.find(baseMatch)
      .sort({ lastAccessedAt: -1 })
      .lean();

    // For each progress entry, fetch topic details
    const videos = await Promise.all(progressEntries.map(async (progress) => {
      const { topicId, subjectId, chapterId, semesterId, videoWatchedSeconds, lastAccessedAt, createdAt } = progress;
      
      let topicName = 'Unknown Topic';
      let subjectName = 'Unknown Subject';
      let chapterName = 'Unknown Chapter';
      let semesterName = 'Unknown Semester';
      
      try {
        const semester = await Subject.findById(semesterId);
        if (semester) {
          semesterName = semester.semesterName;
          const subject = semester.subjects.id(subjectId);
          if (subject) {
            subjectName = subject.subjectName;
            const chapter = subject.chapters.id(chapterId);
            if (chapter) {
              chapterName = chapter.chapterName;
              const topic = chapter.topics.id(topicId);
              if (topic) {
                topicName = topic.topicName;
              }
            }
          }
        }
      } catch (e) {
        console.error('Error fetching topic details:', e);
      }

      return {
        videoTitle: topicName,
        subjectName,
        chapterName,
        semesterName,
        duration: videoWatchedSeconds ? Math.floor(videoWatchedSeconds / 60) : 0, // minutes (backward compat)
        durationSeconds: videoWatchedSeconds || 0,
        durationDisplay: formatWatchTime(videoWatchedSeconds || 0),
        watchedDate: lastAccessedAt || createdAt,
        topicId,
        subjectId
      };
    }));

    res.json({
      success: true,
      videos
    });
  } catch (error) {
    console.error('[Get Student Videos Watched Error]', error);
    throw new HttpError(500, 'Failed to fetch videos watched');
  }
}

// Get detailed courses enrolled by a student
export async function getStudentCoursesEnrolled(req, res) {
  const { studentId } = req.params;

  try {
    // Find the student
    const student = await User.findById(studentId);
    if (!student) throw new HttpError(404, 'Student not found');

    // Determine learning scope for this student
    const { allowedSemesterIds } = await computeLearningScopeForStudent(student);

    // Base match for Progress queries
    const baseMatch = {
      studentId: student._id
    };
    if (allowedSemesterIds.length > 0) {
      baseMatch.semesterId = { $in: allowedSemesterIds };
    }

    // Get unique subjects from Progress with earliest enrollment date
    const enrolledSubjects = await Progress.aggregate([
      {
        $match: baseMatch
      },
      {
        $group: {
          _id: {
            semesterId: '$semesterId',
            subjectId: '$subjectId'
          },
          firstAccessed: { $min: '$createdAt' },
          lastAccessed: { $max: '$lastAccessedAt' },
          totalTopics: { $sum: 1 },
          completedTopics: {
            $sum: { $cond: ['$completed', 1, 0] }
          }
        }
      },
      {
        $sort: { firstAccessed: -1 }
      }
    ]);

    // Fetch subject details for each enrolled subject
    const courses = await Promise.all(enrolledSubjects.map(async (enrollment) => {
      const { semesterId, subjectId } = enrollment._id;
      
      let courseName = 'Unknown Course';
      let semesterName = 'Unknown Semester';
      let actualTotalTopics = enrollment.totalTopics; // Default to Progress count
      
      try {
        const semester = await Subject.findById(semesterId);
        if (semester) {
          semesterName = semester.semesterName;
          const subject = semester.subjects.id(subjectId);
          if (subject) {
            courseName = subject.subjectName;
            // Calculate ACTUAL total topics from curriculum (not just Progress records)
            let topicCount = 0;
            if (subject.chapters && Array.isArray(subject.chapters)) {
              subject.chapters.forEach(chapter => {
                if (chapter.topics && Array.isArray(chapter.topics)) {
                  topicCount += chapter.topics.length;
                }
              });
            }
            actualTotalTopics = topicCount; // Use curriculum count
          }
        }
      } catch (e) {
        console.error('Error fetching course details:', e);
      }

      const progressPercentage = actualTotalTopics > 0 
        ? Math.round((enrollment.completedTopics / actualTotalTopics) * 100)
        : 0;

      return {
        courseName,
        semesterName,
        enrollmentDate: enrollment.firstAccessed,
        lastAccessed: enrollment.lastAccessed,
        progressPercentage,
        completedTopics: enrollment.completedTopics,
        totalTopics: actualTotalTopics, // Dynamic from actual curriculum
        progressStatus: progressPercentage === 100 ? 'Completed' : 
                       progressPercentage >= 50 ? 'In Progress' : 
                       progressPercentage > 0 ? 'Started' : 'Not Started',
        semesterId,
        subjectId
      };
    }));

    res.json({
      success: true,
      courses
    });
  } catch (error) {
    console.error('[Get Student Courses Enrolled Error]', error);
    throw new HttpError(500, 'Failed to fetch courses enrolled');
  }
}
