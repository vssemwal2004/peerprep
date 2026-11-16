import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartTheme } from '../src/admin/prepAnalysis/charts/chartTheme.js';
import {
  compareByRequest, compareChartOption, compareDimensions, compareTableRows, compareTitle, drillCellText, formatCompareValue, isCompareReady,
} from '../src/admin/prepAnalysis/compareModel.js';
import { normalizeState, RANGE_PRESET_VALUES, toQueryRequest } from '../src/admin/prepAnalysis/filterModel.js';

const comparison = {
  dimension: { key: 'section', label: 'Section' },
  columns: [{ value: 'A', label: 'A', students: 3 }, { value: 'B', label: 'B', students: 2 }],
  total: { label: 'All selected', students: 5 },
  metrics: [
    { key: 'students', label: 'Students', module: 'student', moduleLabel: 'Students', format: 'count', better: null, values: [3, 2], total: 5, best: null, worst: null },
    { key: 'solvedEasy', label: 'Easy solved', module: 'coding', moduleLabel: 'Prep Coding', format: 'count', better: 'high', values: [4, 1], total: 5, best: 0, worst: 1 },
    { key: 'solvedHard', label: 'Hard solved', module: 'coding', moduleLabel: 'Prep Coding', format: 'count', better: 'high', values: [0, 2], total: 2, best: 1, worst: 0 },
    { key: 'accuracy', label: 'Accuracy (%)', module: 'coding', moduleLabel: 'Prep Coding', format: 'percent', better: 'high', values: [40, null], total: 40, best: null, worst: null },
  ],
  charts: [{ id: 'solved', title: 'Problems solved by difficulty', metrics: ['solvedEasy', 'solvedHard'], stack: true }, { id: 'rates', title: 'Rates', metrics: ['accuracy'] }],
};

test('compare: section, group and campus are offered, and a choice needs 2 to 8 values', () => {
  assert.deepEqual(compareDimensions(null).map((entry) => entry.label).slice(0, 3), ['Section', 'Group', 'Campus']);
  const draft = { dimension: 'section', values: [{ value: 'A', label: 'A' }] };
  assert.equal(isCompareReady(draft), false);
  assert.equal(isCompareReady({ ...draft, values: [...draft.values, { value: 'B', label: 'B' }] }), true);
  assert.equal(isCompareReady({ ...draft, values: Array.from({ length: 9 }, (_, index) => ({ value: `S${index}`, label: `S${index}` })) }), false);
  assert.deepEqual(compareByRequest({ dimension: 'semester', values: [{ value: 5, label: 'Semester 5' }, { value: 7, label: 'Semester 7' }] }), { dimension: 'semester', values: [5, 7] });
  assert.equal(compareTitle({ dimension: 'college', values: [{ value: 'GEU', label: 'GEU' }, { value: 'GEHU', label: 'GEHU' }] }, null), 'Campus: GEU, GEHU');
});

test('compare table: a row per measure, best and worst marked, values formatted', () => {
  const rows = compareTableRows(comparison);
  assert.deepEqual(rows.map((row) => row.id), ['students', 'solvedEasy', 'solvedHard', 'accuracy']);
  assert.deepEqual(rows[1].cells.map((cell) => cell.tone), ['best', 'worst']);
  assert.deepEqual(rows[0].cells.map((cell) => cell.tone), [null, null], 'the student count is never judged');
  assert.equal(formatCompareValue(40, 'percent'), '40%');
  assert.equal(formatCompareValue(null, 'percent'), '—');
  assert.equal(formatCompareValue(3.25, 'decimal'), (3.3).toLocaleString(undefined, { minimumFractionDigits: 1 }));
  assert.equal(drillCellText(['C++', 'Java'], 'text'), 'C++, Java');
  assert.equal(drillCellText(62.5, 'percent'), '62.5%');
});

test('compare charts: a group of bars per value, difficulty colours, stacked when asked, light and dark', () => {
  for (const dark of [false, true]) {
    const option = compareChartOption(comparison.charts[0], comparison, chartTheme(dark));
    assert.deepEqual(option.xAxis.data, ['A', 'B']);
    assert.deepEqual(option.series.map((series) => series.data), [[4, 1], [0, 2]]);
    assert.ok(option.series.every((series) => series.stack === 'total'));
    assert.equal(option.legend.top, 0);
    const rates = compareChartOption(comparison.charts[1], comparison, chartTheme(dark));
    assert.equal(rates.yAxis.max, 100, 'percent charts run to 100');
    assert.deepEqual(rates.series[0].data, [40, null], 'no value is a gap, not zero');
    const text = JSON.stringify([option.color, rates.color]).toLowerCase();
    assert.ok(!/#6366f1|#8b5cf6|#4f46e5/.test(text), 'no indigo or violet');
  }
  assert.equal(compareChartOption({ id: 'x', metrics: ['missing'] }, comparison, chartTheme(false)), null);
});

test('the period: presets the server knows, and a custom range that round-trips into every request', () => {
  assert.deepEqual(RANGE_PRESET_VALUES, ['7d', '30d', '90d', '180d', '365d', 'all']);
  const custom = normalizeState({ area: 'coding', range: { preset: 'custom', from: '2026-09-01', to: '2026-10-31' }, groups: [] });
  assert.deepEqual(custom.range, { preset: 'custom', from: '2026-09-01', to: '2026-10-31' });
  assert.deepEqual(toQueryRequest({ state: custom }, new Map()).range, { preset: 'custom', from: '2026-09-01', to: '2026-10-31' });
  const reversed = normalizeState({ area: 'coding', range: { preset: 'custom', from: '2026-10-31', to: '2026-09-01' } });
  assert.deepEqual(reversed.range, { preset: 'custom', from: '2026-09-01', to: '2026-10-31' }, 'a reversed range is put the right way round');
  assert.deepEqual(normalizeState({ area: 'coding', range: { preset: 'custom' } }).range, { preset: 'all' }, 'a custom range without dates is all time');
  assert.deepEqual(normalizeState({ area: 'coding', range: { preset: '2d' } }).range, { preset: 'all' }, 'an unknown preset is all time');
  assert.deepEqual(toQueryRequest({ state: normalizeState({ area: 'coding', range: { preset: '90d' } }) }, new Map()).range, { preset: '90d' });
});
