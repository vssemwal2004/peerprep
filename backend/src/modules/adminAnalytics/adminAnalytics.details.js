import crypto from 'crypto';
import { HttpError } from '../../utils/errors.js';
import { FORMULA_VERSION } from './analyticsFormulas.js';
import { analyticsAuthorizationScope, withAdminAnalyticsCache } from './adminAnalytics.cache.js';
import { buildAnalyticsGraphs } from './analyticsRegistry.js';
import { collectAnalyticsContext, fingerprintQuery } from './adminAnalytics.service.js';
import { GRAPH_IDS, validateAnalyticsQuery } from './adminAnalytics.validation.js';

const SORT_FIELDS = Object.freeze({
  'activity-trend': ['bucket', 'codingSolved', 'learningCompleted', 'assessmentsAttempted'],
  'student-ranking': ['name', 'studentCode', 'value'],
  'topic-student-heatmap': ['name', 'studentId'],
  'topic-performance': ['topic', 'source', 'attempts', 'participants', 'completed', 'rate'],
  'difficulty-analysis': ['topic', 'Easy', 'Medium', 'Hard'],
  'assessment-topic-analysis': ['topic', 'participants', 'score'],
  'skill-radar': ['label', 'score', 'students'],
  'mastery-funnel': ['stage', 'value', 'rate'],
  'performance-distribution': ['label', 'count'],
  'cohort-comparison': ['label', 'students', 'value'],
  'assessment-score-trend': ['title', 'average', 'median', 'participants', 'participationRate'],
  'learning-hierarchy': ['label', 'topics', 'eligiblePairs', 'completedPairs', 'engagedPairs', 'completionRate', 'engagementRate'],
  'question-conversion': ['title', 'attempts', 'attemptedStudents', 'solvedStudents', 'conversionRate'],
  'engagement-calendar': ['date', 'activeStudents'],
  'score-effort-scatter': ['name', 'score', 'effort'],
  'source-mix': ['label', 'value'],
});

const DEFAULT_SORTS = Object.freeze({
  'activity-trend': { by: 'bucket', direction: 'asc' },
  'student-ranking': { by: 'value', direction: 'desc' },
  'topic-student-heatmap': { by: 'name', direction: 'asc' },
  'topic-performance': { by: 'attempts', direction: 'desc' },
  'difficulty-analysis': { by: 'topic', direction: 'asc' },
  'assessment-topic-analysis': { by: 'topic', direction: 'asc' },
  'skill-radar': { by: 'label', direction: 'asc' },
  'mastery-funnel': { by: 'value', direction: 'desc' },
  'performance-distribution': { by: 'label', direction: 'asc' },
  'cohort-comparison': { by: 'value', direction: 'desc' },
  'assessment-score-trend': { by: 'title', direction: 'asc' },
  'learning-hierarchy': { by: 'completionRate', direction: 'desc' },
  'question-conversion': { by: 'conversionRate', direction: 'asc' },
  'engagement-calendar': { by: 'date', direction: 'asc' },
  'score-effort-scatter': { by: 'score', direction: 'desc' },
  'source-mix': { by: 'value', direction: 'desc' },
});

function boundedInteger(value, fallback, min, max, label) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new HttpError(400, `${label} must be an integer from ${min} to ${max}.`);
  return number;
}

export function validateGraphDetailsRequest(graphId, input = {}) {
  if (!GRAPH_IDS.includes(graphId)) throw new HttpError(400, 'Unknown analytics graph.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Graph details request must be an object.');
  const query = validateAnalyticsQuery(input.query || {});
  const page = boundedInteger(input.page, 1, 1, 1000000, 'Page');
  const limit = boundedInteger(input.limit, 25, 1, 100, 'Limit');
  const search = String(input.search || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100);
  const requestedSort = input.sort && typeof input.sort === 'object' ? input.sort : {};
  const fallback = DEFAULT_SORTS[graphId];
  const sort = { by: String(requestedSort.by || fallback.by), direction: String(requestedSort.direction || fallback.direction) };
  if (!SORT_FIELDS[graphId].includes(sort.by)) throw new HttpError(400, 'Unsupported graph detail sort field.');
  if (!['asc', 'desc'].includes(sort.direction)) throw new HttpError(400, 'Graph detail sort direction must be asc or desc.');
  if (input.refresh === true || input.cache?.bypass === true) query.cache.bypass = true;
  return { query, page, limit, search, sort };
}

function rowsAndColumns(graph) {
  if (Array.isArray(graph.data)) return { rows: graph.data, columns: undefined };
  if (Array.isArray(graph.data?.rows)) return { rows: graph.data.rows, columns: graph.data.columns || [] };
  if (Array.isArray(graph.data?.items)) return { rows: graph.data.items, columns: graph.data.columns };
  if (Array.isArray(graph.data?.points)) return { rows: graph.data.points, columns: graph.data.columns };
  return { rows: [], columns: graph.data?.columns };
}

