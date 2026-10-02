import mongoose from 'mongoose';
import { HttpError } from '../../utils/errors.js';

export const ANALYTICS_LIMITS = Object.freeze({
  maxCohort: 5000,
  maxIdsPerFilter: 5000,
  maxInteractiveRows: 100000,
  maxDateSpanDays: 366,
  maxHeatmapStudents: 50,
  maxHeatmapTopics: 30,
  maxScatterPoints: 500,
  maxGraphs: 15,
  maxOptionPageSize: 100,
});

export const GRAPH_IDS = Object.freeze([
  'activity-trend', 'student-ranking', 'topic-student-heatmap', 'topic-performance',
  'difficulty-analysis', 'assessment-topic-analysis', 'skill-radar', 'mastery-funnel',
  'performance-distribution', 'cohort-comparison', 'assessment-score-trend',
  'learning-hierarchy', 'question-conversion', 'engagement-calendar', 'score-effort-scatter',
]);

const SOURCE_VALUES = new Set(['coding', 'assessment', 'learning']);
const COMPARISONS = new Set(['none', 'semester', 'branch', 'course', 'group', 'college', 'uploadBatch', 'assessment', 'learningSubject', 'topic']);
const RANK_METRICS = new Set(['overall', 'coding', 'assessment', 'learning', 'consistency']);

function uniqueStrings(value, max = ANALYTICS_LIMITS.maxIdsPerFilter) {
  const values = Array.isArray(value) ? value : (value === undefined || value === null || value === '' ? [] : [value]);
  if (values.length > max) throw new HttpError(400, `A filter may contain at most ${max} values.`);
  return [...new Set(values.map((entry) => String(entry).trim()).filter(Boolean))];
}

function objectIds(value, label) {
  const values = uniqueStrings(value);
  values.forEach((id) => {
    if (!mongoose.isValidObjectId(id)) throw new HttpError(400, `Invalid ${label}.`);
  });
  return values;
}

function safeDate(value, label, fallback) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `Invalid ${label}.`);
  return date;
}

function normalizeSources(body) {
  const raw = body.activity?.sources || body.sources || body.activitySources || body.source || ['coding', 'assessment', 'learning'];
  const values = uniqueStrings(raw).map((entry) => entry.toLowerCase() === 'assessments' ? 'assessment' : entry.toLowerCase());
  const expanded = values.includes('all') ? [...SOURCE_VALUES] : values;
  if (!expanded.length || expanded.some((entry) => !SOURCE_VALUES.has(entry))) {
    throw new HttpError(400, 'Sources must contain coding, assessment, or learning.');
  }
  return expanded;
}

