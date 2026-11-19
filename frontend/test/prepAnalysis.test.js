import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartInsight } from '../src/admin/prepAnalysis/charts/chartInsights.js';
import {
  buildChartOption, CHART_TYPES, chartHeight, chartTable, viewsFor,
} from '../src/admin/prepAnalysis/charts/chartOptions.js';
import { chartPartAt, chartTableKeys, fullPageHeight, legendParts, rowAt, trendPart } from '../src/admin/prepAnalysis/charts/chartParts.js';
import { alpha, chartTheme } from '../src/admin/prepAnalysis/charts/chartTheme.js';
import {
  compactOption, countActive, defaultFilterState, featureFields, groupName, groupText, isKpiActive, isMainField, kpiRule, listRule, newGroup,
  newRankRule, normalizeState, numberPresets, OPERATORS, rangeOf, rangeRule, rankMetrics, rankText, ruleText, setRule, studentFields, summaryLines,
  switchArea, toggleKpi, toQueryRequest, toRequestRank, valueParts, quickFilterFields,
} from '../src/admin/prepAnalysis/filterModel.js';

test('the filter line shows semester, branch, section and the feature status; missing fields are skipped', () => {
  const fieldMap = new Map(['student.semester', 'student.branch', 'quickprep.status', 'quickprep.activity', 'coding.practiceStatus']
    .map((key) => [key, { key, label: key }]));
  assert.deepEqual(quickFilterFields('quickprep', fieldMap).map((entry) => entry.label), ['Semester', 'Branch', 'Sheet status', 'Activity']);
  assert.deepEqual(quickFilterFields('coding', fieldMap).map((entry) => entry.field.key), ['student.semester', 'student.branch', 'coding.practiceStatus']);
  assert.ok(quickFilterFields('quickprep', fieldMap).length <= 5);
});
import { studentHighlights } from '../src/admin/prepAnalysis/studentInsights.js';
import { pathAllowed } from '../src/platform/universityPermissions.js';
import { assessmentAnalysisPath, prepAnalysisStateFromSearch } from '../src/admin/prepAnalysis/analysisPreset.js';

const FIELDS = [
  { key: 'student.semester', module: 'student', group: 'Class', label: 'Semester', kind: 'enum', valueType: 'number', options: 'semesters' },
  { key: 'student.branch', module: 'student', group: 'Class', label: 'Branch', kind: 'enum', options: 'branches' },
  { key: 'student.college', module: 'student', group: 'Class', label: 'Campus', kind: 'enum', options: 'colleges' },
  { key: 'student.search', module: 'student', group: 'Account', label: 'Name, email or student ID', kind: 'text' },
  { key: 'coding.practiceStatus', module: 'coding', group: 'Practice', label: 'Practice status', kind: 'enum', options: 'practiceStatuses' },
  { key: 'coding.solvedTopics', module: 'coding', group: 'Practice', label: 'Topic solved', kind: 'set', options: 'topics' },
  { key: 'coding.prepScore', module: 'coding', group: 'Results', label: 'Prep Score', kind: 'number', unit: '/ 100', rankable: true },
  { key: 'coding.solved', module: 'coding', group: 'Results', label: 'Problems solved', kind: 'number', qualifiers: 'coding', rankable: true },
  { key: 'coding.daysSinceActive', module: 'coding', group: 'Practice', label: 'Days since last practice', kind: 'number', unit: 'days' },
  // Quick Prep sheets are part of Prep Coding.
  { key: 'quickprep.progress', module: 'coding', group: 'Quick Prep sheets', label: 'Sheet progress', kind: 'percent', qualifiers: 'quickprep', rankable: true },
  { key: 'quickprep.status', module: 'coding', group: 'Quick Prep sheets', label: 'Quick Prep status', kind: 'enum', options: 'quickprepStatuses' },
  { key: 'learning.progress', module: 'learning', group: 'Learning', label: 'Course completed', kind: 'percent', rankable: true },
  { key: 'interview.communication', module: 'interview', group: 'Ratings', label: 'Communication rating', kind: 'number', unit: '/ 5', rankable: true },
  { key: 'interview.status', module: 'interview', group: 'Activity', label: 'Interview status', kind: 'enum', options: 'interviewStatuses' },
  { key: 'assessment.averageScore', module: 'assessment', group: 'Scores', label: 'Test score (their average)', kind: 'percent', rankable: true },
  { key: 'assessment.missed', module: 'assessment', group: 'Tests', label: 'Tests missed', kind: 'number', rankable: true },
];
const AREAS = [{ key: 'all', label: 'All features' }, { key: 'coding', label: 'Prep Coding' }, { key: 'learning', label: 'Prep Learning' }, { key: 'interview', label: 'Prep Interview' }, { key: 'assessment', label: 'Prep Assessment' }];
const catalog = { fields: FIELDS, areas: AREAS, staticOptions: { practiceStatuses: [{ value: 'inactive', label: 'Stopped (no practice for 14+ days)' }, { value: 'never', label: 'Never practised' }] } };
const fieldMap = new Map(FIELDS.map((field) => [field.key, field]));
const field = (key) => fieldMap.get(key);
const lookup = (entry, value) => catalog.staticOptions[entry.options]?.find((option) => option.value === value)?.label;
const label = (key) => field(key).label;
const pick = (key, values, operator) => listRule(field(key), values, operator);
const range = (key, from, to) => rangeRule(field(key), from, to);
const groupOf = (...rules) => rules.reduce((group, rule) => setRule(group, rule.field, rule), newGroup());

test('assessment reports open Prep Analysis with the selected assessment already filtered', () => {
  const path = assessmentAnalysisPath({ _id: 'test-42', title: 'Third Year' });
  assert.equal(path, '/admin/analysis?source=assessment&assessmentId=test-42&assessmentTitle=Third+Year');
  const state = prepAnalysisStateFromSearch(path.split('?')[1]);
  assert.equal(state.area, 'assessment');
  assert.deepEqual(state.groups[0].rules[0], {
    id: state.groups[0].rules[0].id,
    field: 'assessment.assignedTests',
    operator: 'anyOf',
    value: ['test-42'],
    labels: { 'test-42': 'Third Year' },
    qualifiers: {},
  });
});

