import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartInsight } from '../src/admin/prepAnalysis/charts/chartInsights.js';
import {
  buildChartOption, CHART_TYPES, chartCsv, chartHeight, chartTable, viewsFor,
} from '../src/admin/prepAnalysis/charts/chartOptions.js';
import { alpha, chartTheme } from '../src/admin/prepAnalysis/charts/chartTheme.js';
import {
  compactOption, countActive, defaultFilterState, featureFields, groupName, groupText, isKpiActive, isMainField, kpiRule, listRule, newGroup,
  newRankRule, normalizeState, numberPresets, OPERATORS, rangeOf, rangeRule, rankMetrics, rankText, ruleText, setRule, studentFields, summaryLines,
  switchArea, toggleKpi, toQueryRequest, toRequestRank, valueParts,
} from '../src/admin/prepAnalysis/filterModel.js';
import { pointsPerSolve, studentHighlights } from '../src/admin/prepAnalysis/studentInsights.js';
import { pathAllowed } from '../src/platform/universityPermissions.js';

const FIELDS = [
  { key: 'student.semester', module: 'student', group: 'Class', label: 'Semester', kind: 'enum', valueType: 'number', options: 'semesters' },
  { key: 'student.branch', module: 'student', group: 'Class', label: 'Branch', kind: 'enum', options: 'branches' },
  { key: 'student.college', module: 'student', group: 'Class', label: 'College / University', kind: 'enum', options: 'colleges' },
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

// ---------------------------------------------------------------- what to analyse

test('the feature comes first, and Quick Prep filters belong to Prep Coding', () => {
  const coding = featureFields(catalog, 'coding').map((entry) => entry.key);
  assert.ok(coding.includes('quickprep.status') && coding.includes('coding.prepScore'), 'Quick Prep is inside Prep Coding');
  assert.ok(coding.every((key) => !key.startsWith('student.')));
  assert.deepEqual([...new Set(featureFields(catalog, 'all').map((entry) => entry.module))], ['coding', 'learning', 'interview', 'assessment']);
  assert.deepEqual(studentFields(catalog).map((entry) => entry.key), ['student.semester', 'student.branch', 'student.college', 'student.search']);
  assert.deepEqual(rankMetrics(catalog, 'assessment').map((entry) => entry.key), ['assessment.averageScore', 'assessment.missed']);
  assert.ok(isMainField(field('student.semester')) && !isMainField(field('student.college')), 'rarely used filters wait under "more"');
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
  assert.equal(numberPresets(field('coding.prepScore'))[3].label, '75 or more');
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
  assert.deepEqual(Object.keys(normalizeState(null)).sort(), ['area', 'groups', 'range', 'rank']);
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
    stackedBar: { groups: [] }, heatmap: { students: [], columns: [] },
  };
  for (const [type, data] of Object.entries(empty)) assert.equal(buildChartOption({ type, data }, chartTheme(false)), null, `${type} is empty`);
  assert.ok(chartHeight({ type: 'stackedBar', data: { horizontal: true, groups: new Array(10).fill({}) } }) > chartHeight({ type: 'stackedBar', data: { horizontal: true, groups: [{}] } }));
});

