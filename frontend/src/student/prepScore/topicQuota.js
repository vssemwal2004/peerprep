// Daily per-topic Prep Score quota: wording shared by the problem page chip and the result toast.
// Server: backend/src/services/prepScore/topicQuota.js.

const resetLabel = (iso) => {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '12:00 AM';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

/**
 * Chip state for a problem: null hides the chip.
 * { tone: 'ok' | 'full' | 'done' | 'muted', label, title }
 */
export function quotaChip(quota, studentStatus) {
  if (!quota || quota.unlimited) return null;
  const { topic, remaining, limit, solve } = quota;
  if (solve) {
    return solve.counted
      ? { tone: 'done', label: 'In Prep Score', title: `This solve counts toward your Prep Score (topic: ${solve.topic}).` }
      : { tone: 'muted', label: 'Not in Prep Score', title: `Solved after the daily ${solve.topic} limit, so it does not add to your Prep Score.` };
  }
  // Solved before the daily limit existed: it already counts.
  if (String(studentStatus || '').toLowerCase() === 'solved') return null;
  if (remaining > 0) {
    return { tone: 'ok', label: `${topic} · ${remaining}/${limit} left today`,
      title: `Prep Score counts ${limit} new solves per topic each day. This problem counts as ${topic}. Resets at ${resetLabel(quota.resetsAt)}.` };
  }
  return { tone: 'full', label: `${topic} limit reached today`,
    title: `You can still solve it, but it won't add to your Prep Score. ${topic} resets at ${resetLabel(quota.resetsAt)}.` };
}

/** Toast after an accepted submit, or null when there is nothing new to say. */
export function quotaToast(outcome) {
  if (!outcome || outcome.alreadySolved || outcome.counted === undefined || outcome.counted === null) return null;
  if (outcome.counted) {
    if (outcome.unlimited) return null;
    return { type: 'success', message: `Counted in Prep Score · ${outcome.topic} ${outcome.used}/${outcome.limit} today` };
  }
  return {
    type: 'warning', duration: 9000, title: `${outcome.topic}: daily Prep Score limit reached`,
    message: `Solve saved, but it won't add to your Prep Score. Try another topic, or come back after ${resetLabel(outcome.resetsAt)}.`,
  };
}

/** Folds a submit outcome into the chip state without another request. */
export function quotaAfterSolve(previous, outcome) {
  if (!outcome) return previous;
  return {
    ...(previous || {}), topic: outcome.topic, limit: outcome.limit, used: outcome.used, remaining: outcome.remaining,
    unlimited: outcome.unlimited, resetsAt: outcome.resetsAt,
    solve: outcome.alreadySolved && previous?.solve ? previous.solve
      : outcome.counted === null || outcome.counted === undefined ? previous?.solve || null
        : { counted: outcome.counted, topic: outcome.topic },
  };
}