test('direct Prep Analysis visits start on all students and feature links start in that feature', () => {
  const plain = prepAnalysisStateFromSearch('');
  assert.equal(plain.area, 'coding');
  assert.equal(plain.range.preset, 'all');
  assert.equal(plain.groups[0].rules.length, 0);
  assert.equal(plain.rank.rules.length, 0);
  const learning = prepAnalysisStateFromSearch('?source=learning');
  assert.equal(learning.area, 'learning');
  assert.equal(learning.groups[0].rules.length, 0);
});

// ---------------------------------------------------------------- what to analyse

test('the feature comes first, and Quick Prep filters belong to Prep Coding', () => {
  const coding = featureFields(catalog, 'coding').map((entry) => entry.key);
  assert.ok(coding.includes('quickprep.status'), 'Quick Prep is inside Prep Coding');
  // The Prep Score is the Prep Coding score, so the coding copy is not offered twice.
  assert.ok(!coding.includes('coding.prepScore'));
  assert.ok(coding.every((key) => !key.startsWith('student.')));
  assert.deepEqual([...new Set(featureFields(catalog, 'all').map((entry) => entry.module))], ['coding', 'learning', 'interview', 'assessment']);
  assert.deepEqual(studentFields(catalog).map((entry) => entry.key), ['student.semester', 'student.branch', 'student.college', 'student.search']);
  assert.deepEqual(rankMetrics(catalog, 'assessment').map((entry) => entry.key), ['assessment.averageScore', 'assessment.missed']);
  assert.ok(isMainField(field('student.semester')) && isMainField(field('student.college')), 'class filters (campus too) are shown straight away');
  assert.ok(!isMainField(field('student.search')), 'rarely used filters wait under "more"');
  const state = { ...defaultFilterState('coding'), groups: [groupOf(range('coding.prepScore', '50', ''), pick('student.semester', ['5']))], rank: { join: 'and', rules: [newRankRule('coding.prepScore')] } };
  const learning = switchArea(state, 'learning', fieldMap, catalog);
  assert.deepEqual(learning.groups[0].rules.map((rule) => rule.field), ['student.semester'], 'student filters stay, the old feature\'s go');
  assert.equal(learning.rank.rules.length, 0);
  assert.equal(switchArea(state, 'all', fieldMap, catalog).groups[0].rules.length, 2);
});

// ---------------------------------------------------------------- which students: tap options, add groups

test('tapping options builds a group; several options in a row mean any of them', () => {
  let group = newGroup();
  group = setRule(group, 'student.semester', pick('student.semester', ['5', '6']));
  group = setRule(group, 'coding.practiceStatus', pick('coding.practiceStatus', ['inactive'], 'noneOf'));
  group = setRule(group, 'coding.prepScore', range('coding.prepScore', '75', ''));
  assert.equal(group.rules.length, 3);
  group = setRule(group, 'student.semester', pick('student.semester', ['7']));
  assert.equal(group.rules.length, 3, 'changing a filter replaces it');
  assert.equal(listRule(field('student.branch'), []), null, 'untapping every option removes the filter');
  const request = toQueryRequest({ state: { ...defaultFilterState('coding'), groups: [group] } }, fieldMap);
  assert.deepEqual(request.filter, { type: 'group', join: 'and', children: [
    { type: 'rule', field: 'coding.practiceStatus', operator: 'noneOf', value: ['inactive'] },
    { type: 'rule', field: 'coding.prepScore', operator: 'gte', value: 75 },
    { type: 'rule', field: 'student.semester', operator: 'anyOf', value: [7] },
  ] });
});

test('another group adds "or these students"; an empty group means everyone', () => {
  const groupA = groupOf(pick('student.semester', ['5']), range('coding.prepScore', '75', ''));
  const groupB = groupOf(pick('student.semester', ['6']), pick('coding.practiceStatus', ['inactive']));
  const request = toQueryRequest({ state: { ...defaultFilterState('coding'), groups: [groupA, groupB] } }, fieldMap);
  assert.equal(request.filter.join, 'or');
  assert.deepEqual(request.filter.children.map((child) => child.children.map((rule) => rule.field)), [['student.semester', 'coding.prepScore'], ['student.semester', 'coding.practiceStatus']]);
  assert.deepEqual(toQueryRequest({ state: { ...defaultFilterState('coding'), groups: [groupA, newGroup()] } }, fieldMap).filter.children.map((rule) => rule.field), ['student.semester', 'coding.prepScore'], 'a group with nothing chosen yet is left out');
  assert.deepEqual(toQueryRequest({ state: { ...defaultFilterState('coding'), groups: [newGroup(), newGroup()] } }, fieldMap).filter.children, [], 'no filter at all means everyone');
  assert.equal(groupName(0), 'Group A');
  assert.equal(groupName(1), 'Group B');
});

test('number filters are one-tap ranges in the field\'s own scale, or a custom from-to', () => {
  assert.equal(numberPresets(field('coding.prepScore'))[3].label, '40 or more', 'Prep Score has no ceiling');
  assert.ok(numberPresets(field('interview.communication')).some((preset) => preset.label === '4 or more'), 'ratings use a 1-5 scale');
  assert.ok(numberPresets(field('coding.daysSinceActive')).some((preset) => preset.label === 'Over 14 days'));
  assert.equal(range('coding.prepScore', '80', '20').operator, 'between');
  assert.deepEqual(range('coding.prepScore', '80', '20').value, ['20', '80'], 'a reversed range is put the right way round');
  assert.equal(range('coding.prepScore', '', ''), null);
  for (const [from, to] of [['10', ''], ['', '30'], ['10', '30']]) assert.deepEqual(rangeOf(range('coding.solved', from, to)), { from, to });
});

