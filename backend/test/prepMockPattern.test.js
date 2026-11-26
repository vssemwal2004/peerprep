import test from 'node:test';
import assert from 'node:assert/strict';
import { mockPatternProblem, normalizeAssessmentSections, normalizePatternFrom } from '../src/controllers/assessmentController.js';

test('the OA pattern month and year: valid past months only', () => {
  const now = new Date('2026-11-25T10:00:00Z');
  assert.deepEqual(normalizePatternFrom({ month: 3, year: 2025 }, now), { month: 3, year: 2025 });
  assert.deepEqual(normalizePatternFrom({ month: '11', year: '2026' }, now), { month: 11, year: 2026 }, 'this month is fine');
  assert.equal(normalizePatternFrom({ month: 12, year: 2026 }, now), null, 'a future month is not a past OA');
  assert.equal(normalizePatternFrom({ month: 13, year: 2025 }, now), null);
  assert.equal(normalizePatternFrom({ month: 0, year: 2025 }, now), null);
  assert.equal(normalizePatternFrom({ month: 5 }, now), null);
  assert.equal(normalizePatternFrom(null, now), null);
});

test('publishing a mock needs the pattern date, and section times within the duration', () => {
  const sections = [{ suggestedMinutes: 25 }, { suggestedMinutes: 90 }];
  assert.match(mockPatternProblem({ patternFrom: null, sections, duration: 120 }), /month and year/);
  assert.equal(mockPatternProblem({ patternFrom: { month: 3, year: 2025 }, sections, duration: 120 }), '');
  assert.match(mockPatternProblem({ patternFrom: { month: 3, year: 2025 }, sections, duration: 100 }), /115 minutes, more than the mock's 100/);
  assert.equal(mockPatternProblem({ patternFrom: { month: 3, year: 2025 }, sections: [{}], duration: 60 }), '', 'section times are optional');
});

test('suggested section minutes are whole minutes or cleared', () => {
  const [a, b, c] = normalizeAssessmentSections([
    { sectionName: 'Aptitude', type: 'mcq', suggestedMinutes: '24.6', questions: [] },
    { sectionName: 'Coding', type: 'coding', suggestedMinutes: '', questions: [] },
    { sectionName: 'Verbal', type: 'mcq', suggestedMinutes: 99999, questions: [] },
  ]);
  assert.equal(a.suggestedMinutes, 25);
  assert.equal(b.suggestedMinutes, undefined);
  assert.equal(c.suggestedMinutes, 1440);
});
