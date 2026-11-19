const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Your Prep Mate';
const LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/**
 * One plain sentence for the comparison page: where the student is behind (and what to try), or
 * that they lead. `data` is the /student/peers/:id/compare response.
 */
export function compareInsight(data) {
  const mate = firstName(data.mate.name);
  const gaps = ['easy', 'medium', 'hard'].map((key) => ({ key, gap: data.mate.totals[key] - data.you.totals[key] })).sort((a, b) => b.gap - a.gap);
  const topic = [...(data.topics || [])].sort((a, b) => (b.mate - b.you) - (a.mate - a.you))[0];
  if (gaps[0].gap > 0) {
    const tip = topic && topic.mate > topic.you ? ` ${mate} is also ahead in ${topic.tag}.` : '';
    return `${mate} has solved ${gaps[0].gap} more ${LABEL[gaps[0].key]} problem${gaps[0].gap === 1 ? '' : 's'}. One ${LABEL[gaps[0].key]} problem today starts closing the gap.${tip}`;
  }
  if (data.mate.thisWeek > data.you.thisWeek) return `${mate} solved ${data.mate.thisWeek - data.you.thisWeek} more this week. Keep your lead overall with a quick solve today.`;
  if (data.you.totals.total === 0 && data.mate.totals.total === 0) return 'Neither of you has solved a practice problem yet. Start today and set the pace.';
  return `You are ahead on solved problems. Keep your ${data.you.streak.current}-day streak going to stay in front.`;
}