test('every filter reads as plain words: in the drawer, on the page and in downloads', () => {
  assert.equal(ruleText(pick('student.semester', ['5', '6']), fieldMap), 'Semester: 5 or 6');
  assert.equal(ruleText({ ...pick('student.semester', ['5']), labels: { 5: 'Semester 5' } }, fieldMap), 'Semester: 5');
  assert.equal(ruleText(pick('coding.practiceStatus', ['inactive', 'never']), fieldMap, lookup), 'Practice status: Stopped or Never practised');
  assert.equal(ruleText(pick('student.branch', ['CSE', 'IT'], 'noneOf'), fieldMap), 'Branch: not CSE, IT');
  assert.equal(ruleText(range('coding.prepScore', '75', ''), fieldMap), 'Prep Score: 75 or more');
  assert.equal(ruleText(range('quickprep.progress', '', '30'), fieldMap), 'Sheet progress: up to 30%');
  assert.equal(ruleText(range('learning.progress', '20', '60'), fieldMap), 'Course completed: 20 to 60%');
  assert.equal(ruleText(range('interview.communication', '4', ''), fieldMap), 'Communication rating: 4 of 5 or more');
  assert.equal(compactOption('Practising (last 14 days)', field('coding.practiceStatus')), 'Practising');
  for (const operator of Object.values(OPERATORS).flat()) assert.doesNotMatch(operator.label, /\b(AND|OR|condition|operator)\b|[<>=]/);
  const state = {
    ...defaultFilterState('coding'),
    groups: [groupOf(pick('student.semester', ['5'])), groupOf(range('coding.prepScore', '75', ''))],
    rank: { join: 'and', rules: [newRankRule('coding.prepScore'), { ...newRankRule('quickprep.progress', 'bottom'), value: 20, unit: 'percent' }] },
  };
  assert.equal(groupText(state.groups[0], fieldMap), 'Semester: 5');
  assert.deepEqual(summaryLines(state, fieldMap, label, lookup), [
    'Group A: Semester: 5',
    'Or Group B: Prep Score: 75 or more',
    'Showing: Top 10 by Prep Score, and Bottom 20% by Sheet progress',
  ]);
  assert.deepEqual(summaryLines(defaultFilterState(), fieldMap, label, lookup), []);
});

test('a closed filter dropdown says "Any" or its choice in a few words', () => {
  assert.deepEqual(valueParts(null, field('coding.prepScore')), { text: 'Any', extra: 0 });
  assert.deepEqual(valueParts(pick('coding.solvedTopics', ['Arrays', 'Graphs', 'DP']), field('coding.solvedTopics')), { text: 'Arrays', extra: 2 });
  assert.deepEqual(valueParts(pick('student.branch', ['CSE'], 'noneOf'), field('student.branch')), { text: 'Not CSE', extra: 0 });
  assert.deepEqual(valueParts(pick('coding.practiceStatus', ['inactive']), field('coding.practiceStatus'), lookup), { text: 'Stopped', extra: 0 });
  assert.deepEqual(valueParts(range('coding.prepScore', '75', ''), field('coding.prepScore')), { text: '75 or more', extra: 0 }, 'a preset reads as its own label');
  assert.deepEqual(valueParts(range('learning.progress', '20', '60'), field('learning.progress')), { text: '20 to 60%', extra: 0 });
  assert.deepEqual(valueParts(range('coding.solved', '', '3'), field('coding.solved')), { text: 'Up to 3', extra: 0 });
  assert.deepEqual(valueParts({ field: 'student.search', operator: 'contains', value: 'asha' }, field('student.search')), { text: '“asha”', extra: 0 });
});

test('top / bottom: everyone, or your own rules by number or %', () => {
  const rank = { join: 'or', rules: [{ ...newRankRule('coding.prepScore'), value: '10', unit: 'percent' }, { ...newRankRule('coding.solved', 'bottom'), value: 5 }, { ...newRankRule('coding.solved'), value: '' }] };
  assert.deepEqual(toRequestRank(rank), { join: 'or', cuts: [
    { metric: 'coding.prepScore', direction: 'top', unit: 'percent', value: 10 },
    { metric: 'coding.solved', direction: 'bottom', unit: 'count', value: 5 },
  ] }, 'an unfinished rule is skipped');
  assert.deepEqual(toRequestRank({ rules: [{ ...newRankRule('coding.prepScore'), unit: 'percent', value: 150 }] }).cuts, []);
  assert.equal(rankText(rank, label), 'Top 10% by Prep Score, or Bottom 5 by Problems solved');
  const state = { ...defaultFilterState('coding'), groups: [groupOf(pick('student.semester', ['5']))], rank };
  assert.equal(countActive(state, fieldMap), 3);
});

test('charts keep their own small filter group; a chart\'s view and width stay in the browser', () => {
  const request = toQueryRequest({ state: defaultFilterState('coding'), layout: [{ id: 'top-students', options: { limit: 10 }, view: 'table', size: 'full' }, { id: 'topic-strength', filter: groupOf(pick('student.branch', ['CSE'])) }] }, fieldMap);
  assert.deepEqual(request.charts[0], { id: 'top-students', options: { limit: 10 } });
  assert.deepEqual(request.charts[1].filter.children, [{ type: 'rule', field: 'student.branch', operator: 'anyOf', value: ['CSE'] }]);
});

test('headline numbers set or clear their filter in every group with one click', () => {
  const stopped = kpiRule('coding', 'stopped', fieldMap);
  const twoGroups = { ...defaultFilterState('coding'), groups: [groupOf(pick('student.semester', ['5'])), groupOf(pick('student.semester', ['6']))] };
  const on = toggleKpi(stopped, twoGroups);
  assert.ok(isKpiActive(stopped, on));
  assert.ok(on.groups.every((group) => group.rules.some((rule) => rule.field === 'coding.practiceStatus')));
  assert.ok(toggleKpi(stopped, on).groups.every((group) => group.rules.length === 1), 'a second click undoes it');
  assert.equal(kpiRule('coding', 'students', fieldMap), null, 'not every number is clickable');
  assert.equal(kpiRule('assessment', 'missed', new Map()), null, 'nothing for fields this university does not have');
});

test('pages saved by earlier versions open as groups instead of breaking', () => {
  const v3 = normalizeState({ area: 'coding', range: { preset: '90d' }, filters: [{ id: 'a', field: 'student.semester', operator: 'anyOf', value: [5] }], ranking: { mode: 'bottom', value: 10, unit: 'percent', metric: 'coding.prepScore' } });
  assert.deepEqual(v3.groups[0].rules.map((rule) => rule.field), ['student.semester']);
  assert.deepEqual([v3.rank.rules[0].direction, v3.rank.rules[0].unit, v3.range.preset], ['bottom', 'percent', '90d']);
  const v4 = normalizeState({
    area: 'coding',
    feature: { type: 'group', join: 'and', children: [{ type: 'rule', field: 'coding.prepScore', operator: 'gte', value: '50' }] },
    students: { type: 'group', join: 'or', children: [{ type: 'group', children: [{ type: 'rule', field: 'student.branch', operator: 'anyOf', value: ['CSE'] }] }] },
    rank: { join: 'or', rules: [{ metric: 'coding.prepScore', direction: 'top', value: 5, unit: 'count' }] },
  });
  assert.deepEqual(v4.groups[0].rules.map((rule) => rule.field), ['coding.prepScore', 'student.branch']);
  assert.equal(v4.rank.join, 'or');
  assert.deepEqual(Object.keys(normalizeState(null)).sort(), ['area', 'groups', 'range', 'rank', 'sheets']);
  assert.deepEqual(normalizeState(null).sheets, [], 'no Quick Prep sheet scope means every sheet');
});

