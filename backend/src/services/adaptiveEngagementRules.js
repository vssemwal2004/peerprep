import crypto from 'node:crypto';

export const DOMAIN_ACCESS = { coding: 'questions', learning: 'learning', assessments: 'assessments', interviews: 'interviews', events: 'events' };
export const DOMAIN_LABELS = { coding: 'Coding', learning: 'Learning', assessments: 'Assessments', interviews: 'AI interviews', events: 'Peer interviews' };
export const DEFAULT_POLICY = {
  enabled: true, domains: Object.keys(DOMAIN_ACCESS), dailyMinutes: 35, maxDifficulty: 'Hard',
  weeklyDays: 5, monthlyDays: 16, dailyXp: 20, weeklyXp: 40, monthlyXp: 150,
  stretchXp: 5, pauseUntil: null, customBadges: [],
};
export const LEVELS = [
  ['Explorer', 0, 0, 0], ['Foundation Builder', 100, 15, 3],
  ['Consistent Learner', 350, 30, 10], ['Skilled Performer', 800, 45, 20],
  ['Advanced Practitioner', 1600, 60, 35], ['Campus Champion', 2800, 72, 50],
  ['Placement Pathfinder', 4500, 82, 70],
].map(([title, xp, mastery, days], i) => ({ level: i + 1, title, xp, mastery, days,
  minScore: xp, requirements: [`${xp} lifetime XP`, `${mastery}% demonstrated mastery`, `${days} verified active days`],
  helper: 'Earned through verified practice and steady improvement.' }));

const badge = (id, title, category, metric, target, description, rarity = 'Common', minimumLevel = 1) =>
  ({ id, title, category, metric, target, description, rarity, minimumLevel, rewardXp: 0 });
export const BADGES = [
  badge('first-step', 'First Step', 'growth', 'activities', 1, 'Complete your first verified activity.'),
  badge('code-initiate', 'Code Initiate', 'coding', 'coding', 1, 'Solve your first practice problem.'),
  badge('problem-solver', 'Problem Solver', 'coding', 'coding', 10, 'Solve 10 distinct practice problems.', 'Uncommon'),
  badge('half-century', 'Half Century', 'coding', 'coding', 50, 'Solve 50 distinct practice problems.', 'Rare', 3),
  badge('century-coder', 'Century Coder', 'coding', 'coding', 100, 'Solve 100 distinct practice problems.', 'Epic', 4),
  badge('hard-hitter', 'Hard Hitter', 'coding', 'hardSolved', 1, 'Solve a Hard practice problem.', 'Rare'),
  badge('complexity-crusher', 'Complexity Crusher', 'coding', 'hardSolved', 5, 'Solve 5 distinct Hard problems.', 'Epic', 4),
  badge('learning-begins', 'Learning Begins', 'learning', 'learning', 1, 'Complete your first lesson.'),
  badge('curious-mind', 'Curious Mind', 'learning', 'learning', 5, 'Complete 5 different lessons.', 'Uncommon'),
  badge('knowledge-builder', 'Knowledge Builder', 'learning', 'learning', 25, 'Complete 25 different lessons.', 'Rare', 3),
  badge('test-explorer', 'Test Explorer', 'assessments', 'assessments', 1, 'Complete an evaluated assessment.'),
  badge('accuracy-ace', 'Accuracy Ace', 'assessments', 'highAssessments', 1, 'Score at least 80% in an evaluated assessment.', 'Rare'),
  badge('assessment-master', 'Assessment Master', 'assessments', 'highAssessments', 5, 'Score at least 80% in 5 assessments.', 'Epic', 3),
  badge('ai-debut', 'AI Interview Debut', 'interviews', 'interviews', 1, 'Complete an AI interview.'),
  badge('confident-speaker', 'Confident Speaker', 'interviews', 'interviews', 5, 'Complete 5 different AI interviews.', 'Rare'),
  badge('peer-debut', 'Peer Interview Debut', 'events', 'events', 1, 'Receive verified feedback from a scheduled peer interview.'),
  badge('getting-started', 'Getting Started', 'momentum', 'activeDays', 3, 'Practise on 3 different days.'),
  badge('week-warrior', 'Week Warrior', 'momentum', 'weeklyDays', 5, 'Complete verified work on 5 days in one week.', 'Uncommon'),
  badge('steady-progress', 'Steady Progress', 'momentum', 'activeDays', 30, 'Practise on 30 different days; consecutive days are not required.', 'Rare'),
  badge('mission-explorer', 'Mission Explorer', 'momentum', 'dailyCompleted', 5, 'Complete 5 daily mission plans.', 'Uncommon'),
  badge('monthly-finisher', 'Monthly Finisher', 'momentum', 'monthlyCompleted', 1, 'Complete a monthly journey.', 'Epic'),
  badge('balanced-learner', 'Balanced Learner', 'growth', 'domainsUsed', 3, 'Complete verified work in 3 allocated features.', 'Rare'),
];

