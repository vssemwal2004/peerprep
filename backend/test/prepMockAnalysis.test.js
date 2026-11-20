import test from 'node:test';
import assert from 'node:assert/strict';
import { CHART_BY_ID } from '../src/modules/prepAnalysis/charts.js';
import { FIELDS, publicFieldCatalog } from '../src/modules/prepAnalysis/fields.js';
import { normalizeScope, validatePrepAnalysisQuery } from '../src/modules/prepAnalysis/prepAnalysis.service.js';

test('PrepMock is a separate analysis area with mock-only charts and fields', () => {
  const catalog = publicFieldCatalog();
  assert.equal(catalog.areas.find((area) => area.key === 'prepmock')?.label, 'PrepMock');
  assert.equal(validatePrepAnalysisQuery({ module: 'prepmock' }).module, 'prepmock');
  assert.equal(CHART_BY_ID.get('prepmock-tests')?.module, 'prepmock');

  const assessmentId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const mockId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
  const regular = { taken: 1, passed: 1, missed: 0, averageScore: 90, byTest: new Map([[assessmentId, { percent: 90 }]]), missedIds: [] };
  const mock = { taken: 1, passed: 0, missed: 0, averageScore: 20, byTest: new Map([[mockId, { percent: 20 }]]), missedIds: [] };
  const row = { assessment: regular, prepmock: mock };
  assert.equal(FIELDS.get('assessment.averageScore').get(row), 90);
  assert.equal(FIELDS.get('prepmock.averageScore').get(row), 20);

  const assessment = CHART_BY_ID.get('assessment-tests').build({ rows: [row], tests: new Map([[assessmentId, { id: assessmentId, title: 'Regular assessment' }]]) });
  const prepmock = CHART_BY_ID.get('prepmock-tests').build({ rows: [row], mocks: new Map([[mockId, { id: mockId, title: 'Practice mock' }]]) });
  assert.equal(assessment.groups[0].values.Passed, 1);
  assert.equal(prepmock.groups[0].values.Failed, 1);
  assert.equal(prepmock.groups[0].label, 'Practice mock');
  assert.deepEqual(normalizeScope({ assessmentIds: [mockId], kind: 'mock' }), { assessmentIds: [mockId], kind: 'mock' });
});