export function validateAnalyticsQuery(input = {}, { estimate = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Analytics query must be an object.');
  const population = input.population || {};
  const activity = input.activity || {};
  const coding = input.coding || activity.coding || {};
  const assessments = input.assessments || input.assessment || activity.assessments || {};
  const learning = input.learning || activity.learning || {};
  const date = input.date || input.dateRange || {};
  const defaultFrom = new Date();
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
  defaultFrom.setUTCHours(0, 0, 0, 0);
  const defaultTo = new Date();
  const presetDays = /^([0-9]{1,3})d$/.exec(String(activity.datePreset || ''))?.[1];
  if (presetDays && !activity.dateFrom) {
    defaultFrom.setUTCDate(defaultTo.getUTCDate() - (Number(presetDays) - 1));
  }
  const dateFrom = safeDate(activity.dateFrom || date.from || input.dateFrom, 'date from', defaultFrom);
  const dateTo = safeDate(activity.dateTo || date.to || input.dateTo, 'date to', defaultTo);
  dateTo.setUTCHours(23, 59, 59, 999);
  if (dateFrom > dateTo) throw new HttpError(400, 'Date from must be before date to.');
  const spanDays = Math.ceil((dateTo - dateFrom) / 86400000);
  if (spanDays > ANALYTICS_LIMITS.maxDateSpanDays) throw new HttpError(400, `Date range cannot exceed ${ANALYTICS_LIMITS.maxDateSpanDays} days.`);

  const compareBy = String(input.comparison?.compareBy || input.comparison?.by || input.compareBy || 'none');
  if (!COMPARISONS.has(compareBy)) throw new HttpError(400, 'Unsupported comparison dimension.');
  const rankMetric = String(population.rankMetric || population.rank?.metric || input.ranking?.metric || 'overall');
  if (!RANK_METRICS.has(rankMetric)) throw new HttpError(400, 'Unsupported ranking metric.');
  const rankN = Number(population.rankN || population.rank?.n || input.ranking?.n || 25);
  if (!Number.isInteger(rankN) || rankN < 1 || rankN > 250) throw new HttpError(400, 'Ranking N must be between 1 and 250.');
  const rawRankDirection = String(population.rankSegment || population.rank?.direction || input.ranking?.direction || 'top');
  if (!['top', 'bottom'].includes(rawRankDirection)) throw new HttpError(400, 'Ranking direction must be top or bottom.');
  const graphMode = String(input.graphs?.mode || input.graphMode || 'recommended');
  if (!['recommended', 'custom'].includes(graphMode)) throw new HttpError(400, 'Graph mode must be recommended or custom.');
  const graphIds = uniqueStrings(input.graphs?.selectedIds || input.graphs?.ids || input.graphIds, ANALYTICS_LIMITS.maxGraphs);
  if (graphIds.some((id) => !GRAPH_IDS.includes(id))) throw new HttpError(400, 'Unknown graph selection.');
  if (graphMode === 'custom' && !estimate && !graphIds.length) throw new HttpError(400, 'Custom graph mode requires at least one graph.');

  const rawSemesters = uniqueStrings(population.semesters || input.semesters);
  const semesters = rawSemesters.map(Number);
  if (semesters.some((value) => !Number.isInteger(value) || value < 1 || value > 8)) throw new HttpError(400, 'Semester values must be integers from 1 to 8.');
  const rawContext = activity.codingMode || coding.context || 'both';
  if (!['practice', 'assessment', 'both'].includes(rawContext)) throw new HttpError(400, 'Coding mode must be practice, assessment, or both.');
  const rawTimeGrain = input.comparison?.timeGrain || input.timeGrain || 'auto';
  if (!['auto', 'day', 'week', 'month'].includes(rawTimeGrain)) throw new HttpError(400, 'Time grain must be auto, day, week, or month.');
  const statuses = uniqueStrings(population.status || population.statuses);
  if (statuses.some((value) => !['active', 'inactive'].includes(value.toLowerCase()))) throw new HttpError(400, 'Student status must be active or inactive.');
  const verdicts = uniqueStrings(activity.verdicts || coding.statuses);
  if (verdicts.some((value) => !['AC', 'WA', 'TLE', 'RE', 'CE'].includes(value))) throw new HttpError(400, 'Unsupported coding verdict.');
  const setNumbers = uniqueStrings(activity.setNumbers || assessments.setNumbers).map(Number);
  if (setNumbers.some((value) => !Number.isInteger(value) || value < 1 || value > 8)) throw new HttpError(400, 'Assessment set numbers must be integers from 1 to 8.');
  return {
    sources: normalizeSources(input),
    population: {
      studentIds: objectIds(population.studentIds || input.studentIds, 'student ID'),
      semesters,
      groups: uniqueStrings(population.groups || input.groups),
      branches: uniqueStrings(population.branches || input.branches),
      courses: uniqueStrings(population.courses || input.courses),
      colleges: uniqueStrings(population.colleges || input.colleges),
      uploadBatchIds: objectIds(population.uploadBatchIds || input.uploadBatchIds, 'upload batch ID'),
      statuses,
      activeOnly: population.activeOnly === true,
      rank: {
        metric: rankMetric,
        direction: rawRankDirection,
        n: rankN,
        minimumEvidence: population.minimumEvidence !== false && population.rank?.minimumEvidence !== false && input.ranking?.minimumEvidence !== false,
      },
    },
    date: { from: dateFrom, to: dateTo, spanDays: Math.max(spanDays, 1) },
    coding: {
      problemIds: objectIds(activity.problemIds || coding.problemIds, 'problem ID'),
      assessmentIds: objectIds(activity.assessmentIds || coding.assessmentIds, 'assessment ID'),
      topics: uniqueStrings(activity.codingTopics || coding.topics || coding.tags),
      difficulties: uniqueStrings(activity.difficulties || coding.difficulties),
      languages: uniqueStrings(activity.languages || coding.languages),
      statuses: verdicts,
      context: rawContext,
    },
    assessments: {
      ids: objectIds(activity.assessmentIds || assessments.ids || assessments.assessmentIds || input.assessmentIds, 'assessment ID'),
      types: uniqueStrings(activity.assessmentTypes || assessments.types),
      questionTypes: uniqueStrings(activity.questionTypes || assessments.questionTypes),
      sections: uniqueStrings(activity.sections || assessments.sections),
      topics: uniqueStrings(activity.assessmentTopics || assessments.topics),
      setNumbers,
      completedOnly: assessments.completedOnly !== false,
    },
    learning: {
      semesterIds: objectIds(learning.semesterIds, 'learning semester ID'),
      subjectIds: objectIds(activity.subjectIds || learning.subjectIds, 'learning subject ID'),
      chapterIds: objectIds(activity.chapterIds || learning.chapterIds, 'learning chapter ID'),
      topicIds: objectIds(activity.learningTopicIds || learning.topicIds, 'learning topic ID'),
      difficulties: uniqueStrings(activity.difficulties || learning.difficulties),
    },
    comparison: { by: compareBy },
    timeGrain: rawTimeGrain,
    scoreMode: (input.comparison?.scoreMode || input.scoreMode) === 'absolute' ? 'absolute' : 'percentage',
    graphs: { mode: graphMode, ids: graphIds },
  };
}

export function validateOptionsQuery(query = {}) {
  const aliases = { studentIds: 'students', uploadBatchIds: 'upload-batches', codingTopics: 'coding-topics', subjectIds: 'learning-subjects', chapterIds: 'learning-chapters', learningTopicIds: 'learning-topics', assessmentIds: 'assessments', problemIds: 'problems' };
  const allowed = new Set(['students', 'assessments', 'upload-batches', 'problems', 'coding-topics', 'learning-subjects', 'learning-chapters', 'learning-topics', 'semesters', 'branches', 'courses', 'groups', 'colleges', 'status', 'difficulties', 'languages', 'verdicts', 'assessmentTypes', 'questionTypes', 'sections', 'assessmentTopics', 'setNumbers']);
  const requestedType = String(query.type || 'students');
  const type = aliases[requestedType] || requestedType;
  if (!allowed.has(type)) throw new HttpError(400, 'Unsupported option type.');
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 25, 1), ANALYTICS_LIMITS.maxOptionPageSize);
  const cursor = Math.max(Number.parseInt(query.cursor, 10) || 0, 0);
  const q = String(query.q || '').trim().slice(0, 100);
  let dependencies = {};
  if (query.dependencies) {
    try { dependencies = typeof query.dependencies === 'string' ? JSON.parse(query.dependencies) : query.dependencies; }
    catch { throw new HttpError(400, 'Invalid option dependencies.'); }
  }
  return { type, limit, cursor, q, dependencies };
}
