// Prep Coach: one short tip after a practice submission, shown at the top of the screen
// (2026-11-26). Students kept solving the same topic or only Easy questions and could not tell why
// their Prep Score stopped rising. This picks the single most useful tip from what just happened.
//
// Pure and deterministic: every input comes from the submit outcome and today's ledger, so the tip
// always agrees with the points actually given. Rules are checked in priority order; the first
// match wins. Returns null when there is nothing worth saying (the score card already shows points).
//
// Tip: { code, tone: 'warn' | 'info' | 'good', title, body, actions: [{ label, href }], topic, once }
//   once = 'day' -> the client shows this code at most once per IST day.

export const COACH_CODES = Object.freeze([
  'repeat', 'topic-full', 'topic-partial', 'last-slot', 'easy-run', 'medium-run', 'challenge', 'wrong-run', 'wrong-capped',
]);

// Easy questions in a row (today, counted) before suggesting a Medium; Mediums before a Hard.
export const EASY_RUN = 3;
export const MEDIUM_RUN = 4;
export const WRONG_RUN = 3;

const topicHref = (topic, extra = {}) => {
  const params = new URLSearchParams({ ...(topic ? { topic } : {}), status: 'unsolved', ...extra });
  return `/problems?${params.toString()}`;
};

const ratio = (high, low) => {
  const value = Number(high) / Number(low);
  if (!Number.isFinite(value) || value <= 1) return '';
  return Number.isInteger(value) ? `${value}×` : `${value.toFixed(1).replace(/\.0$/, '')}×`;
};

const list = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** Difficulties of today's counted first solves, oldest first (the current solve included). */
export function todayDifficulties(ledger, day) {
  return (ledger?.events || [])
    .filter((event) => event.kind === 'solve' && event.day === day && event.raw > 0)
    .sort((a, b) => a.at - b.at)
    .map((event) => event.meta?.difficulty || 'Easy');
}

const tailRun = (values, value) => {
  let count = 0;
  for (let index = values.length - 1; index >= 0 && values[index] === value; index -= 1) count += 1;
  return count;
};

/**
 * outcome:     prepScoreAfterSubmit result ({ kind: 'solve' | 'wrong', ... }), alternative included
 * difficulty:  this problem's difficulty
 * difficulties: todayDifficulties(ledger, today)
 * solvePoints: { Easy, Medium, Hard } activity points
 * challenge:   { open: boolean, scores: boolean, coins } today's daily challenge, or null when unavailable
 * wrongCount:  wrong answers today (counted ones), for wrong outcomes
 */
