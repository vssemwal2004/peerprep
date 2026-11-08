// How much of the PrepCoding library one student has covered, topic by topic.
//
// The library and the "solved" rule are the PrepCoding page's own (platform/questionPractice.js):
// the university's published questions plus the central shared ones; a question is solved when
// its coding problem has an accepted submission or a practice attempt on it was correct. Topics
// are the question tags the PrepCoding page filters by, so "solved 12 of 80" here is the same
// 80 the student sees after clicking through to that topic.

import mongoose from 'mongoose';
import QuestionLibrary from '../../models/QuestionLibrary.js';
import QuestionPracticeAttempt from '../../models/QuestionPracticeAttempt.js';
import Submission from '../../models/Submission.js';
import { sharedQuestions } from '../../platform/sharedContent.js';
import { currentTenant } from '../../platform/tenantContext.js';

export const DIFFICULTY_LEVELS = Object.freeze(['Easy', 'Medium', 'Hard']);
// The largest topics in the library are the "core" topics the preparation estimate is about.
export const CORE_TOPIC_COUNT = 20;
const GRADED = ['AC', 'Accepted', 'WA', 'TLE', 'RE', 'CE'];
const ACCEPTED = ['AC', 'Accepted'];
const PUBLISHED = { status: 'published', visibility: { $ne: 'private' }, sourceType: { $ne: 'assessment' } };
const LIBRARY_FIELDS = '_id questionType sourceProblemId questionData.problemId questionText difficulty tags displayOrder';
const LIBRARY_CACHE_MS = 60_000;
const MAX_QUERY_MS = 20_000;
const libraryCaches = new Map();

const difficultyOf = (value) => {
  const text = String(value || '').trim().toLowerCase();
  return DIFFICULTY_LEVELS.find((level) => level.toLowerCase() === text) || 'Easy';
};
const titleOf = (text) => String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) || 'Untitled question';
const ORDER_NONE = 2147483647;

function libraryItem(question, source) {
  const id = String(question._id);
  const problemId = question.sourceProblemId || question.questionData?.problemId || null;
  return {
    key: `${source}:${id}`,
    id,
    source,
    type: question.questionType || 'coding',
    problemId: source === 'university' && problemId && mongoose.isValidObjectId(problemId) ? String(problemId) : null,
    deepLink: question.questionType === 'coding' && Boolean(problemId),
    title: titleOf(question.questionText),
    difficulty: difficultyOf(question.difficulty),
    tags: [...new Set((question.tags || []).map((tag) => String(tag).trim()).filter(Boolean))],
    order: Number(question.displayOrder) > 0 ? Number(question.displayOrder) : ORDER_NONE,
  };
}

/** The questions a student can practise: this university's published ones and the shared ones. */
export async function loadPracticeLibrary() {
  const cacheKey = currentTenant()?.universityId || 'platform';
  const cached = libraryCaches.get(cacheKey);
  let local;
  if (cached && cached.until > Date.now()) local = cached.items;
  else {
    const rows = await QuestionLibrary.find(PUBLISHED).select(LIBRARY_FIELDS).maxTimeMS(MAX_QUERY_MS).lean();
    local = rows.map((row) => libraryItem(row, 'university'));
    libraryCaches.set(cacheKey, { items: local, until: Date.now() + LIBRARY_CACHE_MS });
  }
  // The shared feed is optional: when the central service is down the local library still counts.
  const shared = await sharedQuestions().catch(() => null);
  return [...local, ...(shared || []).map((question) => libraryItem(question, 'shared'))];
}

/** Where a question opens: its coding workspace, or the PrepCoding list on its topic. */
export function questionLink(item, topicName = '') {
  if (item.deepLink) return item.source === 'university' && item.problemId ? `/problems/${item.problemId}` : `/problems/${item.id}`;
  const topic = topicName || item.tags[0] || '';
  return topic ? `/problems?topic=${encodeURIComponent(topic)}` : '/problems';
}

/**
 * One student's work on every question: Map(item key -> { graded, correct, solved, firstSolvedAt, lastAt }).
 * Coding submissions are joined through the question's problem id, practice attempts by question.
 */
