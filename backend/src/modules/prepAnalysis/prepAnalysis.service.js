import CodingTopic from '../../models/CodingTopic.js';
import Problem from '../../models/Problem.js';
import User from '../../models/User.js';
import { HttpError } from '../../utils/errors.js';
import {
  buildKpiGroups, calendarPayload, CHART_BY_ID, CHARTS, DEFAULT_LAYOUT, GROUP_BY,
} from './charts.js';
import { loadCodingFacts, loadCohort } from './codingFacts.js';
import { allowedModules, FIELDS, MODULES, STATIC_OPTIONS } from './fields.js';
import { applyRankCuts, evaluateFilterTree, normalizeFilterTree, normalizeRankCuts } from './filterEngine.js';
import { loadLearningFacts } from './learningFacts.js';
import {
  ACCURACY_FULL_CREDIT_SUBMISSIONS, ACCURACY_SHARE, competitionRanks, DIFFICULTY_WEIGHTS, PREP_SCORE_VERSION, PROGRESS_SHARE, SOLVE_TARGETS,
} from './prepScore.js';
import { buildReport, EXPORT_TYPES } from './prepAnalysis.export.js';
import { loadAssessmentFacts, PASS_PERCENT } from './assessmentFacts.js';
import { loadInterviewFacts, RATINGS } from './interviewFacts.js';
import { loadQuickPrepFacts, sheetVisibleTo } from './quickPrepFacts.js';
import { buildStudentRows } from './studentRows.js';

export const PREP_SCORE_FORMULA = Object.freeze({
  weights: DIFFICULTY_WEIGHTS,
  targets: SOLVE_TARGETS,
  progressShare: PROGRESS_SHARE,
  accuracyShare: ACCURACY_SHARE,
  accuracyFullCreditSubmissions: ACCURACY_FULL_CREDIT_SUBMISSIONS,
});

export const QUERY_LIMITS = Object.freeze({ maxCharts: 24, maxTableLimit: 100, maxRangeDays: 366 * 3, cacheTtlMs: 60_000, cacheEntries: 6 });
const RANGE_PRESETS = { '7d': 7, '30d': 30, '90d': 90, '180d': 180, '365d': 365, all: null };
const TABLE_SORTS = {
  prepScore: (row) => row.coding.prepScore,
  solved: (row) => row.coding.solved.total,
  accuracy: (row) => row.coding.accuracy,
  learningProgress: (row) => row.learning?.progress ?? -1,
  topicsCompleted: (row) => row.learning?.completedTopics ?? -1,
  sheetProgress: (row) => row.quickprep?.progress ?? -1,
  sheetsFinished: (row) => row.quickprep?.finished ?? -1,
  interviewsDone: (row) => row.interview?.done ?? -1,
  mockScore: (row) => row.interview?.mockScore ?? -1,
  testScore: (row) => row.assessment?.averageScore ?? -1,
  testsTaken: (row) => row.assessment?.taken ?? -1,
  testsMissed: (row) => row.assessment?.missed ?? -1,
  overallScore: (row) => row.scores?.total ?? 0,
  featureScore: (row, area) => row.scores?.features[area]?.score ?? 0,
};
// The order "#" uses in the table, per area.
const POSITION_BY = {
  coding: (row) => row.coding.prepScore,
  learning: (row) => row.learning?.progress ?? 0,
  interview: (row) => row.scores?.features.interview?.score ?? 0,
  assessment: (row) => row.scores?.features.assessment?.score ?? 0,
  all: (row) => row.scores?.total ?? 0,
};
const DEFAULT_SORT = { coding: 'prepScore', learning: 'learningProgress', interview: 'featureScore', assessment: 'featureScore', all: 'overallScore' };

/** Which interview data a university may see: mock interviews ("events") and AI interviews ("interviews"). */
export const interviewParts = (permissions) => ({ peer: !permissions || permissions.events === true, ai: !permissions || permissions.interviews === true });
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- request validation