export function coachTip({ outcome, difficulty = 'Easy', difficulties = [], solvePoints = {}, challenge = null, wrongCount = 0 } = {}) {
  if (!outcome) return null;

  if (outcome.kind === 'wrong') {
    if (outcome.alreadySolved) return null;
    if (outcome.capped) {
      return { code: 'wrong-capped', tone: 'info', once: 'day', title: 'No more loss from wrong answers today',
        body: 'Today’s limit is reached. Keep trying, it costs nothing more.', actions: [] };
    }
    if (wrongCount >= WRONG_RUN) {
      return { code: 'wrong-run', tone: 'info', once: 'day', title: 'Stuck? Take a hint',
        body: 'A wrong answer costs a little, and you get it back if you solve the question today. Try a hint, ANVI or an easier question.',
        actions: [{ label: 'Easier questions', href: topicHref('', { difficulty: 'Easy' }) }] };
    }
    return null;
  }

  if (outcome.kind !== 'solve') return null;
  const parts = Array.isArray(outcome.parts) ? outcome.parts : [];
  const limit = Number(outcome.limit) || 0;
  const mainTopic = parts[0]?.topic || '';
  const suggestions = (outcome.suggestions || []).filter(Boolean);
  const altHref = outcome.alternative?.url || outcome.alternative?.href;
  const altAction = altHref
    ? [{ label: `Try: ${String(outcome.alternative.title || 'next question').slice(0, 40)}`, href: altHref }] : [];
  const topicActions = suggestions.slice(0, 2).map((topic) => ({ label: topic, href: topicHref(topic) }));

  // 1. Re-solved: no new points, whatever the topic.
  if (outcome.alreadySolved) {
    return { code: 'repeat', tone: 'info', topic: mainTopic, title: 'Already solved, so no new points',
      body: 'Revising is great practice. Only new questions raise your Prep Score.',
      actions: [{ label: mainTopic ? `New ${mainTopic} question` : 'Find a new question', href: topicHref(mainTopic) }] };
  }

  // 2. Every topic of this question was already full today: 0 points.
  if (outcome.allFull && outcome.fullTopics?.length) {
    const full = outcome.fullTopics.slice(0, 2);
    return { code: 'topic-full', tone: 'warn', topic: full[0], title: `${list(full)}: daily limit reached${limit ? ` (${limit}/${limit})` : ''}`,
      body: `More ${list(full)} today gives 0 points. Switch topic now; it opens again at midnight.`,
      actions: [...altAction, ...topicActions].slice(0, 2) };
  }

  // 3. Some topics were full: the points went to the others.
  if (outcome.fullTopics?.length) {
    const counted = parts.filter((part) => part.counted).map((part) => part.topic).slice(0, 2);
    return { code: 'topic-partial', tone: 'info', topic: outcome.fullTopics[0], title: `${list(outcome.fullTopics.slice(0, 2))} is full for today`,
      body: counted.length ? `Your points went to ${list(counted)}. Pick a different topic for full points.` : 'Pick a different topic for full points.',
      actions: [...altAction, ...topicActions].slice(0, 2) };
  }

  // 4. This solve used a topic's last counted slot: warn before the next one is wasted.
  const filled = parts.filter((part) => part.counted && limit && Number(part.used) >= limit).map((part) => part.topic);
  if (filled.length) {
    return { code: 'last-slot', tone: 'info', topic: filled[0], title: `Last ${list(filled.slice(0, 2))} solve that counts today`,
      body: `Next ${list(filled.slice(0, 2))} question today won’t add points. Try another topic next.`,
      actions: topicActions };
  }

  // 5. Only Easy in a row: a Medium is worth more.
  const level = String(difficulty || 'Easy');
  if (level === 'Easy' && tailRun(difficulties, 'Easy') >= EASY_RUN) {
    const times = ratio(solvePoints.Medium, solvePoints.Easy);
    return { code: 'easy-run', tone: 'good', once: 'day', topic: mainTopic, title: `${tailRun(difficulties, 'Easy')} Easy in a row, nice!`,
      body: `Ready for a Medium? It is worth ${times || 'more'} an Easy and grows your score faster.`,
      actions: [{ label: mainTopic ? `Medium in ${mainTopic}` : 'Medium questions', href: topicHref(mainTopic, { difficulty: 'Medium' }) }] };
  }
  if (level === 'Medium' && tailRun(difficulties, 'Medium') >= MEDIUM_RUN) {
    const times = ratio(solvePoints.Hard, solvePoints.Medium);
    return { code: 'medium-run', tone: 'good', once: 'day', topic: mainTopic, title: `${tailRun(difficulties, 'Medium')} Medium in a row`,
      body: `Try a Hard one. It is worth ${times || 'more'} a Medium.`,
      actions: [{ label: mainTopic ? `Hard in ${mainTopic}` : 'Hard questions', href: topicHref(mainTopic, { difficulty: 'Hard' }) }] };
  }

  // 6. Daily challenge still open (once a day).
  if (challenge?.open) {
    const gains = [challenge.scores ? 'extra Prep Score' : '', challenge.coins > 0 ? `+${challenge.coins} Prep Coins` : ''].filter(Boolean);
    return { code: 'challenge', tone: 'info', once: 'day', title: 'Today’s daily challenge is still open',
      body: gains.length ? `Finish it for ${list(gains)} and your Prep Streak.` : 'Finish it to keep your Prep Streak.',
      actions: [{ label: 'Open daily challenge', href: '/student/quickprep' }] };
  }

  return null;
}