// ---------------------------------------------------------------- charts

// Payload shapes mirror backend/src/modules/prepAnalysis/charts.js.
const SAMPLES = {
  rankedStackedBar: { items: [{ id: 'a', name: 'Asha', position: 1, score: 62.4, segments: { Easy: 12.1, Medium: 20.3, Hard: 20, Accuracy: 10 }, solved: { Easy: 4, Medium: 3, Hard: 1 } }] },
  donut: { centerLabel: 'problems solved', items: [{ key: 'Easy', name: 'Easy', value: 9 }, { key: 'cpp', name: 'cpp', value: 3 }] },
  trend: { labels: ['2026-09-28', '2026-10-05'], series: [{ name: 'Topics completed', values: [4, 9] }, { name: 'Students learning', values: [3, 5], axis: 'right' }] },
  funnel: { stages: [{ name: 'Students', value: 40 }, { name: 'Started a sheet', value: 30 }, { name: 'Solved a question', value: 20 }, { name: 'Half of a sheet', value: 9 }, { name: 'Finished a sheet', value: 2 }] },
  barList: { valueLabel: '% of course completed', unit: '%', tone: 'warning', items: [{ id: 'd', name: 'Dev', value: 0, note: 'Never started', daysSinceActive: null }] },
  calendar: { from: '2025-10-10', to: '2026-10-10', unit: 'topics completed', days: [['2026-10-01', 4], ['2026-10-03', 1]], max: 4 },
  radar: { student: { id: 'a', name: 'Asha', score: 61 }, indicators: [{ name: 'Arrays', max: 5 }, { name: 'Graphs', max: 5 }, { name: 'DP', max: 5 }], values: [5, 2, 1] },
  histogram: { label: 'Course completed', bins: Array.from({ length: 10 }, (_, index) => ({ label: `${index * 10}–${index * 10 + 10}%`, count: index % 3 })) },
  stackedBar: { series: ['Finished', 'In progress', 'Not started'], horizontal: true, groups: [{ label: 'Placement essentials', students: 9, values: { Finished: 2, 'In progress': 3, 'Not started': 4 } }] },
  heatmap: { unit: '% solved', max: 100, students: ['Asha', 'Bilal'], columns: ['Sheet A', 'Sheet B'], cells: [[0, 0, 100], [1, 0, 25], [0, 1, 20], [1, 1, 0]] },
  scatter: {
    xLabel: 'Submissions', yLabel: 'Prep Score', sizeLabel: 'problems solved', groups: ['Practising', 'Stopped'], total: 3, shown: 3, medianX: 12, medianY: 5,
    items: [{ id: 'a', name: 'Asha', x: 40, y: 12, size: 9, group: 'Practising', note: '9 solved' }, { id: 'b', name: 'Bilal', x: 12, y: 5, size: 3, group: 'Practising' }, { id: 'c', name: 'Chen', x: 30, y: 2, size: 1, group: 'Stopped' }],
  },
  boxplot: {
    groupBy: 'semester', label: 'Average test score', unit: '%', passMark: 40,
    groups: [{ label: 'Sem 1', students: 5, count: 5, min: 10, q1: 30, median: 45, q3: 60, max: 90, mean: 46 }, { label: 'Sem 2', students: 3, count: 3, min: 35, q1: 40, median: 50, q3: 70, max: 80, mean: 55 }],
  },
  bubble: {
    valueLabel: 'students solving', itemLabel: 'Topic', cohort: 589,
    tiers: [{ key: 'strong', label: 'Most practised' }, { key: 'growing', label: 'Growing' }, { key: 'focus', label: 'Needs focus' }],
    items: [{ key: 'String', name: 'String', value: 9, pct: 1.5, accuracy: 60, tier: 'strong' }, { key: 'Stack', name: 'Stack', value: 4, pct: 0.7, accuracy: 50, tier: 'growing' }, { key: 'BFS {x}', name: 'BFS {x}', value: 1, pct: 0.2, accuracy: 100, tier: 'focus' }],
  },
  combo: {
    barLabel: 'questions',
    categories: [{ key: 'Easy', label: 'Easy', students: 4, note: '4 students solved one' }, { key: 'Hard', label: 'Hard', students: 1, note: '1 students solved one' }],
    bars: [{ name: 'Solved', values: [6, 1], stack: 'questions' }, { name: 'Not solved yet', values: [2, 3], stack: 'questions' }],
    lines: [{ name: 'Solve rate', unit: '%', values: [75, 25] }],
  },
};
const serializable = (option) => JSON.stringify(option, (key, value) => (typeof value === 'function' ? undefined : value));

test('every chart type builds in every view, light and dark, and is empty with no data', () => {
  assert.deepEqual([...CHART_TYPES].sort(), Object.keys(SAMPLES).sort(), 'every renderer has a sample');
  for (const dark of [false, true]) {
    for (const [type, data] of Object.entries(SAMPLES)) {
      for (const view of viewsFor(type).filter((entry) => entry.value !== 'table')) {
        const option = buildChartOption({ type, data, size: 'md', section: 'quickprep' }, chartTheme(dark), view.value);
        assert.ok(option?.series?.length, `${type} as ${view.label} draws a series`);
        assert.doesNotThrow(() => serializable(option));
      }
      assert.equal(viewsFor(type).at(-1).value, 'table', `${type} can be a table`);
    }
  }
  const empty = {
    rankedStackedBar: { items: [] }, donut: { items: [] }, trend: { labels: [] }, funnel: { stages: [{ value: 0 }] },
    barList: { items: [] }, calendar: { days: [] }, radar: { student: null, indicators: [] }, histogram: { bins: [{ count: 0 }] },
    stackedBar: { groups: [] }, heatmap: { students: [], columns: [] }, scatter: { items: [] }, boxplot: { groups: [{ count: 0 }] },
    combo: { categories: [], bars: [], lines: [] }, bubble: { items: [] },
  };
  for (const [type, data] of Object.entries(empty)) assert.equal(buildChartOption({ type, data }, chartTheme(false)), null, `${type} is empty`);
  assert.ok(chartHeight({ type: 'stackedBar', data: { horizontal: true, groups: new Array(10).fill({}) } }) > chartHeight({ type: 'stackedBar', data: { horizontal: true, groups: [{}] } }));
});

