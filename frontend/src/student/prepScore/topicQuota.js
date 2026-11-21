// Prep Score on the problem page: the chip (what solving this problem pays today, topic by topic)
// and the notice after a submission. Server: backend/src/services/prepScore/{topicStatus,submitOutcome}.js.
//
// A solve's points are shared equally across the problem's topics; each topic pays for `limit`
// solves a day. A full topic loses only its own share, so mixing topics keeps the score growing.

// Prep Score changes are small (growth curve), so up to two decimals.
const n = (value) => {
  const number = Math.round((Number(value) || 0) * 100) / 100;
  return String(number);
};

export const resetLabel = (iso) => {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '12:00 AM';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

/**
 * Chip for a problem from GET /student/questions/:source/:id/prep-score, or null to hide it.
 * { tone: 'ok' | 'partial' | 'full' | 'done', label, title }
 */
export function quotaChip(status) {
  if (!status || !Array.isArray(status.topics)) return null;
  if (status.solved) return { tone: 'done', label: 'Solved · in your Prep Score', title: 'You already earned this problem’s Prep Score points.' };
  const full = status.topics.filter((topic) => topic.full);
  const lines = status.topics.map((topic) => `${topic.topic}: ${topic.limit ? `${topic.used}/${topic.limit} today${topic.full ? ' (full)' : ''}` : 'no limit'}`).join(' · ');
  const reset = `Topics reset at ${resetLabel(status.resetsAt)}.`;
  if (!full.length) return { tone: 'ok', label: `+${n(status.maxPoints)} Prep Score`, title: `${status.difficulty} problem, shared across its topics. ${lines}. ${reset}` };
  if (full.length === status.topics.length) {
    return { tone: 'full', label: 'Topics full today', title: `Every topic of this problem has reached today's limit, so it adds no Prep Score today. ${lines}. ${reset}` };
  }
  return { tone: 'partial', label: `+${n(status.points)} of ${n(status.maxPoints)} today`, title: `${full.map((topic) => topic.topic).join(', ')} ${full.length === 1 ? 'is' : 'are'} full today; the other topics still pay. ${lines}. ${reset}` };
}

/** Folds a submit outcome into the chip without another request. */
export function quotaAfterSolve(previous, outcome) {
  if (!outcome || outcome.kind !== 'solve' || !previous) return previous;
  const used = new Map((outcome.parts || []).map((part) => [part.topic.toLowerCase(), part]));
  return {
    ...previous, solved: true, points: 0,
    topics: (previous.topics || []).map((topic) => {
      const part = used.get(topic.topic.toLowerCase());
      if (!part) return topic;
      const count = part.counted ? part.used : topic.used;
      return { ...topic, used: count, full: Boolean(topic.limit) && count >= topic.limit };
    }),
  };
}

/**
 * What to show after a judged submission: { kind, ... } for the result card, a toast, or null.
 *  - solve:     { kind: 'solve', points, parts, fullTopics, suggestions, resetsAt, total }
 *  - wrong:     toast { type, message }
 *  - challenge: merged into the solve card when both happen.
 */
export function submitNotice(outcome, challenge, readiness = null) {
  if (outcome?.kind === 'wrong') {
    if (!outcome.lost) return null;
    return { toast: { type: 'info', duration: 6000, message: `−${n(outcome.lost)} Prep Score for this wrong answer${outcome.refundable ? ' · you get it back if you solve this problem today' : ''}.` } };
  }
  // A repeat accept (solved before, or the other copy of the same problem): a short note only.
  if (outcome?.kind === 'solve' && outcome.alreadySolved && !challenge?.completed) {
    return { toast: { type: 'info', duration: 5000, message: 'Accepted again. This problem already counted, so your Prep Score and Prep Readiness stay the same.' } };
  }
  const solve = outcome?.kind === 'solve' && !outcome.alreadySolved ? outcome : null;
  if (!solve && !challenge?.completed) return null;
  return { card: { solve, challenge: challenge?.completed ? challenge : null, readiness: solve ? readiness : null } };
}

export const formatPoints = n;
