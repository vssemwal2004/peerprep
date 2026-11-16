import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeInPeriod, buildComparison, compareBuckets, compareMetricsFor, comparisonReport, validateCompareBy, validateCompareValue,
} from '../src/modules/prepAnalysis/compare.js';
import { comparePrepAnalysisClasses, comparePrepAnalysisClassStudents } from '../src/modules/prepAnalysis/prepAnalysis.controller.js';
import { renderCsv } from '../src/modules/prepAnalysis/prepAnalysis.export.js';
import { attachStoredScores, buildStudentRows, indexProblemMeta } from '../src/modules/prepAnalysis/studentRows.js';
import { evaluateFilterTree, normalizeFilterTree } from '../src/modules/prepAnalysis/filterEngine.js';

const ALL = new Set(['student', 'coding', 'quickprep', 'learning', 'interview', 'assessment']);

function cohort() {
  const problems = indexProblemMeta(new Map([
    ['p1', { id: 'p1', title: 'Two Sum', difficulty: 'Easy', topicIds: [], topics: ['Arrays'], tags: [], companies: [] }],
    ['p2', { id: 'p2', title: 'Course Schedule', difficulty: 'Medium', topicIds: [], topics: ['Graphs'], tags: [], companies: [] }],
    ['p3', { id: 'p3', title: 'Word Ladder II', difficulty: 'Hard', topicIds: [], topics: ['Graphs'], tags: [], companies: [] }],
  ]));
  const students = [
    { _id: 's1', name: 'Asha', semester: 5, branch: 'CSE', college: 'Dehradun', section: 'A', group: 'G1' },
    { _id: 's2', name: 'Bilal', semester: 5, branch: 'ECE', college: 'Bhimtal', section: 'A', group: 'G2' },
    { _id: 's3', name: 'Chen', semester: 3, branch: 'CSE', college: 'Dehradun', section: 'B', group: 'G1' },
    { _id: 's4', name: 'Dev', semester: 7, branch: 'CSE', college: 'dehradun', section: 'b', group: 'G3' },
    { _id: 's5', name: 'Esha', semester: 7, branch: 'CSE', college: 'Haldwani', section: 'C', group: '' },
    { _id: 's6', name: 'Farid', semester: 5, branch: 'CSE', college: 'Haldwani', group: 'G2' },
  ];
  const entry = (problemId, attempts, accepted) => ({ problemId, language: 'cpp', attempts, accepted, verdicts: { AC: accepted, WA: attempts - accepted, TLE: 0, RE: 0, CE: 0 } });
  const byStudent = new Map([
    ['s1', [entry('p1', 1, 1), entry('p2', 2, 1), entry('p3', 3, 1)]],
    ['s2', [entry('p1', 4, 1)]],
    ['s3', [entry('p2', 2, 0)]],
    ['s5', [entry('p1', 1, 1), entry('p3', 1, 1)]],
  ]);
  const days = new Map([['s1', new Map([['2026-11-01', { attempts: 6, accepted: 3 }]])], ['s2', new Map([['2026-11-02', { attempts: 4, accepted: 1 }]])]]);
  const rows = buildStudentRows({ students, facts: { byStudent, days }, problems, now: new Date('2026-11-10T00:00:00Z') });
  attachStoredScores(rows, new Map([['s1', { total: 12, modules: { coding: { score: 10, counts: { Easy: 1, Medium: 1, Hard: 1 } } } }], ['s2', { total: 3, modules: { coding: { score: 2, counts: { Easy: 1, Medium: 0, Hard: 0 } } } }]]), { features: { coding: true } });
  return rows;
}

const metric = (comparison, key) => comparison.metrics.find((entry) => entry.key === key);

test('rows carry the student section and the Section filter matches it', () => {
  const rows = cohort();
  assert.equal(rows.find((row) => row.name === 'Asha').student.section, 'A');
  assert.equal(rows.find((row) => row.name === 'Farid').student.section, '', 'no section is an empty value, never undefined');
  const tree = normalizeFilterTree({ children: [{ field: 'student.section', operator: 'anyOf', value: ['B'] }] }, { allowedModules: ALL });
  assert.deepEqual(rows.filter((row) => evaluateFilterTree(tree, row)).map((row) => row.name).sort(), ['Chen', 'Dev'], 'like every list filter, case does not matter');
});

test('compare by section: each value gets its own students and counts add up to "All selected"', () => {
  const rows = cohort();
  const comparison = buildComparison({ rows, compareBy: { dimension: 'section', values: ['A', 'B', 'C'] }, area: 'coding', modules: new Set(['student', 'coding']) });
  assert.deepEqual(comparison.columns.map((column) => [column.label, column.students]), [['A', 2], ['B', 2], ['C', 1]], 'section "b" matches "B" whatever the case');
  assert.equal(comparison.total.students, 5, 'Farid has no section and is not in any compared value');
  for (const entry of comparison.metrics.filter((item) => item.format === 'count')) {
    assert.equal(entry.values.reduce((sum, value) => sum + value, 0), entry.total, `${entry.label}: the values add up to All selected`);
  }
  assert.deepEqual(metric(comparison, 'solved').values, [4, 0, 2]);
  assert.deepEqual(metric(comparison, 'solvedHard').values, [1, 0, 1]);
  assert.deepEqual(metric(comparison, 'active').values, [2, 1, 1], 'any submission in the period counts as active');
  assert.equal(metric(comparison, 'accuracy').values[0], 40, 'accepted / submissions of the whole value: 4 of 10');
  assert.equal(metric(comparison, 'accuracy').values[1], 0);
  assert.equal(metric(comparison, 'solved').best, 0, 'best and worst are marked');
  assert.equal(metric(comparison, 'solved').worst, 1);
  assert.equal(metric(comparison, 'students').best, null, 'the student count is never judged');
  assert.ok(comparison.charts.some((chart) => chart.id === 'solved'), 'the solved-by-difficulty chart is drawn');
  assert.equal(comparison.metrics.some((entry) => entry.module === 'assessment'), false, 'only the area\'s feature');
});

