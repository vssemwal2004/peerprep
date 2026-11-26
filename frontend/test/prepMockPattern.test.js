import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPatternFrom, patternRows, patternYears } from '../src/features/prepMock/patternModel.js';

test('pattern rows come from the real sections, with suggested times and totals', () => {
  const sections = [
    { sectionName: 'Numerical Ability', type: 'mcq', marksPerQuestion: 1, suggestedMinutes: 25, questions: Array.from({ length: 20 }, () => ({ points: 1 })) },
    { sectionName: 'Coding', type: 'coding', suggestedMinutes: 90, questions: [{ points: 10 }, { points: 20 }] },
  ];
  const pattern = patternRows(sections, 120);
  assert.deepEqual(pattern.rows.map((row) => [row.name, row.questions, row.minutes, row.marks]), [['Numerical Ability', 20, 25, 20], ['Coding', 2, 90, 30]]);
  assert.deepEqual([pattern.totals.questions, pattern.totals.marks, pattern.totals.minutes, pattern.totals.allocated], [22, 50, 120, 115]);
  assert.equal(pattern.overAllocated, 0);
  assert.equal(patternRows(sections, 100).overAllocated, 15, 'times over the duration are flagged');
  assert.equal(patternRows([{ ...sections[0] }, { ...sections[1], suggestedMinutes: '' }], 120).partlyTimed, true);
  assert.equal(patternRows([{ sectionName: 'A', questionCount: 4, marksPerQuestion: 2 }]).rows[0].marks, 8, 'student summaries (counts only) work too');
});

test('OA pattern month and year', () => {
  assert.equal(formatPatternFrom({ month: 3, year: 2025 }), 'Mar 2025');
  assert.equal(formatPatternFrom({ month: 3, year: 2025 }, { long: true }), 'March 2025');
  assert.equal(formatPatternFrom({ month: 0, year: 2025 }), '');
  assert.equal(formatPatternFrom(null), '');
  const years = patternYears(new Date('2026-11-25'));
  assert.equal(years[0], 2026);
  assert.equal(years.at(-1), 2015);
});
