// Extra views of a student's own work for the Prep Analysis pages: preparation growth over time,
// solve milestones, recent solves, per-language and per-difficulty accuracy, and personal records.
// All pure: they read the practice library, the student's work map and the period row.

import { DIFFICULTY_LEVELS, questionLink } from './practiceCoverage.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const SOLVE_MILESTONES = Object.freeze([1, 10, 25, 50, 100, 200, 300, 500, 750, 1000]);
const round1 = (value) => Math.round(value * 10) / 10;

/** Questions solved, oldest first: [{ item, at }]. */
function solvesInOrder(library, work) {
  return library.filter((item) => work.get(item.key)?.solved && work.get(item.key).firstSolvedAt)
    .map((item) => ({ item, at: new Date(work.get(item.key).firstSolvedAt) }))
    .sort((left, right) => left.at - right.at);
}

/** The day each solve-count milestone was reached, and the next one to reach. */
export function solveMilestones(library, work) {
  const solves = solvesInOrder(library, work);
  const reached = SOLVE_MILESTONES.filter((count) => count <= solves.length)
    .map((count) => ({ count, at: solves[count - 1].at.toISOString(), title: solves[count - 1].item.title }));
  const next = SOLVE_MILESTONES.find((count) => count > solves.length) || null;
  return { total: solves.length, reached, next: next ? { count: next, remaining: next - solves.length } : null };
}

/** The latest first solves with links. */
export function recentSolves(library, work, limit = 8) {
  return solvesInOrder(library, work).slice(-limit).reverse().map(({ item, at }) => ({
    id: item.id, title: item.title, difficulty: item.difficulty, type: item.type, tags: item.tags.slice(0, 3), at: at.toISOString(), to: questionLink(item),
  }));
}

/**
 * Week by week: the preparation estimate (same rule as today's, over the same core topics) and
 * the running total of solves per difficulty. Covers the period, or the 12 weeks before now when
 * the period is all time and the student started recently; at most 52 points.
 */
export function preparationGrowth(library, work, coverage, { range = null, now = new Date() } = {}) {
  const solves = solvesInOrder(library, work);
  const firstSolve = solves[0]?.at || null;
  const twelveWeeks = new Date(now.getTime() - 12 * 7 * DAY_MS);
  const start = range?.from || (firstSolve && firstSolve < twelveWeeks ? firstSolve : twelveWeeks);
  const end = range?.to && range.to < now ? range.to : now;
  const days = Math.max(1, (end - start) / DAY_MS);
  const step = Math.max(7, Math.ceil(days / 52)) * DAY_MS;
  const core = coverage.topics.filter((topic) => topic.core);
  const coreKeys = new Map(core.map((topic) => [topic.key, topic]));
  const timesByTopic = new Map(core.map((topic) => [topic.key, []]));
  for (const { item, at } of solves) {
    for (const tag of item.tags) timesByTopic.get(tag.toLowerCase())?.push(at.getTime());
  }
  const totalTarget = core.reduce((sum, topic) => sum + topic.target, 0);
  const points = [];
  for (let time = start.getTime() + step, guard = 0; guard < 60; time += step, guard += 1) {
    const at = Math.min(time, end.getTime());
    let met = 0;
    for (const [key, times] of timesByTopic) met += Math.min(times.filter((value) => value <= at).length, coreKeys.get(key).target);
    const byDifficulty = Object.fromEntries(DIFFICULTY_LEVELS.map((level) => [level, 0]));
    for (const { item, at: solvedAt } of solves) if (solvedAt.getTime() <= at) byDifficulty[item.difficulty] += 1;
    points.push({ date: new Date(at).toISOString().slice(0, 10), preparation: totalTarget ? round1((met / totalTarget) * 100) : 0, ...byDifficulty });
    if (at >= end.getTime()) break;
  }
  return points;
}

/** Accuracy per language and per difficulty from the period's coding row. */
export function codingBreakdown(row) {
  const languages = new Map();
  const difficulties = new Map(DIFFICULTY_LEVELS.map((level) => [level, { level, submissions: 0, accepted: 0, problems: new Set(), solved: new Set() }]));
  for (const entry of row.entries || []) {
    const language = languages.get(entry.language) || { language: entry.language, submissions: 0, accepted: 0 };
    language.submissions += entry.attempts;
    language.accepted += entry.accepted;
    languages.set(entry.language, language);
    const level = difficulties.get(DIFFICULTY_LEVELS.find((value) => value.toLowerCase() === String(entry.meta?.difficulty || '').toLowerCase()) || 'Easy');
    level.submissions += entry.attempts;
    level.accepted += entry.accepted;
    level.problems.add(entry.problemId);
    if (entry.accepted > 0) level.solved.add(entry.problemId);
  }
  const accuracy = (value) => (value.submissions ? round1((value.accepted / value.submissions) * 100) : null);
  return {
    languages: [...languages.values()].sort((left, right) => right.submissions - left.submissions).map((value) => ({ ...value, accuracy: accuracy(value) })),
    difficulties: [...difficulties.values()].map(({ problems, solved, ...value }) => ({ ...value, tried: problems.size, solved: solved.size, accuracy: accuracy(value) })),
  };
}

/** Personal bests across the features the student has. */
export function personalRecords({ activity, sections, coverage, milestones }) {
  const records = [];
  const busiest = [...activity.days].sort((left, right) => right.total - left.total || right.date.localeCompare(left.date))[0];
  if (busiest) records.push({ key: 'busiestDay', label: 'Busiest day', value: busiest.total, unit: 'activities', at: busiest.date });
  if (activity.streak.best) records.push({ key: 'bestStreak', label: 'Longest streak', value: activity.streak.best, unit: 'days' });
  if (coverage) {
    const top = [...coverage.topics].sort((left, right) => right.solved - left.solved)[0];
    if (top?.solved) records.push({ key: 'topTopic', label: 'Most solved topic', value: top.solved, unit: 'solved', detail: top.name });
    const hard = coverage.totals.byDifficulty.Hard.solved;
    if (hard) records.push({ key: 'hardSolved', label: 'Hard questions solved', value: hard, unit: 'solved' });
  }
  if (milestones?.reached?.length) {
    const last = milestones.reached.at(-1);
    records.push({ key: 'milestone', label: `${last.count}${last.count === 1 ? 'st' : 'th'} solve`, value: last.count, unit: 'solves', at: last.at.slice(0, 10) });
  }
  if (sections.assessment?.taken) records.push({ key: 'bestTest', label: 'Best test score', value: sections.assessment.bestScore, unit: '%' });
  if (sections.interview?.mock?.done) records.push({ key: 'bestMock', label: 'Best mock interview', value: sections.interview.mock.best, unit: '%' });
  if (sections.quickprep?.finished) records.push({ key: 'sheets', label: 'Sheets finished', value: sections.quickprep.finished, unit: 'sheets' });
  return records;
}
