import Submission from '../models/Submission.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import Feedback from '../models/Feedback.js';
import Progress from '../models/Progress.js';
import StudentActivity from '../models/StudentActivity.js';
import Pair from '../models/Pair.js';
import User from '../models/User.js';
import StudentAnalytics from '../models/StudentAnalytics.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const round = (value) => Number((value || 0).toFixed(2));
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const toDateKey = (date) => {
  if (!date) return '';
  return new Date(date).toISOString().slice(0, 10);
};

function normalizeWeights({ weightDsa, weightConsistency, weightInterview }) {
  const wDsa = Number(weightDsa);
  const wCons = Number(weightConsistency);
  const wInt = Number(weightInterview);
  const total = (wDsa || 0) + (wCons || 0) + (wInt || 0);
  if (!total) {
    return { wDsa: 0.4, wCons: 0.3, wInt: 0.3 };
  }
  return {
    wDsa: wDsa / total,
    wCons: wCons / total,
    wInt: wInt / total,
  };
}

function computeTopicLevel(accuracy) {
  if (accuracy >= 75) return 'strong';
  if (accuracy >= 55) return 'medium';
  return 'weak';
}

function buildWeeklySeries(countMap) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const items = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(today.getTime() - i * DAY_MS);
    const key = toDateKey(date);
    items.push({ date: key, count: countMap.get(key) || 0 });
  }
  return items;
}