export async function loadStudentPractice(studentId, library) {
  const student = new mongoose.Types.ObjectId(String(studentId));
  const [submissions, attempts] = await Promise.all([
    Submission.aggregate([
      { $match: { user: student, mode: 'submit', status: { $in: GRADED } } },
      { $group: {
        _id: '$problem',
        graded: { $sum: 1 },
        correct: { $sum: { $cond: [{ $in: ['$status', ACCEPTED] }, 1, 0] } },
        firstSolvedAt: { $min: { $cond: [{ $in: ['$status', ACCEPTED] }, '$createdAt', null] } },
        lastAt: { $max: '$createdAt' },
      } },
    ]).option({ maxTimeMS: MAX_QUERY_MS }),
    QuestionPracticeAttempt.aggregate([
      { $match: { studentId: student } },
      { $group: {
        _id: { source: '$source', question: '$questionId' },
        graded: { $sum: { $cond: [{ $in: ['$result', ['correct', 'incorrect']] }, 1, 0] } },
        correct: { $sum: { $cond: [{ $eq: ['$result', 'correct'] }, 1, 0] } },
        firstSolvedAt: { $min: { $cond: [{ $eq: ['$result', 'correct'] }, '$createdAt', null] } },
        lastAt: { $max: '$createdAt' },
      } },
    ]).option({ maxTimeMS: MAX_QUERY_MS }),
  ]);
  const byProblem = new Map(submissions.map((row) => [String(row._id), row]));
  const byQuestion = new Map(attempts.map((row) => [`${row._id.source}:${row._id.question}`, row]));
  const work = new Map();
  const earliest = (left, right) => (!left ? right || null : !right ? left : (new Date(left) < new Date(right) ? left : right));
  const latest = (left, right) => (!left ? right || null : !right ? left : (new Date(left) > new Date(right) ? left : right));
  for (const item of library) {
    const coded = item.problemId ? byProblem.get(item.problemId) : null;
    const practised = byQuestion.get(item.key);
    if (!coded && !practised) continue;
    const correct = (coded?.correct || 0) + (practised?.correct || 0);
    work.set(item.key, {
      graded: (coded?.graded || 0) + (practised?.graded || 0),
      correct,
      solved: correct > 0,
      firstSolvedAt: earliest(coded?.firstSolvedAt, practised?.firstSolvedAt),
      lastAt: latest(coded?.lastAt, practised?.lastAt),
    });
  }
  return work;
}

/** How many to solve before a topic counts as strong: 10% of it, at least 3 and at most 15. */
export const topicTarget = (total) => Math.min(total, Math.max(3, Math.min(15, Math.ceil(total * 0.1))));

/**
 * A topic's state: notStarted (nothing tried), strong (target met at 60%+ correct), needsWork
 * (under 50% correct over 5+ graded tries, or tried without a solve), else building.
 */
export function topicState({ solved, started, graded, accuracy, target }) {
  if (!solved && !started && !graded) return 'notStarted';
  if (solved >= target && (accuracy === null || accuracy >= 60)) return 'strong';
  if ((graded >= 5 && accuracy !== null && accuracy < 50) || (started > 0 && solved === 0)) return 'needsWork';
  return 'building';
}

const inWindow = (date, range) => Boolean(date) && (!range?.from || new Date(date) >= range.from) && (!range?.to || new Date(date) <= range.to);
const solvedBy = (entry, when) => Boolean(entry?.firstSolvedAt) && (!when || new Date(entry.firstSolvedAt) <= when);

/**
 * Topic coverage for one student. `range` marks what was solved in the period; `previousRange`
 * gives the preparation estimate as it stood when the period began.
 */
