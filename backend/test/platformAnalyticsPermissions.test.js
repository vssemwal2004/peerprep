import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeAdminAnalyticsQuery } from '../src/modules/adminAnalytics/adminAnalytics.controller.js';
import { scopeStudentAnalysis } from '../src/controllers/studentAnalysisController.js';

test('admin analysis includes only enabled module evidence', () => {
  const query = { analysisType: 'overview', sources: ['coding', 'assessment', 'learning'] };
  assert.deepEqual(scopeAdminAnalyticsQuery(query, { questions: true, assessments: false, learning: true }).sources,
    ['coding', 'learning']);
  assert.throws(() => scopeAdminAnalyticsQuery({ analysisType: 'assessment', sources: ['assessment'] },
    { questions: true, assessments: false, learning: true }), { status: 403 });
});

test('student analysis excludes disabled modules and composite evidence', () => {
  const analysis = { contractVersion: 1, generatedAt: 'now', problems: { attempts: 2 },
    assessments: { attempts: 3 }, interviews: { total: 4 }, learning: { totalTopics: 5 },
    overview: { readinessScore: 80 }, derived: { readinessScore: 80 },
    explanations: { coding: ['coding'], assessment: ['exam'], interview: ['interview'], learning: ['learning'] } };
  const result = scopeStudentAnalysis(analysis, { questions: true, assessments: false, interviews: false, learning: true });
  assert.equal(result.problems.attempts, 2);
  assert.equal(result.learning.totalTopics, 5);
  assert.deepEqual(result.assessments, {});
  assert.deepEqual(result.interviews, {});
  assert.equal(result.overview, undefined);
  assert.deepEqual(result.explanations.assessment, []);
});
