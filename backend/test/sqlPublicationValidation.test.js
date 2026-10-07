import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeSqlCandidate, sqlOutputsEquivalent } from '../scripts/lib/sql-publication/candidateValidation.js';

test('SQL cases preserve duplicate row multiplicities and required ordering', () => {
  assert.equal(sqlOutputsEquivalent({ description: 'Return results in any order.' }, '2|Bob\n1|Ann', '1|Ann\n2|Bob'), true);
  assert.equal(sqlOutputsEquivalent({ description: 'The order of the final result does not matter.' }, '2|Bob\n1|Ann', '1|Ann\n2|Bob'), true);
  assert.equal(sqlOutputsEquivalent({ description: 'Return results ordered by id.' }, '2|Bob\n1|Ann', '1|Ann\n2|Bob'), false);
  assert.equal(sqlOutputsEquivalent({ description: 'Return results in any order.' }, '1|Ann\n1|Ann', '1|Ann\n2|Bob'), false);
  assert.equal(sqlOutputsEquivalent({}, '', ''), true);
  assert.equal(sqlOutputsEquivalent({}, '1|3.50', '1|3.5'), true);
});

test('SQL preflight requires independent executable fixtures including hidden cases', () => {
  const problem = { category: 'SQL', sqlConfig: { dialect: 'sqlite', schemaSql: 'CREATE TABLE x(id INTEGER);' }, referenceSolutions: { sql: 'SELECT * FROM x;' } };
  const cases = Array.from({ length: 11 }, (_, index) => ({ kind: index === 0 ? 'sample' : 'hidden', position: index + 1, input: `INSERT INTO x VALUES (${index});`, output: String(index) }));
  assert.equal(analyzeSqlCandidate(problem, cases).valid, true);
  assert.equal(analyzeSqlCandidate(problem, cases.slice(0, 1)).valid, false);
  assert.equal(analyzeSqlCandidate(problem, [...cases, cases[0]]).valid, false);
});
