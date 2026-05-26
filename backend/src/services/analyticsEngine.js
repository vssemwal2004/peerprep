import Submission from '../models/Submission.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import Feedback from '../models/Feedback.js';
import Progress from '../models/Progress.js';
import StudentActivity from '../models/StudentActivity.js';
import Pair from '../models/Pair.js';
import User from '../models/User.js';
import StudentAnalytics from '../models/StudentAnalytics.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACCEPTED_STATUSES = ['AC', 'Accepted'];
export const ANALYTICS_CONTRACT_VERSION = '2026.05.startup-readiness-v1';
export const ANALYTICS_SCORE_MODEL = Object.freeze({
  assessmentPenalty: {
    tabSwitch: 2,
    fullscreenExit: 3,
    copyPaste: 4,
    cameraFlag: 4,
    pause: 1,
    violationScore: 1.25,
    violationStatus: 10,
    maxPenalty: 40,
  },
  derivedScores: {
    performance: {
      dsaAccuracy: 0.32,
      assessmentAdjustedScore: 0.34,
      interviewScore: 0.18,
      learningCompletion: 0.16,
    },
    readiness: {
      performanceScore: 0.45,
      consistencyScore: 0.18,
      effortScore: 0.12,
      assessmentIntegrityScore: 0.25,
    },
    placementSignal: {
      readinessScore: 0.5,
      dsaAccuracy: 0.2,
      interviewScore: 0.2,
      consistencyScore: 0.1,
    },
    overviewHealth: {
      readinessScore: 0.55,
      consistencyScore: 0.25,
      assessmentIntegrityScore: 0.2,
    },
  },
  thresholds: {
    topicStrong: 75,
    topicMedium: 55,
    riskHighIntegrityBelow: 55,
    riskHighViolationRateAtLeast: 45,
    riskMediumIntegrityBelow: 78,
    riskMediumViolationRateAtLeast: 20,
    readinessReady: 85,
    readinessAlmostReady: 70,
    readinessImproving: 50,
    companyIntegrityMinimum: 80,
  },
  safety: {
    studentVisibleRawSecurityFields: false,
    studentVisibleSecurityAggregatesOnly: true,
  },
});

const round = (value) => Number((value || 0).toFixed(2));
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const ASSESSMENT_FINAL_STATUSES = ['submitted', 'violation'];

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
  if (accuracy >= ANALYTICS_SCORE_MODEL.thresholds.topicStrong) return 'strong';
  if (accuracy >= ANALYTICS_SCORE_MODEL.thresholds.topicMedium) return 'medium';
  return 'weak';
}

function computeAssessmentViolationCount(submission = {}) {
  return Number(submission.tabSwitches || 0)
    + Number(submission.fullscreenExits || 0)
    + Number(submission.copyPasteCount || 0)
    + Number(submission.cameraFlags || 0);
}

function computeAssessmentPenalty(submission = {}) {
  const weights = ANALYTICS_SCORE_MODEL.assessmentPenalty;
  const weightedEvents =
    Number(submission.tabSwitches || 0) * weights.tabSwitch
    + Number(submission.fullscreenExits || 0) * weights.fullscreenExit
    + Number(submission.copyPasteCount || 0) * weights.copyPaste
    + Number(submission.cameraFlags || 0) * weights.cameraFlag
    + Number(submission.pauseCount || 0) * weights.pause
    + Number(submission.violationScore || 0) * weights.violationScore
    + (submission.status === 'violation' ? weights.violationStatus : 0);

  return clamp(weightedEvents, 0, weights.maxPenalty);
}

function computeAssessmentIntegrity(submission = {}) {
  return clamp(100 - computeAssessmentPenalty(submission), 0, 100);
}

function computeSecurityRisk(integrityScore = 100, violationRate = 0) {
  const thresholds = ANALYTICS_SCORE_MODEL.thresholds;
  if (integrityScore < thresholds.riskHighIntegrityBelow || violationRate >= thresholds.riskHighViolationRateAtLeast) return 'high';
  if (integrityScore < thresholds.riskMediumIntegrityBelow || violationRate >= thresholds.riskMediumViolationRateAtLeast) return 'medium';
  return 'low';
}

