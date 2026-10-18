// Builds one row per student from the cohort and the grouped coding facts and
// scores each student from their own work. Filters, rank cuts and charts all
// read these rows, so one database pass serves every filter change for the period.

import { prepScores } from '../../services/prepScores.js';
import { PASS_PERCENT, testAssignedTo } from './assessmentFacts.js';
import { RATINGS } from './interviewFacts.js';
import { accessibleSemesters } from './learningFacts.js';
import { DIFFICULTIES, prepScore } from './prepScore.js';
import { sheetVisibleTo } from './quickPrepFacts.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// A student with no activity for this many days counts as stopped.
export const INACTIVE_AFTER_DAYS = 14;
const round1 = (value) => Math.round(value * 10) / 10;
const daysSince = (date, now) => (date ? Math.max(0, Math.floor((now.getTime() - new Date(date).getTime()) / DAY_MS)) : null);
const activityStatus = (hasActivity, days) => (!hasActivity ? 'never' : days > INACTIVE_AFTER_DAYS ? 'inactive' : 'active');

/** Learning figures for one student: topics completed of the topics they can open. */
function learningRow(student, facts, now, totalsCache) {
  const own = facts.byStudent.get(String(student._id)) || { subjects: [], days: new Map(), lastAccessedAt: null };
  const cacheKey = String(Number(student.semester) || 0);
  if (!totalsCache.has(cacheKey)) {
    const access = accessibleSemesters(facts.curriculum, student.semester);
    const bySubject = new Map();
    for (const semester of access) for (const subject of semester.subjects) bySubject.set(subject.name, (bySubject.get(subject.name) || 0) + subject.topics);
    totalsCache.set(cacheKey, { semesterIds: new Set(access.map((semester) => semester.id)), subjectNames: new Map(access.flatMap((semester) => semester.subjects.map((subject) => [subject.id, subject.name]))), bySubject, total: access.reduce((sum, semester) => sum + semester.topics, 0) });
  }
  const totals = totalsCache.get(cacheKey);
  const bySubject = new Map([...totals.bySubject.entries()].map(([name, total]) => [name, { total, completed: 0, started: 0 }]));
  let videoSeconds = 0;
  for (const entry of own.subjects) {
    if (!totals.semesterIds.has(entry.semesterId)) continue;
    const name = totals.subjectNames.get(entry.subjectId);
    if (!name) continue;
    const subject = bySubject.get(name);
    subject.completed += entry.completed;
    subject.started += entry.started;
    videoSeconds += entry.videoSeconds;
  }
  const completedTopics = [...bySubject.values()].reduce((sum, subject) => sum + Math.min(subject.completed, subject.total), 0);
  const started = [...bySubject.values()].some((subject) => subject.started > 0 || subject.completed > 0);
  const lastDay = [...own.days.keys()].sort().at(-1);
  const lastTimes = [own.lastAccessedAt ? new Date(own.lastAccessedAt).getTime() : 0, lastDay ? Date.parse(`${lastDay}T00:00:00Z`) : 0];
  const lastActive = Math.max(...lastTimes) || null;
  const days = daysSince(lastActive, now);
  return {
    completedTopics,
    availableTopics: totals.total,
    progress: totals.total ? round1(Math.min(100, (completedTopics / totals.total) * 100)) : 0,
    videoMinutes: Math.round(videoSeconds / 60),
    subjects: [...bySubject.entries()].filter(([, subject]) => subject.started > 0 || subject.completed > 0).map(([name]) => name),
    subjectsFinished: [...bySubject.entries()].filter(([, subject]) => subject.total > 0 && subject.completed >= subject.total).map(([name]) => name),
    bySubject,
    days: own.days,
    daysSinceActive: days,
    status: activityStatus(started, days),
  };
}

/** Quick Prep figures for one student across the sheets they started. */
function quickPrepRow(student, facts, now) {
  const entries = facts.byStudent.get(String(student._id)) || [];
  const solved = entries.reduce((sum, entry) => sum + entry.solved, 0);
  const total = entries.reduce((sum, entry) => sum + entry.total, 0);
  const finished = entries.filter((entry) => entry.finished).length;
  const lastActive = entries.map((entry) => entry.lastViewedAt).filter(Boolean).sort((left, right) => new Date(right) - new Date(left))[0] || null;
  const days = daysSince(lastActive, now);
  const visible = [...facts.sheets.values()].filter((sheet) => sheet.published && sheetVisibleTo(sheet, student.semester)).length;
  return {
    started: entries.length,
    finished,
    solved,
    total,
    visibleSheets: visible,
    progress: total ? round1((solved / total) * 100) : 0,
    sheets: entries.map((entry) => entry.sheetId),
    sheetsFinished: entries.filter((entry) => entry.finished).map((entry) => entry.sheetId),
    bySheet: new Map(entries.map((entry) => [entry.sheetId, entry])),
    daysSinceActive: days,
    status: !entries.length ? 'none' : finished ? 'finished' : 'inProgress',
  };
}
const dayKey = (date) => new Date(date).toISOString().slice(0, 10);
const mean = (values) => (values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : 0);

