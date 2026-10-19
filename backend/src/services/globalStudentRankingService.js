import { isUniversity } from '../platform/deployment.js';
import { controlRequest, universityPolicy } from '../platform/client.js';
import { GLOBAL_RANK_VERSION, rankingPolicyKey, snapshotScore } from '../platform/globalRanking.js';
import { currentTenant } from '../platform/tenantContext.js';
import { ensurePrepScoreStore, servingPolicy, servingRows } from './prepScore/sync.js';

const SYNC_INTERVAL = 5 * 60_000;
const snapshots = new Map();
const pendings = new Map();
const scope = () => currentTenant()?.universityId || process.env.PEERPREP_UNIVERSITY_ID || 'standalone';

export async function syncUniversityGlobalRanking() {
  if (!isUniversity()) return null;
  const tenantKey = scope();
  if (pendings.has(tenantKey)) return pendings.get(tenantKey);
  const cached = snapshots.get(tenantKey);
  if (cached && Date.now() - cached.at < SYNC_INTERVAL) return cached;
  const pending = (async () => {
    const generatedAt = new Date();
    const [policy, state] = await Promise.all([universityPolicy(), ensurePrepScoreStore()]);
    if (policy.active !== true) throw new Error('University is inactive');
    const [scorePolicy, rows] = await Promise.all([servingPolicy(state), servingRows(state)]);
    const scores = new Map(), counts = new Map();
    for (const row of rows) {
      const exact = Number(row.total || 0);
      const score = snapshotScore(exact, row.hasProgress, scorePolicy.config.formula.decimalPlaces);
      scores.set(String(row.studentId), { score, exact, hasProgress: row.hasProgress });
      counts.set(score, (counts.get(score) || 0) + 1);
    }
    await controlRequest('rankings/snapshot', { method: 'POST', body: {
      version: GLOBAL_RANK_VERSION, scorePolicyVersion: scorePolicy.version, generatedAt: generatedAt.toISOString(), policyKey: rankingPolicyKey(policy, scorePolicy.version),
      buckets: [...counts].map(([score, count]) => ({ score, count })),
    } });
    const snapshot = { at: Date.now(), generatedAt: generatedAt.toISOString(), scores };
    snapshots.set(tenantKey, snapshot);
    return snapshot;
  })().finally(() => { pendings.delete(tenantKey); });
  pendings.set(tenantKey, pending);
  return pending;
}

export async function getStudentGlobalRanking(student) {
  if (!isUniversity()) return { status: 'not_connected', rank: null };
  try {
    const current = await syncUniversityGlobalRanking();
    const own = current.scores.get(String(student._id));
    if (!own) return { status: 'syncing', rank: null };
    const result = await controlRequest(`rankings/self?score=${own.score}&generatedAt=${encodeURIComponent(current.generatedAt)}`);
    if (result.status === 'syncing') snapshots.delete(scope());
    const shown = Number.isFinite(Number(result.score)) ? { ...result, score: own.exact } : result;
    if (!own.hasProgress && result.status === 'ready') return { ...shown, status: 'unranked', rank: null, tied: false };
    return shown;
  } catch {
    // A central outage must never erase or block the independent university rank.
    return { status: 'unavailable', rank: null };
  }
}