export function buildCoverage(library, work, { range = null, now = new Date() } = {}) {
  const topics = new Map();
  const difficulty = Object.fromEntries(DIFFICULTY_LEVELS.map((level) => [level, { total: 0, solved: 0 }]));
  let solvedItems = 0;
  let solvedInPeriod = 0;
  for (const item of library) {
    const entry = work.get(item.key);
    difficulty[item.difficulty].total += 1;
    if (entry?.solved) { difficulty[item.difficulty].solved += 1; solvedItems += 1; }
    if (entry?.solved && inWindow(entry.firstSolvedAt, range)) solvedInPeriod += 1;
    for (const tag of item.tags) {
      const key = tag.toLowerCase();
      if (!topics.has(key)) {
        topics.set(key, {
          key, labels: new Map(), total: 0, solved: 0, started: 0, graded: 0, correct: 0, solvedInPeriod: 0, solvedAtStart: 0, lastAt: null,
          byDifficulty: Object.fromEntries(DIFFICULTY_LEVELS.map((level) => [level, { total: 0, solved: 0 }])),
        });
      }
      const topic = topics.get(key);
      topic.labels.set(tag, (topic.labels.get(tag) || 0) + 1);
      topic.total += 1;
      topic.byDifficulty[item.difficulty].total += 1;
      if (!entry) continue;
      topic.graded += entry.graded;
      topic.correct += entry.correct;
      if (entry.solved) {
        topic.solved += 1;
        topic.byDifficulty[item.difficulty].solved += 1;
        if (inWindow(entry.firstSolvedAt, range)) topic.solvedInPeriod += 1;
        if (range?.from && solvedBy(entry, range.from)) topic.solvedAtStart += 1;
      } else topic.started += 1;
      if (entry.lastAt && (!topic.lastAt || new Date(entry.lastAt) > new Date(topic.lastAt))) topic.lastAt = entry.lastAt;
    }
  }
  const list = [...topics.values()].map((topic) => {
    const name = [...topic.labels.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0][0];
    const accuracy = topic.graded ? Math.round((topic.correct / topic.graded) * 1000) / 10 : null;
    const target = topicTarget(topic.total);
    const result = {
      key: topic.key, name, total: topic.total, solved: topic.solved, started: topic.started, notTried: topic.total - topic.solved - topic.started,
      graded: topic.graded, accuracy, solvedInPeriod: topic.solvedInPeriod, target,
      coverage: topic.total ? Math.round((topic.solved / topic.total) * 1000) / 10 : 0,
      byDifficulty: topic.byDifficulty, lastAt: topic.lastAt ? new Date(topic.lastAt).toISOString() : null,
      solvedAtStart: topic.solvedAtStart,
    };
    result.state = topicState({ ...result });
    return result;
  }).sort((left, right) => right.total - left.total || left.name.localeCompare(right.name));
  const core = list.slice(0, CORE_TOPIC_COUNT);
  core.forEach((topic) => { topic.core = true; });
  const estimate = (solvedOf) => {
    const target = core.reduce((sum, topic) => sum + topic.target, 0);
    return target ? Math.round((core.reduce((sum, topic) => sum + Math.min(solvedOf(topic), topic.target), 0) / target) * 1000) / 10 : 0;
  };
  const states = { strong: 0, building: 0, needsWork: 0, notStarted: 0 };
  core.forEach((topic) => { states[topic.state] += 1; });
  return {
    totals: { questions: library.length, solved: solvedItems, solvedInPeriod, coverage: library.length ? Math.round((solvedItems / library.length) * 1000) / 10 : 0, byDifficulty: difficulty },
    preparation: {
      percent: estimate((topic) => topic.solved),
      atPeriodStart: range?.from ? estimate((topic) => topic.solvedAtStart) : null,
      coreTopics: core.length,
      states,
    },
    topics: list.map(({ solvedAtStart, ...topic }) => ({ ...topic, core: Boolean(topic.core) })),
    asOf: now.toISOString(),
  };
}

const RANK = { Easy: 0, Medium: 1, Hard: 2 };
const shape = (item, entry, topicName) => ({
  id: item.id, source: item.source, title: item.title, difficulty: item.difficulty, type: item.type,
  to: questionLink(item, topicName), graded: entry?.graded || 0,
  solvedAt: entry?.firstSolvedAt ? new Date(entry.firstSolvedAt).toISOString() : null,
  lastAt: entry?.lastAt ? new Date(entry.lastAt).toISOString() : null,
});

/** One topic in detail: what to practise next, what to retry, and what is already solved. */
export function topicDetail(library, work, key, { limit = 12 } = {}) {
  const wanted = String(key || '').trim().toLowerCase();
  const items = library.filter((item) => item.tags.some((tag) => tag.toLowerCase() === wanted));
  if (!items.length) return null;
  const coverage = buildCoverage(items, work).topics.find((topic) => topic.key === wanted);
  const byOrder = (left, right) => RANK[left.difficulty] - RANK[right.difficulty] || left.order - right.order || left.title.localeCompare(right.title);
  const recent = (field) => (left, right) => new Date(work.get(right.key)?.[field] || 0) - new Date(work.get(left.key)?.[field] || 0);
  const next = items.filter((item) => !work.has(item.key)).sort(byOrder);
  const retry = items.filter((item) => work.has(item.key) && !work.get(item.key).solved).sort(recent('lastAt'));
  const solved = items.filter((item) => work.get(item.key)?.solved).sort(recent('firstSolvedAt'));
  const list = (rows) => rows.slice(0, limit).map((item) => shape(item, work.get(item.key), coverage.name));
  return {
    topic: coverage,
    next: list(next), retry: list(retry), solved: list(solved),
    counts: { next: next.length, retry: retry.length, solved: solved.length },
    practiceAll: `/problems?topic=${encodeURIComponent(coverage.name)}`,
  };
}

/** Clears the cached library (tests and library edits). */
export function resetPracticeLibraryCache() { libraryCaches.clear(); }
