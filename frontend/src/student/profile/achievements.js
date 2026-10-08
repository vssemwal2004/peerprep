// Profile awards. Every award is computed from data the profile already loads; nothing is stored
// or invented. `value`/`target` drive the progress shown on locked awards.

export const AWARD_DEFINITIONS = [
  { id: 'first-accept', title: 'First Accept', description: 'Get your first accepted solution', metric: 'solved', target: 1, tone: 'emerald', icon: 'check' },
  { id: 'solver-10', title: 'Problem Solver', description: 'Solve 10 problems', metric: 'solved', target: 10, tone: 'sky', icon: 'code' },
  { id: 'solver-50', title: 'Half Century', description: 'Solve 50 problems', metric: 'solved', target: 50, tone: 'indigo', icon: 'medal' },
  { id: 'hard-1', title: 'Hard Hitter', description: 'Solve a Hard problem', metric: 'hardSolved', target: 1, tone: 'rose', icon: 'zap' },
  { id: 'streak-7', title: 'On Fire', description: 'Reach a 7-day streak', metric: 'bestStreak', target: 7, tone: 'orange', icon: 'flame' },
  { id: 'streak-30', title: 'Unstoppable', description: 'Reach a 30-day streak', metric: 'bestStreak', target: 30, tone: 'amber', icon: 'crown' },
  { id: 'active-30', title: 'Regular', description: 'Be active on 30 different days', metric: 'activeDays', target: 30, tone: 'cyan', icon: 'calendar' },
  { id: 'polyglot', title: 'Polyglot', description: 'Submit in 3 languages', metric: 'languages', target: 3, tone: 'violet', icon: 'languages' },
  { id: 'assessment-1', title: 'Test Taker', description: 'Complete an assessment', metric: 'assessments', target: 1, tone: 'amber', icon: 'clipboard' },
  { id: 'interview-1', title: 'Interview Ready', description: 'Receive interview feedback', metric: 'interviews', target: 1, tone: 'sky', icon: 'message' },
];

/**
 * @param {{solved:number, hardSolved:number, bestStreak:number, activeDays:number,
 *          languages:number, assessments:number, interviews:number}} metrics
 */
export function computeAwards(metrics) {
  const awards = AWARD_DEFINITIONS.map((definition) => {
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
