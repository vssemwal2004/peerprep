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

/**
 * Three short reads for the comparison page: where to focus, consistency, and your best edge.
 * Each is { kind: 'focus' | 'rhythm' | 'edge', title, text }.
 */
export function compareInsights(data) {
  const mate = firstName(data.mate.name);
  const list = [{ kind: 'focus', title: 'Where to focus', text: compareInsight(data) }];
  const youDays = data.you.activeDays30 || 0;
  const mateDays = data.mate.activeDays30 || 0;
  list.push({
    kind: 'rhythm', title: 'Practice rhythm',
    text: youDays === mateDays ? `You both practised on ${youDays} of the last 30 days. A steady daily habit decides who pulls ahead.`
      : youDays > mateDays ? `You practised on ${youDays} of the last 30 days, ${youDays - mateDays} more than ${mate}. Consistency is your strength.`
        : `${mate} practised on ${mateDays} of the last 30 days, ${mateDays - youDays} more than you. Short daily sessions close this fastest.`,
  });
  const edge = [...(data.topics || [])].sort((a, b) => (b.you - b.mate) - (a.you - a.mate))[0];
  const hardLead = data.you.totals.hard - data.mate.totals.hard;
  list.push(edge && edge.you > edge.mate
    ? { kind: 'edge', title: 'Your edge', text: `You lead in ${edge.tag} by ${edge.you - edge.mate} problem${edge.you - edge.mate === 1 ? '' : 's'}. Help ${mate} with it, or push into a new topic.` }
    : hardLead > 0 ? { kind: 'edge', title: 'Your edge', text: `You have solved ${hardLead} more Hard problem${hardLead === 1 ? '' : 's'} than ${mate}.` }
      : { kind: 'edge', title: 'Your next edge', text: `Pick a topic ${mate} has not touched yet and own it this week.` });
  return list;
}
