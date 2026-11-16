import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesTableSearch, tableSearchTerms, validatePrepAnalysisQuery } from '../src/modules/prepAnalysis/prepAnalysis.service.js';

const student = (name, email, studentId) => ({ name, email, studentId });

test('table search: terms are comma-separated, trimmed, lower-case, unique and capped', () => {
  assert.deepEqual(tableSearchTerms(''), []);
  assert.deepEqual(tableSearchTerms(' Asha , 2301, asha ,, '), ['asha', '2301']);
  assert.equal(tableSearchTerms(Array.from({ length: 80 }, (_, index) => `s${index}`).join(',')).length, 50);
});

test('table search matches name, email or student ID; any term is enough', () => {
  const asha = student('Asha Rao', 'asha@geu.ac.in', 'GEU2301');
  assert.equal(matchesTableSearch(asha, []), true);
  assert.equal(matchesTableSearch(asha, ['rao']), true);
  assert.equal(matchesTableSearch(asha, ['@geu.ac']), true);
  assert.equal(matchesTableSearch(asha, ['geu2301']), true);
  assert.equal(matchesTableSearch(asha, ['bilal', '2301']), true);
  assert.equal(matchesTableSearch(asha, ['bilal']), false);
  assert.equal(matchesTableSearch({ name: 'No Email' }, ['email@']), false);
});

test('the query keeps the table search, trimmed and bounded', () => {
  const searchOf = (search) => validatePrepAnalysisQuery({ module: 'coding', table: { search } }, undefined).table.search;
  assert.equal(searchOf('  Asha  '), 'Asha');
  assert.equal(searchOf(undefined), '');
  assert.equal(searchOf({ $ne: 1 }), '', 'non-strings are ignored');
  assert.equal(searchOf('x'.repeat(500)).length, 200);
});
