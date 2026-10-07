import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeExternalCoverage, buildProblemIdentityIndex, indexDoocsRows,
  matchProblemIdentity, normalizeSlug, normalizeTitle,
} from '../scripts/lib/external-source-coverage.js';

test('normalizes titles and slugs without retaining punctuation', () => {
  assert.equal(normalizeTitle('  K-th & Smallest!  '), 'k th and smallest');
  assert.equal(normalizeSlug('/K-th & Smallest!/'), 'k-th-smallest');
});

test('matches registry slug before title and rejects ambiguous titles', () => {
  const problems = [{ _id: 'a', title: 'Shared' }, { _id: 'b', title: 'Shared' }];
  const index = buildProblemIdentityIndex(problems, [{ problemId: 'b', externalSlug: 'unique-slug' }]);
  assert.equal(matchProblemIdentity(index, { slug: 'unique-slug', title: 'Shared' }).identity.problemId, 'b');
  assert.equal(matchProblemIdentity(index, { title: 'Shared' }).status, 'ambiguous');
  assert.equal(matchProblemIdentity(index, { externalId: 1 }).status, 'unmatched');
});

test('rejects conflicting Doocs solutions instead of selecting one', () => {
  const indexed = indexDoocsRows([
    { row: { id: 1, title: 'Two Sum', language: 'Python', solution: 'a' }, truncated_cells: [] },
    { row: { id: 1, title: 'Two Sum', language: 'Python', solution: 'b' }, truncated_cells: [] },
  ]);
  assert.equal(indexed.byTitle.get('two sum').solutions.python, null);
  assert.equal(indexed.invalidRows[0].reason, 'conflicting-duplicate-solution');
});

test('reports source-backed reference and canonical-test coverage read-only', () => {
  const base = {
    _id: 'p1', title: 'Two Sum', category: 'DSA', status: 'draft',
    referenceSolutions: { python: 'existing' },
  };
  const doocsRows = ['C++', 'C', 'Java', 'JavaScript', 'TypeScript'].map((language) => ({
    row: { id: 1, title: 'Two Sum', language, solution: `${language} source` }, truncated_cells: [],
  }));
  const source = Array.from({ length: 12 }, (_, index) => `    assert candidate(${index}) == ${index}`).join('\n');
  const report = analyzeExternalCoverage({
    problems: [base],
    registryRows: [{ problemId: 'p1', externalSlug: 'two-sum' }],
    testCases: [{ problem: 'p1', kind: 'sample' }, { problem: 'p1', kind: 'sample' }],
    doocsRows,
    neulabRows: [{ task_id: 'two-sum', canonical_tests: { source, comparison: 'exact' }, metadata: {} }],
  });
  assert.equal(report.cohorts.missingAnySixLanguageReference, 1);
  assert.equal(report.doocs.fullyFillableBlockers, 1);
  assert.equal(report.doocs.referencesFillable, 5);
  assert.equal(report.cohorts.incompleteTestSuites, 1);
  assert.equal(report.neulab.enoughCanonicalTestsForHiddenMinimum, 1);
  assert.equal(base.referenceSolutions.python, 'existing');
});
