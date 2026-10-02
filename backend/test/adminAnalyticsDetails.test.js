import test from 'node:test';
import assert from 'node:assert/strict';
import adminAnalyticsRouter from '../src/modules/adminAnalytics/adminAnalytics.routes.js';
import { requireAdmin, requireAuth } from '../src/middleware/auth.js';
import {
  buildGraphDetailsCacheKey, paginateGraphRows, validateGraphDetailsRequest,
} from '../src/modules/adminAnalytics/adminAnalytics.details.js';

test('graph details route is POST-only behind shared authentication and admin guards', () => {
  assert.equal(adminAnalyticsRouter.stack[0]?.handle, requireAuth);
  assert.equal(adminAnalyticsRouter.stack[1]?.handle, requireAdmin);
  const layer = adminAnalyticsRouter.stack.find((entry) => entry.route?.path === '/graphs/:graphId/details');
  assert.ok(layer);
  assert.equal(layer.route.methods.post, true);
  assert.equal(layer.route.methods.get, undefined);
});

test('graph details validation normalizes the full query and bounds pagination', () => {
  const value = validateGraphDetailsRequest('student-ranking', {
    query: { mode: 'students', activity: { sources: ['coding'] } },
    page: 3, limit: 100, search: '  Aman\u0000 ', sort: { by: 'value', direction: 'desc' },
  });
  assert.equal(value.query.analysisType, 'students');
  assert.deepEqual(value.query.sources, ['coding']);
  assert.equal(value.page, 3);
  assert.equal(value.limit, 100);
  assert.equal(value.search, 'Aman');
  assert.deepEqual(value.sort, { by: 'value', direction: 'desc' });
  assert.throws(() => validateGraphDetailsRequest('unknown', { query: {} }), /Unknown analytics graph/);
  assert.throws(() => validateGraphDetailsRequest('student-ranking', { query: {}, limit: 101 }), /Limit/);
  assert.throws(() => validateGraphDetailsRequest('student-ranking', { query: {}, sort: { by: '$where' } }), /sort field/);
  assert.throws(() => validateGraphDetailsRequest('student-ranking', { query: {}, sort: { by: 'value', direction: 'sideways' } }), /sort direction/);
});

test('matrix graph details paginate student rows and preserve columns', () => {
  const graph = {
    id: 'topic-student-heatmap',
    data: {
      columns: ['Arrays', 'Graphs'],
      rows: [
        { studentId: '3', name: 'Zoya', cells: [{ topic: 'Arrays', value: 80 }] },
        { studentId: '1', name: 'Aman', cells: [{ topic: 'Arrays', value: 70 }] },
        { studentId: '2', name: 'Bhavya', cells: [{ topic: 'Graphs', value: 60 }] },
        { studentId: '4', name: 'Dev', cells: [{ topic: 'Graphs', value: 50 }] },
      ],
    },
  };
  const result = paginateGraphRows(graph, { page: 2, limit: 2, search: '', sort: { by: 'name', direction: 'asc' } });
  assert.deepEqual(result.columns, ['Arrays', 'Graphs']);
  assert.deepEqual(result.rows.map((row) => row.name), ['Dev', 'Zoya']);
  assert.deepEqual(result.pagination, { page: 2, limit: 2, totalRows: 4, totalPages: 2, hasPrevious: true, hasNext: false });
});

test('detail row search, numeric sorting, and empty out-of-range pages are stable', () => {
  const graph = { id: 'student-ranking', data: [
    { studentId: 'a', name: 'Aman', value: 65 },
    { studentId: 'b', name: 'Bhavya', value: 91 },
    { studentId: 'c', name: 'Amanpreet', value: 78 },
  ] };
  const filtered = paginateGraphRows(graph, { page: 1, limit: 10, search: 'aman', sort: { by: 'value', direction: 'desc' } });
  assert.deepEqual(filtered.rows.map((row) => row.value), [78, 65]);
  assert.equal(filtered.pagination.totalRows, 2);
  const empty = paginateGraphRows(graph, { page: 8, limit: 2, search: '', sort: { by: 'value', direction: 'desc' } });
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.pagination.totalPages, 2);
  assert.equal(empty.pagination.hasNext, false);
});

test('detail cache keys are distinct across graph, page, search, and sort', () => {
  const base = { page: 1, limit: 25, search: '', sort: { by: 'value', direction: 'desc' } };
  const first = buildGraphDetailsCacheKey('query', 'student-ranking', base);
  assert.notEqual(first, buildGraphDetailsCacheKey('query', 'performance-distribution', base));
  assert.notEqual(first, buildGraphDetailsCacheKey('query', 'student-ranking', { ...base, page: 2 }));
  assert.notEqual(first, buildGraphDetailsCacheKey('query', 'student-ranking', { ...base, search: 'aman' }));
  assert.notEqual(first, buildGraphDetailsCacheKey('query', 'student-ranking', { ...base, sort: { by: 'name', direction: 'asc' } }));
});
