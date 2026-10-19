import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreFromLevelCounts } from '../src/services/prepScore/engine.js';
import { normalizePrepScoreConfig } from '../src/services/prepScore/policy.js';
import { configProblem, simulate } from '../../frontend/src/admin/prepScore/engine.js';

test('the Master Admin simulator computes exactly what the server stores', () => {
  const configs = [
    normalizePrepScoreConfig({}),
    normalizePrepScoreConfig({ formula: { volumeExponent: 0.55, qualityExponent: 1.2, scale: 10, decimalPlaces: 1 }, modules: {
      coding: { weight: 2, points: { Easy: 1, Medium: 3.5, Hard: 9 } }, learning: { weight: 0.5 }, interview: { weight: 0 },
    } }),
  ];
  const samples = [
    {},
    { coding: { Easy: 12, Medium: 8, Hard: 3 }, learning: { Medium: 10 } },
    { coding: { Hard: 1 }, assessment: { Easy: 2, Hard: 2 }, interview: { Medium: 3 }, learning: { Easy: 40, Medium: 5, Hard: 1 } },
  ];
  const all = { coding: true, assessment: true, interview: true, learning: true };
  for (const config of configs) {
    for (const counts of samples) {
      const server = scoreFromLevelCounts(counts, all, config);
      const client = simulate(config, counts);
      assert.equal(client.total, server.total);
      for (const key of Object.keys(server.features)) assert.equal(client.modules[key], server.features[key].score);
    }
  }
  assert.equal(configProblem(configs[0]), '');
  assert.match(configProblem({ ...configs[0], modules: { ...configs[0].modules, coding: { ...configs[0].modules.coding, points: { Easy: 5, Medium: 2, Hard: 4 } } } }), /rise from Easy/);
});
