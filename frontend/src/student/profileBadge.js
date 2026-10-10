// Tier ladder used by getLearnerBadge, expressed on the blended score so the profile can show
// progress toward the next tier. Order matches the checks below (lowest first).
// A tier is reached when ANY of its criteria is met (mirrors the OR checks in getLearnerBadge).
const LEARNER_TIERS = [
  { title: 'Rising Learner', minScore: 0 },
  { title: 'Quick Solver', minScore: 65, solved: 30, streak: 7 },
  { title: 'Consistent Performer', minScore: 100, solved: 80, assessment: 70 },
  { title: 'Skill Champion', minScore: 135, streak: 21 },
  { title: 'Problem Master', minScore: 170, solved: 180 },
  { title: 'Elite Coder', minScore: 220, solved: 260 },
];

/** How "level points" are computed (shown to students in the badges gallery). */
export const LEVEL_POINTS_FORMULA = [
  { label: 'Problem solved', points: 0.5 },
  { label: 'Day of current streak', points: 1.75 },
  { label: 'Assessment average (per %)', points: 0.35 },
  { label: 'Interview average (per point)', points: 0.2 },
  { label: 'Challenge bonus (per point)', points: 0.1 },
];

/**
 * Public description of every level and how to reach it, derived from LEARNER_TIERS so the
 * gallery can never drift from the real rules. Any one requirement is enough.
 */
export function getLearnerLevelLadder() {
  return LEARNER_TIERS.map((tier, index) => {
    const requirements = [];
    if (tier.solved) requirements.push(`Solve ${tier.solved} problems`);
    if (tier.streak) requirements.push(`Keep a ${tier.streak}-day streak`);
    if (tier.assessment) requirements.push(`Average ${tier.assessment}% in assessments`);
    if (tier.minScore > 0) requirements.push(`Earn ${tier.minScore} level points`);
    return {
      level: index + 1,
      title: tier.title,
      helper: getLearnerBadge(TIER_SAMPLE_INPUT[index]).helper,
      requirements: requirements.length ? requirements : ['Every student starts here'],
    };
  });
}

// Inputs that land exactly on each tier, used only to look up its helper text.
const TIER_SAMPLE_INPUT = [
  { solvedCount: 0 },
  { solvedCount: 30 },
  { solvedCount: 80 },
  { streak: 21 },
  { solvedCount: 180 },
  { solvedCount: 260 },
];

function blendedLearnerScore({ solvedCount = 0, streak = 0, assessmentScore = 0, interviewScore = 0, challengePoints = 0 }) {
  return (Number(solvedCount || 0) * 0.5)
    + (Number(streak || 0) * 1.75)
    + (Number(assessmentScore || 0) * 0.35)
    + (Number(interviewScore || 0) * 0.2)
    + (Number(challengePoints || 0) * 0.1);
}

/**
 * Level view for the profile: current tier (same result as getLearnerBadge), its 1-based level,
 * and score progress toward the next tier. `next` is null at the top tier.
 */
export function getLearnerLevel(input) {
  const badge = getLearnerBadge(input);
  const score = Math.round(blendedLearnerScore(input) * 10) / 10;
  const index = Math.max(0, LEARNER_TIERS.findIndex((tier) => tier.title === badge.title));
  const next = LEARNER_TIERS[index + 1] || null;
  // Progress = the criterion of the next tier the student is closest to meeting.
  const ratios = next
    ? [
      score / next.minScore,
      next.solved ? Number(input?.solvedCount || 0) / next.solved : 0,
      next.streak ? Number(input?.streak || 0) / next.streak : 0,
      next.assessment ? Number(input?.assessmentScore || 0) / next.assessment : 0,
    ]
    : [1];
  const progress = Math.max(0, Math.min(100, Math.max(...ratios) * 100));
  return { ...badge, level: index + 1, totalLevels: LEARNER_TIERS.length, score, next, progress };
}

export function getLearnerBadge({
  solvedCount = 0,
  streak = 0,
  assessmentScore = 0,
  interviewScore = 0,
  challengePoints = 0,
}) {
  const solved = Number(solvedCount || 0);
  const safeStreak = Number(streak || 0);
  const safeAssessmentScore = Number(assessmentScore || 0);
  const safeInterviewScore = Number(interviewScore || 0);

  const blendedScore = (solved * 0.5)
    + (safeStreak * 1.75)
    + (safeAssessmentScore * 0.35)
    + (safeInterviewScore * 0.2)
    + (Math.max(0, Number(challengePoints) || 0) * 0.1);

  if (solved >= 260 || blendedScore >= 220) {
    return { title: 'Elite Coder', helper: 'Outstanding solving depth and platform performance.' };
  }
  if (solved >= 180 || blendedScore >= 170) {
    return { title: 'Problem Master', helper: 'High solve count with strong execution consistency.' };
  }
  if (safeStreak >= 21 || blendedScore >= 135) {
    return { title: 'Skill Champion', helper: 'Excellent momentum across coding, learning, and feedback.' };
  }
  if (solved >= 80 || safeAssessmentScore >= 70 || blendedScore >= 100) {
    return { title: 'Consistent Performer', helper: 'Reliable progress backed by repeat practice.' };
  }
  if (solved >= 30 || safeStreak >= 7 || blendedScore >= 65) {
    return { title: 'Quick Solver', helper: 'Growing fast with sharp improvement on coding rounds.' };
  }
  return { title: 'Rising Learner', helper: 'Building fundamentals and daily momentum on PeerPrep.' };
}