function dailyCounts(dates) {
  const days = new Map();
  for (const date of dates) days.set(dayKey(date), (days.get(dayKey(date)) || 0) + 1);
  return days;
}

/** Prep Assessment figures for one student: their own tests, scores and missed tests. */
function assessmentRow(student, facts, now, range) {
  const id = String(student._id);
  const latest = new Map();
  for (const attempt of [...(facts.byStudent.get(id) || [])].sort((left, right) => new Date(left.at) - new Date(right.at))) latest.set(attempt.testId, attempt);
  const attempts = [...latest.values()];
  const percents = attempts.map((attempt) => attempt.percent);
  const passedIds = attempts.filter((attempt) => attempt.percent >= PASS_PERCENT).map((attempt) => attempt.testId);
  // Report navigation must also work for a completed test that an admin later hides.
  const assignedIds = [...facts.tests.values()].filter((test) => test.forEveryone || test.assigned.has(id)).map((test) => test.id);
  // A missed test: meant for the student, over, (started in the period) and not taken.
  const inPeriod = (test) => !range?.from || !test.startTime || new Date(test.startTime) >= range.from;
  const missedIds = [...facts.tests.values()].filter((test) => test.ended && inPeriod(test) && testAssignedTo(test, id) && !latest.has(test.id)).map((test) => test.id);
  const lastAt = attempts.length ? attempts.at(-1).at : null;
  const days = daysSince(lastAt, now);
  return {
    taken: attempts.length,
    passed: passedIds.length,
    failed: attempts.length - passedIds.length,
    missed: missedIds.length,
    passRate: attempts.length ? round1((passedIds.length / attempts.length) * 100) : 0,
    averageScore: mean(percents),
    bestScore: percents.length ? Math.max(...percents) : 0,
    lastScore: attempts.length ? attempts.at(-1).percent : 0,
    minutes: attempts.reduce((sum, attempt) => sum + attempt.minutes, 0),
    takenIds: attempts.map((attempt) => attempt.testId),
    assignedIds,
    passedIds,
    missedIds,
    byTest: latest,
    days: dailyCounts(attempts.map((attempt) => attempt.at)),
    daysSinceActive: days,
    status: activityStatus(attempts.length > 0, days),
  };
}

/** Prep Interview figures for one student: mock interviews received and given, AI interviews. */
function interviewRow(student, facts, now) {
  const own = facts.byStudent.get(String(student._id)) || { received: [], given: 0, scheduled: 0, aiStarted: 0, aiCompleted: 0, aiDays: [] };
  const received = [...own.received].sort((left, right) => new Date(left.at) - new Date(right.at));
  const scores = received.map((entry) => entry.score);
  const ratings = Object.fromEntries(RATINGS.map(({ key }) => [key, mean(received.map((entry) => entry.ratings[key]).filter((value) => value > 0))]));
  const dates = [...received.map((entry) => entry.at), ...own.aiDays];
  const lastAt = dates.length ? new Date(Math.max(...dates.map((date) => new Date(date).getTime()))) : null;
  const days = daysSince(lastAt, now);
  const done = received.length + own.aiCompleted;
  return {
    done,
    mockDone: received.length,
    mockScore: mean(scores),
    bestMockScore: scores.length ? Math.max(...scores) : 0,
    lastMockScore: scores.length ? scores.at(-1) : 0,
    ratings,
    given: own.given,
    scheduled: own.scheduled,
    aiStarted: own.aiStarted,
    aiCompleted: own.aiCompleted,
    mocks: received,
    aiDates: own.aiDays,
    days: dailyCounts(dates),
    daysSinceActive: days,
    status: activityStatus(done > 0, days),
  };
}

const lower = (value) => String(value ?? '').trim().toLowerCase();

/**
 * problems: Map(problemId -> { title, difficulty, topics[], tags[], companies[] }) with display names.
 * Returns the same map with lowercase lookup sets added for qualifier matching.
 */
export function indexProblemMeta(problems) {
  for (const meta of problems.values()) {
    meta.topicKeys = new Set((meta.topics || []).map(lower));
    meta.tagKeys = new Set((meta.tags || []).map(lower));
    meta.companyKeys = new Set((meta.companies || []).map(lower));
  }
  return problems;
}

