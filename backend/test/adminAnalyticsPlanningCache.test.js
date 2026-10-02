import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyticsAuthorizationScope, invalidateAdminAnalyticsCache,
  resetAdminAnalyticsCacheForTests, withAdminAnalyticsCache,
} from '../src/modules/adminAnalytics/adminAnalytics.cache.js';
import { fingerprintQuery } from '../src/modules/adminAnalytics/adminAnalytics.service.js';
import { buildAnalyticsGraphs, planAnalyticsGraphIds } from '../src/modules/adminAnalytics/analyticsRegistry.js';
import { validateAnalyticsQuery } from '../src/modules/adminAnalytics/adminAnalytics.validation.js';

test.beforeEach(() => resetAdminAnalyticsCacheForTests());

test('analysis types plan no more than four relevant default graphs', () => {
  const cases = {
    overview: ['source-mix', 'activity-trend', 'student-ranking', 'performance-distribution'],
    students: ['student-ranking', 'performance-distribution', 'score-effort-scatter', 'engagement-calendar'],
    coding: ['difficulty-analysis', 'question-conversion', 'topic-performance', 'activity-trend'],
    assessment: ['assessment-score-trend', 'performance-distribution', 'student-ranking', 'activity-trend'],
    learning: ['learning-hierarchy', 'topic-performance', 'topic-student-heatmap', 'activity-trend'],
    topics: ['topic-performance', 'topic-student-heatmap', 'difficulty-analysis', 'question-conversion'],
    engagement: ['activity-trend', 'engagement-calendar', 'source-mix', 'score-effort-scatter'],
    comparison: ['cohort-comparison', 'student-ranking', 'performance-distribution', 'source-mix'],
  };
  Object.entries(cases).forEach(([analysisType, expected]) => {
    const ids = planAnalyticsGraphIds({ analysisType, sources: ['coding', 'assessment', 'learning'], comparison: { by: 'none' }, graphs: { mode: 'recommended', ids: [] } });
    assert.deepEqual(ids, expected);
    assert.ok(ids.length <= 4);
  });
});

test('single-source overview and comparison select source-aware graph plans', () => {
  assert.deepEqual(
    planAnalyticsGraphIds({ analysisType: 'overview', sources: ['coding'], comparison: { by: 'none' }, graphs: { mode: 'recommended', ids: [] } }),
    ['difficulty-analysis', 'question-conversion', 'topic-performance', 'activity-trend'],
  );
  assert.equal(
    planAnalyticsGraphIds({ analysisType: 'overview', sources: ['coding'], comparison: { by: 'branch' }, graphs: { mode: 'recommended', ids: [] } })[0],
    'cohort-comparison',
  );
});

test('custom graphs preserve explicit order and validation enforces the four-graph interactive bound', () => {
  const ids = ['engagement-calendar', 'student-ranking', 'activity-trend'];
  assert.deepEqual(planAnalyticsGraphIds({ graphs: { mode: 'custom', ids } }), ids);
  const normalized = validateAnalyticsQuery({ mode: 'coding-performance', graphs: { mode: 'custom', selectedIds: ids } });
  assert.equal(normalized.analysisType, 'coding');
  assert.throws(() => validateAnalyticsQuery({ graphs: { mode: 'custom', selectedIds: ['activity-trend', 'student-ranking', 'topic-performance', 'difficulty-analysis', 'engagement-calendar'] } }), /at most 4 graphs/);
});

test('lazy graph registry returns only planned payloads', () => {
  const query = {
    analysisType: 'coding', sources: ['coding'], date: { spanDays: 30 }, timeGrain: 'day',
    comparison: { by: 'none' }, graphs: { mode: 'recommended', ids: [] },
    population: { studentIds: [], rank: { metric: 'coding', direction: 'top', n: 10, minimumEvidence: true } },
  };
  const planned = planAnalyticsGraphIds(query);
  const graphs = buildAnalyticsGraphs({ students: [], studentMetrics: new Map(), query, coding: null, assessment: null, learning: null }, planned);
  assert.deepEqual(graphs.map((graph) => graph.id), planned);
  assert.equal(graphs.length, 4);
});

