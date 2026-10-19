// "What would change?" for a Prep Score draft, run against one university's real students before
// anything is published. Nothing is written: stored scores and ranks stay as they are.
import User from '../../models/User.js';
import { computePrepScoreRows, dashboardPermissions } from '../studentDashboardService.js';
import { cohortKeyFor, ensurePrepScoreStore, storedScoresFor } from './sync.js';

const IMPACT_LIMIT = 3_000;
const BATCH_SIZE = 300;
const TOP = 10;

/** Competition rank (1, 2, 2, 4) within each cohort; students without work are unranked. */
function cohortRanks(rows, valueOf) {
  const ranks = new Map();
  const cohorts = new Map();
  for (const row of rows) {
    if (!row.hasProgress) continue;
    if (!cohorts.has(row.cohortKey)) cohorts.set(row.cohortKey, []);
    cohorts.get(row.cohortKey).push(row);
  }
  for (const members of cohorts.values()) {
    for (const row of members) ranks.set(row.id, 1 + members.filter((other) => valueOf(other) > valueOf(row)).length);
  }
  return ranks;
}

const mean = (values) => (values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : 0);

export async function previewPolicyImpact(config, now = new Date()) {
  await ensurePrepScoreStore();
  const [permissions, students] = await Promise.all([
    dashboardPermissions({}),
    User.find({ role: 'student', isActive: { $ne: false }, accessScope: { $ne: 'assessment_only' } })
      .select('_id name semester college role isActive accessScope').sort({ _id: 1 }).limit(IMPACT_LIMIT + 1).lean(),
  ]);
  const truncated = students.length > IMPACT_LIMIT;
  const sample = students.slice(0, IMPACT_LIMIT);
  const [{ scores: stored }, ...batches] = await Promise.all([
    storedScoresFor(sample.map((student) => student._id)),
    ...Array.from({ length: Math.ceil(sample.length / BATCH_SIZE) }, (unused, index) => computePrepScoreRows(sample.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE), permissions, { version: 0, config }, now)),
  ]);
  const proposed = new Map(batches.flat().map((row) => [String(row.studentId), row.score]));
  const rows = sample.map((student) => {
    const id = String(student._id);
    const next = proposed.get(id);
    return {
      id, name: student.name || 'Student', cohortKey: cohortKeyFor(student),
      before: stored.get(id)?.total ?? 0, after: next?.total ?? 0,
      hasProgress: Boolean(next?.hasProgress || stored.get(id)?.hasProgress),
    };
  });
  const beforeRanks = cohortRanks(rows, (row) => row.before);
  const afterRanks = cohortRanks(rows, (row) => row.after);
  const active = rows.filter((row) => row.hasProgress);
  return {
    studentsCompared: rows.length,
    truncated,
    withProgress: active.length,
    scoreChanged: active.filter((row) => row.before !== row.after).length,
    rankChanged: active.filter((row) => beforeRanks.get(row.id) !== afterRanks.get(row.id)).length,
    averageBefore: mean(active.map((row) => row.before)),
    averageAfter: mean(active.map((row) => row.after)),
    top: [...active].sort((left, right) => right.after - left.after || left.name.localeCompare(right.name)).slice(0, TOP).map((row) => ({
      name: row.name,
      before: { score: row.before, rank: beforeRanks.get(row.id) ?? null },
      after: { score: row.after, rank: afterRanks.get(row.id) ?? null },
    })),
  };
}