function matchesSearch(row, normalizedSearch) {
  if (!normalizedSearch) return true;
  return JSON.stringify(row).toLocaleLowerCase('en-US').includes(normalizedSearch);
}

function compareValues(left, right) {
  const leftMissing = left === null || left === undefined || left === '';
  const rightMissing = right === null || right === undefined || right === '';
  if (leftMissing || rightMissing) return leftMissing === rightMissing ? 0 : (leftMissing ? 1 : -1);
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), 'en', { numeric: true, sensitivity: 'base' });
}

export function paginateGraphRows(graph, { page, limit, search, sort }) {
  const extracted = rowsAndColumns(graph);
  const needle = search.toLocaleLowerCase('en-US');
  const rows = extracted.rows.map((row, index) => ({ row, index }))
    .filter(({ row }) => matchesSearch(row, needle))
    .sort((left, right) => {
      const result = compareValues(left.row?.[sort.by], right.row?.[sort.by]);
      return (sort.direction === 'desc' ? -result : result) || left.index - right.index;
    });
  const totalRows = rows.length;
  const totalPages = totalRows ? Math.ceil(totalRows / limit) : 0;
  const offset = (page - 1) * limit;
  return {
    columns: extracted.columns,
    rows: rows.slice(offset, offset + limit).map((entry) => entry.row),
    pagination: {
      page, limit, totalRows, totalPages,
      hasPrevious: page > 1 && totalRows > 0,
      hasNext: page < totalPages,
    },
  };
}

export function buildGraphDetailsCacheKey(baseFingerprint, graphId, options) {
  const digest = crypto.createHash('sha256').update(JSON.stringify({
    kind: 'graph-details-v1', baseFingerprint, graphId,
    page: options.page, limit: options.limit, search: options.search.toLocaleLowerCase('en-US'), sort: options.sort,
  })).digest('hex');
  return `details:${digest}`;
}

async function executeGraphDetailsUncached({ user, graphId, options }) {
  const context = await collectAnalyticsContext({ user, query: options.query });
  let graph;
  let detail;
  if (graphId === 'topic-student-heatmap') {
    const needle = options.search.toLocaleLowerCase('en-US');
    const multiplier = options.sort.direction === 'desc' ? -1 : 1;
    const matchedStudents = context.students.map((student, index) => ({ student, index }))
      .filter(({ student }) => !needle || JSON.stringify({ name: student.name, studentId: student.studentId, email: student.email }).toLocaleLowerCase('en-US').includes(needle))
      .sort((left, right) => {
        const result = compareValues(left.student?.[options.sort.by], right.student?.[options.sort.by]);
        return result * multiplier || left.index - right.index;
      });
    const offset = (options.page - 1) * options.limit;
    const pageStudents = matchedStudents.slice(offset, offset + options.limit).map((entry) => entry.student);
    graph = buildAnalyticsGraphs({ ...context, students: pageStudents, query: options.query, detailMode: true }, [graphId])[0];
    const available = graph.status === 'ready' || graph.status === 'partial';
    const totalRows = available ? matchedStudents.length : 0;
    const totalPages = totalRows ? Math.ceil(totalRows / options.limit) : 0;
    detail = {
      columns: graph.data?.columns || [],
      rows: available ? (graph.data?.rows || []) : [],
      pagination: {
        page: options.page, limit: options.limit, totalRows, totalPages,
        hasPrevious: options.page > 1 && totalRows > 0,
        hasNext: options.page < totalPages,
      },
    };
  } else {
    graph = buildAnalyticsGraphs({ ...context, query: options.query }, [graphId])[0];
    detail = paginateGraphRows(graph, options);
  }
  const queryFingerprint = fingerprintQuery(options.query, user);
  return {
    meta: {
      formulaVersion: FORMULA_VERSION,
      generatedAt: new Date().toISOString(),
      timezone: 'UTC',
      queryFingerprint,
      graphId,
      cohortSize: context.students.length,
      baseCohortSize: context.cohort.baseSize,
      selectionMode: options.query.population.selectionMode,
      analysisType: options.query.analysisType,
    },
    graph: {
      id: graph.id,
      title: graph.title,
      status: graph.status,
      reason: graph.reason,
      note: graph.note,
      config: graph.config || {},
      ...(detail.columns ? { columns: detail.columns } : {}),
    },
    pagination: detail.pagination,
    rows: detail.rows,
  };
}

export async function executeGraphDetails({ user, graphId, options }) {
  const scopeHash = analyticsAuthorizationScope(user);
  const baseFingerprint = fingerprintQuery(options.query, user);
  return withAdminAnalyticsCache({
    key: buildGraphDetailsCacheKey(baseFingerprint, graphId, options),
    scopeHash,
    bypass: options.query.cache?.bypass === true,
    loader: () => executeGraphDetailsUncached({ user, graphId, options }),
  });
}
