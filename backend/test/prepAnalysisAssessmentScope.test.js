// Prep Analysis scoped to one assessment (or a few): the same analysis, narrowed to the tests
// and to the students who were given or took them. Needs MongoDB (in-memory here).

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Assessment from '../src/models/Assessment.js';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';
import User from '../src/models/User.js';
import { CHARTS } from '../src/modules/prepAnalysis/charts.js';
import { exportPrepAnalysisFile } from '../src/modules/prepAnalysis/prepAnalysis.controller.js';
import { validateChartExportOptions, validateExportOptions } from '../src/modules/prepAnalysis/prepAnalysis.export.js';
import {
  cacheKey, countPrepAnalysis, drillPrepAnalysis, exportPrepAnalysis, exportPrepAnalysisChart, getAnalysisContext, getStudentProfile,
  listFieldOptions, normalizeRange, normalizeScope, runPrepAnalysis, scopeFromQueryString, validateDrill, validatePrepAnalysisQuery,
} from '../src/modules/prepAnalysis/prepAnalysis.service.js';

let mongo;
let skipped = false;
const oid = () => new mongoose.Types.ObjectId();
const admin = { _id: oid(), role: 'admin', name: 'Admin' };
const DAY = 24 * 60 * 60 * 1000;
const ids = {};
const people = {};
const ASSESSMENT_CHART_IDS = CHARTS.filter((chart) => chart.module === 'assessment').map((chart) => chart.id);

