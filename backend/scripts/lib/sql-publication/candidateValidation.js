import { createHash } from 'node:crypto';
import { sqlResultUnordered } from '../../../src/services/sqlOutputEquivalenceService.js';
export { sqlResultUnordered, sqlOutputsEquivalent } from '../../../src/services/sqlOutputEquivalenceService.js';

export function analyzeSqlCandidate(problem, testCases) {
  const issues = [];
  if (problem.category !== 'SQL' || problem.sqlConfig?.dialect !== 'sqlite') issues.push('SQLITE_DIALECT_REQUIRED');
  if (!String(problem.sqlConfig?.schemaSql || '').trim()) issues.push('SQL_SCHEMA_MISSING');
  if (!String(problem.referenceSolutions?.sql || '').trim()) issues.push('SQL_REFERENCE_MISSING');
  if (!testCases.some((entry) => entry.kind === 'sample')) issues.push('SQL_SAMPLE_MISSING');
  if (testCases.filter((entry) => entry.kind === 'hidden').length < 10) issues.push('SQL_HIDDEN_CASES_INSUFFICIENT');
  const seen = new Set();
  for (const entry of testCases) {
    const input = String(entry.input || '').trim();
    if (!input || seen.has(input)) issues.push('SQL_CASE_INPUT_EMPTY_OR_DUPLICATE');
    if (entry.output === undefined || entry.output === null) issues.push('SQL_CASE_OUTPUT_MISSING');
    seen.add(input);
  }
  const fingerprint = createHash('sha256').update(JSON.stringify({
    schema: problem.sqlConfig, query: problem.referenceSolutions?.sql,
    unordered: sqlResultUnordered(problem),
    cases: testCases.map((entry) => [entry.kind, entry.position, entry.input, entry.output]),
    time: problem.timeLimitSeconds, memory: problem.memoryLimitMb,
  })).digest('hex');
  return { valid: issues.length === 0, issues: [...new Set(issues)], fingerprint };
}

