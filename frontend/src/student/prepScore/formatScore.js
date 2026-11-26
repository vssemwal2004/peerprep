/** A Prep Score as "1,234.5" (one decimal at most, never negative). */
export function formatScore(value) {
  const number = Number(value);
  return (Number.isFinite(number) ? Math.max(0, number) : 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/**
 * One line under a university rank: how far the next rank is. The rank is live, but it moves only
 * when your Prep Score passes the next student's (2026-11-26 feedback: "score rose, rank did not").
 */
export function rankGapText(ranking) {
  const rank = Number(ranking?.rank);
  if (!(rank > 0)) return '';
  if (rank === 1) return ranking?.tied ? 'Tied at #1 · one more point puts you alone on top' : 'You are #1 in your university';
  const gap = Number(ranking?.nextRankGap);
  if (!(gap > 0)) return 'Rank = your Prep Score vs. your university · updates live';
  const shown = gap.toLocaleString(undefined, { minimumFractionDigits: gap < 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `+${shown} Prep Score to pass the next student · updates live`;
}
