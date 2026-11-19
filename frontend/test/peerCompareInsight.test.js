import assert from 'node:assert/strict';
import test from 'node:test';
import { compareInsight } from '../src/student/peers/compareInsight.js';

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