export function normalizeRange(input = {}) {
  const preset = input.preset ?? (input.from || input.to ? 'custom' : 'all');
  if (preset !== 'custom') {
    if (!Object.hasOwn(RANGE_PRESETS, preset)) throw new HttpError(400, 'Unknown date range.');
    const days = RANGE_PRESETS[preset];
    return { preset, from: days ? new Date(Date.now() - days * DAY_MS) : null, to: null };
  }
  const from = input.from ? new Date(input.from) : null;
  const to = input.to ? new Date(input.to) : null;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) throw new HttpError(400, 'Invalid date.');
  if (from && to && from > to) throw new HttpError(400, 'The start date must be before the end date.');
  if (from && (((to || new Date()) - from) / DAY_MS) > QUERY_LIMITS.maxRangeDays) throw new HttpError(400, 'A date range can cover up to 3 years.');
  if (to) to.setUTCHours(23, 59, 59, 999);
  return { preset: 'custom', from, to };
}

function normalizeChartOptions(chart, options = {}) {
  const result = { ...(chart.options || {}) };
  if (options.groupBy !== undefined) {
    if (!GROUP_BY[options.groupBy]) throw new HttpError(400, 'Unknown group-by.');
    result.groupBy = options.groupBy;
  }
  if (options.limit !== undefined) {
    const limit = Number.parseInt(options.limit, 10);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, 'A chart limit must be 1-100.');
    result.limit = limit;
  }
  if (options.studentId !== undefined) {
    const studentId = String(options.studentId || '');
    if (studentId && !/^[a-f0-9]{24}$/i.test(studentId)) throw new HttpError(400, 'Unknown student.');
    result.studentId = studentId;
  }
  return result;
}

/** `module` is the analysis area: 'all' or one licensed module. */
export function validatePrepAnalysisQuery(body = {}, permissions) {
  const modules = new Set(allowedModules(permissions));
  const area = String(body.module || 'coding');
  if (area !== 'all' && (!MODULES[area] || area === 'student')) throw new HttpError(400, 'Unknown analysis area.');
  if (area !== 'all' && !modules.has(area)) throw new HttpError(403, `${MODULES[area].label} is not enabled for this university.`);
  const filter = normalizeFilterTree(body.filter, { allowedModules: modules });
  const rank = normalizeRankCuts(body.rank, { allowedModules: modules });

  const requested = Array.isArray(body.charts) ? body.charts : (DEFAULT_LAYOUT[area] || []).map((id) => ({ id }));
  if (requested.length > QUERY_LIMITS.maxCharts) throw new HttpError(400, `Up to ${QUERY_LIMITS.maxCharts} charts can be shown at once.`);
  const charts = requested
    .map((entry) => ({ entry, chart: CHART_BY_ID.get(String(entry?.id || '')) }))
    .filter(({ entry, chart }) => {
      if (!chart) throw new HttpError(400, `Unknown chart: ${entry?.id}`);
      // A default layout can name charts of an unlicensed area; they are skipped, never shown.
      return modules.has(chart.module) && (area === 'all' || chart.module === area);
    })
    .map(({ entry, chart }) => ({
      id: chart.id,
      filter: normalizeFilterTree(entry.filter, { allowedModules: modules }),
      options: normalizeChartOptions(chart, entry.options),
    }));

  const table = body.table || {};
  const sort = (TABLE_SORTS[table.sort] || table.sort === 'name') ? table.sort : DEFAULT_SORT[area];
  return {
    module: area,
    modules,
    parts: interviewParts(permissions),
    range: normalizeRange(body.range),
    filter,
    rank,
    charts,
    table: {
      sort,
      direction: table.direction === 'asc' ? 'asc' : 'desc',
      page: Math.max(1, Number.parseInt(table.page, 10) || 1),
      limit: Math.min(QUERY_LIMITS.maxTableLimit, Math.max(1, Number.parseInt(table.limit, 10) || 25)),
    },
    refresh: body.refresh === true,
  };
}

// ---------------------------------------------------------------- context cache

const contextCache = new Map();

function cacheKey(user, range, modules, parts) {
  const scope = user?.role === 'coordinator' && user.coordinatorDataScope !== 'all' ? `c:${user.coordinatorId}` : user?.role === 'coordinator' ? `ca:${user.coordinatorId}` : 'all';
  const period = range.preset === 'custom' ? `${range.from?.toISOString() || ''}..${range.to?.toISOString() || ''}` : range.preset;
  return `${scope}|${period}|${[...modules].sort().join(',')}|${parts.peer ? 'p' : ''}${parts.ai ? 'a' : ''}`;
}

