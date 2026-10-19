import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aiInterviewLevel, assessmentLevel, calculateModule, levelCounts, prepScore, scoreFromLevelCounts,
} from '../src/services/prepScore/engine.js';
import { DEFAULT_PREP_SCORE_CONFIG, normalizePrepScoreConfig, videoCompletionPercent } from '../src/services/prepScore/policy.js';

const round = (value, places = 2) => {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};
const ALL = { coding: true, assessment: true, interview: true, learning: true, mock: true, ai: true };

test('15 activity mixes match Score = (E+M+H)^0.4 × ((E + 2M + 4H)/(E+M+H))^1.5 exactly', () => {
  const samples = [
    [1, 0, 0], [0, 1, 0], [0, 0, 1], [2, 1, 0], [2, 0, 1],
    [0, 2, 1], [3, 2, 1], [10, 0, 0], [0, 10, 0], [0, 0, 10],
    [12, 8, 3], [30, 20, 10], [7, 11, 5], [50, 25, 5], [100, 100, 100],
  ];
  const { points } = DEFAULT_PREP_SCORE_CONFIG.modules.coding;
  for (const [Easy, Medium, Hard] of samples) {
    const volume = Easy + Medium + Hard;
    const expected = round((volume ** 0.4) * (((Easy + 2 * Medium + 4 * Hard) / volume) ** 1.5));
    assert.equal(calculateModule({ Easy, Medium, Hard }, points, DEFAULT_PREP_SCORE_CONFIG.formula).score, expected, `E=${Easy}, M=${Medium}, H=${Hard}`);
  }
  assert.equal(calculateModule({}, points, DEFAULT_PREP_SCORE_CONFIG.formula).score, 0);
});

test('every formula constant is a Master Admin variable (points 1/3.5/9, α, β, S, weights)', () => {
  const config = normalizePrepScoreConfig({
    formula: { volumeExponent: 1, qualityExponent: 1, scale: 2 },
    modules: {
      coding: { weight: 3, points: { Easy: 1, Medium: 3.5, Hard: 9 } },
      assessment: { weight: 1, points: { Easy: 2, Medium: 5, Hard: 10 } },
      interview: { weight: 0 }, learning: { weight: 0 },
    },
  });
  const result = scoreFromLevelCounts({ coding: { Easy: 1, Medium: 1, Hard: 1 }, assessment: { Hard: 2 } }, ALL, config);
  // With α = β = 1 each module is S × (weighted points).
  assert.equal(result.features.coding.score, 27);
  assert.equal(result.features.assessment.score, 40);
  assert.equal(result.total, round((27 * 3 + 40) / 4));
});

test('each activity takes its content level, falls back to the configured level, and honours pass marks', () => {
  const evidence = {
    problemSolved: [{ level: 'Easy', count: 2 }, { level: 'Hard', count: 1 }, { level: null, count: 1 }],
    assessmentCompleted: [{ level: 'Hard', percent: 40 }, { level: 'Hard', percent: 39.9 }, { level: null, percent: 90 }, { level: 'Easy', percent: null }],
    mockCompleted: [{ percent: 80 }, { percent: 10 }],
    aiCompleted: [{ level: 'Hard' }, { level: null }],
    videoCompleted: [{ topicLevel: 'easy-medium' }, { topicLevel: 'medium-hard' }, { topicLevel: null }],
  };
  const { counts, attempted } = levelCounts(evidence, DEFAULT_PREP_SCORE_CONFIG, ALL);
  assert.equal(attempted, true);
  assert.deepEqual(counts.coding, { Easy: 2, Medium: 1, Hard: 1 });
  // 39.9% is below the 40% pass mark; a test still being marked (no percent) earns nothing.
  assert.deepEqual(counts.assessment, { Easy: 0, Medium: 1, Hard: 1 });
  assert.deepEqual(counts.interview, { Easy: 0, Medium: 2, Hard: 1 });
  assert.deepEqual(counts.learning, { Easy: 1, Medium: 1, Hard: 1 });
});