function scoreTone(score = 0) {
  const value = Number(score) || 0;
  if (value >= 80) return 'positive';
  if (value >= 60) return 'stable';
  if (value >= 40) return 'attention';
  return 'risk';
}

function scoreImpact(score = 0) {
  const value = Number(score) || 0;
  if (value >= 80) return 'boosting';
  if (value >= 60) return 'supporting';
  if (value >= 40) return 'limiting';
  return 'blocking';
}

function explanation({ id, title, score, summary, evidence = [], action, impact }) {
  return {
    id,
    title,
    score: round(clamp(score)),
    impact: impact || scoreImpact(score),
    tone: scoreTone(score),
    summary,
    evidence: evidence.filter(Boolean).slice(0, 4),
    action,
  };
}

function scoreSpread(values = []) {
  if (!values.length) return 0;
  return Math.max(...values) - Math.min(...values);
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function computeGrowthScore(progress = []) {
  if (progress.length < 2) return 0;
  const half = Math.max(1, Math.floor(progress.length / 2));
  const earlier = progress.slice(0, half).map((item) => item.value || 0);
  const later = progress.slice(half).map((item) => item.value || 0);
  return clamp(50 + (average(later) - average(earlier)), 0, 100);
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
          accepted: { $sum: { $cond: [{ $in: ['$status', ACCEPTED_STATUSES] }, 1, 0] } },
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
          accepted: { $sum: { $cond: [{ $in: ['$status', ACCEPTED_STATUSES] }, 1, 0] } },
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
      { $match: { studentId, status: { $in: ASSESSMENT_FINAL_STATUSES } } },
      {
        $addFields: {
          safeScore: { $ifNull: ['$score', 0] },
          safeAccuracy: { $ifNull: ['$accuracy', 0] },
          tabSwitchSafe: { $ifNull: ['$tabSwitches', 0] },
          fullscreenSafe: { $ifNull: ['$fullscreenExits', 0] },
          copyPasteSafe: { $ifNull: ['$copyPasteCount', 0] },
          cameraSafe: { $ifNull: ['$cameraFlags', 0] },
          pauseSafe: { $ifNull: ['$pauseCount', 0] },
          violationScoreSafe: { $ifNull: ['$violationScore', 0] },
          timeTakenSafe: { $ifNull: ['$timeTakenSec', 0] },
        },
      },
      {
        $addFields: {
          violationCount: {
            $add: ['$tabSwitchSafe', '$fullscreenSafe', '$copyPasteSafe', '$cameraSafe'],
          },
          penalty: {
            $min: [
              40,
              {
                $add: [
                  { $multiply: ['$tabSwitchSafe', 2] },
                  { $multiply: ['$fullscreenSafe', 3] },
                  { $multiply: ['$copyPasteSafe', 4] },
                  { $multiply: ['$cameraSafe', 4] },
                  '$pauseSafe',
                  { $multiply: ['$violationScoreSafe', 1.25] },
                  { $cond: [{ $eq: ['$status', 'violation'] }, 10, 0] },
                ],
              },
            ],
          },
        },
      },
      {
        $addFields: {
          adjustedScore: { $max: [0, { $subtract: ['$safeScore', '$penalty'] }] },
          integrityScore: { $max: [0, { $subtract: [100, '$penalty'] }] },
        },
      },
      {
        $group: {
          _id: null,
          attempts: { $sum: 1 },
          submittedAttempts: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
          violationAttempts: { $sum: { $cond: [{ $eq: ['$status', 'violation'] }, 1, 0] } },
          avgScore: { $avg: '$safeScore' },
          adjustedAvgScore: { $avg: '$adjustedScore' },
          avgAccuracy: { $avg: '$safeAccuracy' },
          highestScore: { $max: '$safeScore' },
          avgIntegrityScore: { $avg: '$integrityScore' },
          avgTimeTakenSec: { $avg: '$timeTakenSafe' },
          violationCount: { $sum: '$violationCount' },
          tabSwitches: { $sum: '$tabSwitchSafe' },
          fullscreenExits: { $sum: '$fullscreenSafe' },
          copyPasteCount: { $sum: '$copyPasteSafe' },
          cameraFlags: { $sum: '$cameraSafe' },
          violationScore: { $sum: '$violationScoreSafe' },
          pauseCount: { $sum: '$pauseSafe' },
        },
      },
    ]),
    AssessmentSubmission.find({ studentId, status: { $in: ASSESSMENT_FINAL_STATUSES } })
      .sort({ submittedAt: -1, updatedAt: -1 })
      .limit(12)
      .select('score accuracy submittedAt updatedAt status timeTakenSec tabSwitches fullscreenExits copyPasteCount cameraFlags violationScore pauseCount')
      .lean(),
  ]);

  const enrichedRecent = (recent || []).map((item) => {
    const penalty = computeAssessmentPenalty(item);
    const adjustedScore = clamp(Number(item.score || 0) - penalty, 0, 100);
    const integrityScore = computeAssessmentIntegrity(item);
    return {
      ...item,
      violationCount: computeAssessmentViolationCount(item),
      adjustedScore,
      integrityScore,
    };
  });

  const summary = summaryAgg[0] || {
    attempts: 0,
    submittedAttempts: 0,
    violationAttempts: 0,
    avgScore: 0,
    adjustedAvgScore: 0,
    avgAccuracy: 0,
    highestScore: 0,
    avgIntegrityScore: 100,
    avgTimeTakenSec: 0,
    violationCount: 0,
    tabSwitches: 0,
    fullscreenExits: 0,
    copyPasteCount: 0,
    cameraFlags: 0,
    violationScore: 0,
    pauseCount: 0,
  };
  const latestScore = enrichedRecent?.[0]?.score || 0;
  const latestAdjustedScore = enrichedRecent?.[0]?.adjustedScore || 0;
  const progress = (recent || []).reverse().map((item) => ({
    label: item.submittedAt ? new Date(item.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Attempt',
    value: round(clamp(Number(item.score || 0) - computeAssessmentPenalty(item), 0, 100)),
    rawScore: round(item.score || 0),
    adjustedScore: round(clamp(Number(item.score || 0) - computeAssessmentPenalty(item), 0, 100)),
    integrityScore: round(computeAssessmentIntegrity(item)),
    violationCount: computeAssessmentViolationCount(item),
  }));
  const violationRate = summary.attempts ? (summary.violationAttempts / summary.attempts) * 100 : 0;
  const stabilityScore = clamp(100 - scoreSpread(progress.map((item) => item.value || 0)), 0, 100);
  const integrityScore = summary.attempts ? summary.avgIntegrityScore : 100;
  const securityRisk = computeSecurityRisk(integrityScore, violationRate);

  return {
    attempts: summary.attempts || 0,
    submittedAttempts: summary.submittedAttempts || 0,
    violationAttempts: summary.violationAttempts || 0,
    avgScore: round(summary.avgScore || 0),
    adjustedAvgScore: round(summary.adjustedAvgScore || 0),
    avgAccuracy: round(summary.avgAccuracy || 0),
    highestScore: round(summary.highestScore || 0),
    latestScore: round(latestScore || 0),
    latestAdjustedScore: round(latestAdjustedScore || 0),
    stabilityScore: round(stabilityScore),
    integrityScore: round(integrityScore),
    violationRate: round(violationRate),
    violationCount: summary.violationCount || 0,
    avgTimeTakenSec: round(summary.avgTimeTakenSec || 0),
    securityRisk,
    proctoring: {
      tabSwitches: summary.tabSwitches || 0,
      fullscreenExits: summary.fullscreenExits || 0,
      copyPasteCount: summary.copyPasteCount || 0,
      cameraFlags: summary.cameraFlags || 0,
      violationScore: round(summary.violationScore || 0),
      pauseCount: summary.pauseCount || 0,
    },
    progress,
    recentAttempts: enrichedRecent.slice(0, 6).map((item) => ({
      label: item.submittedAt ? new Date(item.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Attempt',
      value: round(item.adjustedScore || 0),
      rawScore: round(item.score || 0),
      adjustedScore: round(item.adjustedScore || 0),
      integrityScore: round(item.integrityScore || 0),
      violationCount: item.violationCount || 0,
    })),
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

function computeDerivedScores({
  weeklyActiveDays,
  streak,
  attempts,
  assessments,
  completedTopics,
  problemAccuracy,
  assessmentScore,
  assessmentIntegrityScore,
  interviewScore,
  learningCompletion,
  progress,
  assessmentViolationRate,
}) {
  const weights = ANALYTICS_SCORE_MODEL.derivedScores;
  const consistencyScore = clamp(Math.round(weeklyActiveDays * 10 + streak * 6), 0, 100);
  const effortRaw = attempts + assessments * 2 + completedTopics;
  const effortScore = clamp(Math.round((effortRaw / 5) * 10), 0, 100);
  const performanceScore = clamp(round(
    (Number(problemAccuracy || 0) * weights.performance.dsaAccuracy)
    + (Number(assessmentScore || 0) * weights.performance.assessmentAdjustedScore)
    + (Number(interviewScore || 0) * weights.performance.interviewScore)
    + (Number(learningCompletion || 0) * weights.performance.learningCompletion),
  ));
  const readinessScore = clamp(round(
    (performanceScore * weights.readiness.performanceScore)
    + (consistencyScore * weights.readiness.consistencyScore)
    + (effortScore * weights.readiness.effortScore)
    + (Number(assessmentIntegrityScore || 100) * weights.readiness.assessmentIntegrityScore),
  ));
  const placementSignal = clamp(round(
    (readinessScore * weights.placementSignal.readinessScore)
    + (Number(problemAccuracy || 0) * weights.placementSignal.dsaAccuracy)
    + (Number(interviewScore || 0) * weights.placementSignal.interviewScore)
    + (consistencyScore * weights.placementSignal.consistencyScore),
  ));
  const growthScore = computeGrowthScore(progress || []);
  const riskLevel = computeSecurityRisk(assessmentIntegrityScore, assessmentViolationRate || 0);

  return {
    contractVersion: ANALYTICS_CONTRACT_VERSION,
    consistencyScore,
    effortScore,
    assessmentIntegrityScore: round(assessmentIntegrityScore || 100),
    performanceScore,
    readinessScore,
    placementSignal,
    growthScore,
    riskLevel,
  };
}

function chooseCurrentFocus({ problemMetrics, assessmentMetrics, interviewMetrics, learningMetrics }) {
  const candidates = [
    {
      label: problemMetrics.topics?.find((topic) => topic.level === 'weak')?.topic || 'DSA accuracy',
      score: problemMetrics.accuracy || 0,
    },
    {
      label: assessmentMetrics.integrityScore < 85 ? 'Assessment integrity' : 'Assessment performance',
      score: Math.min(assessmentMetrics.adjustedAvgScore || 0, assessmentMetrics.integrityScore || 100),
    },
    {
      label: 'Mock interview readiness',
      score: interviewMetrics.avgScore || 0,
    },
    {
      label: 'Learning completion',
      score: learningMetrics.completionPercent || 0,
    },
  ];

  return candidates.sort((a, b) => a.score - b.score)[0]?.label || 'Build more tracked attempts';
}

function buildAnalyticsExplanations({
  problemMetrics,
  assessmentMetrics,
  interviewMetrics,
  learningMetrics,
  derivedScores,
  weeklyActiveDays,
  streak,
  currentFocus,
}) {
  const weakestTopic = [...(problemMetrics.topics || [])]
    .filter((topic) => Number(topic.attempts || 0) > 0)
    .sort((a, b) => (a.accuracy || 0) - (b.accuracy || 0))[0];
  const strongestTopic = [...(problemMetrics.topics || [])]
    .filter((topic) => Number(topic.attempts || 0) > 0)
    .sort((a, b) => (b.accuracy || 0) - (a.accuracy || 0))[0];
  const lowestInterviewCategory = Object.entries(interviewMetrics.categoryScores || {})
    .sort(([, a], [, b]) => Number(a || 0) - Number(b || 0))[0];

  const overview = [
    explanation({
      id: 'readiness-score',
      title: 'Overall readiness',
      score: derivedScores.readinessScore,
      summary: `Readiness is driven by performance, consistency, effort, and assessment integrity. Current focus: ${currentFocus}.`,
      evidence: [
        `Performance score ${round(derivedScores.performanceScore)}%`,
        `Consistency score ${round(derivedScores.consistencyScore)}%`,
        `Effort score ${round(derivedScores.effortScore)}%`,
        `Integrity score ${round(derivedScores.assessmentIntegrityScore)}%`,
      ],
      action: currentFocus ? `Work on ${currentFocus} first.` : 'Add more tracked activity to improve the signal.',
    }),
    explanation({
      id: 'weekly-rhythm',
      title: 'Weekly rhythm',
      score: derivedScores.consistencyScore,
      summary: `${weeklyActiveDays} active days this week and a ${streak}-day streak are shaping your consistency score.`,
      evidence: [
        `${weeklyActiveDays}/7 active days`,
        `${streak} day current streak`,
      ],
      action: weeklyActiveDays >= 5 ? 'Keep the same cadence and raise difficulty slowly.' : 'Add one small tracked action on quiet days.',
    }),
  ];

  const coding = [
    explanation({
      id: 'dsa-accuracy',
      title: 'DSA accuracy',
      score: problemMetrics.accuracy,
      summary: `${round(problemMetrics.accuracy)}% accepted quality across ${problemMetrics.attempts || 0} attempts.`,
      evidence: [
        `${problemMetrics.solved || 0} accepted submissions`,
        strongestTopic ? `Strongest: ${strongestTopic.topic} (${round(strongestTopic.accuracy)}%)` : '',
        weakestTopic ? `Weakest: ${weakestTopic.topic} (${round(weakestTopic.accuracy)}%)` : '',
      ],
      action: weakestTopic ? `Practice ${weakestTopic.topic} in focused sets.` : 'Solve more tagged problems to unlock topic-level guidance.',
    }),
  ];

  const assessment = [
    explanation({
      id: 'assessment-adjusted-score',
      title: 'Adjusted assessment score',
      score: assessmentMetrics.adjustedAvgScore || assessmentMetrics.avgScore,
      summary: 'Assessment score is adjusted with integrity signals so readiness is harder to inflate.',
      evidence: [
        `Raw average ${round(assessmentMetrics.avgScore)}%`,
        `Adjusted average ${round(assessmentMetrics.adjustedAvgScore || assessmentMetrics.avgScore)}%`,
        `${assessmentMetrics.violationAttempts || 0} flagged attempts`,
        `${round(assessmentMetrics.violationRate || 0)}% violation rate`,
      ],
      action: assessmentMetrics.integrityScore < 85
        ? 'Complete the next assessment with clean fullscreen, camera, and copy/paste behavior.'
        : 'Review mistakes before the next timed attempt.',
    }),
    explanation({
      id: 'assessment-integrity',
      title: 'Assessment integrity',
      score: assessmentMetrics.integrityScore ?? 100,
      summary: `Integrity is currently ${round(assessmentMetrics.integrityScore ?? 100)}% with ${assessmentMetrics.securityRisk || 'low'} security risk.`,
      evidence: [
        `${assessmentMetrics.violationCount || 0} total proctoring warnings`,
        `${assessmentMetrics.proctoring?.tabSwitches || 0} tab switches`,
        `${assessmentMetrics.proctoring?.fullscreenExits || 0} fullscreen exits`,
        `${assessmentMetrics.proctoring?.cameraFlags || 0} camera flags`,
      ],
      action: assessmentMetrics.integrityScore < 85
        ? 'Reduce proctoring warnings to increase trusted readiness.'
        : 'Maintain clean assessment behavior.',
    }),
    explanation({
      id: 'assessment-stability',
      title: 'Score stability',
      score: assessmentMetrics.stabilityScore || 0,
      summary: 'Stability measures how predictable your recent adjusted scores are.',
      evidence: [
        `Latest adjusted score ${round(assessmentMetrics.latestAdjustedScore || 0)}%`,
        `Highest raw score ${round(assessmentMetrics.highestScore || 0)}%`,
        `${assessmentMetrics.recentAttempts?.length || 0} recent attempts used`,
      ],
      action: 'Re-attempt weak areas after reviewing mistakes to reduce score swings.',
    }),
  ];

  const interview = [
    explanation({
      id: 'interview-readiness',
      title: 'Interview readiness',
      score: interviewMetrics.avgScore || 0,
      summary: `${interviewMetrics.total || 0} reviewed mock interviews contribute to this signal.`,
      evidence: [
        `${round(interviewMetrics.avgScore || 0)} average feedback score`,
        `${interviewMetrics.pending || 0} pending sessions`,
        lowestInterviewCategory ? `Lowest category: ${lowestInterviewCategory[0]}` : '',
      ],
      action: lowestInterviewCategory ? `Improve ${lowestInterviewCategory[0]} in the next mock.` : 'Complete a reviewed mock interview to unlock recruiter-style guidance.',
    }),
  ];

  const learning = [
    explanation({
      id: 'learning-completion',
      title: 'Learning completion',
      score: learningMetrics.completionPercent || 0,
      summary: `${learningMetrics.completedTopics || 0}/${learningMetrics.totalTopics || 0} learning topics are complete.`,
      evidence: [
        `${learningMetrics.coursesEnrolled || 0} enrolled courses`,
        `${learningMetrics.videosWatched || 0} watched lessons`,
        `${problemMetrics.solved || 0} solved practice problems`,
      ],
      action: 'Convert each learning session into immediate coding practice.',
    }),
  ];

  return {
    overview,
    coding,
    assessment,
    interview,
    learning,
    placement: [
      explanation({
        id: 'placement-signal',
        title: 'Placement signal',
        score: derivedScores.placementSignal,
        summary: 'Placement signal combines readiness, DSA accuracy, interview score, and consistency.',
        evidence: [
          `Readiness ${round(derivedScores.readinessScore)}%`,
          `DSA accuracy ${round(problemMetrics.accuracy)}%`,
          `Interview score ${round(interviewMetrics.avgScore || 0)}%`,
          `Consistency ${round(derivedScores.consistencyScore)}%`,
        ],
        action: currentFocus ? `Improve ${currentFocus} for the fastest placement lift.` : 'Keep building balanced activity across modules.',
      }),
    ],
  };
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
    problemAccuracy: problemMetrics.accuracy,
    assessmentScore: assessmentMetrics.adjustedAvgScore || assessmentMetrics.avgScore,
    assessmentIntegrityScore: assessmentMetrics.integrityScore,
    assessmentViolationRate: assessmentMetrics.violationRate,
    interviewScore: interviewMetrics.avgScore,
    learningCompletion: learningMetrics.completionPercent,
    progress: assessmentMetrics.progress,
  });

  const avgScore = assessmentMetrics.adjustedAvgScore || assessmentMetrics.avgScore || problemMetrics.accuracy;
  const currentFocus = chooseCurrentFocus({
    problemMetrics,
    assessmentMetrics,
    interviewMetrics,
    learningMetrics,
  });
  const explanations = buildAnalyticsExplanations({
    problemMetrics,
    assessmentMetrics,
    interviewMetrics,
    learningMetrics,
    derivedScores,
    weeklyActiveDays,
    streak,
    currentFocus,
  });

  return {
    contractVersion: ANALYTICS_CONTRACT_VERSION,
    scoreModel: {
      version: ANALYTICS_CONTRACT_VERSION,
      studentVisibleSecurityAggregatesOnly: ANALYTICS_SCORE_MODEL.safety.studentVisibleSecurityAggregatesOnly,
    },
    overview: {
      totalAttempts: problemMetrics.attempts + assessmentMetrics.attempts,
      problemAttempts: problemMetrics.attempts,
      assessmentAttempts: assessmentMetrics.attempts,
      avgScore: round(avgScore),
      interviewScore: interviewMetrics.avgScore,
      streak,
      readinessScore: derivedScores.readinessScore,
      healthScore: round(
        (derivedScores.readinessScore * ANALYTICS_SCORE_MODEL.derivedScores.overviewHealth.readinessScore)
        + (derivedScores.consistencyScore * ANALYTICS_SCORE_MODEL.derivedScores.overviewHealth.consistencyScore)
        + (derivedScores.assessmentIntegrityScore * ANALYTICS_SCORE_MODEL.derivedScores.overviewHealth.assessmentIntegrityScore),
      ),
      currentFocus,
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
    explanations,
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
  const assessmentIntegrityScore = analysis?.assessments?.integrityScore ?? 100;
  const assessmentScore = analysis?.assessments?.adjustedAvgScore || analysis?.assessments?.avgScore || 0;
  const totalAttempts = analysis?.problems?.attempts || 0;

  const { wDsa, wCons, wInt } = normalizeWeights(benchmark);
  const baseReadiness = dsaScore * wDsa + consistencyScore * wCons + interviewScore * wInt;
  const assessmentSignal = assessmentScore ? assessmentScore * 0.12 : 0;
  const integrityMultiplier = clamp(0.72 + (assessmentIntegrityScore / 100) * 0.28, 0.72, 1);
  const readinessScore = clamp(round((baseReadiness * 0.88 + assessmentSignal) * integrityMultiplier));

  let badge = 'Improving';
  if (readinessScore < ANALYTICS_SCORE_MODEL.thresholds.readinessImproving) badge = 'Not Ready';
  else if (readinessScore < ANALYTICS_SCORE_MODEL.thresholds.readinessAlmostReady) badge = 'Improving';
  else if (readinessScore < ANALYTICS_SCORE_MODEL.thresholds.readinessReady) badge = 'Almost Ready';
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
  if (assessmentIntegrityScore < ANALYTICS_SCORE_MODEL.thresholds.companyIntegrityMinimum) {
    gaps.push({
      type: 'Assessment Integrity',
      message: `Your assessment integrity score is ${round(assessmentIntegrityScore)}. Reduce proctoring warnings for a stronger readiness signal.`,
      required: ANALYTICS_SCORE_MODEL.thresholds.companyIntegrityMinimum,
      current: round(assessmentIntegrityScore),
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
  if (assessmentIntegrityScore < ANALYTICS_SCORE_MODEL.thresholds.companyIntegrityMinimum) {
    actionPlan.push('Complete the next assessment with zero tab switches, fullscreen exits, copy/paste blocks, or camera warnings.');
  }
  topicFeedback.forEach((item) => {
    actionPlan.push(`Solve 15-25 ${item.topic} questions to strengthen coverage.`);
  });

  if (!actionPlan.length) {
    actionPlan.push('Keep practicing to maintain readiness.');
  }

  const estimateWeeks = Math.min(8, Math.max(1, Math.ceil(actionPlan.length / 2)));
  const timeEstimate = `Estimated time to reach readiness: ${estimateWeeks}-${estimateWeeks + 1} weeks`;
  const explanations = [
    explanation({
      id: 'company-fit-score',
      title: 'Company fit score',
      score: readinessScore,
      summary: 'Company fit uses company benchmark weights, assessment strength, and assessment integrity.',
      evidence: [
        `DSA ${round(dsaScore)}%`,
        `Consistency ${round(consistencyScore)}%`,
        `Interview ${round(interviewScore)}%`,
        `Assessment integrity ${round(assessmentIntegrityScore)}%`,
      ],
      action: actionPlan[0] || 'Keep practicing to maintain readiness.',
    }),
    explanation({
      id: 'benchmark-gap',
      title: 'Benchmark gaps',
      score: clamp(100 - gaps.length * 18, 0, 100),
      summary: gaps.length ? `${gaps.length} benchmark gap${gaps.length > 1 ? 's' : ''} need attention.` : 'No major benchmark gap is currently blocking readiness.',
      evidence: gaps.map((gap) => `${gap.type}: ${gap.current}/${gap.required}`),
      action: gaps[0]?.message || 'Protect current strengths while increasing practice volume.',
    }),
  ];

  return {
    contractVersion: ANALYTICS_CONTRACT_VERSION,
    readinessScore,
    badge,
    breakdown: {
      dsa: round(dsaScore),
      consistency: round(consistencyScore),
      interview: round(interviewScore),
      assessment: round(assessmentScore),
      integrity: round(assessmentIntegrityScore),
    },
    gapAnalysis: gaps,
    topicFeedback,
    actionPlan,
    explanations,
    timeEstimate,
  };
}

export const __analyticsTestHooks = {
  clamp,
  round,
  computeAssessmentPenalty,
  computeAssessmentIntegrity,
  computeAssessmentViolationCount,
  computeSecurityRisk,
  computeDerivedScores,
};


