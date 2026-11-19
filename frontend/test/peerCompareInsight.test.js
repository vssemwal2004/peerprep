import assert from 'node:assert/strict';
import test from 'node:test';
import { compareInsight, compareInsights } from '../src/student/peers/compareInsight.js';
import { pageWindow, seriesValues } from '../src/student/peers/circleMath.js';

const side = (name, easy, medium, hard, extra = {}) => ({ name, totals: { easy, medium, hard, total: easy + medium + hard }, thisWeek: 0, streak: { current: 3 }, ...extra });

test('the tip names the biggest difficulty gap and a topic where the Prep Mate is ahead', () => {
  const text = compareInsight({ you: side('Mohit Singh', 10, 5, 1), mate: side('Aarav Sharma', 8, 12, 2), topics: [{ tag: 'Graph', you: 1, mate: 6 }, { tag: 'Array', you: 9, mate: 4 }] });
  assert.match(text, /^Aarav has solved 7 more Medium problems\./);
  assert.match(text, /ahead in Graph\./);
});

test('when the student leads, the tip says so; a quiet pair is told to start', () => {
  assert.match(compareInsight({ you: side('Mohit', 9, 9, 9), mate: side('Aarav', 1, 1, 1), topics: [] }), /You are ahead/);
  assert.match(compareInsight({ you: side('Mohit', 9, 9, 9), mate: side('Aarav', 1, 1, 1, { thisWeek: 4 }), topics: [] }), /Aarav solved 4 more this week/);
  assert.match(compareInsight({ you: side('Mohit', 0, 0, 0), mate: side('Aarav', 0, 0, 0), topics: [] }), /Neither of you/);
});

test('three reads: focus, rhythm and edge', () => {
  const reads = compareInsights({ you: side('Mohit', 9, 9, 2, { activeDays30: 12 }), mate: side('Aarav Sharma', 1, 1, 1, { activeDays30: 4 }), topics: [{ tag: 'Array', you: 7, mate: 1 }] });
  assert.deepEqual(reads.map((read) => read.kind), ['focus', 'rhythm', 'edge']);
  assert.match(reads[1].text, /12 of the last 30 days, 8 more than Aarav/);
  assert.match(reads[2].text, /lead in Array by 6/);
});

test('chart helpers: running totals and page windows', () => {
  const weekly = [{ solved: 1 }, { solved: 0 }, { solved: 2 }];
  assert.deepEqual(seriesValues(weekly, 10, 'week'), [1, 0, 2]);
  assert.deepEqual(seriesValues(weekly, 10, 'total'), [8, 8, 10], 'all-time total at the end of each week');
  assert.deepEqual(pageWindow(5, 84), [1, 'gap-4', 4, 5, 6, 'gap-84', 84]);
  assert.deepEqual(pageWindow(1, 3), [1, 2, 3]);
});
