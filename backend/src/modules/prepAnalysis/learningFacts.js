// Loads Prep Learning evidence: the curriculum a student can open and their
// topic progress. A student can open every topic in semesters up to their own
// (the same rule as the student dashboard), so "learning progress" is
// completed topics / topics they can open. Progress rows are grouped inside
// MongoDB per (student, semester, subject) and per (student, day).

import mongoose from 'mongoose';
import Progress from '../../models/Progress.js';
import Semester from '../../models/Subject.js';
import { learningSemesters } from '../../platform/sharedContent.js';

const MAX_QUERY_MS = 30000;
const IN_LIST_LIMIT = 5000;
const plain = (doc) => (typeof doc?.toObject === 'function' ? doc.toObject() : doc);

/** Curriculum as plain data: semesters with their number, subjects and topic counts. */
export async function loadCurriculum() {
  const docs = (await learningSemesters()) ?? await Semester.find().select('semesterName coordinatorId subjects').lean();
  return docs.map(plain).map((semester) => {
    const subjects = (semester.subjects || []).map((subject) => ({
      id: String(subject._id),
      name: String(subject.subjectName || 'Subject').trim(),
      topics: (subject.chapters || []).reduce((sum, chapter) => sum + (chapter.topics || []).length, 0),
    }));
    return {
      id: String(semester._id),
      name: semester.semesterName,
      number: Number(String(semester.semesterName || '').match(/\d+/)?.[0]),
      subjects,
      topics: subjects.reduce((sum, subject) => sum + subject.topics, 0),
    };
  });
}

/** The semesters a student can open: every semester up to their own (all, when unknown). */
export function accessibleSemesters(curriculum, studentSemester) {
  const own = Number(studentSemester);
  return curriculum.filter((semester) => !(own > 0 && semester.number > own));
}

function inRange(field, range) {
  const checks = [];
  if (range.from) checks.push({ $gte: [field, range.from] });
  if (range.to) checks.push({ $lte: [field, range.to] });
  return checks;
}

export async function loadLearningFacts({ studentIds, range }) {
  const cohort = new Set(studentIds);
  const curriculum = await loadCurriculum();
  const empty = { curriculum, byStudent: new Map() };
  if (!studentIds.length || !curriculum.length) return empty;

  const match = {};
  if (studentIds.length <= IN_LIST_LIMIT) match.studentId = { $in: studentIds.map((id) => new mongoose.Types.ObjectId(id)) };
  const completedInRange = { $and: [{ $eq: ['$completed', true] }, ...inRange('$completedAt', range)] };
  const touchedInRange = range.from || range.to ? { $and: inRange('$lastAccessedAt', range) } : true;

  const [subjectRows, dayRows] = await Promise.all([
    Progress.aggregate([
      { $match: match },
      { $group: {
        _id: { student: '$studentId', semester: '$semesterId', subject: '$subjectId' },
        completed: { $sum: { $cond: [completedInRange, 1, 0] } },
        started: { $sum: { $cond: [touchedInRange, 1, 0] } },
        videoSeconds: { $sum: { $cond: [touchedInRange, { $ifNull: ['$videoWatchedSeconds', 0] }, 0] } },
        lastAccessedAt: { $max: '$lastAccessedAt' },
      } },
    ]).option({ maxTimeMS: MAX_QUERY_MS, allowDiskUse: true }),
    Progress.aggregate([
      { $match: { ...match, completed: true, completedAt: { $ne: null, ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) } } },
      { $group: { _id: { student: '$studentId', day: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } } }, completed: { $sum: 1 } } },
    ]).option({ maxTimeMS: MAX_QUERY_MS, allowDiskUse: true }),
  ]);

  const byStudent = new Map();
  const studentEntry = (id) => {
    if (!byStudent.has(id)) byStudent.set(id, { subjects: [], days: new Map(), lastAccessedAt: null });
    return byStudent.get(id);
  };
  for (const row of subjectRows) {
    const id = String(row._id.student);
    if (!cohort.has(id)) continue;
    const entry = studentEntry(id);
    entry.subjects.push({
      semesterId: String(row._id.semester), subjectId: String(row._id.subject),
      completed: row.completed, started: row.started, videoSeconds: row.videoSeconds,
    });
    if (row.lastAccessedAt && (!entry.lastAccessedAt || row.lastAccessedAt > entry.lastAccessedAt)) entry.lastAccessedAt = row.lastAccessedAt;
  }
  for (const row of dayRows) {
    const id = String(row._id.student);
    if (cohort.has(id)) studentEntry(id).days.set(row._id.day, row.completed);
  }
  return { curriculum, byStudent };
}