test('views change how a chart reads: steps with %, 100% bars, weekly lines', () => {
  const steps = buildChartOption({ type: 'funnel', data: SAMPLES.funnel }, chartTheme(false));
  assert.equal(steps.series[0].type, 'bar');
  // Count and share are two right-aligned columns (row axes 2 and 3) under headings, never "30 · 75%".
  assert.equal(steps.yAxis[1].axisLabel.formatter('1'), '30');
  assert.equal(steps.yAxis[2].axisLabel.formatter('1'), '75%');
  assert.deepEqual(steps.title.map((heading) => heading.text), ['STEP', 'STUDENTS', '% OF FIRST']);
  const percent = buildChartOption({ type: 'stackedBar', data: SAMPLES.stackedBar }, chartTheme(false), 'percent');
  assert.deepEqual(percent.series.map((series) => series.data[0]), [22, 33, 44]);
  const grouped = buildChartOption({ type: 'stackedBar', data: SAMPLES.stackedBar }, chartTheme(false), 'grouped');
  assert.ok(grouped.series.every((series) => !series.stack), 'side by side bars are not stacked');
  const weekly = buildChartOption({ type: 'calendar', data: SAMPLES.calendar }, chartTheme(false), 'weekly');
  assert.deepEqual(weekly.series[0].data, [5], 'days in the same week add up');
  const accent = buildChartOption({ type: 'radar', data: SAMPLES.radar, section: 'learning' }, chartTheme(false));
  assert.equal(accent.series[0].data[0].itemStyle.color, '#0284c7', 'every feature uses the app\'s sky colour');
  assert.equal(alpha('#4f46e5', 0.5), 'rgba(79,70,229,0.5)');
  assert.equal(alpha('rgba(79,70,229,0.5)', 0.5), 'rgba(79,70,229,0.25)');
});

test('box plots, heat grids, treemaps and dots point at the right group, cell, row and student', () => {
  const at = (type, data, params, view = 'chart') => chartPartAt({ type, data, drillable: true }, view, params);
  assert.equal(at('boxplot', SAMPLES.boxplot, { dataIndex: 1 }).key, 'Sem 2', 'a box (or its average diamond) is its group');
  assert.equal(at('boxplot', SAMPLES.boxplot, { dataIndex: 1 }).students, 3);
  // A heat cell is [series, group, count]: the click knows both, not just the cell's position in the list.
  assert.equal(at('stackedBar', SAMPLES.stackedBar, { dataIndex: 7, value: [1, 0, 3] }, 'heat').key, 'Placement essentials|In progress');
  assert.equal(at('radar', { indicators: [{ name: 'Arrays' }, { name: 'Graphs' }, { name: 'DP' }], topics: [] }, { dataIndex: 2 }, 'polar').key, 'DP', 'the radial bars are topics');

  // A treemap puts a hidden root first, so each box carries its own row and zeros stay drawable.
  const donut = buildChartOption({ type: 'donut', data: SAMPLES.donut }, chartTheme(false), 'treemap');
  assert.deepEqual(donut.series[0].data.map((box) => box.rowIndex), [0, 1]);
  const zeros = buildChartOption({ type: 'barList', data: SAMPLES.barList }, chartTheme(false), 'treemap');
  assert.equal(zeros.series[0].data[0].real, 0, 'the label keeps the real value');
  assert.ok(zeros.series[0].data[0].value > 0, 'but the box has a size');
  const mixed = buildChartOption({ type: 'barList', data: { items: [{ key: 'a', name: 'A', value: 50 }, { key: 'b', name: 'B', value: 0 }] } }, chartTheme(false), 'treemap');
  assert.ok(mixed.series[0].data[1].value < mixed.series[0].data[0].value / 20, 'a zero is a sliver beside real values');

  // Dots are students: the option carries the student for the click, and no dot is drawn without data.
  const dots = buildChartOption({ type: 'scatter', data: SAMPLES.scatter }, chartTheme(false));
  assert.deepEqual(dots.series.map((series) => [series.name, series.data.length]), [['Practising', 2], ['Stopped', 1]]);
  assert.equal(dots.series[0].data[0].item.id, 'a');
  assert.equal(chartTable({ type: 'scatter', data: SAMPLES.scatter }).ids.join(), 'a,b,c', 'a table row opens its student');
  const boxes = buildChartOption({ type: 'boxplot', data: SAMPLES.boxplot }, chartTheme(false));
  assert.deepEqual(boxes.series[0].data[0], [10, 30, 45, 60, 90], 'low, lower quartile, median, upper quartile, high');
  assert.ok(boxes.series[0].markLine, 'the pass mark is drawn');
  assert.deepEqual(chartTableKeys({ type: 'boxplot', data: SAMPLES.boxplot }), ['Sem 1', 'Sem 2']);
  assert.match(chartInsight({ id: 'class-spread', data: SAMPLES.boxplot }), /Sem 2 has the highest middle/);
  assert.match(chartInsight({ id: 'student-map', data: SAMPLES.scatter }), /submitted more than the middle student/);
});

test('every chart can be read as a table', () => {
  for (const [type, data] of Object.entries(SAMPLES)) {
    const table = chartTable({ type, data });
    assert.ok(table.columns.length >= 2, `${type} has columns`);
    assert.ok(table.rows.length >= 1 && table.rows.every((row) => row.length === table.columns.length), `${type} rows fit the columns`);
  }
  assert.deepEqual(chartTable({ type: 'funnel', data: SAMPLES.funnel }).rows[1], ['Started a sheet', 30, 75, 75]);
  assert.deepEqual(chartTable({ type: 'heatmap', data: SAMPLES.heatmap }).rows[0], ['Asha', 100, 25]);
  assert.deepEqual(chartTable({ type: 'barList', data: SAMPLES.barList }).ids, ['d'], 'rows know their student');
});