async function buildContext(user, range, modules, parts) {
  const cohort = await loadCohort(user);
  const studentIds = cohort.students.map((student) => String(student._id));
  const empty = { byStudent: new Map(), days: new Map(), problems: new Map(), topics: new Map() };
  const [coding, learning, quickprep, assessment, interview] = await Promise.all([
    modules.has('coding') ? loadCodingFacts({ studentIds, range }) : empty,
    modules.has('learning') ? loadLearningFacts({ studentIds, range }) : null,
    // Quick Prep sheets are part of Prep Coding.
    modules.has('coding') ? loadQuickPrepFacts({ studentIds, range }) : null,
    modules.has('assessment') ? loadAssessmentFacts({ user, studentIds, range }) : null,
    modules.has('interview') ? loadInterviewFacts({ studentIds, range, ...parts }) : null,
  ]);
  const rows = buildStudentRows({
    students: cohort.students, facts: coding, problems: coding.problems, batchNames: cohort.batchNames, learning, quickprep, assessment, interview, range,
    scoreFeatures: { coding: modules.has('coding'), learning: modules.has('learning'), interview: modules.has('interview'), assessment: modules.has('assessment') },
  });
  return {
    rows, topics: coding.topics, batchNames: cohort.batchNames, truncated: cohort.truncated, loadedAt: new Date(),
    curriculum: learning?.curriculum || [], sheets: quickprep?.sheets || new Map(), tests: assessment?.tests || new Map(),
  };
}

/** Cohort rows for a period, shared by every filter change for 60 s (concurrent callers share one load). */
export async function getAnalysisContext(user, range, { refresh = false, modules = new Set(['coding']), parts = { peer: true, ai: true } } = {}) {
  const key = cacheKey(user, range, modules, parts);
  const cached = contextCache.get(key);
  if (!refresh && cached && Date.now() - cached.at < QUERY_LIMITS.cacheTtlMs) return cached.promise;
  const promise = buildContext(user, range, modules, parts);
  contextCache.set(key, { at: Date.now(), promise });
  promise.catch(() => contextCache.delete(key));
  while (contextCache.size > QUERY_LIMITS.cacheEntries) contextCache.delete(contextCache.keys().next().value);
  return promise;
}

export function clearPrepAnalysisCache() { contextCache.clear(); }

// ---------------------------------------------------------------- queries

function selectRows(rows, filter, rank) {
  return applyRankCuts(rows.filter((row) => evaluateFilterTree(filter, row)), rank);
}

function tableRow(row, position) {
  return {
    id: row.id, name: row.name, studentId: row.studentId, email: row.email,
    semester: row.student.semester, branch: row.student.branch, course: row.student.course, group: row.student.group, college: row.student.college,
    position,
    prepScore: row.coding.prepScore, points: row.coding.points,
    solved: row.coding.solved, accuracy: row.coding.accuracy, submissions: row.coding.submissions,
    activeDays: row.coding.activeDays, daysSinceActive: row.coding.daysSinceActive, practiceStatus: row.coding.practiceStatus,
    languages: row.coding.languages,
    learning: row.learning ? {
      progress: row.learning.progress, completedTopics: row.learning.completedTopics, availableTopics: row.learning.availableTopics,
      videoMinutes: row.learning.videoMinutes, status: row.learning.status, daysSinceActive: row.learning.daysSinceActive,
    } : null,
    quickprep: row.quickprep ? {
      progress: row.quickprep.progress, started: row.quickprep.started, finished: row.quickprep.finished, solved: row.quickprep.solved,
      status: row.quickprep.status, daysSinceActive: row.quickprep.daysSinceActive,
    } : null,
    interview: row.interview ? {
      done: row.interview.done, mockDone: row.interview.mockDone, mockScore: row.interview.mockScore, aiCompleted: row.interview.aiCompleted,
      scheduled: row.interview.scheduled, status: row.interview.status, daysSinceActive: row.interview.daysSinceActive,
    } : null,
    assessment: row.assessment ? {
      taken: row.assessment.taken, passed: row.assessment.passed, missed: row.assessment.missed, averageScore: row.assessment.averageScore,
      bestScore: row.assessment.bestScore, status: row.assessment.status, daysSinceActive: row.assessment.daysSinceActive,
    } : null,
    scores: {
      total: row.scores?.total ?? 0,
      features: Object.fromEntries(Object.entries(row.scores?.features || {}).map(([key, feature]) => [key, feature.score])),
    },
  };
}

