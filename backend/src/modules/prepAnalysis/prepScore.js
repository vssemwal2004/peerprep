// Prep Score: a 0-100 number for ONE student, computed only from that
// student's own Prep Coding work (no other student's data is involved).
//
//   progress_d = min(1, solved_d / target_d)          d in { Easy, Medium, Hard }
//   progress   = (10*progress_Easy + 20*progress_Medium + 40*progress_Hard) / 70 * 100
//   accuracy   = accepted submissions / graded submissions * 100
//   confidence = min(1, graded submissions / 10)
//   Prep Score = 0.85 * progress + 0.15 * accuracy * confidence
//
// Each difficulty is a weighted share of the average, capped at its target, so
// easy-only volume can never reach the top (500 easy solves still earn only the
// Easy share) and one lucky submission cannot earn the full accuracy share.

export const PREP_SCORE_VERSION = 'prep-score-v2';
export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
export const DIFFICULTY_WEIGHTS = Object.freeze({ Easy: 10, Medium: 20, Hard: 40 });
// Solves needed for full credit in each difficulty.
export const SOLVE_TARGETS = Object.freeze({ Easy: 50, Medium: 40, Hard: 20 });
export const PROGRESS_SHARE = 0.85;
export const ACCURACY_SHARE = 0.15;
export const ACCURACY_FULL_CREDIT_SUBMISSIONS = 10;

const WEIGHT_TOTAL = DIFFICULTIES.reduce((sum, difficulty) => sum + DIFFICULTY_WEIGHTS[difficulty], 0);
const round1 = (value) => Math.round(value * 10) / 10;

/**
 * solved: { Easy, Medium, Hard } distinct accepted problems; accepted/attempts: graded submissions.
 * Returns the score and its parts (points per difficulty and for accuracy add up to the score).
 */
export function prepScore({ solved = {}, accepted = 0, attempts = 0 }, targets = SOLVE_TARGETS) {
  const progressByDifficulty = Object.fromEntries(DIFFICULTIES.map((difficulty) => [
    difficulty,
    Math.min(1, (solved[difficulty] || 0) / Math.max(1, targets[difficulty] || 1)),
  ]));
  const progress = (DIFFICULTIES.reduce((sum, difficulty) => (
    sum + DIFFICULTY_WEIGHTS[difficulty] * progressByDifficulty[difficulty]
  ), 0) / WEIGHT_TOTAL) * 100;
  const accuracy = attempts > 0 ? (accepted / attempts) * 100 : 0;
  const confidence = Math.min(1, attempts / ACCURACY_FULL_CREDIT_SUBMISSIONS);
  const points = Object.fromEntries(DIFFICULTIES.map((difficulty) => [
    difficulty,
    round1((DIFFICULTY_WEIGHTS[difficulty] * progressByDifficulty[difficulty] / WEIGHT_TOTAL) * 100 * PROGRESS_SHARE),
  ]));
  const exact = PROGRESS_SHARE * progress + ACCURACY_SHARE * accuracy * confidence;
  return {
    score: round1(exact),
    // Unrounded, for averaging into an overall score without piling up rounding.
    exact,
    progress: round1(progress),
    accuracy: round1(accuracy),
    points: { ...points, accuracy: round1(ACCURACY_SHARE * accuracy * confidence) },
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