function emptyCoding() {
  return {
    solved: { Easy: 0, Medium: 0, Hard: 0, total: 0 },
    attempted: 0, submissions: 0, accepted: 0, accuracy: 0, activeDays: 0,
    lastActiveAt: null, daysSinceActive: null, practiceStatus: 'never',
    languages: [], solvedTopics: [], solvedTags: [], solvedDifficulties: [],
    prepScore: 0, work: 0, quality: 100, triesPerSolve: 0, points: { Easy: 0, Medium: 0, Hard: 0 },
  };
}

/**
 * students: lean User docs. facts.byStudent: Map(id -> [{ problemId, language, attempts, accepted }]).
 * facts.days: Map(id -> Map(day -> { attempts, accepted })). problems: indexed meta map.
 */
/** Prep Score per feature and overall, with the same formula students see on their dashboard. */
export function rowScores(row, features) {
  const mocks = row.interview?.mocks || [];
  // Only marked tests count towards the score.
  const attempts = row.assessment ? [...row.assessment.byTest.values()].filter((attempt) => Number.isFinite(attempt.percent)) : [];
  return prepScores({
    easySolved: row.coding.solved.Easy, mediumSolved: row.coding.solved.Medium, hardSolved: row.coding.solved.Hard,
    submissions: row.coding.submissions, acceptedSubmissions: row.coding.accepted,
    completedTopics: row.learning?.completedTopics, totalTopics: row.learning?.availableTopics,
    mockInterviews: mocks.length, mockAverage: mean(mocks.map((mock) => mock.score)), aiInterviews: row.interview?.aiCompleted,
    testsTaken: attempts.length, testAverage: mean(attempts.map((attempt) => attempt.percent)),
  }, features);
}

export function buildStudentRows({
  students, facts, problems, batchNames = new Map(), now = new Date(), learning = null, quickprep = null, assessment = null, interview = null, range = null,
  scoreFeatures = { coding: true, learning: Boolean(learning), interview: Boolean(interview), assessment: Boolean(assessment) },
}) {
  const learningTotals = new Map();
  const rows = students.map((student) => {
    const id = String(student._id);
    const entries = (facts.byStudent.get(id) || [])
      .map((entry) => ({ ...entry, meta: problems.get(String(entry.problemId)) }))
      .filter((entry) => entry.meta);
    const days = facts.days.get(id) || new Map();
    const coding = emptyCoding();
    const solvedIds = new Set();
    const attemptedIds = new Set();
    const languages = new Set();
    const solvedTopics = new Set();
    const solvedTags = new Set();
    const solvedDifficulties = new Set();
    for (const entry of entries) {
      coding.submissions += entry.attempts;
      coding.accepted += entry.accepted;
      attemptedIds.add(entry.problemId);
      languages.add(entry.language);
      if (entry.accepted > 0 && !solvedIds.has(entry.problemId)) {
        solvedIds.add(entry.problemId);
        if (DIFFICULTIES.includes(entry.meta.difficulty)) {
          coding.solved[entry.meta.difficulty] += 1;
          solvedDifficulties.add(entry.meta.difficulty);
        }
        entry.meta.topics.forEach((topic) => solvedTopics.add(topic));
        entry.meta.tags.forEach((tag) => solvedTags.add(tag));
      }
    }
    coding.solved.total = solvedIds.size;
    coding.attempted = attemptedIds.size;
    coding.accuracy = coding.submissions ? Math.round((coding.accepted / coding.submissions) * 1000) / 10 : 0;
    coding.activeDays = days.size;
    const lastDay = [...days.keys()].sort().at(-1);
    coding.lastActiveAt = lastDay || null;
    coding.daysSinceActive = lastDay ? Math.max(0, Math.floor((now.getTime() - Date.parse(`${lastDay}T00:00:00Z`)) / DAY_MS)) : null;
    coding.practiceStatus = coding.submissions === 0 ? 'never' : coding.daysSinceActive > INACTIVE_AFTER_DAYS ? 'inactive' : 'active';
    const score = prepScore({ solved: coding.solved, accepted: coding.accepted, attempts: coding.submissions });
    coding.prepScore = score.score;
    coding.work = score.work;
    coding.quality = score.quality;
    coding.triesPerSolve = score.triesPerSolve;
    coding.points = score.points;
    coding.languages = [...languages];
    coding.solvedTopics = [...solvedTopics];
    coding.solvedTags = [...solvedTags];
    coding.solvedDifficulties = [...solvedDifficulties];
    return {
      id,
      name: student.name || 'Unnamed student',
      email: student.email || '',
      studentId: student.studentId || '',
      student: {
        semester: student.semester ?? null,
        course: student.course || '',
        branch: student.branch || '',
        college: student.college || '',
        group: student.group || '',
        coordinators: (student.teacherIds || []).map(String),
        batches: (student.uploadBatchIds || []).map(String),
        batchNames: (student.uploadBatchIds || []).map((batchId) => batchNames.get(String(batchId))).filter(Boolean),
        status: student.isActive === false ? 'inactive' : 'active',
      },
      coding,
      learning: learning ? learningRow(student, learning, now, learningTotals) : null,
      quickprep: quickprep ? quickPrepRow(student, quickprep, now) : null,
      assessment: assessment ? assessmentRow(student, assessment, now, range) : null,
      interview: interview ? interviewRow(student, interview, now) : null,
      entries,
      days,
      qualifiedCache: new Map(),
    };
  });
  for (const row of rows) row.scores = rowScores(row, scoreFeatures);
  return rows;
}

