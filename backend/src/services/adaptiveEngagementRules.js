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
// Fifty tiered badges. Ids of earlier badges are kept wherever the meaning is unchanged so earned
// badges stay earned; retired ones remain in each student's collection. Streak badges use the best
// run of consecutive verified days, so a break never takes one away.
const tier = (id, title, category, metric, target, rarity, description) => badge(id, title, category, metric, target, description, rarity);
export const BADGES = [
  // Daily active streak: verified work on consecutive days, any feature.
  tier('streak-3', 'Warm Up', 'momentum', 'activeStreak', 3, 'Common', 'Practise 3 days in a row.'),
  tier('streak-7', 'Week Strong', 'momentum', 'activeStreak', 7, 'Common', 'Practise 7 days in a row.'),
  tier('streak-14', 'Fortnight Focus', 'momentum', 'activeStreak', 14, 'Uncommon', 'Practise 14 days in a row.'),
  tier('streak-30', 'Monthly Momentum', 'momentum', 'activeStreak', 30, 'Uncommon', 'Practise 30 days in a row.'),
  tier('streak-50', 'Fifty Days Strong', 'momentum', 'activeStreak', 50, 'Rare', 'Practise 50 days in a row.'),
  tier('streak-100', 'Century Streak', 'momentum', 'activeStreak', 100, 'Epic', 'Practise 100 days in a row.'),
  tier('streak-200', 'Unbreakable', 'momentum', 'activeStreak', 200, 'Epic', 'Practise 200 days in a row.'),
  tier('streak-365', 'Year of Practice', 'momentum', 'activeStreak', 365, 'Legendary', 'Practise every day for a year.'),
  // Coding streak.
  tier('code-streak-7', 'Coding Week', 'coding', 'codingStreak', 7, 'Common', 'Solve a problem 7 days in a row.'),
  tier('code-streak-30', 'Coding Month', 'coding', 'codingStreak', 30, 'Uncommon', 'Solve a problem 30 days in a row.'),
  tier('code-streak-50', 'Code Rhythm', 'coding', 'codingStreak', 50, 'Rare', 'Solve a problem 50 days in a row.'),
  tier('code-streak-100', 'Code Centurion', 'coding', 'codingStreak', 100, 'Epic', 'Solve a problem 100 days in a row.'),
  tier('code-streak-200', 'Code Marathon', 'coding', 'codingStreak', 200, 'Epic', 'Solve a problem 200 days in a row.'),
  tier('code-streak-365', 'Code Every Day', 'coding', 'codingStreak', 365, 'Legendary', 'Solve a problem every day for a year.'),
  // Learning streak.
  tier('learn-streak-7', 'Study Week', 'learning', 'learningStreak', 7, 'Common', 'Complete a lesson 7 days in a row.'),
  tier('learn-streak-30', 'Study Month', 'learning', 'learningStreak', 30, 'Uncommon', 'Complete a lesson 30 days in a row.'),
  tier('learn-streak-100', 'Scholar Streak', 'learning', 'learningStreak', 100, 'Epic', 'Complete a lesson 100 days in a row.'),
  // Problems solved.
  tier('code-initiate', 'Code Initiate', 'coding', 'coding', 1, 'Common', 'Solve your first practice problem.'),
  tier('problem-solver', 'Problem Solver', 'coding', 'coding', 10, 'Common', 'Solve 10 distinct practice problems.'),
  tier('solver-25', 'Quarter Century', 'coding', 'coding', 25, 'Uncommon', 'Solve 25 distinct practice problems.'),
  tier('half-century', 'Half Century', 'coding', 'coding', 50, 'Uncommon', 'Solve 50 distinct practice problems.'),
  tier('century-coder', 'Century Coder', 'coding', 'coding', 100, 'Rare', 'Solve 100 distinct practice problems.'),
  tier('solver-200', 'Double Century', 'coding', 'coding', 200, 'Epic', 'Solve 200 distinct practice problems.'),
  tier('solver-300', 'Triple Century', 'coding', 'coding', 300, 'Epic', 'Solve 300 distinct practice problems.'),
  tier('solver-500', 'Problem Legend', 'coding', 'coding', 500, 'Legendary', 'Solve 500 distinct practice problems.'),
  // Hard problems.
  tier('hard-hitter', 'Hard Hitter', 'coding', 'hardSolved', 1, 'Uncommon', 'Solve a Hard practice problem.'),
  tier('complexity-crusher', 'Complexity Crusher', 'coding', 'hardSolved', 5, 'Rare', 'Solve 5 distinct Hard problems.'),
  tier('hard-25', 'Hard Mode', 'coding', 'hardSolved', 25, 'Epic', 'Solve 25 distinct Hard problems.'),
  tier('hard-50', 'Summit Seeker', 'coding', 'hardSolved', 50, 'Legendary', 'Solve 50 distinct Hard problems.'),
  // Lessons completed.
  tier('learning-begins', 'Learning Begins', 'learning', 'learning', 1, 'Common', 'Complete your first lesson.'),
  tier('curious-mind', 'Curious Mind', 'learning', 'learning', 5, 'Common', 'Complete 5 different lessons.'),
  tier('knowledge-builder', 'Knowledge Builder', 'learning', 'learning', 25, 'Uncommon', 'Complete 25 different lessons.'),
  tier('lessons-50', 'Deep Diver', 'learning', 'learning', 50, 'Rare', 'Complete 50 different lessons.'),
  tier('lessons-100', 'Knowledge Seeker', 'learning', 'learning', 100, 'Epic', 'Complete 100 different lessons.'),
  tier('lessons-200', 'Master Learner', 'learning', 'learning', 200, 'Legendary', 'Complete 200 different lessons.'),
  // Daily challenges completed.
  tier('daily-1', 'Daily Debut', 'momentum', 'dailyCompleted', 1, 'Common', 'Complete your first daily challenge.'),
  tier('daily-7', 'Daily Habit', 'momentum', 'dailyCompleted', 7, 'Uncommon', 'Complete 7 daily challenges.'),
  tier('daily-30', 'Daily Devotee', 'momentum', 'dailyCompleted', 30, 'Rare', 'Complete 30 daily challenges.'),
  tier('daily-100', 'Daily Legend', 'momentum', 'dailyCompleted', 100, 'Epic', 'Complete 100 daily challenges.'),
  // QuickPreps completed (ids keep their original "quest" names so earned badges stay earned).
  tier('quest-1', 'QuickPrep Starter', 'quests', 'questsCompleted', 1, 'Common', 'Complete your first QuickPrep.'),
  tier('quest-3', 'QuickPrep Explorer', 'quests', 'questsCompleted', 3, 'Uncommon', 'Complete 3 QuickPreps.'),
  tier('quest-5', 'QuickPrep Veteran', 'quests', 'questsCompleted', 5, 'Rare', 'Complete 5 QuickPreps.'),
  tier('quest-10', 'QuickPrep Master', 'quests', 'questsCompleted', 10, 'Epic', 'Complete 10 QuickPreps.'),
  // Assessments.
  tier('test-explorer', 'Test Explorer', 'assessments', 'assessments', 1, 'Common', 'Complete an evaluated assessment.'),
  tier('tests-5', 'Test Regular', 'assessments', 'assessments', 5, 'Uncommon', 'Complete 5 evaluated assessments.'),
  tier('accuracy-ace', 'Accuracy Ace', 'assessments', 'highAssessments', 1, 'Rare', 'Score at least 80% in an evaluated assessment.'),
  tier('assessment-master', 'Assessment Master', 'assessments', 'highAssessments', 5, 'Epic', 'Score at least 80% in 5 assessments.'),
  // Interviews.
  tier('ai-debut', 'AI Interview Debut', 'interviews', 'interviews', 1, 'Common', 'Complete an AI interview.'),
  tier('confident-speaker', 'Confident Speaker', 'interviews', 'interviews', 5, 'Rare', 'Complete 5 different AI interviews.'),
  tier('peer-debut', 'Peer Interview Debut', 'events', 'events', 1, 'Common', 'Receive verified feedback from a scheduled peer interview.'),
];
export const BADGE_TIERS = { Common: 'Bronze', Uncommon: 'Silver', Rare: 'Gold', Epic: 'Platinum', Legendary: 'Diamond', Special: 'Special', Legacy: 'Legacy' };

