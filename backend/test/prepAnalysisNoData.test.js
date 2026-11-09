import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyRankCuts, evaluateFilterTree, normalizeFilterTree, normalizeRankCuts } from '../src/modules/prepAnalysis/filterEngine.js';
import { buildStudentRows } from '../src/modules/prepAnalysis/studentRows.js';

const ALL = { allowedModules: new Set(['student', 'coding', 'quickprep', 'learning', 'interview', 'assessment']) };
const NOW = new Date('2026-11-09T00:00:00Z');
const tree = (field, operator, value) => ({ children: [{ field, operator, value }] });
const pick = (rows, filter, rank) => applyRankCuts(rows.filter((row) => evaluateFilterTree(normalizeFilterTree(filter, ALL), row)), normalizeRankCuts(rank, ALL)).map((row) => row.name).sort();

// Four students and two tests: Asha scored 20%, Bilal 90%, Chen finished test t1 but it is still
// being evaluated, Dev never took anything. Test t2 started after the period being looked at.
function cohort({ range = { preset: 'all', from: null, to: null } } = {}) {
  const tests = new Map([
    ['t1', { id: 't1', title: 'Weekly test', visible: true, ended: true, forEveryone: true, assigned: new Set(), startTime: new Date('2026-10-01T00:00:00Z') }],
    ['t2', { id: 't2', title: 'Later test', visible: true, ended: true, forEveryone: true, assigned: new Set(), startTime: new Date('2026-11-05T00:00:00Z') }],
  ]);
  const attempt = (percent) => ({ testId: 't1', status: 'submitted', percent, score: percent, maxMarks: 100, minutes: 30, at: new Date('2026-10-01T10:00:00Z') });
  const assessment = {
    tests,
    byStudent: new Map([['a', [attempt(20)]], ['b', [attempt(90)]]]),
    awaiting: new Map([['c', new Set(['t1'])]]),
  };
  const students = [['a', 'Asha'], ['b', 'Bilal'], ['c', 'Chen'], ['d', 'Dev']].map(([_id, name]) => ({ _id, name, semester: 5 }));
  return buildStudentRows({ students, facts: { byStudent: new Map(), days: new Map() }, problems: new Map(), assessment, range, now: NOW });
}

test('score filters never match students who have no score', () => {
  const rows = cohort();
  assert.deepEqual(pick(rows, tree('assessment.averageScore', 'lte', 25)), ['Asha'], 'only the student who scored 20%, not the ones with no score');
  assert.deepEqual(pick(rows, tree('coding.accuracy', 'lte', 25)), [], 'nobody practised, so nobody has a low accuracy');
  assert.deepEqual(pick(rows, tree('interview.mockScore', 'lte', 25)), []);
  assert.deepEqual(pick(rows, tree('assessment.taken', 'eq', 0)), ['Chen', 'Dev'], 'counts are still 0, a real value');
});

test('Top / Bottom N ranks only students who have a value', () => {
  const rows = cohort();
  assert.deepEqual(pick(rows, null, { cuts: [{ metric: 'assessment.averageScore', direction: 'bottom', unit: 'count', value: 1 }] }), ['Asha'], 'lowest scorer, not someone who never took a test');
  assert.deepEqual(pick(rows, null, { cuts: [{ metric: 'assessment.averageScore', direction: 'top', unit: 'count', value: 5 }] }), ['Asha', 'Bilal'], 'never more than the students with a score');
});

test('a test awaiting evaluation is taken, not missed, and the student is not "never took a test"', () => {
  const chen = cohort().find((row) => row.name === 'Chen');
  assert.equal(chen.assessment.awaiting, 1);
  assert.equal(chen.assessment.missedIds.includes('t1'), false, 'awaiting evaluation is not missed');
  assert.notEqual(chen.assessment.status, 'never');
  const dev = cohort().find((row) => row.name === 'Dev');
  assert.deepEqual(dev.assessment.missedIds.sort(), ['t1', 't2']);
  assert.equal(dev.assessment.status, 'never');
});

test('a test that started after the period is not counted as missed in that period', () => {
  const dev = cohort({ range: { preset: 'custom', from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-10-31T23:59:59Z') } }).find((row) => row.name === 'Dev');
  assert.deepEqual(dev.assessment.missedIds, ['t1'], 't2 started on 5 Nov, after the period ended');
});
