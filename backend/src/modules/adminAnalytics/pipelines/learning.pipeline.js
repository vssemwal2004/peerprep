import mongoose from 'mongoose';
import Progress from '../../../models/Progress.js';
import Semester from '../../../models/Subject.js';
import { authorizedLearningFilter } from '../adminAnalytics.authorization.js';
import { ANALYTICS_LIMITS } from '../adminAnalytics.validation.js';

function flattenLearning(semesters, query) {
  const topics = [];
  for (const semester of semesters) {
    for (const subject of semester.subjects || []) {
      if (query.learning.subjectIds.length && !query.learning.subjectIds.includes(String(subject._id))) continue;
      for (const chapter of subject.chapters || []) {
        if (query.learning.chapterIds.length && !query.learning.chapterIds.includes(String(chapter._id))) continue;
        for (const topic of chapter.topics || []) {
          if (query.learning.topicIds.length && !query.learning.topicIds.includes(String(topic._id))) continue;
          if (query.learning.difficulties.length && !query.learning.difficulties.includes(topic.difficultyLevel)) continue;
          topics.push({
            semesterId: String(semester._id), semester: semester.semesterName,
            subjectId: String(subject._id), subject: subject.subjectName,
            chapterId: String(chapter._id), chapter: chapter.chapterName,
            topicId: String(topic._id), topic: topic.topicName,
            difficulty: topic.difficultyLevel, importance: topic.importanceLevel,
          });
        }
      }
    }
  }
  return topics;
}

export async function collectLearningEvidence({ user, studentIds, query }) {
  const definitionFilter = authorizedLearningFilter(user);
  if (query.learning.semesterIds.length) definitionFilter._id = { $in: query.learning.semesterIds };
  const semesters = await Semester.find(definitionFilter).select('_id semesterName subjects coordinatorId').limit(1000).lean();
  const topics = flattenLearning(semesters, query);
  const topicIds = topics.map((topic) => new mongoose.Types.ObjectId(topic.topicId));
  if (!studentIds.length || !topicIds.length) return emptyLearning(semesters, topics);
  const match = {
    studentId: { $in: studentIds },
    topicId: { $in: topicIds },
  };
  const rows = await Progress.find(match)
    .select('_id studentId semesterId subjectId chapterId topicId completed completedAt videoWatchedSeconds videoDuration lastAccessedAt')
    .sort({ lastAccessedAt: -1, _id: -1 })
    .limit(ANALYTICS_LIMITS.maxInteractiveRows + 1)
    .lean();
  const truncated = rows.length > ANALYTICS_LIMITS.maxInteractiveRows;
  const progress = rows.slice(0, ANALYTICS_LIMITS.maxInteractiveRows);
  const perStudent = new Map();
  const perTopic = new Map();
  const activity = [];
  for (const row of progress) {
    const studentId = String(row.studentId);
    const topicId = String(row.topicId);
    const watched = Math.max(Number(row.videoWatchedSeconds) || 0, 0);
    const student = perStudent.get(studentId) || { completedTopics: new Set(), engagedTopics: new Set(), activeDays: new Set(), watchedSeconds: 0 };
    student.eligibleTopics ||= new Set();
    student.eligibleTopics.add(topicId);
    const completedAsOfEnd = row.completed && (!row.completedAt || row.completedAt <= query.date.to);
    const completedInWindow = completedAsOfEnd && row.completedAt >= query.date.from;
    const accessedInWindow = row.lastAccessedAt >= query.date.from && row.lastAccessedAt <= query.date.to;
    const meaningfullyEngaged = completedInWindow || (watched > 0 && accessedInWindow);
    if (completedAsOfEnd) student.completedTopics.add(topicId);
    if (meaningfullyEngaged) student.engagedTopics.add(topicId);
    if (meaningfullyEngaged && accessedInWindow) {
      student.activeDays.add(row.lastAccessedAt.toISOString().slice(0, 10));
    }
    if (accessedInWindow) student.watchedSeconds += watched;
    perStudent.set(studentId, student);
    const stats = perTopic.get(topicId) || { topicId, completedStudents: new Set(), engagedStudents: new Set(), watchedSeconds: 0 };
    stats.eligibleStudents ||= new Set();
    stats.eligibleStudents.add(studentId);
    if (completedAsOfEnd) stats.completedStudents.add(studentId);
    if (meaningfullyEngaged) stats.engagedStudents.add(studentId);
    stats.watchedSeconds += watched;
    perTopic.set(topicId, stats);
    if (meaningfullyEngaged) activity.push({ studentId, at: completedInWindow ? row.completedAt : row.lastAccessedAt, kind: completedInWindow ? 'learned' : 'learning-engagement', topicId });
  }
  return { source: 'learning', semesters, topics, progress, perStudent, perTopic, activity, truncated };
}

function emptyLearning(semesters = [], topics = []) {
  return { source: 'learning', semesters, topics, progress: [], perStudent: new Map(), perTopic: new Map(), activity: [], truncated: false };
}
