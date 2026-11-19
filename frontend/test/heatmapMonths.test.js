import assert from 'node:assert/strict';
import test from 'node:test';
import { heatmapModel } from '../src/admin/prepAnalysis/charts/heatmapModel.js';

test('a week that holds the 1st of a month is split, so every month starts its own column', () => {
  // 2026-10-26 (Mon) … 2026-11-08 (Sun): the week of Oct 26 also holds Nov 1 (a Sunday).
  const model = heatmapModel({ from: '2026-10-26', to: '2026-11-08', days: [['2026-11-01', 3]] });
  assert.deepEqual(model.columns.map((column) => [column.month, column.startsMonth, column.cells.filter(Boolean).length]),
    [['2026-10', false, 6], ['2026-11', true, 1], ['2026-11', false, 7]]);
  assert.equal(model.columns[1].cells[6].day, '2026-11-01', 'Sunday keeps its row');
  assert.equal(model.columns[1].cells[6].value, 3);
  assert.equal(model.columns[1].label, 'Nov');
  const days = model.columns.flatMap((column) => column.cells.filter(Boolean).map((cell) => cell.day));
  assert.equal(days.length, 14, 'every day drawn once');
  assert.equal(new Set(days).size, 14);
});