export const dayKey = (at) => new Date(new Date(at).getTime() + 3.5 * 3600000).toISOString().slice(0, 10);
export function periodsAt(now = new Date()) {
  const date = new Date(`${dayKey(now)}T00:00:00Z`);
  const day = date.getTime(), week = day - ((date.getUTCDay() + 6) % 7) * 86400000;
  const month = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return Object.fromEntries([['daily', day, day + 86400000], ['weekly', week, week + 7 * 86400000], ['monthly', month, next]].map(([kind, start, end]) =>
    [kind, { kind, periodKey: new Date(start).toISOString().slice(0, kind === 'monthly' ? 7 : 10), startsAt: new Date(start - 12600000), endsAt: new Date(end - 12600000) }]));
}
export const seeded = (seed, key) => parseInt(crypto.createHash('sha256').update(`${seed}:${key}`).digest('hex').slice(0, 8), 16) / 0xffffffff;
export const enabledDomains = (permissions, policy) => Object.keys(DOMAIN_ACCESS).filter((domain) => permissions[DOMAIN_ACCESS[domain]] === true && policy.domains.includes(domain));

export function abilityFrom(events, now) {
  const recent = events.filter((event) => new Date(event.occurredAt) >= new Date(now.getTime() - 30 * 86400000));
  return Object.fromEntries(Object.keys(DOMAIN_ACCESS).map((domain) => {
    const rows = recent.filter((event) => event.domain === domain);
    const unique = [...new Map(rows.map((event) => [event.contentKey, event])).values()];
    const scored = unique.filter((event) => Number.isFinite(event.score));
    const quality = scored.length ? scored.reduce((sum, event) => sum + event.score, 0) / scored.length : 0;
    // Completion is evidence of practice, not evidence of assessment accuracy. Confidence limits cold starts.
    const coverage = Math.min(100, unique.length * (domain === 'learning' ? 4 : 8));
    const mastery = Math.round(scored.length ? quality * Math.min(1, scored.length / 5) : coverage);
    return [domain, { mastery, samples: unique.length, confidence: Math.min(1, unique.length / 10),
      band: mastery >= 70 && unique.length >= 8 ? 'Hard' : mastery >= 35 && unique.length >= 4 ? 'Medium' : 'Easy' }];
  }));
}

export function selectDailyMissions(candidates, ability, policy, seed, returning = false) {
  const order = { Easy: 0, Medium: 1, Hard: 2 };
  const max = order[policy.maxDifficulty];
  const budget = Math.min(policy.dailyMinutes, returning ? 15 : Object.values(ability).every((v) => v.samples < 3) ? 15 : policy.dailyMinutes);
  const eligible = candidates.filter((c) => (order[c.difficulty] ?? 0) <= Math.min(max, order[ability[c.domain]?.band] ?? 0));
  const ranked = eligible.map((c) => ({ ...c, priority: (100 - (ability[c.domain]?.mastery || 0)) / 100 * .6 + seeded(seed, c.key) * .4 }))
    .sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));
  // The shortest interview/assessment can exceed the onboarding preference, but
  // must still fit the administrator's hard time ceiling.
  const core = ranked.find((c) => c.minutes <= budget) || [...ranked].sort((a, b) => a.minutes - b.minutes).find((c) => c.minutes <= policy.dailyMinutes);
  if (!core) return [];
  const goals = [{ ...core, id: 'core', slot: 'core', target: 1, reason: returning ? 'A manageable restart after your break.' : `Selected for your current ${DOMAIN_LABELS[core.domain].toLowerCase()} practice level.` }];
  const choices = ranked.filter((c) => c.key !== core.key && c.minutes + core.minutes <= budget).sort((a, b) => Number(b.domain !== core.domain) - Number(a.domain !== core.domain) || b.priority - a.priority).slice(0, 2);
  choices.forEach((c, i) => goals.push({ ...c, id: `choice-${i}`, slot: 'choice', target: 1, reason: 'Choose this or the other option to complete your daily plan.' }));
  const used = new Set(goals.map((goal) => goal.key));
  const stretch = candidates.filter((c) => !used.has(c.key) && (order[c.difficulty] ?? 0) <= max && c.minutes <= policy.dailyMinutes
    && (order[c.difficulty] ?? 0) <= (order[ability[c.domain]?.band] ?? 0) + 1).sort((a, b) => seeded(seed, b.key) - seeded(seed, a.key))[0];
  if (stretch) goals.push({ ...stretch, id: 'stretch', slot: 'stretch', target: 1, rewardXp: policy.stretchXp, reason: 'Optional extra practice. It never blocks your daily plan.' });
  return goals;
}