/** Rows of the student table. `position` is the place within the students in view, by the area's measure. */
function studentTable(rows, table, area) {
  const positions = competitionRanks(rows, POSITION_BY[area] || POSITION_BY.coding);
  const direction = table.direction === 'asc' ? 1 : -1;
  const sorter = table.sort === 'name'
    ? (left, right) => direction * left.name.localeCompare(right.name)
    : (left, right) => direction * (TABLE_SORTS[table.sort](left, area) - TABLE_SORTS[table.sort](right, area)) || left.name.localeCompare(right.name);
  const sorted = [...rows].sort(sorter);
  const start = (table.page - 1) * table.limit;
  return {
    total: rows.length, page: table.page, limit: table.limit, sort: table.sort, direction: table.direction,
    rows: sorted.slice(start, start + table.limit).map((row) => tableRow(row, positions.get(row))),
  };
}

export async function runPrepAnalysis({ user, query }) {
  const context = await getAnalysisContext(user, query.range, { refresh: query.refresh, modules: query.modules, parts: query.parts });
  const selected = selectRows(context.rows, query.filter, query.rank);
  const charts = query.charts.map(({ id, filter, options }) => {
    const chart = CHART_BY_ID.get(id);
    const rows = filter.children.length ? selected.filter((row) => evaluateFilterTree(filter, row)) : selected;
    const data = chart.build({ rows, options, range: query.range, topics: context.topics, sheets: context.sheets, tests: context.tests });
    return {
      id, module: chart.module, section: chart.section, type: chart.type, size: chart.size, title: chart.title, question: chart.question,
      options, filtered: filter.children.length > 0, studentCount: rows.length, data,
    };
  });
  return {
    meta: {
      version: PREP_SCORE_VERSION,
      generatedAt: new Date().toISOString(),
      dataLoadedAt: context.loadedAt.toISOString(),
      module: query.module,
      range: { preset: query.range.preset, from: query.range.from?.toISOString() || null, to: query.range.to?.toISOString() || null },
      cohortSize: context.rows.length,
      matched: selected.length,
      truncated: context.truncated,
      formula: PREP_SCORE_FORMULA,
    },
    kpiGroups: buildKpiGroups(query.module, query.modules, selected),
    charts,
    students: studentTable(selected, query.table, query.module),
  };
}

/** A CSV / Excel / PDF file of every student matching the filters, in the table's order. */
export async function exportPrepAnalysis({ user, query, options }) {
  const context = await getAnalysisContext(user, query.range, { modules: query.modules, parts: query.parts });
  const selected = selectRows(context.rows, query.filter, query.rank);
  const sortKey = TABLE_SORTS[query.table.sort] ? query.table.sort : DEFAULT_SORT[query.module];
  const direction = query.table.direction === 'asc' ? 1 : -1;
  const ordered = [...selected].sort((left, right) => direction * (TABLE_SORTS[sortKey](left, query.module) - TABLE_SORTS[sortKey](right, query.module)) || left.name.localeCompare(right.name));
  const report = buildReport({
    rows: ordered, columns: options.columns, summary: options.summary, query,
    cohortSize: context.rows.length, positionOf: POSITION_BY[query.module] || POSITION_BY.coding,
  });
  const type = EXPORT_TYPES[options.format];
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    buffer: await type.render(report),
    contentType: type.contentType,
    filename: `prep-analysis-${query.module}-${stamp}.${type.extension}`,
    rowCount: report.rows.length,
  };
}

export async function countPrepAnalysis({ user, query }) {
  const context = await getAnalysisContext(user, query.range, { modules: query.modules, parts: query.parts });
  return { cohortSize: context.rows.length, matched: selectRows(context.rows, query.filter, query.rank).length };
}

// ---------------------------------------------------------------- one student's profile

const VERDICT_LABELS = Object.freeze({ AC: 'Accepted', WA: 'Wrong answer', TLE: 'Too slow', RE: 'Crashed', CE: 'Did not compile' });
const PROFILE_LIMITS = Object.freeze({ topics: 15, unsolved: 8 });

/** Per-topic figures from one student's own submissions, most-practised first. */
function topicBreakdown(row) {
  const topics = new Map();
  for (const entry of row.entries) {
    for (const name of entry.meta.topics.length ? entry.meta.topics : entry.meta.tags) {
      const topic = topics.get(name) || { name, attempted: new Set(), solved: new Set(), submissions: 0, accepted: 0 };
      topic.attempted.add(entry.problemId);
      if (entry.accepted > 0) topic.solved.add(entry.problemId);
      topic.submissions += entry.attempts;
      topic.accepted += entry.accepted;
      topics.set(name, topic);
    }
  }
  return [...topics.values()]
    .map((topic) => ({ name: topic.name, solved: topic.solved.size, attempted: topic.attempted.size, accuracy: topic.submissions ? Math.round((topic.accepted / topic.submissions) * 100) : 0 }))
    .sort((left, right) => right.attempted - left.attempted || right.solved - left.solved || left.name.localeCompare(right.name))
    .slice(0, PROFILE_LIMITS.topics);
}