test('new parts: submission trend day/week keys, the funnel\'s lost students, and empty calendar days', () => {
  const at = (type, data, params, view = 'chart') => chartPartAt({ type, data, drillable: true }, view, params);
  const daily = { interval: 'day', labels: ['2026-11-05'], keys: ['2026-11-05'], series: [{ name: 'Accepted', values: [3] }, { name: 'Not accepted', values: [2] }] };
  assert.equal(trendPart({ data: daily }, 0).key, '2026-11-05');
  assert.doesNotMatch(trendPart({ data: daily }, 0).label, /Week of/, 'a day is labelled as a day');
  const weekly = { interval: 'week', labels: ['2026-11-02'], keys: ['week:2026-11-02'], series: daily.series };
  assert.equal(trendPart({ data: weekly }, 0).key, 'week:2026-11-02');
  assert.equal(trendPart({ data: weekly }, 0).label, 'Week of 2026-11-02');
  const funnel = { stages: [{ name: 'Students', value: 10 }, { name: 'Started practising', value: 4 }], drops: [{ key: 'lost:1', from: 'Students', to: 'Started practising', students: 6 }] };
  assert.equal(at('funnel', funnel, { dataIndex: 1, seriesName: 'Lost since the step before' }, 'drop').key, 'lost:1', 'the red part lists who stopped, not who reached');
  assert.equal(at('funnel', funnel, { dataIndex: 1, seriesName: 'Reached' }, 'drop').key, '1');
  assert.equal(at('calendar', { days: [['2026-11-05', 2]] }, { value: ['2026-11-04', 0] }), null, 'an empty day shows its 0 but has nobody to list');
  assert.equal(at('calendar', { days: [['2026-11-05', 2]] }, { value: ['2026-11-05', 2] }).key, '2026-11-05');
  assert.deepEqual(chartTableKeys({ type: 'trend', data: weekly }), ['week:2026-11-02'], 'table rows drill with the same keys');
});

test('a click on a chart points at the part whose students can be listed', () => {
  const at = (type, data, params, view = 'chart') => chartPartAt({ type, data, drillable: true }, view, params);
  assert.deepEqual(at('donut', { centerLabel: 'problems solved', items: [{ key: 'Easy', name: 'Easy', value: 0 }, { key: 'Hard', name: 'Hard', value: 2, students: 1 }] }, { dataIndex: 0 }),
    { key: 'Hard', label: 'Hard', color: '#f43f5e', value: 2, unit: 'problems solved', students: 1 }, 'empty slices are not drawn, so indexes skip them');
  const top = { items: [{ id: 's1', name: 'Asha', score: 5, solved: { Easy: 1, Medium: 2, Hard: 3 } }] };
  for (const view of ['chart', 'mix']) {
    for (const seriesName of ['Easy', 'Medium', 'Hard']) {
      assert.equal(at('rankedStackedBar', top, { dataIndex: 0, seriesName }, view), null, 'segments have no separate drill-down');
    }
    assert.deepEqual(rowAt({ type: 'rankedStackedBar', data: top }, view, 0), { studentId: 's1' }, 'the entire row opens a single student');
  }
  assert.equal(at('radar', SAMPLES.radar, { componentType: 'radar', name: 'Graphs' }).key, 'Graphs', 'a topic name on the radar');
  assert.equal(at('stackedBar', SAMPLES.stackedBar, { dataIndex: 0, seriesName: 'Finished' }).key, 'Placement essentials|Finished');
  assert.deepEqual(legendParts({ type: 'donut', data: SAMPLES.donut }).map((part) => [part.key, part.share]), [['Easy', 75], ['cpp', 25]], 'legend chips are parts with their share');
  assert.deepEqual(legendParts({ type: 'rankedStackedBar', data: top }).map((part) => part.key), ['*|Easy', '*|Medium', '*|Hard']);
  assert.equal(trendPart({ type: 'trend', data: SAMPLES.trend }, 0).key, '2026-09-28', 'anywhere in a week\'s column');
  assert.equal(at('donut', SAMPLES.donut, { dataIndex: 1 }).label, 'C++', 'languages read as names');
  assert.equal(at('barList', { valueLabel: 'students solving', items: [{ key: 'Graphs', name: 'Graphs', value: 4 }] }, { dataIndex: 0 }).students, 4);
  assert.equal(at('barList', SAMPLES.barList, { dataIndex: 0 }), null, 'a student row has no part (it opens the student)');
  assert.equal(at('funnel', SAMPLES.funnel, { dataIndex: 2 }).key, '2');
  assert.equal(at('trend', SAMPLES.trend, { dataIndex: 1 }).students, 5, 'the students-per-week line');
  assert.equal(at('calendar', SAMPLES.calendar, { value: ['2026-10-01', 4] }).key, '2026-10-01');
  assert.equal(at('calendar', SAMPLES.calendar, { dataIndex: 0 }, 'weekly'), null, 'a week is not one day');
  assert.equal(at('radar', SAMPLES.radar, { dataIndex: 1 }), null, 'the radar shape is one series');
  assert.equal(at('radar', SAMPLES.radar, { dataIndex: 1 }, 'bars').key, 'Graphs');
  assert.deepEqual(chartTableKeys({ type: 'histogram', data: { bins: [{ key: '0', label: 'a', count: 1 }, { label: 'b', count: 2 }] } }), ['0', '1']);
  assert.ok(fullPageHeight({ type: 'barList', data: { items: new Array(150).fill({}) } }) > 150 * 25, 'every topic gets room on the full page');
});

