import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { validateAnalyticsQuery, validateOptionsQuery } from '../src/modules/adminAnalytics/adminAnalytics.validation.js';
import { buildAnalyticsGraphs, selectRecommendedGraphs } from '../src/modules/adminAnalytics/analyticsRegistry.js';
import { selectPopulationSegment } from '../src/modules/adminAnalytics/adminAnalytics.service.js';
import adminAnalyticsRouter from '../src/modules/adminAnalytics/adminAnalytics.routes.js';
import { requireAdmin, requireAuth } from '../src/middleware/auth.js';

const oid = () => new mongoose.Types.ObjectId().toString();

test('admin analytics router is protected by authentication and the admin-only guard', () => {
  assert.equal(adminAnalyticsRouter.stack[0]?.handle, requireAuth);
  assert.equal(adminAnalyticsRouter.stack[1]?.handle, requireAdmin);
  assert.throws(() => requireAdmin({ user: { role: 'student' } }, {}, () => {}), (error) => error.status === 403);
  assert.throws(() => requireAdmin({ user: { role: 'coordinator' } }, {}, () => {}), (error) => error.status === 403);
  let continued = false;
  requireAdmin({ user: { role: 'admin' } }, {}, () => { continued = true; });
  assert.equal(continued, true);
});

test('canonical frontend analytics DTO is normalized without silently dropping fields', () => {
  const assessmentId = oid();
  const query = validateAnalyticsQuery({
    population: { semesters: ['5'], selectionMode: 'bottom', rankSegment: 'bottom', rankN: 10, rankMetric: 'assessment', minimumEvidence: false },
    activity: {
      sources: ['coding', 'assessments'], datePreset: '90d', codingMode: 'assessment',
      assessmentIds: [assessmentId], codingTopics: ['Arrays'], difficulties: ['Hard'],
      languages: ['java'], verdicts: ['AC'], problemIds: [oid()],
    },
    comparison: { compareBy: 'branch', timeGrain: 'week', scoreMode: 'absolute' },
    graphs: { mode: 'custom', selectedIds: ['question-conversion'] },
  });
  assert.deepEqual(query.sources, ['coding', 'assessment']);
  assert.deepEqual(query.population.semesters, [5]);
  assert.equal(query.population.rank.direction, 'bottom');
  assert.equal(query.population.selectionMode, 'bottom');
  assert.equal(query.population.rank.minimumEvidence, false);
  assert.equal(query.coding.context, 'assessment');
  assert.deepEqual(query.coding.assessmentIds, [assessmentId]);
  assert.deepEqual(query.coding.topics, ['Arrays']);
  assert.equal(query.comparison.by, 'branch');
  assert.equal(query.timeGrain, 'week');
  assert.deepEqual(query.graphs.ids, ['question-conversion']);
});

test('invalid semesters, ranking direction, coding context, and time grain fail closed', () => {
  assert.throws(() => validateAnalyticsQuery({ population: { semesters: ['9'] } }), /Semester/);
  assert.throws(() => validateAnalyticsQuery({ population: { rankSegment: 'middle' } }), /Ranking direction/);
  assert.throws(() => validateAnalyticsQuery({ activity: { codingMode: 'everything' } }), /Coding mode/);
  assert.throws(() => validateAnalyticsQuery({ comparison: { timeGrain: 'quarter' } }), /Time grain/);
  assert.throws(() => validateAnalyticsQuery({ population: { selectionMode: 'unknown' } }), /population selection mode/);
});

test('option field aliases used by the filter drawer are accepted', () => {
  assert.equal(validateOptionsQuery({ type: 'studentIds' }).type, 'students');
  assert.equal(validateOptionsQuery({ type: 'chapterIds' }).type, 'learning-chapters');
  assert.equal(validateOptionsQuery({ type: 'assessmentTypes' }).type, 'assessmentTypes');
});

test('ranking ties use name then stable student id ordering', () => {
  const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const students = [
    { _id: ids[0], name: 'Zoya', studentId: '3' },
    { _id: ids[1], name: 'Aman', studentId: '2' },
    { _id: ids[2], name: 'Aman', studentId: '1' },
  ];
  const studentMetrics = new Map(ids.map((id) => [String(id), {
    coding: { mastery: null, acceptanceRate: null }, assessment: { normalizedScore: null }, learning: { completionRate: null },
    consistency: null, overall: { value: 75 }, evidence: { overall: true }, effortEvents: 0,
  }]));
  const query = {
    sources: [], date: { spanDays: 30 }, timeGrain: 'day', comparison: { by: 'none' },
    population: { studentIds: [], rank: { metric: 'overall', direction: 'top', n: 10, minimumEvidence: true } },
  };
  const graphs = buildAnalyticsGraphs({ students, studentMetrics, query, coding: null, assessment: null, learning: null });
  const ranking = graphs.find((graph) => graph.id === 'student-ranking');
  assert.equal(ranking.status, 'ready');
  assert.deepEqual(ranking.data.map((row) => row.name), ['Aman', 'Aman', 'Zoya']);
  assert.ok(String(ranking.data[0].studentId).localeCompare(String(ranking.data[1].studentId)) < 0);
  assert.doesNotThrow(() => selectRecommendedGraphs(undefined, {}));
});

test('top and activity population modes select the complete analysis audience', () => {
  const students = [
    { _id: 'a', name: 'A' }, { _id: 'b', name: 'B' }, { _id: 'c', name: 'C' },
  ];
  const metrics = new Map([
    ['a', { coding: { attempts: 8, mastery: 90 }, assessment: { completedAttempts: 0, normalizedScore: null }, learning: { engagedTopics: 0, completionRate: null }, overall: { value: 90 }, consistency: 40, evidence: { overall: true } }],
    ['b', { coding: { attempts: 0, mastery: null }, assessment: { completedAttempts: 2, normalizedScore: 75 }, learning: { engagedTopics: 2, completionRate: 50 }, overall: { value: 70 }, consistency: 60, evidence: { overall: true } }],
    ['c', { coding: { attempts: 2, mastery: 25 }, assessment: { completedAttempts: 0, normalizedScore: null }, learning: { engagedTopics: 0, completionRate: null }, overall: { value: 25 }, consistency: 20, evidence: { overall: true } }],
  ]);
  const rank = { metric: 'overall', n: 2, minimumEvidence: true };
  assert.deepEqual(selectPopulationSegment(students, metrics, { selectionMode: 'top', rank }).map((student) => student._id), ['a', 'b']);
  assert.deepEqual(selectPopulationSegment(students, metrics, { selectionMode: 'bottom', rank }).map((student) => student._id), ['c', 'b']);
  assert.deepEqual(selectPopulationSegment(students, metrics, { selectionMode: 'multi-source', rank }).map((student) => student._id), ['b']);
});

test('cross-source graphs are withheld without a canonical mapping', () => {
  const query = { sources: ['coding', 'assessment', 'learning'], date: { spanDays: 30 }, timeGrain: 'day', comparison: { by: 'none' }, population: { studentIds: [], rank: { metric: 'overall', direction: 'top', n: 10, minimumEvidence: true } } };
  const graphs = buildAnalyticsGraphs({ students: [], studentMetrics: new Map(), query, coding: null, assessment: null, learning: null });
  assert.equal(graphs.find((graph) => graph.id === 'skill-radar').status, 'not_relevant');
  assert.equal(graphs.find((graph) => graph.id === 'mastery-funnel').status, 'not_relevant');
  assert.ok(graphs.some((graph) => graph.id === 'question-conversion'));
  assert.ok(graphs.some((graph) => graph.id === 'source-mix'));
  assert.equal(graphs.length, 16);
});
