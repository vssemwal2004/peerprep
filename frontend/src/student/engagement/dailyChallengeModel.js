export function dailyGoalStatus(goal) {
  return goal.completed ? 'completed' : goal.paused ? 'paused' : 'pending';
}

// Alternatives count as one requirement; stretch work never blocks the daily reward.
export function dailyPlanProgress(goals = []) {
  const core = goals.filter(goal => goal.slot === 'core');
  const choices = goals.filter(goal => goal.slot === 'choice');
  const fraction = goal => goal.completed ? 1 : Math.min(1, Math.max(0, Number(goal.value) || 0) / Math.max(1, Number(goal.target) || 1));
  const total = core.length + (choices.length ? 1 : 0);
  const completed = core.filter(goal => goal.completed).length + (choices.some(goal => goal.completed) ? 1 : 0);
  const progress = core.reduce((sum, goal) => sum + fraction(goal), 0) + (choices.length ? Math.max(...choices.map(fraction)) : 0);
  return { total, completed, percent: total ? Math.round(progress / total * 100) : 0 };
}