test('the skill profile shows every student in view, or one student next to the average', () => {
  const cohort = {
    mode: 'cohort', cohort: 241, student: null, unit: '%', indicators: [{ name: 'String', max: 100 }, { name: 'Array', max: 100 }, { name: 'Math', max: 100 }], values: [41.9, 29, 14.5],
    topics: [{ name: 'String', students: 101, pct: 41.9, avgSolved: 0.8, accuracy: 70 }, { name: 'Array', students: 70, pct: 29, avgSolved: 0.6, accuracy: 65 }, { name: 'Math', students: 35, pct: 14.5, avgSolved: 0.2, accuracy: 50 }],
  };
  const option = buildChartOption({ type: 'radar', data: cohort }, chartTheme(false));
  assert.equal(option.title.text, 'All students in view');
  assert.equal(option.series[0].data.length, 1);
  assert.deepEqual(chartTable({ type: 'radar', data: cohort }).rows[0], ['String', 101, 41.9, 0.8, 70]);
  assert.equal(chartInsight({ id: 'student-profile', type: 'radar', data: cohort }), '41.9% of these students (101 of 241) have solved String; Math is the least covered here (14.5%).');
  const student = { ...SAMPLES.radar, mode: 'student', average: [1, 0.5, 0.2], topics: [{ name: 'Arrays', accuracy: 50 }, { name: 'Graphs', accuracy: 40 }, { name: 'DP', accuracy: 30 }] };
  assert.equal(buildChartOption({ type: 'radar', data: student }, chartTheme(false)).series[0].data.length, 2, 'the student next to the average');
  assert.match(chartInsight({ id: 'student-profile', type: 'radar', data: { mode: 'student', missing: true } }), /not in the current filter/);
});

test('top-student bars are as long as the score and the label is the score', () => {
  const data = { items: [{ id: 'a', name: 'Depth', position: 1, score: 13.4, segments: { Easy: 0.4, Medium: 3.6, Hard: 9.4 }, counts: { Easy: 2, Medium: 6, Hard: 6 }, solved: { Easy: 1, Medium: 0, Hard: 0 } }] };
  const option = buildChartOption({ type: 'rankedStackedBar', data }, chartTheme(false));
  const length = option.series.reduce((sum, series) => sum + series.data[0], 0);
  assert.equal(Math.round(length * 10) / 10, 13.4);
  assert.deepEqual(option.title.map((heading) => heading.text), ['Student', 'Prep Score']);
  assert.equal(option.yAxis[1].axisLabel.formatter('0'), '13.4');
  assert.deepEqual(chartTable({ type: 'rankedStackedBar', data }).rows[0], [1, 'Depth', 13.4, 1, 0, 0], 'the table shows problems solved in the period, like the drawer');
});

test('each chart says what stands out in one sentence, with no averages', () => {
  const insight = (id, type, data) => chartInsight({ id, type, data });
  assert.equal(insight('top-students', 'rankedStackedBar', SAMPLES.rankedStackedBar), 'Asha leads with a Prep Score of 62.4, with 1 Hard problem solved.');
  assert.equal(insight('quickprep-funnel', 'funnel', SAMPLES.funnel), 'Biggest drop: “Half of a sheet” to “Finished a sheet”, where 7 students (78%) stop.');
  assert.equal(insight('learning-trend', 'trend', SAMPLES.trend), '9 topics completed in the latest week, up 125% on the week before.');
  assert.equal(insight('learning-needs-attention', 'barList', SAMPLES.barList), 'This student has not studied in the last 14 days.');
  const attention = { items: [{ name: 'A', value: 1, daysSinceActive: 30 }, { name: 'B', value: 2, daysSinceActive: 2 }, { name: 'C', value: 3, daysSinceActive: null }] };
  assert.equal(insight('needs-attention', 'barList', attention), '2 of these 3 students have not practised in the last 14 days.');
  assert.equal(insight('quickprep-sheets', 'stackedBar', SAMPLES.stackedBar), 'Most finished: Placement essentials (2 students). Most not started: Placement essentials (4).');
  assert.equal(insight('quickprep-matrix', 'heatmap', SAMPLES.heatmap), '1 of these 2 students have finished at least one of these sheets.');
  assert.match(insight('learning-calendar', 'calendar', SAMPLES.calendar), /^Busiest day: .+, with 4 topics completed\. Darker squares mean more activity\.$/);
  assert.equal(insight('student-profile', 'radar', SAMPLES.radar), 'Asha is strongest in Arrays (5 solved) and weakest in DP (1).');
  assert.equal(insight('difficulty-split', 'donut', { items: [{ key: 'Easy', value: 6 }, { key: 'Medium', value: 3 }, { key: 'Hard', value: 1 }] }), '60% of solved problems are Easy, 30% Medium and 10% Hard.');
  assert.equal(insight('top-students', 'rankedStackedBar', { items: [] }), null, 'nothing to say about nothing');
  for (const [type, data] of Object.entries(SAMPLES)) assert.doesNotMatch(String(insight('any', type, data)), /average/i);
});

test('charts speak the area\'s own units and colours, and escape names', () => {
  const sheets = buildChartOption({ type: 'stackedBar', data: SAMPLES.stackedBar }, chartTheme(false));
  assert.deepEqual(sheets.series.map((series) => series.name), ['Finished', 'In progress', 'Not started']);
  assert.equal(sheets.series[0].itemStyle.color, '#10b981', 'Finished is green');
  const matrix = buildChartOption({ type: 'heatmap', data: SAMPLES.heatmap }, chartTheme(false));
  assert.match(matrix.tooltip.formatter({ value: [0, 0, 100] }), /100%<\/b> solved/);
  const behind = buildChartOption({ type: 'barList', data: SAMPLES.barList }, chartTheme(false));
  assert.equal(behind.yAxis[1].axisLabel.formatter('0'), '0%');
  const topics = buildChartOption({ type: 'barList', data: { valueLabel: 'students solving', cohort: 3000, items: [{ key: 'Graphs', name: 'Graphs', value: 1175, pct: 39.2 }] } }, chartTheme(false));
  assert.equal(topics.yAxis[1].axisLabel.formatter('0'), '1,175', 'the count column');
  assert.equal(topics.yAxis[2].axisLabel.formatter('0'), '39.2%', 'its share of everyone in view, in its own column');
  assert.deepEqual(topics.title.map((heading) => heading.text), ['STUDENTS', '% OF STUDENTS'], 'every figures column has a short heading');
  assert.equal(behind.yAxis.length, 2, 'no share column when there is no share');
  // Bubbles: one per topic, sized by students, coloured by priority; names cannot break the label.
  const bubbles = buildChartOption({ type: 'bubble', data: SAMPLES.bubble }, chartTheme(false));
  const nodes = bubbles.series[0].data;
  assert.equal(nodes.length, 3, 'every topic is a bubble, not a top-N');
  assert.ok(nodes[0].symbolSize > nodes[1].symbolSize && nodes[1].symbolSize > nodes[2].symbolSize, 'more students, bigger bubble');
  assert.deepEqual(nodes.map((node) => node.category), [0, 1, 2], 'colour follows the priority tier');
  assert.equal(nodes[2].label.formatter(), '{name|BFS x}', 'rich-text markers in a topic name are removed');
  assert.deepEqual(chartPartAt({ type: 'bubble', data: SAMPLES.bubble, drillable: true }, 'chart', { dataIndex: 1 }).key, 'Stack', 'a bubble opens its topic');
  assert.equal(buildChartOption({ type: 'bubble', data: SAMPLES.bubble }, chartTheme(false), 'bars').yAxis[2].axisLabel.formatter('0'), '1.5%', 'the Bars view has the same columns');
  assert.equal(topics.yAxis[0].axisLabel.formatter('0'), 'Graphs', 'rows are indexes, labels are names');
  const histogram = buildChartOption({ type: 'histogram', data: SAMPLES.histogram }, chartTheme(false));
  assert.equal(histogram.xAxis.name, 'Course completed');
  const leaderboard = buildChartOption({ type: 'rankedStackedBar', data: { items: [{ ...SAMPLES.rankedStackedBar.items[0], name: '<img src=x>' }] } }, chartTheme(false));
  assert.ok(!leaderboard.tooltip.formatter({ dataIndex: 0, seriesName: 'Hard' }).includes('<img'), 'student names are escaped');
});