test('fixed levels, disabled activities, "counts as" units and unlicensed features', () => {
  const config = normalizePrepScoreConfig({ modules: {
    coding: { activities: { problemSolved: { levelSource: 'fixed', level: 'Hard', units: 2 } } },
    interview: { passPercent: 90, activities: { aiCompleted: { enabled: false } } },
  } });
  const evidence = { problemSolved: [{ level: 'Easy', count: 3 }], mockCompleted: [{ percent: 80 }], aiCompleted: [{ level: 'Hard' }] };
  const { counts } = levelCounts(evidence, config, ALL);
  assert.deepEqual(counts.coding, { Easy: 0, Medium: 0, Hard: 6 });
  assert.deepEqual(counts.interview, { Easy: 0, Medium: 0, Hard: 0 });
  // Low marks still count as work: the student is ranked, at the bottom.
  const score = prepScore({ mockCompleted: [{ percent: 10 }] }, { ...ALL, coding: false, assessment: false, learning: false }, { version: 7 });
  assert.equal(score.total, 0);
  assert.equal(score.hasProgress, true);
  assert.equal(score.policyVersion, 7);
  assert.deepEqual(Object.keys(score.features), ['interview']);
});

test('test and AI interview levels come from their own content', () => {
  assert.equal(assessmentLevel({ sections: [{ questions: [{ difficulty: 'easy', marks: 1 }, { difficulty: 'hard', marks: 3 }] }] }), 'Hard');
  assert.equal(assessmentLevel({ sections: [{ questions: [{ difficulty: 'Easy', marks: 1 }, { difficulty: 'Hard', marks: 1 }] }] }), 'Medium');
  assert.equal(assessmentLevel({ sections: [{ questions: [{ type: 'coding', difficulty: '', coding: { difficulty: 'Hard' } }] }] }), 'Hard');
  assert.equal(assessmentLevel({ sections: [{ questions: [{ difficulty: '' }] }] }), null);
  assert.equal(aiInterviewLevel({ data: { difficulty: 'easy' }, publishedSnapshot: { data: { difficulty: 'hard' } } }), 'Hard');
  assert.equal(aiInterviewLevel({ data: { difficulty: '' } }), null);
});

test('invalid policy changes fail closed; pre-v5 drafts upgrade', () => {
  assert.throws(() => normalizePrepScoreConfig({ modules: { coding: { points: { Easy: 5, Medium: 2, Hard: 4 } } } }), /ordered/);
  assert.throws(() => normalizePrepScoreConfig({ modules: Object.fromEntries(['coding', 'assessment', 'interview', 'learning'].map((key) => [key, { weight: 0 }])) }), /At least one/);
  assert.throws(() => normalizePrepScoreConfig({ modules: { learning: { completionPercent: 101 } } }), /completion percentage/);
  assert.throws(() => normalizePrepScoreConfig({ modules: { assessment: { passPercent: -1 } } }), /pass mark/);
  assert.throws(() => normalizePrepScoreConfig({ modules: { learning: { topicLevels: { easy: 'Trivial' } } } }), /Easy, Medium or Hard/);
  // Mock interviews have no difficulty of their own, so they can never read content levels.
  assert.equal(normalizePrepScoreConfig({ modules: { interview: { activities: { mockCompleted: { levelSource: 'content' } } } } }).modules.interview.activities.mockCompleted.levelSource, 'fixed');
  const upgraded = normalizePrepScoreConfig({
    difficultyWeights: { Easy: 1, Medium: 3, Hard: 6 }, moduleWeights: { coding: 2 },
    activities: { learning: { videoCompleted: { completionPercent: 80, units: 2 } } },
  });
  assert.deepEqual(upgraded.modules.assessment.points, { Easy: 1, Medium: 3, Hard: 6 });
  assert.equal(upgraded.modules.coding.weight, 2);
  assert.equal(upgraded.modules.learning.activities.videoCompleted.units, 2);
  assert.equal(videoCompletionPercent({ config: upgraded }), 80);
});