test('views change how a chart reads: steps with %, 100% bars, weekly lines', () => {
  const steps = buildChartOption({ type: 'funnel', data: SAMPLES.funnel }, chartTheme(false));
  assert.equal(steps.series[0].type, 'bar');
  assert.equal(steps.series[0].label.formatter({ dataIndex: 1, value: 30 }), '30 · 75%');
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

test('every chart can be read as a table and downloaded as safe CSV', () => {
  for (const [type, data] of Object.entries(SAMPLES)) {
    const table = chartTable({ type, data });
    assert.ok(table.columns.length >= 2, `${type} has columns`);
    assert.ok(table.rows.length >= 1 && table.rows.every((row) => row.length === table.columns.length), `${type} rows fit the columns`);
  }
  assert.deepEqual(chartTable({ type: 'funnel', data: SAMPLES.funnel }).rows[1], ['Started a sheet', 30, 75, 75]);
  assert.deepEqual(chartTable({ type: 'heatmap', data: SAMPLES.heatmap }).rows[0], ['Asha', 100, 25]);
  assert.deepEqual(chartTable({ type: 'barList', data: SAMPLES.barList }).ids, ['d'], 'rows know their student');
  const csv = chartCsv({ type: 'barList', data: { valueLabel: 'failed attempts', items: [{ name: '=cmd()', value: -1 }] } });
  assert.ok(csv.startsWith('\uFEFFName,Failed attempts'));
  assert.match(csv, /'=cmd\(\),-1/, 'formula-looking text is neutralised, numbers are not');
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
  assert.match(insight('learning-calendar', 'calendar', SAMPLES.calendar), /^Active on 2 days in the last year\. Busiest: .+ \(4 topics completed\)\.$/);
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
  assert.equal(behind.series[0].label.formatter({ value: 40 }), '40%');
  const histogram = buildChartOption({ type: 'histogram', data: SAMPLES.histogram }, chartTheme(false));
  assert.equal(histogram.xAxis.name, 'Course completed');
  const leaderboard = buildChartOption({ type: 'rankedStackedBar', data: { items: [{ ...SAMPLES.rankedStackedBar.items[0], name: '<img src=x>' }] } }, chartTheme(false));
  assert.ok(!leaderboard.tooltip.formatter([{ dataIndex: 0 }]).includes('<img'), 'student names are escaped');
});

// ---------------------------------------------------------------- one student

const FORMULA = { weights: { Easy: 10, Medium: 20, Hard: 40 }, targets: { Easy: 50, Medium: 40, Hard: 20 }, progressShare: 0.85, accuracyShare: 0.15, accuracyFullCreditSubmissions: 10 };

test('a student profile says what stands out, from that student\'s own work only', () => {
  assert.deepEqual(pointsPerSolve(FORMULA), { Easy: 0.2, Medium: 0.6, Hard: 2.4 });
  const coding = {
    practiceStatus: 'inactive', daysSinceActive: 21, solved: { Easy: 50, Medium: 12, Hard: 0, total: 62 }, targets: FORMULA.targets,
    submissions: 120, accuracy: 31, verdicts: [{ key: 'AC', name: 'Accepted', value: 37 }, { key: 'TLE', name: 'Too slow', value: 60 }, { key: 'WA', name: 'Wrong answer', value: 23 }],
    topics: [{ name: 'Arrays', solved: 30, attempted: 32 }, { name: 'Dynamic Programming', solved: 1, attempted: 6 }],
  };
  const quickprep = { status: 'inProgress', finished: 0, sheets: [{ title: 'Graphs sprint', solved: 1, total: 10, progress: 10, finished: false }], notStarted: [] };
  const learning = { status: 'active', progress: 12, daysSinceActive: 2, subjects: [] };
  const lines = studentHighlights({ coding, quickprep, learning, formula: FORMULA }, 20);
  const texts = lines.map((line) => line.text);
  assert.ok(texts.includes('No coding practice for 21 days.'));
  assert.ok(texts.includes('Low accuracy: 31% of submissions accepted; most failures are “Too slow”.'));
  assert.ok(texts.includes('Ready for Hard problems: 12 Mediums solved, no Hard yet. Each Hard solve adds about 2.4 points.'));
  assert.ok(texts.includes('Reached the Easy target; more Easy solves no longer raise the Prep Score.'));
  assert.ok(texts.includes('Finding Dynamic Programming hard: 1 of 6 tried problems solved.'));
  assert.ok(texts.includes('Stuck in “Graphs sprint”: 1 of 10 questions solved.'));
  assert.ok(texts.includes('Behind in the course: 12% of the topics open to them completed.'));
  assert.equal(lines[0].tone, 'warn', 'problems come first');
  assert.ok(texts.every((text) => !/average|class|cohort|other students/i.test(text)), 'never compared with others');
  assert.deepEqual(studentHighlights({ coding: { practiceStatus: 'never', solved: { total: 0 } }, formula: FORMULA }), [{ tone: 'warn', text: 'Has not submitted any code yet.' }]);
  assert.equal(studentHighlights({ coding, formula: FORMULA }).length, 6, 'a short list by default');
});

test('the old analytics page stays reachable for assessment analysis only when assessments are licensed', () => {
  const university = { university: true };
  assert.equal(pathAllowed('/admin/analysis/assessments', { questions: true, assessments: false }, 'admin', '', university), false);
  assert.equal(pathAllowed('/admin/analysis/assessments', { questions: false, assessments: true }, 'admin', '', university), true);
  assert.equal(pathAllowed('/admin/analysis', { questions: true }, 'admin', '', university), true);
});