const lowerSet = (values) => new Set((values || []).map(lower));

/** Learning figures limited to some subjects: metric 'completedTopics' | 'progress'. */
export function qualifiedLearningMetric(row, metric, qualifiers) {
  if (!row.learning) return 0;
  if (!qualifiers?.subjects?.length) return row.learning[metric] ?? 0;
  const wanted = lowerSet(qualifiers.subjects);
  let completed = 0;
  let total = 0;
  for (const [name, subject] of row.learning.bySubject) {
    if (!wanted.has(lower(name))) continue;
    completed += Math.min(subject.completed, subject.total);
    total += subject.total;
  }
  if (metric === 'completedTopics') return completed;
  return total ? round1((completed / total) * 100) : 0;
}

/** Quick Prep figures limited to some sheets: metric 'solved' | 'progress'. */
export function qualifiedQuickPrepMetric(row, metric, qualifiers) {
  if (!row.quickprep) return 0;
  if (!qualifiers?.sheets?.length) return row.quickprep[metric] ?? 0;
  let solved = 0;
  let total = 0;
  for (const sheetId of qualifiers.sheets) {
    const entry = row.quickprep.bySheet.get(String(sheetId));
    if (!entry) continue;
    solved += entry.solved;
    total += entry.total;
  }
  if (metric === 'solved') return solved;
  return total ? round1((solved / total) * 100) : 0;
}

/** Assessment figures limited to some tests: metric 'averageScore' | 'taken' | 'passed'. */
export function qualifiedAssessmentMetric(row, metric, qualifiers) {
  if (!row.assessment) return 0;
  if (!qualifiers?.tests?.length) return row.assessment[metric] ?? 0;
  const attempts = qualifiers.tests.map((testId) => row.assessment.byTest.get(String(testId))).filter(Boolean);
  if (metric === 'taken') return attempts.length;
  if (metric === 'passed') return attempts.filter((attempt) => attempt.percent >= PASS_PERCENT).length;
  return mean(attempts.map((attempt) => attempt.percent));
}

const hasQualifiers = (qualifiers) => qualifiers && Object.values(qualifiers).some((values) => Array.isArray(values) && values.length);

function entryMatches(entry, qualifiers) {
  const { meta } = entry;
  const anyIn = (values, keys) => values.some((value) => keys.has(lower(value)));
  if (qualifiers.difficulties?.length && !qualifiers.difficulties.includes(meta.difficulty)) return false;
  if (qualifiers.languages?.length && !qualifiers.languages.includes(entry.language)) return false;
  if (qualifiers.topics?.length && !anyIn(qualifiers.topics, meta.topicKeys)) return false;
  if (qualifiers.tags?.length && !anyIn(qualifiers.tags, meta.tagKeys)) return false;
  if (qualifiers.companies?.length && !anyIn(qualifiers.companies, meta.companyKeys)) return false;
  return true;
}

/**
 * A coding metric limited to problems/languages matching the qualifiers
 * (values within one qualifier are OR'd; different qualifiers are AND'd).
 * metric: 'solved' | 'attempted' | 'submissions' | 'accuracy'.
 */
export function qualifiedCodingMetric(row, metric, qualifiers) {
  if (!hasQualifiers(qualifiers)) {
    if (metric === 'solved') return row.coding.solved.total;
    return row.coding[metric] ?? 0;
  }
  const key = `${metric}:${JSON.stringify(qualifiers)}`;
  if (row.qualifiedCache.has(key)) return row.qualifiedCache.get(key);
  const solved = new Set();
  const attempted = new Set();
  let submissions = 0;
  let accepted = 0;
  for (const entry of row.entries) {
    if (!entryMatches(entry, qualifiers)) continue;
    attempted.add(entry.problemId);
    if (entry.accepted > 0) solved.add(entry.problemId);
    submissions += entry.attempts;
    accepted += entry.accepted;
  }
  const values = {
    solved: solved.size,
    attempted: attempted.size,
    submissions,
    accuracy: submissions ? Math.round((accepted / submissions) * 1000) / 10 : 0,
  };
  for (const [name, value] of Object.entries(values)) row.qualifiedCache.set(`${name}:${JSON.stringify(qualifiers)}`, value);
  return values[metric] ?? 0;
}