/** Problems tried in any language but never accepted, most attempts first. */
function unsolvedProblems(row) {
  const problems = new Map();
  for (const entry of row.entries) {
    const problem = problems.get(entry.problemId) || { title: entry.meta.title, difficulty: entry.meta.difficulty, attempts: 0, accepted: 0 };
    problem.attempts += entry.attempts;
    problem.accepted += entry.accepted;
    problems.set(entry.problemId, problem);
  }
  return [...problems.values()].filter((problem) => problem.accepted === 0)
    .sort((left, right) => right.attempts - left.attempts || left.title.localeCompare(right.title))
    .slice(0, PROFILE_LIMITS.unsolved)
    .map((problem) => ({ title: problem.title, difficulty: problem.difficulty, attempts: problem.attempts }));
}

function codingProfile(row, range) {
  const verdicts = { AC: 0, WA: 0, TLE: 0, RE: 0, CE: 0 };
  const languages = new Map();
  for (const entry of row.entries) {
    for (const key of Object.keys(verdicts)) verdicts[key] += entry.verdicts?.[key] || 0;
    languages.set(entry.language, (languages.get(entry.language) || 0) + entry.attempts);
  }
  const daily = new Map([...row.days.entries()].map(([day, value]) => [day, value.attempts]));
  const { coding } = row;
  return {
    prepScore: coding.prepScore, points: coding.points, progress: coding.progress,
    solved: coding.solved, targets: SOLVE_TARGETS, accuracy: coding.accuracy,
    submissions: coding.submissions, accepted: coding.accepted, attempted: coding.attempted,
    activeDays: coding.activeDays, daysSinceActive: coding.daysSinceActive, practiceStatus: coding.practiceStatus,
    languages: [...languages.entries()].sort((left, right) => right[1] - left[1]).map(([language, submissions]) => ({ language, submissions })),
    verdicts: Object.entries(verdicts).filter(([, value]) => value > 0).map(([key, value]) => ({ key, name: VERDICT_LABELS[key], value })),
    topics: topicBreakdown(row),
    unsolved: unsolvedProblems(row),
    calendar: calendarPayload(daily, range, 'submissions'),
  };
}

function quickPrepProfile(row, sheets) {
  const { quickprep } = row;
  const started = [...quickprep.bySheet.values()].map((entry) => ({
    id: entry.sheetId, title: sheets.get(entry.sheetId)?.title || 'Sheet',
    solved: entry.solved, total: entry.total, finished: Boolean(entry.finished),
    progress: entry.total ? Math.round((entry.solved / entry.total) * 100) : 0,
    lastViewedAt: entry.lastViewedAt ? new Date(entry.lastViewedAt).toISOString() : null,
  })).sort((left, right) => right.progress - left.progress || left.title.localeCompare(right.title));
  const notStarted = [...sheets.values()]
    .filter((sheet) => sheet.published && sheetVisibleTo(sheet, row.student.semester) && !quickprep.bySheet.has(sheet.id))
    .map((sheet) => sheet.title).sort((left, right) => left.localeCompare(right));
  return {
    status: quickprep.status, progress: quickprep.progress, solved: quickprep.solved, total: quickprep.total,
    finished: quickprep.finished, daysSinceActive: quickprep.daysSinceActive, sheets: started, notStarted,
  };
}

function learningProfile(row, range) {
  const { learning } = row;
  return {
    status: learning.status, progress: learning.progress, completedTopics: learning.completedTopics, availableTopics: learning.availableTopics,
    videoMinutes: learning.videoMinutes, daysSinceActive: learning.daysSinceActive,
    subjects: [...learning.bySubject.entries()].filter(([, subject]) => subject.total > 0)
      .map(([name, subject]) => ({ name, completed: Math.min(subject.completed, subject.total), total: subject.total, progress: Math.round((Math.min(subject.completed, subject.total) / subject.total) * 100) }))
      .sort((left, right) => right.progress - left.progress || left.name.localeCompare(right.name)),
    calendar: calendarPayload(learning.days, range, 'topics completed'),
  };
}