test('compare by campus and semester; buckets keep the chosen order', () => {
  const rows = cohort();
  const campus = buildComparison({ rows, compareBy: { dimension: 'college', values: ['Haldwani', 'Dehradun'] }, area: 'all', modules: ALL });
  assert.deepEqual(campus.columns.map((column) => [column.label, column.students]), [['Haldwani', 2], ['Dehradun', 3]]);
  assert.equal(campus.dimension.label, 'Campus');
  assert.equal(metric(campus, 'students').total, 5);
  const semester = compareBuckets(rows, { dimension: 'semester', values: [7, 5] });
  assert.deepEqual(semester.map((bucket) => [bucket.label, bucket.rows.length]), [['Semester 7', 2], ['Semester 5', 3]]);
  const groups = compareBuckets(rows, { dimension: 'group', values: ['G1', 'G2'] });
  assert.deepEqual(groups.map((bucket) => bucket.rows.map((row) => row.name).sort()), [['Asha', 'Chen'], ['Bilal', 'Farid']]);
});

test('compare measures follow the area and the licensed features', () => {
  assert.deepEqual([...new Set(compareMetricsFor('assessment', ALL).map((entry) => entry.module))], ['student', 'assessment']);
  assert.deepEqual([...new Set(compareMetricsFor('all', new Set(['student', 'coding', 'learning'])).map((entry) => entry.module))], ['student', 'coding', 'learning']);
  const row = cohort().find((entry) => entry.name === 'Dev');
  assert.equal(activeInPeriod(row, ALL), false);
});

test('compare requests are checked: dimension, 2 to 8 values, repeats dropped', () => {
  assert.deepEqual(validateCompareBy({ dimension: 'section', values: [' A ', 'a', 'B'] }), { dimension: 'section', values: ['A', 'B'] });
  assert.deepEqual(validateCompareBy({ dimension: 'semester', values: ['5', 7, 'x'] }), { dimension: 'semester', values: [5, 7] });
  const status = (fn) => { try { fn(); } catch (error) { return error.status; } return 200; };
  assert.equal(status(() => validateCompareBy({ dimension: 'hostel', values: ['A', 'B'] })), 400, 'unknown dimension');
  assert.equal(status(() => validateCompareBy({ dimension: 'toString', values: ['A', 'B'] })), 400, 'no prototype keys');
  assert.equal(status(() => validateCompareBy({ dimension: 'section', values: Array.from({ length: 9 }, (_, index) => `S${index}`) })), 400, 'more than 8 values');
  assert.equal(status(() => validateCompareBy({ dimension: 'section', values: ['A', 'a'] })), 400, 'fewer than 2 different values');
  assert.equal(status(() => validateCompareBy(null)), 400);
  assert.deepEqual(validateCompareValue({ dimension: 'group', value: 'G1' }), { dimension: 'group', value: 'G1' });
  assert.equal(status(() => validateCompareValue({ dimension: 'group', value: '' })), 400);
});

test('the compare endpoints answer 400 for a bad comparison before loading anything', async () => {
  const res = { set() { return this; }, json() { throw new Error('should not answer'); } };
  const call = (handler, body) => handler({ body, headers: {}, user: { role: 'admin' }, platformPermissions: undefined }, res);
  await assert.rejects(call(comparePrepAnalysisClasses, { module: 'coding', compareBy: { dimension: 'hostel', values: ['A', 'B'] } }), (error) => error.status === 400);
  await assert.rejects(call(comparePrepAnalysisClasses, { module: 'coding', compareBy: { dimension: 'section', values: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] } }), (error) => error.status === 400);
  await assert.rejects(call(comparePrepAnalysisClassStudents, { module: 'coding', compareBy: { dimension: 'nope', value: 'A' } }), (error) => error.status === 400);
  // A feature the university has not licensed is refused like /query.
  await assert.rejects(
    comparePrepAnalysisClasses({ body: { module: 'assessment', compareBy: { dimension: 'section', values: ['A', 'B'] } }, headers: {}, user: {}, platformPermissions: { questions: true } }, res),
    (error) => error.status === 403,
  );
});

test('the comparison downloads as a table with one column per value and All selected', () => {
  const comparison = buildComparison({ rows: cohort(), compareBy: { dimension: 'section', values: ['A', 'B'] }, area: 'coding', modules: new Set(['student', 'coding']) });
  const report = comparisonReport(comparison, { title: 'Prep Analysis · Section comparison', details: [['Period', 'All time']], filters: ['No filters'] });
  const csv = renderCsv(report).toString('utf8');
  assert.match(csv, /Feature,Measure,A,B,All selected/);
  assert.match(csv, /Students,Students,2,2,4/);
  assert.match(csv, /Prep Coding,Problems solved,4,0,4/);
});
