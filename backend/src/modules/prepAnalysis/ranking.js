export { LEVELS as DIFFICULTIES } from '../../services/prepScore/policy.js';

/** Competition ranks (1, 2, 2, 4): equal values share a rank. */
export function competitionRanks(rows, valueOf) {
  const sorted = [...rows].sort((left, right) => valueOf(right) - valueOf(left));
  const ranks = new Map();
  sorted.forEach((row, index) => {
    const previous = sorted[index - 1];
    ranks.set(row, previous && valueOf(previous) === valueOf(row) ? ranks.get(previous) : index + 1);
  });
  return ranks;
}
