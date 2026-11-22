// Classic learner levels, 12 tiers, on the blended "level points" score. Mirror of
// backend/src/services/studentDashboardService.js CLASSIC_LEVELS — keep both in step.
// Levels 1–7: reached when ANY one requirement is met.
// Levels 8–12 (elite): ALL requirements together, using the best streak so a broken streak never
// drops a level. The elite levels pay Prep Coins (server side, once per level).
const LEARNER_TIERS = [
  { title: 'Rising Learner', helper: 'Building fundamentals and daily momentum on PeerPrep.' },
  { title: 'Quick Solver', minScore: 65, solved: 30, streak: 7, helper: 'Growing fast with sharp improvement on coding rounds.' },
  { title: 'Consistent Performer', minScore: 100, solved: 80, assessment: 70, helper: 'Reliable progress backed by repeat practice.' },
  { title: 'Skill Champion', minScore: 135, streak: 21, helper: 'Excellent momentum across coding, learning, and feedback.' },
  { title: 'Problem Master', minScore: 170, solved: 180, helper: 'High solve count with strong execution consistency.' },
  { title: 'Elite Coder', minScore: 220, solved: 260, helper: 'Outstanding solving depth and platform performance.' },
  { title: 'Algorithm Architect', minScore: 300, solved: 350, streak: 45, helper: 'Deep problem-solving range built over months.' },
  { title: 'Code Strategist', all: true, minScore: 400, solved: 450, bestStreak: 60, coins: 10, helper: 'Elite: breadth, depth and two months of unbroken practice.' },
  { title: 'Placement Ace', all: true, minScore: 520, solved: 600, bestStreak: 90, coins: 12, helper: 'Elite: interview-grade consistency across every round.' },
  { title: 'Grandmaster', all: true, minScore: 680, solved: 800, bestStreak: 120, coins: 15, helper: 'Elite: a rare mix of volume, difficulty and discipline.' },
  { title: 'Legend', all: true, minScore: 850, solved: 1000, bestStreak: 180, coins: 20, helper: 'Elite: a thousand solves and half a year without a break.' },
  { title: 'Hall of Fame', all: true, minScore: 1100, solved: 1300, bestStreak: 365, coins: 25, helper: 'The summit: a full year of daily practice at the highest level.' },
];

/** How "level points" are computed (shown to students in the badges gallery). */
export const LEVEL_POINTS_FORMULA = [
  { label: 'Problem solved', points: 0.5 },
  { label: 'Day of current streak', points: 1.75 },
  { label: 'Assessment average (per %)', points: 0.35 },
  { label: 'Interview average (per point)', points: 0.2 },
  { label: 'Challenge bonus (per point)', points: 0.1 },
];

export const ELITE_LEVEL_FROM = 8;

function requirementsOf(tier) {
  const requirements = [];
  if (tier.solved) requirements.push(`Solve ${tier.solved.toLocaleString('en-IN')} problems`);
  if (tier.streak) requirements.push(`Keep a ${tier.streak}-day streak`);
  if (tier.bestStreak) requirements.push(`Reach a ${tier.bestStreak}-day best streak`);
  if (tier.assessment) requirements.push(`Average ${tier.assessment}% in assessments`);
  if (tier.minScore > 0) requirements.push(`Earn ${tier.minScore.toLocaleString('en-IN')} level points`);
  return requirements;
}

/**
 * Public description of every level and how to reach it, derived from LEARNER_TIERS so the
 * gallery can never drift from the real rules. `all`: every requirement is needed (elite levels).
 */
export function getLearnerLevelLadder() {
  return LEARNER_TIERS.map((tier, index) => {
    const requirements = requirementsOf(tier);
    return {
      level: index + 1,
      title: tier.title,
      helper: tier.helper,
      all: Boolean(tier.all),
      elite: index + 1 >= ELITE_LEVEL_FROM,
      coins: tier.coins || 0,
      requirements: requirements.length ? requirements : ['Every student starts here'],
    };
  });
}

function blendedLearnerScore({ solvedCount = 0, streak = 0, assessmentScore = 0, interviewScore = 0, challengePoints = 0 }) {
  return (Number(solvedCount || 0) * 0.5)
    + (Number(streak || 0) * 1.75)
    + (Number(assessmentScore || 0) * 0.35)
    + (Number(interviewScore || 0) * 0.2)
    + (Math.max(0, Number(challengePoints) || 0) * 0.1);
}

function valuesOf(input = {}) {
  const streak = Number(input.streak || 0);
  return {
    minScore: blendedLearnerScore(input),
    solved: Number(input.solvedCount || 0),
    streak,
    bestStreak: Math.max(streak, Number(input.bestStreak || 0)),
    assessment: Number(input.assessmentScore || 0),
  };
}

const CRITERIA = ['minScore', 'solved', 'streak', 'bestStreak', 'assessment'];
const tierMet = (tier, values) => {
  const checks = CRITERIA.filter((key) => tier[key] !== undefined).map((key) => values[key] >= tier[key]);
  if (!checks.length) return true;
  return tier.all ? checks.every(Boolean) : checks.some(Boolean);
};

function tierIndex(input) {
  const values = valuesOf(input);
  for (let index = LEARNER_TIERS.length - 1; index > 0; index -= 1) if (tierMet(LEARNER_TIERS[index], values)) return index;
  return 0;
}

/**
 * Level view for the profile: current tier (same result as getLearnerBadge), its 1-based level,
 * and progress toward the next tier. For an "any one" tier progress is the closest requirement;
 * for an elite "all" tier it is the furthest-behind one. `next` is null at the top tier.
 */
export function getLearnerLevel(input) {
  const index = tierIndex(input);
  const badge = { title: LEARNER_TIERS[index].title, helper: LEARNER_TIERS[index].helper };
  const values = valuesOf(input);
  const score = Math.round(values.minScore * 10) / 10;
  const next = LEARNER_TIERS[index + 1] || null;
  let progress = 100;
  if (next) {
    const ratios = CRITERIA.filter((key) => next[key]).map((key) => Math.min(1, values[key] / next[key]));
    progress = Math.max(0, Math.min(100, (next.all ? Math.min(...ratios) : Math.max(...ratios)) * 100));
  }
  return { ...badge, level: index + 1, totalLevels: LEARNER_TIERS.length, score, next, progress, elite: index + 1 >= ELITE_LEVEL_FROM };
}

export function getLearnerBadge(input = {}) {
  const tier = LEARNER_TIERS[tierIndex(input)];
  return { title: tier.title, helper: tier.helper };
}
