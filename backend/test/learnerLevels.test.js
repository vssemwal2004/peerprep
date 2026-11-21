import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLASSIC_LEVELS, learnerLevel } from '../src/services/studentDashboardService.js';
import { ELITE_FROM_LEVEL, LEVELS } from '../src/services/adaptiveEngagementRules.js';

const base = { solved: 0, streak: 0, bestStreak: 0, assessmentScore: 0, interviewScore: 0, challengePoints: 0 };

test('twelve classic levels; 1–7 need any one requirement', () => {
  assert.equal(CLASSIC_LEVELS.length, 12);
  assert.equal(learnerLevel(base).level, 1);
  assert.equal(learnerLevel({ ...base, solved: 30 }).title, 'Quick Solver');
  assert.equal(learnerLevel({ ...base, assessmentScore: 70 }).level, 3);
  assert.equal(learnerLevel({ ...base, solved: 350 }).title, 'Algorithm Architect');
});

test('elite levels 8–12 need every requirement together, on the best streak', () => {
  // A huge solve count alone stops at level 7 (any-one), not the elite tier.
  assert.equal(learnerLevel({ ...base, solved: 2000 }).level, 7);
  // Solved 450 + best streak 60 + 400 level points (225 + 35 + 20 + 120) → level 8, even after the
  // current streak broke.
  const elite = { ...base, solved: 450, streak: 0, bestStreak: 60, assessmentScore: 100, interviewScore: 100, challengePoints: 1200 };
  assert.equal(learnerLevel(elite).title, 'Code Strategist');
  assert.equal(learnerLevel({ ...elite, bestStreak: 59 }).level, 7, 'one requirement short');
  assert.equal(learnerLevel({ ...elite, challengePoints: 1190 }).level, 7, 'level points short');
  assert.equal(learnerLevel({ ...base, solved: 1300, streak: 365, bestStreak: 365, assessmentScore: 100, interviewScore: 100 }).title, 'Hall of Fame');
});

test('adaptive ladder: twelve levels, each harder than the last, elite from level 8 with coins', () => {
  assert.equal(LEVELS.length, 12);
  assert.equal(ELITE_FROM_LEVEL, 8);
  for (let index = 1; index < LEVELS.length; index += 1) {
    for (const key of ['xp', 'mastery', 'days']) assert.ok(LEVELS[index][key] > LEVELS[index - 1][key], `${LEVELS[index].title} ${key} rises`);
  }
  assert.deepEqual(LEVELS.filter((level) => level.elite).map((level) => level.coins), [10, 12, 15, 20, 25]);
  assert.ok(LEVELS.every((level) => level.mastery <= 100));
});