before(async () => {
  try { mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' }, instance: { ip: '127.0.0.1' } }); } catch (error) { if (error?.code === 'EPERM') { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: 'prep_analysis_assessment_scope_test' });
  await Promise.all([User.init(), Assessment.init(), AssessmentSubmission.init()]);

  const students = [
    // name, branch, semester, college
    ['s1', 'Asha', 'CSE', 5, 'GEHU'], ['s2', 'Bilal', 'ECE', 5, 'GEU'], ['s3', 'Chen', 'CSE', 3, 'GEHU'], ['s4', 'Dev', 'ECE', 7, 'GEU'],
    ['s5', 'Esha', 'CSE', 1, 'Outsider College'], ['s6', 'Farid', 'ECE', 2, 'Outsider College'], ['s7', 'Gita', 'CSE', 8, 'GEHU'],
  ];
  for (const [key, name, branch, semester, college] of students) {
    const user = await User.create({
      name, email: `${key}@scope.test`, studentId: key.toUpperCase(), passwordHash: 'x', role: 'student', branch, semester, college, course: 'B.Tech',
    });
    people[key] = String(user._id);
  }
  const base = { createdBy: admin._id, totalMarks: 100, targetType: 'selected', startTime: new Date(Date.now() - 20 * DAY), endTime: new Date(Date.now() - 15 * DAY) };
  const a = await Assessment.create({ ...base, title: 'Test A', assignedStudents: [people.s1, people.s2, people.s3] });
  const b = await Assessment.create({ ...base, title: 'Test B', assignedStudents: [people.s3, people.s4] });
  const c = await Assessment.create({ ...base, title: 'Test C', assignedStudents: [people.s6] });
  const draft = await Assessment.create({ ...base, title: 'Draft D', lifecycleStatus: 'draft', assignedStudents: [people.s5] });
  Object.assign(ids, { a: String(a._id), b: String(b._id), c: String(c._id), draft: String(draft._id) });

  const submit = (assessment, student, score) => ({
    assessmentId: assessment, studentId: people[student], status: 'submitted', evaluationStatus: 'completed', score, maxMarks: 100,
    startedAt: new Date(Date.now() - 10 * DAY), submittedAt: new Date(Date.now() - 10 * DAY), timeTakenSec: 600,
  });
  await AssessmentSubmission.insertMany([
    submit(a._id, 's1', 80), submit(a._id, 's2', 30), submit(a._id, 's3', 60), submit(b._id, 's3', 20),
    // Gita was never assigned test A but has a graded submission on it: she belongs to its report.
    submit(a._id, 's7', 90),
    submit(c._id, 's6', 90),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

const guard = (t) => { if (skipped) { t.skip('MongoDB memory server is not available here'); return true; } return false; };
const body = (extra = {}) => ({ module: 'assessment', range: { preset: 'all' }, ...extra });
const scoped = (...keys) => ({ assessmentIds: keys.map((key) => ids[key]) });
const run = (request, user = admin) => runPrepAnalysis({ user, query: validatePrepAnalysisQuery(request, undefined) });
const names = (result) => result.students.rows.map((row) => row.name).sort();
const chartOf = (result, id) => result.charts.find((chart) => chart.id === id);
const sum = (list) => list.reduce((total, value) => total + value, 0);

// ---------------------------------------------------------------- request contract

test('scope is optional, validated, de-duplicated and sorted; a string scope (chart download) is never an assessment scope', () => {
  assert.equal(normalizeScope(undefined), null);
  assert.equal(normalizeScope(null), null);
  assert.equal(normalizeScope({}), null);
  assert.equal(normalizeScope({ assessmentIds: [] }), null, 'an empty list means everyone');
  const high = 'f'.repeat(24);
  const low = '1'.repeat(24);
  assert.deepEqual(normalizeScope({ assessmentIds: [high, low, high.toUpperCase()] }), { assessmentIds: [low, high] });
  assert.deepEqual(normalizeScope({ assessmentIds: ['nope', 5, {}] }), { assessmentIds: [] }, 'malformed ids are dropped, and a list that names nothing stays a scope');
  assert.throws(() => normalizeScope({ assessmentIds: Array.from({ length: 21 }, oid).map(String) }), (error) => error.status === 400 || error.statusCode === 400);
  assert.equal(normalizeScope({ assessmentIds: Array.from({ length: 20 }, oid).map(String) }).assessmentIds.length, 20);
  assert.throws(() => normalizeScope({ assessmentIds: low }), /must be a list/);
  assert.throws(() => normalizeScope([low]), /Invalid assessment scope/);
  assert.throws(() => normalizeScope('x'), /Invalid assessment scope/);

  assert.equal(validatePrepAnalysisQuery({ module: 'assessment' }, undefined).scope, null);
  assert.equal(validatePrepAnalysisQuery({ module: 'assessment', scope: 'chart' }, undefined).scope, null);
  assert.deepEqual(validatePrepAnalysisQuery({ module: 'assessment', scope: { assessmentIds: [low] } }, undefined).scope, { assessmentIds: [low] });
  assert.deepEqual(validatePrepAnalysisQuery({ module: 'assessment', scope: 'chart', assessmentScope: { assessmentIds: [low] } }, undefined).scope, { assessmentIds: [low] });
  assert.deepEqual(scopeFromQueryString(`${high},${low}`), { assessmentIds: [low, high] });
  assert.deepEqual(scopeFromQueryString([low, high]), { assessmentIds: [low, high] });
  assert.equal(scopeFromQueryString(undefined), null);
  assert.equal(scopeFromQueryString(''), null);
});

test('the context cache key includes the scope, in a stable order, and never matches an unscoped key', () => {
  const user = admin;
  const range = normalizeRange({ preset: 'all' });
  const modules = new Set(['coding', 'assessment']);
  const parts = { peer: true, ai: true };
  const x = '1'.repeat(24);
  const y = '2'.repeat(24);
  const unscoped = cacheKey(user, range, modules, parts, null);
  assert.equal(cacheKey(user, range, modules, parts), unscoped);
  assert.notEqual(cacheKey(user, range, modules, parts, { assessmentIds: [x] }), unscoped);
  assert.notEqual(cacheKey(user, range, modules, parts, { assessmentIds: [] }), unscoped, 'an empty scope is still a scope');
  assert.notEqual(cacheKey(user, range, modules, parts, { assessmentIds: [x] }), cacheKey(user, range, modules, parts, { assessmentIds: [x, y] }));
  assert.equal(cacheKey(user, range, modules, parts, { assessmentIds: [y, x] }), cacheKey(user, range, modules, parts, { assessmentIds: [x, y] }));
});

// ---------------------------------------------------------------- scoped analysis

test('unscoped analysis is unchanged: every student and every test', async (t) => {
  if (guard(t)) return;
  const result = await run(body());
  assert.equal(result.meta.cohortSize, 7);
  assert.equal(result.meta.matched, 7);
  assert.deepEqual(result.students.rows.find((row) => row.name === 'Chen').assessment.taken, 2);
  const labels = chartOf(result, 'assessment-tests').data.groups.map((group) => group.label).sort();
  assert.deepEqual(labels, ['Test A', 'Test B', 'Test C'], 'drafts are never listed');
});

test('one assessment: only that test, and only the students assigned to it or with a graded submission on it', async (t) => {
  if (guard(t)) return;
  const result = await run(body({ scope: scoped('a') }));
  assert.equal(result.meta.cohortSize, 4);
  assert.equal(result.meta.matched, 4);
  assert.deepEqual(names(result), ['Asha', 'Bilal', 'Chen', 'Gita'], 'Gita has a submission without an assignment; Dev, Esha and Farid are out');
  const byName = Object.fromEntries(result.students.rows.map((row) => [row.name, row.assessment]));
  assert.equal(byName.Chen.taken, 1, 'Chen also took test B, which is out of scope');
  assert.equal(byName.Chen.averageScore, 60);
  assert.equal(byName.Bilal.passed, 0);
  assert.equal(byName.Asha.passed, 1);
  assert.equal(byName.Gita.taken, 1);
  assert.equal(result.students.total, 4);

  const tests = chartOf(result, 'assessment-tests').data;
  assert.deepEqual(tests.groups.map((group) => group.label), ['Test A']);
  assert.deepEqual(tests.groups[0].values, { Passed: 3, Failed: 1, Missed: 0 });
  assert.equal(chartOf(result, 'assessment-funnel').data.stages[0].value, 4);
  // KPIs only count the scoped cohort.
  const kpis = result.kpiGroups.flatMap((group) => group.kpis);
  assert.ok(kpis.some((kpi) => kpi.value === 4), 'a KPI shows the four students');
  for (const chart of result.charts) assert.ok(chart.studentCount <= 4, `${chart.id} counts at most the scoped cohort`);
});

test('two assessments: each student appears once, counts add across both tests, a missed test is counted', async (t) => {
  if (guard(t)) return;
  const result = await run(body({ scope: scoped('b', 'a') }));
  assert.deepEqual(names(result), ['Asha', 'Bilal', 'Chen', 'Dev', 'Gita']);
  const byName = Object.fromEntries(result.students.rows.map((row) => [row.name, row.assessment]));
  assert.equal(byName.Chen.taken, 2);
  assert.equal(byName.Chen.passed, 1);
  assert.equal(byName.Dev.missed, 1, 'Dev was assigned B and never took it');
  assert.equal(byName.Asha.missed, 0);
  const tests = chartOf(result, 'assessment-tests').data.groups;
  assert.deepEqual(tests.map((group) => group.label).sort(), ['Test A', 'Test B']);
  assert.deepEqual(tests.find((group) => group.label === 'Test B').values, { Passed: 0, Failed: 1, Missed: 1 });
  const count = await countPrepAnalysis({ user: admin, query: validatePrepAnalysisQuery(body({ scope: scoped('a', 'b') }), undefined) });
  assert.deepEqual(count, { cohortSize: 5, matched: 5 });
});

test('assessment ids that do not exist, are drafts or are malformed are dropped without widening the scope', async (t) => {
  if (guard(t)) return;
  const reference = await run(body({ scope: scoped('a') }));
  const noisy = await run(body({ scope: { assessmentIds: [ids.a, String(oid()), ids.draft, 'not-an-id'] } }));
  assert.deepEqual(names(noisy), names(reference));
  assert.deepEqual(noisy.charts.map((chart) => chart.studentCount), reference.charts.map((chart) => chart.studentCount));
  // A draft alone is not visible, so nothing is in scope: an empty cohort, not everyone.
  const draftOnly = await run(body({ scope: { assessmentIds: [ids.draft] } }));
  assert.equal(draftOnly.meta.cohortSize, 0);
});

test('a scope that names no visible test answers 200 with an empty cohort on every endpoint', async (t) => {
  if (guard(t)) return;
  const scope = { assessmentIds: [String(oid())] };
  const result = await run(body({ scope }));
  assert.equal(result.meta.cohortSize, 0);
  assert.equal(result.meta.matched, 0);
  assert.equal(result.students.total, 0);
  assert.deepEqual(result.students.rows, []);
  assert.ok(result.charts.length > 0, 'charts still render, empty');
  assert.equal(chartOf(result, 'assessment-tests').data.groups.length, 0);
  const query = validatePrepAnalysisQuery(body({ scope }), undefined);
  assert.deepEqual(await countPrepAnalysis({ user: admin, query }), { cohortSize: 0, matched: 0 });
  const drill = await drillPrepAnalysis({ user: admin, query, drill: validateDrill({ drill: { chartId: 'assessment-funnel', key: '0' } }) });
  assert.equal(drill.total, 0);
  const file = await exportPrepAnalysis({ user: admin, query, options: validateExportOptions({ format: 'csv' }, undefined, 'assessment') });
  assert.equal(file.rowCount, 0);
  assert.deepEqual((await listFieldOptions({ user: admin, optionsKey: 'tests', scope })).options, []);
});

test('scoped and unscoped contexts never share a cache entry, whatever the order of the ids', async (t) => {
  if (guard(t)) return;
  const options = { modules: new Set(['coding', 'learning', 'interview', 'assessment']) };
  const range = normalizeRange({ preset: 'all' });
  const everyone = await getAnalysisContext(admin, range, options);
  const onlyA = await getAnalysisContext(admin, range, { ...options, scope: normalizeScope(scoped('a')) });
  const again = await getAnalysisContext(admin, range, options);
  assert.equal(everyone.rows.length, 7);
  assert.equal(onlyA.rows.length, 4);
  assert.equal(again, everyone, 'the unscoped entry is still the unscoped one');
  assert.equal(everyone.tests.size, 3);
  assert.deepEqual([...onlyA.tests.keys()], [ids.a]);
  const ab = await getAnalysisContext(admin, range, { ...options, scope: normalizeScope(scoped('a', 'b')) });
  const ba = await getAnalysisContext(admin, range, { ...options, scope: normalizeScope(scoped('b', 'a')) });
  assert.equal(ab, ba, 'sorted ids give one stable entry');
  assert.notEqual(ab, onlyA);
  for (const row of onlyA.rows) assert.deepEqual([...row.assessment.assignedIds].filter((id) => id !== ids.a), [], 'only scoped tests in assignedIds');
});

test('previous-period KPI deltas, focus and compare keep working under a scope', async (t) => {
  if (guard(t)) return;
  const request = { module: 'assessment', range: { preset: '30d' }, scope: scoped('a'), charts: [{ id: 'assessment-funnel' }, { id: 'assessment-tests' }] };
  const result = await run(request);
  assert.ok(result.meta.previous, 'the previous period is compared');
  assert.equal(result.meta.cohortSize, 4, 'the cohort does not depend on the period');
  assert.equal(result.meta.matched, 4);

  const focused = await run({ ...request, focus: { chartId: 'assessment-funnel', key: '2', label: 'Passed a test' } });
  assert.deepEqual(names(focused), ['Asha', 'Chen', 'Gita'], 'the focus is among the scoped students who passed');
  assert.equal(focused.meta.focus.students, 3);

  const compared = await run({
    ...request,
    compare: [
      { label: 'CSE', filter: { children: [{ field: 'student.branch', operator: 'is', value: 'CSE' }] } },
      { label: 'ECE', filter: { children: [{ field: 'student.branch', operator: 'is', value: 'ECE' }] } },
    ],
  });
  assert.deepEqual(compared.compare.map((group) => [group.label, group.matched]), [['CSE', 3], ['ECE', 1]]);
});

test('filters and the table apply inside the scoped cohort', async (t) => {
  if (guard(t)) return;
  const result = await run(body({ scope: scoped('a', 'b'), filter: { children: [{ field: 'student.branch', operator: 'is', value: 'ECE' }] } }));
  assert.deepEqual(names(result), ['Bilal', 'Dev'], 'Farid is ECE but has nothing to do with these tests');
  assert.equal(result.meta.cohortSize, 5);
  assert.equal(result.meta.matched, 2);
});

// ---------------------------------------------------------------- drill == chart

// How many students each part of a chart stands for (undefined: the chart counts something else there).
const STUDENT_STACKS = new Set(['assessment-tests', 'assessment-scores']);
function partsOf(chart, data) {
  const right = (index) => data.series?.find((series) => series.axis === 'right')?.values?.[index];
  switch (chart.type) {
    case 'donut': return (data.items || []).filter((item) => item.value > 0).map((item) => ({ key: item.key, expected: item.students }));
    case 'barList': return [
      ...(data.items || []).filter((item) => item.key).map((item) => ({ key: item.key, expected: item.students })),
      ...(data.chips || []).map((chip) => ({ key: chip.key, expected: chip.value })),
      { key: '__all__', expected: undefined },
    ];
    case 'histogram': return (data.bins || []).map((bin, index) => ({ key: bin.key ?? String(index), expected: bin.count }));
    case 'funnel': return (data.stages || []).map((stage, index) => ({ key: String(index), expected: stage.value }));
    case 'trend': return (data.labels || []).map((week, index) => ({ key: week, expected: right(index) }));
    case 'stackedBar': return (data.groups || []).flatMap((group) => [
      { key: group.label, expected: group.students },
      ...(data.series || []).map((series) => ({ key: `${group.label}|${series}`, expected: STUDENT_STACKS.has(chart.id) ? group.values[series] : undefined })),
    ]);
    case 'calendar': return (data.days || []).map(([day]) => ({ key: day }));
    default: return [];
  }
}

for (const [label, scopeKeys] of [['one assessment', ['a']], ['two assessments', ['a', 'b']], ['no visible assessment', []]]) {
  test(`every part of every assessment chart opens the students the chart counts, scoped to ${label}`, async (t) => {
    if (guard(t)) return;
    const scope = scopeKeys.length ? scoped(...scopeKeys) : { assessmentIds: [String(oid())] };
    const request = body({ scope, charts: ASSESSMENT_CHART_IDS.map((id) => ({ id })) });
    const result = await run(request);
    const query = validatePrepAnalysisQuery(request, undefined);
    const cohortIds = new Set((await getAnalysisContext(admin, query.range, { modules: query.modules, parts: query.parts, scope: query.scope })).rows.map((row) => row.id));
    let checked = 0;
    for (const chart of result.charts) {
      const definition = CHARTS.find((entry) => entry.id === chart.id);
      for (const part of partsOf(definition, chart.data)) {
        const drill = await drillPrepAnalysis({ user: admin, query, drill: validateDrill({ drill: { chartId: chart.id, key: part.key, limit: 200 } }) });
        if (part.expected !== undefined) {
          assert.equal(drill.students, part.expected, `${chart.id} · ${part.key}`);
          checked += 1;
        }
        assert.equal(drill.cohortSize, cohortIds.size, `${chart.id} · ${part.key} is drawn from the scoped cohort`);
        for (const row of drill.rows) assert.ok(cohortIds.has(row.id), `${chart.id} · ${part.key} lists only scoped students`);
      }
      const whole = await drillPrepAnalysis({ user: admin, query, drill: validateDrill({ drill: { chartId: chart.id, key: '', limit: 200 } }) });
      assert.equal(whole.cohort, chart.studentCount, `${chart.id}: the whole-chart drill covers the chart's students`);
    }
    if (scopeKeys.length) assert.ok(checked >= 10, `checked ${checked} parts with an exact count`);
  });
}

test('the test-by-test drill under scope lists only scoped tests and students', async (t) => {
  if (guard(t)) return;
  const request = body({ scope: scoped('a'), charts: [{ id: 'assessment-tests' }] });
  const query = validatePrepAnalysisQuery(request, undefined);
  const detail = await drillPrepAnalysis({ user: admin, query, drill: validateDrill({ drill: { chartId: 'assessment-tests', key: 'Test A', view: 'detail', limit: 200 } }) });
  const testColumn = detail.columns.findIndex((column) => column.key === 'test');
  assert.ok(testColumn >= 0);
  assert.ok(detail.rows.length > 0);
  assert.ok(detail.rows.every((row) => row.cells[testColumn] === 'Test A'));
  // Test B exists in the university but not in this report.
  const other = await drillPrepAnalysis({ user: admin, query, drill: validateDrill({ drill: { chartId: 'assessment-tests', key: 'Test B', limit: 200 } }) });
  assert.equal(other.students, 0);
});

// ---------------------------------------------------------------- downloads

test('table export has one row per matching scoped student; chart export matches the chart count', async (t) => {
  if (guard(t)) return;
  const request = body({ scope: scoped('a'), charts: [{ id: 'assessment-funnel' }] });
  const query = validatePrepAnalysisQuery({ ...request, charts: [] }, undefined);
  const result = await run(request);
  const table = await exportPrepAnalysis({ user: admin, query, options: validateExportOptions({ format: 'csv' }, undefined, 'assessment') });
  assert.equal(table.rowCount, result.meta.matched);
  assert.equal(table.rowCount, 4);
  const csv = table.buffer.toString('utf8');
  assert.ok(csv.includes('Gita') && !csv.includes('Esha') && !csv.includes('Farid'));

  const chartQuery = validatePrepAnalysisQuery({ ...request, table: undefined }, undefined);
  for (const [key, expected] of [['', 4], ['1', 4], ['2', 3]]) {
    const file = await exportPrepAnalysisChart({
      user: admin, query: chartQuery, drill: validateDrill({ drill: { chartId: 'assessment-funnel', key } }), options: validateChartExportOptions({ format: 'csv' }),
    });
    assert.equal(file.rowCount, expected, `funnel part "${key}"`);
  }
});

test('the HTTP export handler takes the assessments as assessmentScope next to scope: "chart"', async (t) => {
  if (guard(t)) return;
  const send = async (requestBody) => {
    const headers = {};
    let sent;
    await exportPrepAnalysisFile(
      { body: requestBody, user: admin, headers: {}, platformPermissions: undefined },
      { set(value) { Object.assign(headers, value); }, send(buffer) { sent = buffer; } },
    );
    return { headers, sent };
  };
  const chart = await send({
    ...body({ charts: [{ id: 'assessment-funnel' }] }), scope: 'chart', assessmentScope: scoped('a'),
    drill: { chartId: 'assessment-funnel', key: '' }, format: 'csv',
  });
  assert.equal(chart.headers['X-Row-Count'], '4');
  const tableFile = await send({ ...body(), scope: scoped('a', 'b'), format: 'csv' });
  assert.equal(tableFile.headers['X-Row-Count'], '5');
  const everyone = await send({ ...body(), format: 'csv' });
  assert.equal(everyone.headers['X-Row-Count'], '7');
});

// ---------------------------------------------------------------- option lists and profile

test('option lists under a scope come from the scoped cohort and the scoped tests only', async (t) => {
  if (guard(t)) return;
  const scope = normalizeScope(scoped('a'));
  const list = async (optionsKey, extra = {}) => (await listFieldOptions({ user: admin, optionsKey, ...extra })).options;

  assert.deepEqual((await list('tests', { scope })).map((option) => option.label), ['Test A']);
  assert.deepEqual((await list('tests')).map((option) => option.label).sort(), ['Test A', 'Test B', 'Test C']);
  assert.deepEqual((await list('colleges', { scope })).map((option) => option.value), ['GEHU', 'GEU']);
  assert.deepEqual((await list('colleges')).map((option) => option.value), ['GEHU', 'GEU', 'Outsider College']);
  assert.deepEqual((await list('branches', { scope })).map((option) => [option.value, option.count]), [['CSE', 3], ['ECE', 1]]);
  assert.deepEqual((await list('courses', { scope })).map((option) => [option.value, option.count]), [['B.Tech', 4]]);
  assert.deepEqual((await list('semesters', { scope })).map((option) => option.value), [3, 5, 8]);
  assert.equal((await list('semesters')).length, 8, 'unscoped semesters are the static list');
  const students = await list('students', { scope });
  assert.deepEqual(students.map((option) => option.value).sort(), ['s1', 's2', 's3', 's7'].map((key) => people[key]).sort());
  assert.equal((await list('students')).length, 7);
  assert.deepEqual((await list('groups', { scope })), [], 'a field nobody has set is empty');
});

test('a student profile under a scope shows only the scoped tests; a student outside it is not found', async (t) => {
  if (guard(t)) return;
  const input = { user: admin, permissions: undefined, range: { preset: 'all' } };
  const all = await getStudentProfile({ ...input, studentId: people.s3 });
  assert.equal(all.assessment.tests.length, 2);
  const onlyA = await getStudentProfile({ ...input, studentId: people.s3, scope: scoped('a') });
  assert.deepEqual(onlyA.assessment.tests.map((entry) => entry.title), ['Test A']);
  assert.equal(onlyA.assessment.taken, 1);
  await assert.rejects(getStudentProfile({ ...input, studentId: people.s5, scope: scoped('a') }), (error) => (error.status ?? error.statusCode) === 404);
  assert.equal((await getStudentProfile({ ...input, studentId: people.s5 })).student.name, 'Esha');
  assert.equal(sum(onlyA.assessment.tests.map(() => 1)), 1);
});