export function selectPeriodGoals(kind, candidates, ability, policy, now, seed) {
  const period = periodsAt(now)[kind];
  const remainingDays = Math.max(1, Math.ceil((period.endsAt - now) / 86400000));
  const domains = [...new Set(candidates.map((item) => item.domain))].sort((a, b) => seeded(seed, b) - seeded(seed, a));
  if (!domains.length) return [];
  const goals = domains.slice(0, kind === 'weekly' ? 2 : 3).map((domain) => {
    const pool = candidates.filter((item) => item.domain === domain);
    const skill = ability[domain]?.band || 'Easy';
    const multiplier = { Easy: 1, Medium: 1.5, Hard: 2 }[skill];
    const target = Math.max(1, Math.min(pool.length, remainingDays, Math.round((kind === 'weekly' ? 2 : 6) * multiplier)));
    return { id: domain, domain, metric: domain, target, label: `${DOMAIN_LABELS[domain]} completions`,
      // Freeze the allowed content set so future catalogue changes cannot inflate a target.
      contentKeys: pool.map((item) => item.key), href: pool[0].href, slot: 'core' };
  });
  goals.push({ id: 'activeDays', domain: 'momentum', metric: 'activeDays', target: Math.min(candidates.length, remainingDays, kind === 'weekly' ? policy.weeklyDays : policy.monthlyDays), label: 'Verified active days', slot: 'core' });
  return goals;
}

export function evaluateGoals(assignment, events, domains, availableKeys, now) {
  const rows = events.filter((event) => new Date(event.occurredAt) >= new Date(assignment.assignedAt)
    && new Date(event.occurredAt) < new Date(assignment.endsAt) && new Date(event.occurredAt) <= now && domains.includes(event.domain));
  return assignment.goals.filter((goal) => goal.domain === 'momentum' || domains.includes(goal.domain)).map((goal) => {
    const matching = goal.metric === 'activeDays' ? rows : rows.filter((event) => event.domain === goal.domain && (goal.key ? event.contentKey === goal.key : goal.contentKeys.includes(event.contentKey)));
    const value = goal.metric === 'activeDays' ? new Set(matching.map((event) => event.dayKey)).size : new Set(matching.map((event) => event.contentKey)).size;
    const milestones = new Map();
    for (const event of [...matching].sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))) {
      const key = goal.metric === 'activeDays' ? event.dayKey : event.contentKey;
      if (!milestones.has(key)) milestones.set(key, event.occurredAt);
    }
    const unavailable = goal.key ? !availableKeys.has(goal.key) && !value : goal.contentKeys ? goal.contentKeys.filter((key) => availableKeys.has(key) || matching.some((event) => event.contentKey === key)).length < goal.target : !domains.length;
    return { ...goal, value: Math.min(value, goal.target), progress: Math.min(100, Math.round(value / goal.target * 100)), completed: value >= goal.target,
      completedAt: value >= goal.target ? new Date([...milestones.values()][goal.target - 1]) : null,
      paused: unavailable, href: unavailable ? null : goal.href };
  });
}
export function assignmentCompletedAt(assignment, goals) {
  let required = goals.filter((goal) => goal.slot !== 'stretch');
  if (assignment.kind === 'daily') {
    const choice = required.filter((goal) => goal.slot === 'choice' && goal.completedAt).sort((a, b) => a.completedAt - b.completedAt)[0];
    required = [...required.filter((goal) => goal.slot === 'core'), ...(choice ? [choice] : [])];
  }
  return new Date(Math.max(...required.map((goal) => new Date(goal.completedAt).getTime())));
}
export function assignmentComplete(assignment, goals) {
  if (assignmentPaused(assignment, goals)) return false;
  if (assignment.kind !== 'daily') return goals.every((goal) => goal.completed);
  const choices = goals.filter((goal) => goal.slot === 'choice');
  return goals.some((goal) => goal.slot === 'core' && goal.completed) && (!choices.length || choices.some((goal) => goal.completed));
}
export function assignmentPaused(assignment, goals) {
  if (!goals.length) return true;
  if (assignment.kind !== 'daily') return goals.length !== assignment.goals.length || goals.some((g) => g.paused);
  const core = goals.find((g) => g.slot === 'core');
  const needsChoice = assignment.goals.some((g) => g.slot === 'choice');
  return !core || core.paused || (needsChoice && !goals.some((g) => g.slot === 'choice' && !g.paused));
}

export function progressionView(level, xp, mastery, activeDays) {
  const current = LEVELS[level - 1] || LEVELS[0], next = LEVELS[level] || null;
  const ratios = next ? [xp / next.xp, mastery / next.mastery, activeDays / next.days] : [1];
  return { ...current, totalLevels: LEVELS.length, next, score: xp, mastery, activeDays, progress: Math.min(100, Math.floor(Math.min(...ratios) * 100)) };
}