/** Quest badges need coding; every other category follows its feature allocation. */
export const badgeCategoryAllowed = (category, domains) => category === 'quests' ? domains.includes('coding') : (!DOMAIN_ACCESS[category] || domains.includes(category));

const nextDayKey = (key) => new Date(Date.parse(`${key}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
/** Longest run of consecutive day keys. Earned streak badges never expire, so the best run counts. */
export function bestStreak(dayKeys) {
  let best = 0, run = 0, previous = null;
  for (const key of [...new Set(dayKeys)].sort()) {
    run = previous && nextDayKey(previous) === key ? run + 1 : 1;
    best = Math.max(best, run);
    previous = key;
  }
  return best;
}
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

/**
 * The daily challenge: one unsolved coding problem per student per day. The seed includes the
 * student and the day, so classmates get different problems and a refresh never reshuffles. The
 * pick stays at the student's level, stepping up only when nothing at that level is left. A
 * university without coding gets one task from its other allocated features instead.
 */
export function selectDailyMissions(candidates, ability, policy, seed, returning = false) {
  const order = { Easy: 0, Medium: 1, Hard: 2 };
  const max = order[policy.maxDifficulty] ?? 2;
  const coding = candidates.filter((c) => c.domain === 'coding');
  const pool = coding.length ? coding : candidates.filter((c) => c.minutes <= policy.dailyMinutes);
  if (!pool.length) return [];
  const rank = (c) => order[c.difficulty] ?? 0;
  const ceiling = (c) => Math.min(max, returning ? 0 : order[ability[c.domain]?.band] ?? 0);
  const atLevel = pool.filter((c) => rank(c) <= ceiling(c));
  const stepUp = pool.filter((c) => rank(c) <= Math.min(max, ceiling(c) + 1));
  const eligible = atLevel.length ? atLevel : stepUp.length ? stepUp : pool.filter((c) => rank(c) <= max);
  if (!eligible.length) return [];
  const pick = [...eligible].sort((a, b) => seeded(seed, b.key) - seeded(seed, a.key) || a.key.localeCompare(b.key))[0];
  return [{ ...pick, id: 'core', slot: 'core', target: 1,
    reason: returning ? 'A manageable restart after your break.' : `Picked for you at your current ${DOMAIN_LABELS[pick.domain].toLowerCase()} level.` }];
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
