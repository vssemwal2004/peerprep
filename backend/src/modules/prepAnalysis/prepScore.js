<<<<<<< Updated upstream
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
=======
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
  return {
    score: round1(PROGRESS_SHARE * progress + ACCURACY_SHARE * accuracy * confidence),
    progress: round1(progress),
    accuracy: round1(accuracy),
    points: { ...points, accuracy: round1(ACCURACY_SHARE * accuracy * confidence) },
>>>>>>> Stashed changes
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