// ---------------------------------------------------------------- one student

test('a student profile says what stands out, from that student\'s own work only', () => {
  const coding = {
    practiceStatus: 'inactive', daysSinceActive: 21, solved: { Easy: 50, Medium: 12, Hard: 0, total: 62 },
    submissions: 120, accuracy: 31, verdicts: [{ key: 'AC', name: 'Accepted', value: 37 }, { key: 'TLE', name: 'Too slow', value: 60 }, { key: 'WA', name: 'Wrong answer', value: 23 }],
    topics: [{ name: 'Arrays', solved: 30, attempted: 32 }, { name: 'Dynamic Programming', solved: 1, attempted: 6 }],
  };
  const quickprep = { status: 'inProgress', finished: 0, sheets: [{ title: 'Graphs sprint', solved: 1, total: 10, progress: 10, finished: false }], notStarted: [] };
  const learning = { status: 'active', progress: 12, daysSinceActive: 2, subjects: [] };
  const lines = studentHighlights({ coding, quickprep, learning }, 20);
  const texts = lines.map((line) => line.text);
  assert.ok(texts.includes('No coding practice for 21 days.'));
  assert.ok(texts.includes('Low accuracy: 31% of submissions accepted; most failures are “Too slow”.'));
  assert.ok(texts.includes('Ready for Hard problems: 12 Mediums solved, no Hard yet.'));
  assert.ok(!texts.some((text) => /points|quality/.test(text)), 'no scoring arithmetic in the highlights');
  assert.ok(texts.includes('Finding Dynamic Programming hard: 1 of 6 tried problems solved.'));
  assert.ok(texts.includes('Stuck in “Graphs sprint”: 1 of 10 questions solved.'));
  assert.ok(texts.includes('Behind in the course: 12% of the topics open to them completed.'));
  assert.equal(lines[0].tone, 'warn', 'problems come first');
  assert.ok(texts.every((text) => !/average|class|cohort|other students/i.test(text)), 'never compared with others');
  assert.deepEqual(studentHighlights({ coding: { practiceStatus: 'never', solved: { total: 0 } } }), [{ tone: 'warn', text: 'Has not submitted any code yet.' }]);
  assert.equal(studentHighlights({ coding }).length, 5, 'a short list by default');
});

test('the old analytics page stays reachable for assessment analysis only when assessments are licensed', () => {
  const university = { university: true };
  assert.equal(pathAllowed('/admin/analysis/assessments', { questions: true, assessments: false }, 'admin', '', university), false);
  assert.equal(pathAllowed('/admin/analysis/assessments', { questions: false, assessments: true }, 'admin', '', university), true);
  assert.equal(pathAllowed('/admin/analysis', { questions: true }, 'admin', '', university), true);
});

test('heat map: Monday-first weeks, levels, streaks and figures for the period', async () => {
  const { heatmapModel } = await import('../src/admin/prepAnalysis/charts/heatmapModel.js');
  // 2026-11-02 is a Monday. Active: 3rd–5th (a 3-day run), and the 9th (the period end).
  const model = heatmapModel({ from: '2026-11-02', to: '2026-11-09', unit: 'submissions', days: [['2026-11-03', 1], ['2026-11-04', 8], ['2026-11-05', 2], ['2026-11-09', 4]] });
  assert.equal(model.weeks.length, 2);
  assert.equal(model.weeks[0][0].day, '2026-11-02', 'weeks start on Monday');
  assert.equal(model.weeks[1][1], null, 'days after the period end are blank');
  assert.deepEqual(model.weeks[0].slice(1, 4).map((day) => day.level), [1, 4, 1], 'max 8 → steps of 2');
  assert.equal(model.weeks[0][0].level, 0);
  assert.deepEqual(model.stats, {
    total: 15, activeDays: 4, days: 8, busiest: { day: '2026-11-04', value: 8 }, currentStreak: 1, bestStreak: 3, perActiveDay: 3.8,
    last7: 15, last30: 15, lastActive: '2026-11-09', daysSinceActive: 0,
  });
  assert.deepEqual(model.legend.map((entry) => entry.label), ['0', '1–2', '3–4', '5–6', '7+']);
  // Today (the period end) without activity yet: the streak up to yesterday still counts.
  const resting = heatmapModel({ from: '2026-11-02', to: '2026-11-06', days: [['2026-11-04', 1], ['2026-11-05', 1]] });
  assert.equal(resting.stats.currentStreak, 2);
});

test('a redesigned default layout replaces the saved one once, then admin changes stay', async () => {
  const { upgradeToDefaults } = await import('../src/admin/prepAnalysis/layoutDefaults.js');
  const saved = { coding: [{ id: 'top-students' }], learning: [{ id: 'learning-trend' }] };
  const upgraded = upgradeToDefaults(saved, {}, { coding: 2 });
  assert.deepEqual(upgraded.layouts, { learning: [{ id: 'learning-trend' }] }, 'only the redesigned area falls back to its default');
  assert.deepEqual(upgraded.versions, { coding: 2 });
  assert.equal(upgradeToDefaults({ coding: [{ id: 'mine' }] }, upgraded.versions, { coding: 2 }), null, 'already on this version: nothing changes');
});