test('authorization-aware fingerprints isolate administrators even for identical queries', () => {
  const query = validateAnalyticsQuery({});
  const first = { _id: 'admin-a', role: 'admin' };
  const second = { _id: 'admin-b', role: 'admin' };
  assert.notEqual(analyticsAuthorizationScope(first), analyticsAuthorizationScope(second));
  assert.notEqual(fingerprintQuery(query, first), fingerprintQuery(query, second));
  assert.equal(fingerprintQuery(query, first), fingerprintQuery({ ...query, cache: { bypass: true } }, first));
});

test('cache returns clone-safe hits and does not leak identical keys across scopes', async () => {
  let loads = 0;
  const load = async (name) => { loads += 1; return { meta: {}, rows: [{ name }] }; };
  const a = analyticsAuthorizationScope({ _id: 'a', role: 'admin' });
  const b = analyticsAuthorizationScope({ _id: 'b', role: 'admin' });
  const first = await withAdminAnalyticsCache({ key: 'same', scopeHash: a, loader: () => load('A') });
  const hit = await withAdminAnalyticsCache({ key: 'same', scopeHash: a, loader: () => load('wrong') });
  hit.rows[0].name = 'mutated';
  const hitAgain = await withAdminAnalyticsCache({ key: 'same', scopeHash: a, loader: () => load('wrong') });
  const isolated = await withAdminAnalyticsCache({ key: 'same', scopeHash: b, loader: () => load('B') });
  assert.equal(first.meta.cache.status, 'miss');
  assert.equal(hit.meta.cache.status, 'hit');
  assert.equal(hitAgain.rows[0].name, 'A');
  assert.equal(isolated.rows[0].name, 'B');
  assert.equal(loads, 2);
});

test('concurrent misses coalesce and refresh bypass replaces cached data', async () => {
  let loads = 0;
  const scopeHash = analyticsAuthorizationScope({ _id: 'admin', role: 'admin' });
  const slowLoader = async () => {
    loads += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { meta: {}, value: loads };
  };
  const [first, second] = await Promise.all([
    withAdminAnalyticsCache({ key: 'coalesce', scopeHash, loader: slowLoader }),
    withAdminAnalyticsCache({ key: 'coalesce', scopeHash, loader: slowLoader }),
  ]);
  assert.equal(loads, 1);
  assert.deepEqual(new Set([first.meta.cache.status, second.meta.cache.status]), new Set(['miss', 'coalesced']));

  const refreshed = await withAdminAnalyticsCache({ key: 'coalesce', scopeHash, bypass: true, loader: slowLoader });
  const afterRefresh = await withAdminAnalyticsCache({ key: 'coalesce', scopeHash, loader: slowLoader });
  assert.equal(refreshed.meta.cache.status, 'refresh');
  assert.equal(afterRefresh.value, 2);
  assert.equal(afterRefresh.meta.cache.status, 'hit');
  assert.equal(loads, 2);
});

test('cache invalidation advances the visible version and forces recomputation', async () => {
  let loads = 0;
  const scopeHash = analyticsAuthorizationScope({ _id: 'admin', role: 'admin' });
  const loader = async () => ({ meta: {}, value: ++loads });
  const before = await withAdminAnalyticsCache({ key: 'invalidate', scopeHash, loader });
  const invalidation = await invalidateAdminAnalyticsCache();
  const after = await withAdminAnalyticsCache({ key: 'invalidate', scopeHash, loader });
  assert.equal(before.value, 1);
  assert.equal(after.value, 2);
  assert.ok(after.meta.cache.version > before.meta.cache.version);
  assert.equal(after.meta.cache.lastInvalidatedAt, invalidation.invalidatedAt);
});