function interviewProfile(row, range) {
  const { interview } = row;
  return {
    status: interview.status, done: interview.done, mockDone: interview.mockDone, mockScore: interview.mockScore, bestMockScore: interview.bestMockScore,
    lastMockScore: interview.lastMockScore, given: interview.given, scheduled: interview.scheduled, aiStarted: interview.aiStarted, aiCompleted: interview.aiCompleted,
    daysSinceActive: interview.daysSinceActive,
    ratings: RATINGS.map(({ key, label }) => ({ key, label, value: interview.ratings[key] })),
    mocks: [...interview.mocks].reverse().slice(0, 10).map((mock) => ({ score: mock.score, at: new Date(mock.at).toISOString() })),
    calendar: calendarPayload(interview.days, range, 'interviews'),
  };
}

function assessmentProfile(row, tests, range) {
  const { assessment } = row;
  return {
    status: assessment.status, taken: assessment.taken, passed: assessment.passed, failed: assessment.failed, missed: assessment.missed,
    averageScore: assessment.averageScore, bestScore: assessment.bestScore, lastScore: assessment.lastScore, passRate: assessment.passRate,
    minutes: assessment.minutes, daysSinceActive: assessment.daysSinceActive, passPercent: PASS_PERCENT,
    tests: [...assessment.byTest.values()].sort((left, right) => new Date(right.at) - new Date(left.at)).map((attempt) => ({
      id: attempt.testId, title: tests.get(attempt.testId)?.title || 'Test', percent: attempt.percent, score: attempt.score, maxMarks: attempt.maxMarks,
      passed: attempt.percent >= PASS_PERCENT, at: new Date(attempt.at).toISOString(),
    })),
    missedTests: assessment.missedIds.map((id) => tests.get(id)?.title || 'Test'),
    calendar: calendarPayload(assessment.days, range, 'tests taken'),
  };
}

/** One student's profile from their row: only their own work, never compared with anyone else. */
export function buildStudentProfile(row, { range, modules, sheets = new Map(), tests = new Map() }) {
  const { semester, course, branch, college, group, batchNames, status } = row.student;
  return {
    range: { preset: range.preset, from: range.from?.toISOString() || null, to: range.to?.toISOString() || null },
    student: { id: row.id, name: row.name, studentId: row.studentId, email: row.email, semester, course, branch, college, group, batchNames, status },
    coding: modules.has('coding') ? codingProfile(row, range) : null,
    quickprep: modules.has('coding') && row.quickprep ? quickPrepProfile(row, sheets) : null,
    learning: modules.has('learning') && row.learning ? learningProfile(row, range) : null,
    interview: modules.has('interview') && row.interview ? interviewProfile(row, range) : null,
    assessment: modules.has('assessment') && row.assessment ? assessmentProfile(row, tests, range) : null,
    prepScore: row.scores || { total: 0, features: {} },
    formula: PREP_SCORE_FORMULA,
  };
}

/** Everything Prep Analysis knows about one student in the admin's own scope, for the period. */
export async function getStudentProfile({ user, permissions, studentId, range: rangeInput }) {
  if (!/^[a-f0-9]{24}$/i.test(String(studentId || ''))) throw new HttpError(400, 'Unknown student.');
  const modules = new Set(allowedModules(permissions));
  const range = normalizeRange(rangeInput);
  const context = await getAnalysisContext(user, range, { modules, parts: interviewParts(permissions) });
  const row = context.rows.find((entry) => entry.id === String(studentId));
  if (!row) throw new HttpError(404, 'This student is not in your list.');
  return buildStudentProfile(row, { range, modules, sheets: context.sheets, tests: context.tests });
}

// ---------------------------------------------------------------- option lists

const OPTION_LIMIT = 60;
const QUALIFIER_LISTS = { topics: 'coding', tags: 'coding', companies: 'coding', languages: 'coding', difficulties: 'coding', subjects: 'learning', sheets: 'coding', tests: 'assessment' };

function distinctFromRows(rows, read) {
  const counts = new Map();
  for (const row of rows) {
    const values = [].concat(read(row) ?? []);
    for (const value of values) if (value !== '' && value !== null && value !== undefined) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ value, label: String(value), count }));
}