function computeStreak(activeDates) {
  if (!activeDates.size) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  for (let i = 0; i < 365; i += 1) {
    const date = new Date(today.getTime() - i * DAY_MS);
    const key = toDateKey(date);
    if (activeDates.has(key)) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

async function buildActivityCounts(studentId, days = 30) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const [submissionAgg, activityAgg] = await Promise.all([
    Submission.aggregate([
      { $match: { user: studentId, mode: 'submit', createdAt: { $gte: start } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
          count: { $sum: 1 },
        },
      },
    ]),
    StudentActivity.aggregate([
      { $match: { studentId, date: { $gte: start } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'UTC' } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const countMap = new Map();
  submissionAgg.forEach((entry) => {
    countMap.set(entry._id, (countMap.get(entry._id) || 0) + entry.count);
  });
  activityAgg.forEach((entry) => {
    countMap.set(entry._id, (countMap.get(entry._id) || 0) + entry.count);
  });

  const activeDates = new Set(
    Array.from(countMap.entries())
      .filter(([, count]) => count > 0)
      .map(([key]) => key),
  );

  return { countMap, activeDates };
}

async function buildProblemMetrics(studentId) {
  const [totalAgg, topicAgg] = await Promise.all([
    Submission.aggregate([
      { $match: { user: studentId, mode: 'submit' } },
      {
        $group: {
          _id: null,
          attempts: { $sum: 1 },
          accepted: { $sum: { $cond: [{ $eq: ['$status', 'AC'] }, 1, 0] } },
        },
      },
    ]),
    Submission.aggregate([
      { $match: { user: studentId, mode: 'submit' } },
      {
        $lookup: {
          from: 'problems',
          localField: 'problem',
          foreignField: '_id',
          as: 'problem',
        },
      },
      { $unwind: { path: '$problem', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          tags: { $cond: [{ $gt: [{ $size: { $ifNull: ['$problem.tags', []] } }, 0] }, '$problem.tags', ['General'] ] },
        },
      },
      { $unwind: { path: '$tags', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$tags',
          attempts: { $sum: 1 },
          accepted: { $sum: { $cond: [{ $eq: ['$status', 'AC'] }, 1, 0] } },
        },
      },
      { $sort: { attempts: -1 } },
    ]),
  ]);

  const totals = totalAgg[0] || { attempts: 0, accepted: 0 };
  const accuracy = totals.attempts ? (totals.accepted / totals.attempts) * 100 : 0;

  const topics = topicAgg.map((entry) => {
    const acc = entry.attempts ? (entry.accepted / entry.attempts) * 100 : 0;
    return {
      topic: entry._id || 'General',
      accuracy: round(acc),
      attempts: entry.attempts || 0,
      level: computeTopicLevel(acc),
    };
  });

  return {
    attempts: totals.attempts || 0,
    accuracy: round(accuracy),
    topics,
    solved: totals.accepted || 0,
  };
}

async function buildAssessmentMetrics(studentId) {
  const [summaryAgg, recent] = await Promise.all([
    AssessmentSubmission.aggregate([
      { $match: { studentId, status: 'submitted' } },
      {
        $group: {
          _id: null,
          attempts: { $sum: 1 },
          avgScore: { $avg: '$score' },
          avgAccuracy: { $avg: '$accuracy' },
          highestScore: { $max: '$score' },
        },
      },
    ]),
    AssessmentSubmission.find({ studentId, status: 'submitted' })
      .sort({ submittedAt: -1 })
      .limit(8)
      .select('score submittedAt')
      .lean(),
  ]);

  const summary = summaryAgg[0] || { attempts: 0, avgScore: 0, avgAccuracy: 0, highestScore: 0 };
  const latestScore = recent?.[0]?.score || 0;
  const progress = (recent || []).reverse().map((item) => ({
    label: item.submittedAt ? new Date(item.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Attempt',
    value: round(item.score || 0),
  }));

  return {
    attempts: summary.attempts || 0,
    avgScore: round(summary.avgScore || 0),
    avgAccuracy: round(summary.avgAccuracy || 0),
    highestScore: round(summary.highestScore || 0),
    latestScore: round(latestScore || 0),
    progress,
  };
}

async function buildInterviewMetrics(studentId) {
  const [feedbackAgg, distributionAgg, pendingCount] = await Promise.all([
    Feedback.aggregate([
      { $match: { to: studentId } },
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$marks' },
          total: { $sum: 1 },
          avgIntegrity: { $avg: '$integrity' },
          avgCommunication: { $avg: '$communication' },
          avgPreparedness: { $avg: '$preparedness' },
          avgProblemSolving: { $avg: '$problemSolving' },
          avgAttitude: { $avg: '$attitude' },
        },
      },
    ]),
    Feedback.aggregate([
      { $match: { to: studentId } },
      {
        $bucket: {
          groupBy: '$marks',
          boundaries: [0, 20, 40, 60, 80, 101],
          default: 'other',
          output: { count: { $sum: 1 } },
        },
      },
    ]),
    Pair.countDocuments({
      $or: [{ interviewee: studentId }, { interviewer: studentId }],
      status: { $in: ['pending', 'scheduled'] },
    }),
  ]);

  const distributionMap = new Map(
    distributionAgg
      .filter((d) => d._id !== 'other')
      .map((d) => [`${d._id}-${d._id + 20}`, d.count]),
  );

  const ratingDistribution = [
    { label: '0-20', value: distributionMap.get('0-20') || 0 },
    { label: '20-40', value: distributionMap.get('20-40') || 0 },
    { label: '40-60', value: distributionMap.get('40-60') || 0 },
    { label: '60-80', value: distributionMap.get('60-80') || 0 },
    { label: '80-100', value: distributionMap.get('80-100') || 0 },
  ];

  const summary = feedbackAgg[0] || {
    avgScore: 0,
    total: 0,
    avgIntegrity: 0,
    avgCommunication: 0,
    avgPreparedness: 0,
    avgProblemSolving: 0,
    avgAttitude: 0,
  };

  const tags = [];
  if (summary.total > 0) {
    if (summary.avgCommunication && summary.avgCommunication < 3) tags.push('Communication');
    if (summary.avgPreparedness && summary.avgPreparedness < 3) tags.push('Preparation');
    if (summary.avgProblemSolving && summary.avgProblemSolving < 3) tags.push('Problem Solving');
    if (summary.avgAttitude && summary.avgAttitude < 3) tags.push('Attitude');
    if (summary.avgIntegrity && summary.avgIntegrity < 3) tags.push('Integrity');
    if (!tags.length && summary.avgScore >= 80) tags.push('Strong performance');
    if (!tags.length) tags.push('Keep practicing');
  }

  return {
    avgScore: round(summary.avgScore || 0),
    total: summary.total || 0,
    pending: pendingCount || 0,
    tags,
    ratingDistribution,
    categoryScores: {
      communication: round(summary.avgCommunication || 0),
      problemSolving: round(summary.avgProblemSolving || 0),
      preparedness: round(summary.avgPreparedness || 0),
      attitude: round(summary.avgAttitude || 0),
      integrity: round(summary.avgIntegrity || 0),
    },
  };
}

async function buildLearningMetrics(studentId) {
  const [totalTopics, completedTopics, videosWatched, subjects] = await Promise.all([
    Progress.countDocuments({ studentId }),
    Progress.countDocuments({ studentId, completed: true }),
    Progress.countDocuments({ studentId, videoWatchedSeconds: { $gt: 0 } }),
    Progress.distinct('subjectId', { studentId }),
  ]);

  const completionPercent = totalTopics ? (completedTopics / totalTopics) * 100 : 0;

  return {
    completedTopics,
    totalTopics,
    completionPercent: round(completionPercent),
    coursesEnrolled: subjects.length,
    videosWatched,
  };
}

function computeDerivedScores({ weeklyActiveDays, streak, attempts, assessments, completedTopics }) {
  const consistencyScore = clamp(Math.round(weeklyActiveDays * 10 + streak * 6), 0, 100);
  const effortRaw = attempts + assessments * 2 + completedTopics;
  const effortScore = clamp(Math.round((effortRaw / 5) * 10), 0, 100);
  return { consistencyScore, effortScore };
}

export async function computeStudentAnalytics(studentId) {
  const [problemMetrics, assessmentMetrics, interviewMetrics, learningMetrics, activityCounts] = await Promise.all([
    buildProblemMetrics(studentId),
    buildAssessmentMetrics(studentId),
    buildInterviewMetrics(studentId),
    buildLearningMetrics(studentId),
    buildActivityCounts(studentId, 30),
  ]);

  const weeklyActivity = buildWeeklySeries(activityCounts.countMap);
  const activeDates = activityCounts.activeDates;
  const weeklyActiveDays = weeklyActivity.filter((d) => d.count > 0).length;
  const streak = computeStreak(activeDates);

  const lastActiveAt = Array.from(activityCounts.countMap.entries())
    .filter(([, count]) => count > 0)
    .map(([key]) => new Date(key))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const derivedScores = computeDerivedScores({
    weeklyActiveDays,
    streak,
    attempts: problemMetrics.attempts,
    assessments: assessmentMetrics.attempts,
    completedTopics: learningMetrics.completedTopics,
  });

  const avgScore = assessmentMetrics.avgScore || problemMetrics.accuracy;

  return {
    overview: {
      totalAttempts: problemMetrics.attempts + assessmentMetrics.attempts,
      problemAttempts: problemMetrics.attempts,
      assessmentAttempts: assessmentMetrics.attempts,
      avgScore: round(avgScore),
      interviewScore: interviewMetrics.avgScore,
      streak,
    },
    assessments: assessmentMetrics,
    problems: problemMetrics,
    interviews: interviewMetrics,
    learning: {
      ...learningMetrics,
      practiceSolved: problemMetrics.solved || 0,
    },
    consistency: {
      currentStreak: streak,
      weeklyActivity,
      activeDays: weeklyActiveDays,
      lastActiveAt,
    },
    derived: derivedScores,
  };
}

export async function upsertStudentAnalytics(studentId) {
  const analyticsPayload = await computeStudentAnalytics(studentId);
  return StudentAnalytics.findOneAndUpdate(
    { studentId },
    { ...analyticsPayload, generatedAt: new Date() },
    { new: true, upsert: true },
  ).lean();
}

export async function computeAllStudentsAnalytics() {
  const students = await User.find({ role: 'student' }).select('_id').lean();
  const results = [];
  for (const student of students) {
    const doc = await upsertStudentAnalytics(student._id);
    results.push(doc);
  }
  return results;
}

export function buildReadinessReport(analysis, benchmark) {
  const dsaScore = analysis?.problems?.accuracy || 0;
  const consistencyScore = analysis?.derived?.consistencyScore || 0;
  const interviewScore = analysis?.interviews?.avgScore || 0;
  const totalAttempts = analysis?.problems?.attempts || 0;

  const { wDsa, wCons, wInt } = normalizeWeights(benchmark);
  const readinessScore = clamp(round(dsaScore * wDsa + consistencyScore * wCons + interviewScore * wInt));

  let badge = 'Improving';
  if (readinessScore < 50) badge = 'Not Ready';
  else if (readinessScore < 70) badge = 'Improving';
  else if (readinessScore < 85) badge = 'Almost Ready';
  else badge = 'Ready';

  const gaps = [];
  if (dsaScore < benchmark.dsaAccuracyRequired) {
    gaps.push({
      type: 'DSA Accuracy',
      message: `Your DSA accuracy is ${round(dsaScore)}%, required is ${benchmark.dsaAccuracyRequired}%.`,
      required: benchmark.dsaAccuracyRequired,
      current: round(dsaScore),
    });
  }
  if (benchmark.minQuestionAttempts && totalAttempts < benchmark.minQuestionAttempts) {
    gaps.push({
      type: 'Problem Attempts',
      message: `You attempted ${totalAttempts} problems, minimum ${benchmark.minQuestionAttempts} needed.`,
      required: benchmark.minQuestionAttempts,
      current: totalAttempts,
    });
  }
  if (analysis?.consistency?.currentStreak < benchmark.minStreak) {
    gaps.push({
      type: 'Consistency',
      message: `Your current streak is ${analysis?.consistency?.currentStreak || 0} days, minimum ${benchmark.minStreak} days required.`,
      required: benchmark.minStreak,
      current: analysis?.consistency?.currentStreak || 0,
    });
  }
  if (interviewScore < benchmark.interviewScore) {
    gaps.push({
      type: 'Interview',
      message: `Your interview score is ${round(interviewScore)}, required is ${benchmark.interviewScore}.`,
      required: benchmark.interviewScore,
      current: round(interviewScore),
    });
  }

  const topicFeedback = [];
  const topicMap = new Map((analysis?.problems?.topics || []).map((t) => [t.topic.toLowerCase(), t]));
  (benchmark.requiredTopics || []).forEach((topic) => {
    const key = topic.toLowerCase();
    const stat = topicMap.get(key);
    const current = stat ? stat.accuracy : 0;
    if (!stat) {
      topicFeedback.push({
        topic,
        message: `You have not attempted ${topic} problems. Minimum practice required.`,
        current,
        required: benchmark.dsaAccuracyRequired,
      });
      return;
    }
    if (current < benchmark.dsaAccuracyRequired) {
      topicFeedback.push({
        topic,
        message: `Your ${topic} accuracy is ${round(current)}%, required is ${benchmark.dsaAccuracyRequired}%.`,
        current: round(current),
        required: benchmark.dsaAccuracyRequired,
      });
    }
  });

  const actionPlan = [];
  if (dsaScore < benchmark.dsaAccuracyRequired) {
    const gap = benchmark.dsaAccuracyRequired - dsaScore;
    const target = Math.max(20, Math.ceil(gap / 2) * 10);
    actionPlan.push(`Solve ${target} mixed DSA questions to lift accuracy.`);
  }
  if (benchmark.minQuestionAttempts && totalAttempts < benchmark.minQuestionAttempts) {
    const delta = benchmark.minQuestionAttempts - totalAttempts;
    actionPlan.push(`Attempt ${delta} more coding problems to reach the benchmark.`);
  }
  if (analysis?.consistency?.currentStreak < benchmark.minStreak) {
    actionPlan.push(`Maintain a ${benchmark.minStreak}-day streak with daily practice.`);
  }
  if (interviewScore < benchmark.interviewScore) {
    actionPlan.push('Practice 3 mock interviews focused on communication and problem solving.');
  }
  topicFeedback.forEach((item) => {
    actionPlan.push(`Solve 15-25 ${item.topic} questions to strengthen coverage.`);
  });

  if (!actionPlan.length) {
    actionPlan.push('Keep practicing to maintain readiness.');
  }

  const estimateWeeks = Math.min(8, Math.max(1, Math.ceil(actionPlan.length / 2)));
  const timeEstimate = `Estimated time to reach readiness: ${estimateWeeks}-${estimateWeeks + 1} weeks`;

  return {
    readinessScore,
    badge,
    breakdown: {
      dsa: round(dsaScore),
      consistency: round(consistencyScore),
      interview: round(interviewScore),
    },
    gapAnalysis: gaps,
    topicFeedback,
    actionPlan,
    timeEstimate,
  };
}


