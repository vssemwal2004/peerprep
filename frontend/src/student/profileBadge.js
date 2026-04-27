export function getLearnerBadge({
  solvedCount = 0,
  streak = 0,
  assessmentScore = 0,
  interviewScore = 0,
}) {
  const solved = Number(solvedCount || 0);
  const safeStreak = Number(streak || 0);
  const safeAssessmentScore = Number(assessmentScore || 0);
  const safeInterviewScore = Number(interviewScore || 0);

  const blendedScore = (solved * 0.5)
    + (safeStreak * 1.75)
    + (safeAssessmentScore * 0.35)
    + (safeInterviewScore * 0.2);

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
