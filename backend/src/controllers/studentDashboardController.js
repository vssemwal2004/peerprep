import mongoose from 'mongoose';
import Problem from '../models/Problem.js';
import StudentProblemView from '../models/StudentProblemView.js';
import Progress from '../models/Progress.js';
import { HttpError } from '../utils/errors.js';
import { listStudentChallengeBadges } from '../services/studentEngagementService.js';
import { refreshAdaptiveEngagement } from '../services/adaptiveEngagementService.js';
import { latestQuestResume } from '../services/questService.js';
import { studentHasFeature } from '../services/studentFeatureAccess.js';

export async function refreshStudentChallenges(req, res) {
  // No client-supplied metrics, award IDs, dates or point values are trusted.
  res.set('Cache-Control', 'private, no-store');
  res.json(await refreshAdaptiveEngagement(req.user));
}

export async function getStudentChallengeBadges(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json(await listStudentChallengeBadges(req.user, { cursor: req.query?.cursor }));
}
import { dashboardPermissions, getStudentDashboardData, getStudentUniversityRanking, getAccessibleCurriculumTopic, getSharedCodingCatalog, publicProblemMatch } from '../services/studentDashboardService.js';

function publicRanking(ranking = {}) {
  return {
    score: Number(ranking.score) || 0,
    rank: Number(ranking.rank) > 0 ? Number(ranking.rank) : null,
    totalStudents: Number(ranking.totalStudents) || 0,
    universityName: String(ranking.universityName || ''),
    percentile: Number.isFinite(Number(ranking.percentile)) ? Number(ranking.percentile) : null,
    hasProgress: Boolean(ranking.hasProgress),
    tied: Boolean(ranking.tied),
    level: ranking.level || null,
    earnedBadges: Number(ranking.earnedBadges) || 0,
    milestoneBadges: Number(ranking.milestoneBadges) || 0,
    challengeBadges: Number(ranking.challengeBadges) || 0,
    badgeMetrics: ranking.badgeMetrics || null,
    levelMetrics: ranking.levelMetrics || null,
    unit: 'prep-score',
    calculatedAt: new Date().toISOString(),
  };
}

export async function getStudentDashboard(req, res) {
  res.set('Cache-Control', 'private, no-store');
  const canQuickPrep = studentHasFeature(req.user, 'quickprep');
  const canCoding = studentHasFeature(req.user, 'prep_coding');
  const canLearning = studentHasFeature(req.user, 'learning');
  const canRanking = studentHasFeature(req.user, 'rankings') || studentHasFeature(req.user, 'prep_coins');
  const [data, quest] = await Promise.all([getStudentDashboardData(req.user), canQuickPrep ? latestQuestResume(req.user).catch(() => null) : null]);
  // The quest a student last opened competes with their other unfinished work on recency.
  if (quest) data.resumeItems = [quest, ...(data.resumeItems || [])].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 4);
  data.resumeItems = (data.resumeItems || []).filter((item) => (
    (item.type === 'coding' && canCoding)
    || (item.type === 'learning' && canLearning)
    || (item.type === 'quest' && canQuickPrep)
  ));
  if (!canCoding) {
    data.coding = null;
    data.suggestedPractice = [];
  }
  if (!canLearning) data.learning = null;
  data.ranking = canRanking ? publicRanking(data.ranking) : null;
  res.json(data);
}

export async function getStudentRanking(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json({ ranking: publicRanking(await getStudentUniversityRanking(req.user)) });
}

export async function recordStudentProblemView(req, res) {
  const problemId = String(req.body?.problemId || '');
  const source = req.body?.source || 'university';
  if (!['university', 'shared'].includes(source)) throw new HttpError(400, 'Invalid problem source');
  if (!mongoose.isValidObjectId(problemId)) throw new HttpError(400, 'A valid problem ID is required');
  if (!(await dashboardPermissions(req.user)).questions) throw new HttpError(403, 'Coding practice is disabled for this university');
  const exists = source === 'shared'
    ? (await getSharedCodingCatalog()).some((question) => String(question._id) === problemId)
    : await Problem.exists({ _id: problemId, ...publicProblemMatch });
  if (!exists) throw new HttpError(404, 'Problem not found');
  try {
    await StudentProblemView.updateOne(
      { studentId: req.user._id, problemId, source },
      { $set: { lastViewedAt: new Date() } },
      { upsert: true },
    );
  } catch (error) {
    // Two tabs can open the same problem simultaneously; the unique record already exists.
    if (error.code !== 11000) throw error;
  }
  res.status(204).end();
}

export async function recordStudentTopicView(req, res) {
  const { topicId, semesterId, subjectId, chapterId, coordinatorId, contentType } = req.body || {};
  if (![topicId, semesterId, subjectId, chapterId].every((id) => mongoose.isValidObjectId(id))) {
    throw new HttpError(400, 'Valid curriculum IDs are required');
  }
  if (!['video', 'notes', 'questions'].includes(contentType)) throw new HttpError(400, 'Invalid learning content type');
  if (!(await dashboardPermissions(req.user)).learning) throw new HttpError(403, 'Learning is disabled for this university');
  const topic = await getAccessibleCurriculumTopic(req.user, topicId);
  const contentExists = topic && ({ video: topic.hasVideo, notes: topic.hasNotes, questions: topic.hasQuestions })[contentType];
  if (!topic || !contentExists || topic.semesterId !== String(semesterId) || topic.subjectId !== String(subjectId) || topic.chapterId !== String(chapterId) || topic.coordinatorId !== String(coordinatorId)) {
    throw new HttpError(404, 'Learning content not found');
  }
  try {
    await Progress.updateOne(
      { studentId: req.user._id, topicId },
      {
        $set: { lastAccessedAt: new Date(), lastViewedContentType: contentType },
        $setOnInsert: { semesterId, subjectId, chapterId, coordinatorId },
      },
      { upsert: true, runValidators: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  res.status(204).end();
}