/** Values for one field's picker, searched by `q`. Dynamic lists come from the admin's own cohort. */
export async function listFieldOptions({ user, permissions, optionsKey, q = '' }) {
  const modules = new Set(allowedModules(permissions));
  const owner = [...FIELDS.values()].find((field) => field.options === optionsKey);
  if (!owner && !QUALIFIER_LISTS[optionsKey] && optionsKey !== 'students') throw new HttpError(400, 'Unknown option list.');
  const module = owner?.module || QUALIFIER_LISTS[optionsKey] || 'student';
  if (!modules.has(module)) throw new HttpError(403, 'This option list belongs to a module that is not enabled.');
  const needle = String(q || '').trim().toLowerCase().slice(0, 80);
  const context = () => getAnalysisContext(user, normalizeRange({ preset: 'all' }), { modules, parts: interviewParts(permissions) });

  let options;
  if (STATIC_OPTIONS[optionsKey]) {
    options = STATIC_OPTIONS[optionsKey];
  } else if (optionsKey === 'students') {
    // Most active students first, so pickers open on useful names.
    const { rows } = await context();
    options = [...rows]
      .filter((row) => !needle || `${row.name} ${row.studentId} ${row.email}`.toLowerCase().includes(needle))
      .sort((left, right) => right.coding.prepScore - left.coding.prepScore || left.name.localeCompare(right.name))
      .map((row) => ({ value: row.id, label: row.studentId ? `${row.name} · ${row.studentId}` : row.name }));
    return { options: options.slice(0, OPTION_LIMIT), total: options.length };
  } else if (['courses', 'branches', 'colleges', 'groups', 'coordinators', 'batches'].includes(optionsKey)) {
    const { rows, batchNames } = await context();
    const readers = {
      courses: (row) => row.student.course, branches: (row) => row.student.branch,
      colleges: (row) => row.student.college, groups: (row) => row.student.group,
      coordinators: (row) => row.student.coordinators, batches: (row) => row.student.batches,
    };
    options = distinctFromRows(rows, readers[optionsKey]);
    if (optionsKey === 'batches') options = options.map((option) => ({ ...option, label: batchNames.get(option.value) || 'Upload list' }));
    if (optionsKey === 'coordinators' && options.length) {
      const coordinators = await User.find({ role: 'coordinator', coordinatorId: { $in: options.map((option) => option.value) } }).select('coordinatorId name').lean();
      const names = new Map(coordinators.map((coordinator) => [coordinator.coordinatorId, coordinator.name]));
      options = options.map((option) => ({ ...option, label: names.get(option.value) ? `${names.get(option.value)} (${option.value})` : option.value }));
    }
    options.sort((left, right) => String(left.label).localeCompare(String(right.label), undefined, { numeric: true }));
  } else if (optionsKey === 'subjects') {
    const { curriculum } = await context();
    options = [...new Set(curriculum.flatMap((semester) => semester.subjects.filter((subject) => subject.topics > 0).map((subject) => subject.name)))]
      .sort((left, right) => left.localeCompare(right)).map((name) => ({ value: name, label: name }));
  } else if (optionsKey === 'tests') {
    const { tests } = await context();
    options = [...tests.values()].sort((left, right) => new Date(right.startTime || 0) - new Date(left.startTime || 0) || left.title.localeCompare(right.title))
      .map((test) => ({ value: test.id, label: test.title }));
  } else if (optionsKey === 'sheets') {
    const { sheets } = await context();
    options = [...sheets.values()].filter((sheet) => sheet.published).sort((left, right) => left.title.localeCompare(right.title)).map((sheet) => ({ value: sheet.id, label: sheet.title }));
  } else if (optionsKey === 'topics') {
    const topics = await CodingTopic.find({ status: 'active' }).select('name parentId').sort({ depth: 1, displayOrder: 1, name: 1 }).lean();
    options = topics.map((topic) => ({ value: topic.name, label: topic.name, parent: Boolean(topic.parentId) }));
  } else if (optionsKey === 'tags' || optionsKey === 'companies') {
    const values = await Problem.distinct(optionsKey === 'tags' ? 'tags' : 'companyTags', { status: { $in: ['published', 'Active', 'active'] } });
    options = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].sort().map((value) => ({ value, label: value }));
  } else {
    throw new HttpError(400, 'Unknown option list.');
  }

  const filtered = needle ? options.filter((option) => String(option.label).toLowerCase().includes(needle)) : options;
  return { options: filtered.slice(0, OPTION_LIMIT), total: filtered.length };
}

export { CHARTS };
