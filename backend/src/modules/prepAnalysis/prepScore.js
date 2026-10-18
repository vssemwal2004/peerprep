// Prep Coding score for ONE student, from that student's own work only.
//
//   Work points = 1 x Easy + 2 x Medium + 4 x Hard          (distinct problems solved)
//   Quality     = min(1, (3 x solved + 10) / (submissions + 10))
//   Score       = Work points x Quality
//
// Quality is the student's average submissions per solved problem: up to 3
// submissions per solve are fair, and 10 starter submissions (epsilon) are free,
// so normal debugging never lowers the score but guessing does. A solve in 3 or
// fewer submissions always raises the score; there is no ceiling.

export const PREP_SCORE_VERSION = 'prep-score-v3';
export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
export const DIFFICULTY_POINTS = Object.freeze({ Easy: 1, Medium: 2, Hard: 4 });
export const FAIR_TRIES_PER_SOLVE = 3;
export const STARTER_SUBMISSIONS = 10;

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * solved: { Easy, Medium, Hard } distinct accepted problems; attempts: graded submissions.
 * Returns the score, its two factors, and the points each difficulty adds (they add up to the score).
 */
export function prepScore({ solved = {}, accepted = 0, attempts = 0 }) {
  const counts = Object.fromEntries(DIFFICULTIES.map((difficulty) => [difficulty, Math.max(0, Number(solved[difficulty]) || 0)]));
  const solvedTotal = DIFFICULTIES.reduce((sum, difficulty) => sum + counts[difficulty], 0);
  const work = DIFFICULTIES.reduce((sum, difficulty) => sum + DIFFICULTY_POINTS[difficulty] * counts[difficulty], 0);
  const submissions = Math.max(0, Number(attempts) || 0);
  const quality = Math.min(1, (FAIR_TRIES_PER_SOLVE * solvedTotal + STARTER_SUBMISSIONS) / (submissions + STARTER_SUBMISSIONS));
  const exact = work * quality;
  return {
    score: round1(exact),
    // Unrounded, for averaging into an overall score without piling up rounding.
    exact,
    work,
    quality: round1(quality * 100),
    accuracy: submissions ? round1((Math.min(accepted, submissions) / submissions) * 100) : 0,
    triesPerSolve: solvedTotal ? round1(submissions / solvedTotal) : 0,
    points: Object.fromEntries(DIFFICULTIES.map((difficulty) => [difficulty, round1(DIFFICULTY_POINTS[difficulty] * counts[difficulty] * quality)])),
  };
}

/** Positions (1, 2, 2, 4) by a numeric key, highest first; ties share a position. */
export function competitionRanks(rows, valueOf) {
  const sorted = [...rows].sort((left, right) => valueOf(right) - valueOf(left));
  const ranks = new Map();
  sorted.forEach((row, index) => {
    const previous = sorted[index - 1];
    ranks.set(row, previous && valueOf(previous) === valueOf(row) ? ranks.get(previous) : index + 1);
  });
  return ranks;
}
