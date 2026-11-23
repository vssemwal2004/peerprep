// Profile awards. Every award is computed from data the profile already loads; nothing is stored
// or invented. `value`/`target` drive the progress shown on locked awards.

// `feature`: the area the student must be able to use (university licence AND their own feature
// access) for the award to be shown at all, earned or locked.
export const AWARD_DEFINITIONS = [
  { id: 'first-accept', feature: 'coding', title: 'First Accept', description: 'Get your first accepted solution', metric: 'solved', target: 1, tone: 'emerald', icon: 'check' },
  { id: 'solver-10', feature: 'coding', title: 'Problem Solver', description: 'Solve 10 problems', metric: 'solved', target: 10, tone: 'sky', icon: 'code' },
  { id: 'solver-50', feature: 'coding', title: 'Half Century', description: 'Solve 50 problems', metric: 'solved', target: 50, tone: 'indigo', icon: 'medal' },
  { id: 'hard-1', feature: 'coding', title: 'Hard Hitter', description: 'Solve a Hard problem', metric: 'hardSolved', target: 1, tone: 'rose', icon: 'zap' },
  { id: 'streak-7', feature: 'coding', title: 'On Fire', description: 'Reach a 7-day streak', metric: 'bestStreak', target: 7, tone: 'orange', icon: 'flame' },
  { id: 'streak-30', feature: 'coding', title: 'Unstoppable', description: 'Reach a 30-day streak', metric: 'bestStreak', target: 30, tone: 'amber', icon: 'crown' },
  { id: 'active-30', feature: 'coding', title: 'Regular', description: 'Be active on 30 different days', metric: 'activeDays', target: 30, tone: 'cyan', icon: 'calendar' },
  { id: 'polyglot', feature: 'coding', title: 'Polyglot', description: 'Submit in 3 languages', metric: 'languages', target: 3, tone: 'violet', icon: 'languages' },
  { id: 'assessment-1', feature: 'assessments', title: 'Test Taker', description: 'Complete an assessment', metric: 'assessments', target: 1, tone: 'amber', icon: 'clipboard' },
  { id: 'interview-1', feature: 'interviews', title: 'Interview Ready', description: 'Receive interview feedback', metric: 'interviews', target: 1, tone: 'sky', icon: 'message' },
];

/**
 * @param {{solved:number, hardSolved:number, bestStreak:number, activeDays:number,
 *          languages:number, assessments:number, interviews:number}} metrics
 */
export function computeAwards(metrics, { features = null } = {}) {
  // features: { coding, assessments, interviews } booleans; a false one hides its awards entirely.
  const awards = AWARD_DEFINITIONS.filter((definition) => !features || features[definition.feature] !== false).map((definition) => {
    const value = Math.max(0, Number(metrics?.[definition.metric]) || 0);
    return {
      ...definition,
      value,
      earned: value >= definition.target,
      progress: Math.min(100, (value / definition.target) * 100),
    };
  });
  // The locked award the student is closest to finishing (ties keep definition order).
  const nextAward = awards
    .filter((award) => !award.earned)
    .sort((a, b) => b.progress - a.progress)[0] || null;
  return { awards, earnedCount: awards.filter((award) => award.earned).length, nextAward };
}
