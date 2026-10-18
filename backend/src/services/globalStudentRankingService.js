import { isUniversity } from '../platform/deployment.js';
import { controlRequest, universityPolicy } from '../platform/client.js';
import { GLOBAL_RANK_VERSION, rankingPolicyKey } from '../platform/globalRanking.js';
import { getUniversityRankSnapshotRows } from './studentDashboardService.js';

const SYNC_INTERVAL = 5 * 60_000;
let snapshot = null, pending = null;

export async function syncUniversityGlobalRanking() {
  if (!isUniversity()) return null;
  if (pending) return pending;
  if (snapshot && Date.now() - snapshot.at < SYNC_INTERVAL) return snapshot;
  pending = (async () => {
    const generatedAt = new Date();
    const policy = await universityPolicy();
    if (policy.active !== true) throw new Error('University is inactive');
    const rows = await getUniversityRankSnapshotRows(policy.permissions || {}, generatedAt);
    const scores = new Map(), counts = new Map();
    for (const row of rows) {
      // Snapshots carry whole Prep Score points (484.4 -> 484), which keeps the bucket count small for any cohort size.
      // Anyone with progress is at least 1, so they never share the 0 bucket with students who have not started.
      const exact = Number(row.rankingSummary.score || 0);
      const { hasProgress } = row.rankingSummary;
      const score = hasProgress ? Math.max(1, Math.round(exact)) : 0;
      scores.set(String(row.studentId), { score, exact, hasProgress });
      counts.set(score, (counts.get(score) || 0) + 1);
    }
    await controlRequest('rankings/snapshot', { method: 'POST', body: {
      version: GLOBAL_RANK_VERSION, generatedAt: generatedAt.toISOString(), policyKey: rankingPolicyKey(policy),
      buckets: [...counts].map(([score, count]) => ({ score, count })),
    } });
    snapshot = { at: Date.now(), generatedAt: generatedAt.toISOString(), scores };
    return snapshot;
  })().finally(() => { pending = null; });
  return pending;
}

export async function getStudentGlobalRanking(student) {
  if (!isUniversity()) return { status: 'not_connected', rank: null };
  try {
    const current = await syncUniversityGlobalRanking();
    const own = current.scores.get(String(student._id));
    if (!own) return { status: 'syncing', rank: null };
    const result = await controlRequest(`rankings/self?score=${own.score}&generatedAt=${encodeURIComponent(current.generatedAt)}`);
    if (result.status === 'syncing') snapshot = null;
    const shown = Number.isFinite(Number(result.score)) ? { ...result, score: own.exact } : result;
    if (!own.hasProgress && result.status === 'ready') return { ...shown, status: 'unranked', rank: null, tied: false };
    return shown;
  } catch {
    // A central outage must never erase or block the independent university rank.
    return { status: 'unavailable', rank: null };
  }
}
