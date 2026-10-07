import { evaluateSubmissionResult, normalizeComparableOutput } from './executionService.js';

export const sqlResultUnordered = problem => /\bany order\b|\b(?:order|ordering)\b[^.\n]{0,90}\b(?:does not|doesn't) matter\b/i.test(String(problem.description || '').replace(/[*_`]/g, ''));

export function sqlOutputsEquivalent(problem, actual, expected) {
  const lines = (value) => normalizeComparableOutput(value).split('\n').filter((line) => line !== '');
  let actualLines = lines(actual), expectedLines = lines(expected);
  if (sqlResultUnordered(problem)) {
    // Canonicalize numeric formatting before sorting so mixed decimal/integer
    // formatting cannot reorder equivalent rows differently.
    const key = (row) => row.split('|').map((cell) => /^-?\d+\.0+$/.test(cell) ? cell.replace(/\.0+$/, '') : cell).join('|');
    actualLines = actualLines.map(key).sort(); expectedLines = expectedLines.map(key).sort();
  }
  if (actualLines.length !== expectedLines.length) return false;
  return actualLines.every((row, index) => {
    const left = row.split('|'), right = expectedLines[index].split('|');
    return left.length === right.length && left.every((cell, column) => evaluateSubmissionResult({ status: { id: 3 }, stdout: cell }, right[column]).internalStatus === 'AC');
  });
}
