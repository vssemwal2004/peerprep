import { Router } from 'express';
import { requireAuth, requireAdmin, requireStudent, requireFullStudent } from '../middleware/auth.js';
import { claimAchievement, acknowledgeAchievement, engagementScope, refreshAdaptiveEngagement, acceptChallenge } from '../services/adaptiveEngagementService.js';
import { EngagementPolicy, EngagementReward, MissionAssignment, MonthlyProgressSnapshot } from '../models/AdaptiveEngagement.js';
import { engagementTenant, engagementPermissions, getEngagementPolicy, validatePolicy } from '../services/engagementPolicyService.js';
import { BADGES, LEVELS } from '../services/adaptiveEngagementRules.js';
import { HttpError } from '../utils/errors.js';
import { getCachedJson, setCachedJson, invalidateCacheNamespaces } from '../services/responseCacheService.js';
import { getRateLimitKey } from '../middleware/rateLimiter.js';
import rateLimit from 'express-rate-limit';
import { requireEngagementUniqueIndex } from '../utils/engagementIndexes.js';

const router = Router();
router.use(requireAuth, (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
const refreshLimit = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: true, legacyHeaders: false, keyGenerator: getRateLimitKey });
const cacheNamespace = (scope) => `adaptive-engagement:${scope.tenantKey}:${scope.studentId}`;
router.post('/refresh', requireStudent, requireFullStudent, refreshLimit, async (req, res) => {
  // Check current central allocations even when using the short shared cache.
  const permissions = await engagementPermissions(req.user);
  const scope = engagementScope(req.user);
  const policy = await getEngagementPolicy(scope.tenantKey, req.user.semester);
  const cacheKey = JSON.stringify([scope, req.user.semester, permissions, policy.revision]);
  const cached = await getCachedJson(cacheNamespace(scope), cacheKey);
  if (cached && new Date(cached.daily?.endsAt).getTime() > Date.now()) return res.json({ ...cached, newAwards: [] });
  const value = await refreshAdaptiveEngagement(req.user);
  await setCachedJson(cacheNamespace(scope), cacheKey, value, 2);
  res.json(value);
});
router.post('/challenges/:kind/accept', requireStudent, requireFullStudent, refreshLimit, async (req, res) => {
  const result = await acceptChallenge(req.user, req.params.kind, req.body?.periodKey);
  await invalidateCacheNamespaces(cacheNamespace(engagementScope(req.user)));
  res.json(result);
});
router.post('/achievements/claim', requireStudent, requireFullStudent, async (req, res) => res.json(await claimAchievement(req.user)));
router.post('/achievements/acknowledge', requireStudent, requireFullStudent, async (req, res) => {
  await acknowledgeAchievement(req.user, req.body?.ids); res.json({ acknowledged: true });
});
router.get('/history', requireStudent, requireFullStudent, async (req, res) => {
  const months = await MonthlyProgressSnapshot.find(engagementScope(req.user)).sort({ month: -1 }).limit(12).lean();
  res.json({ months });
});
router.get('/policy', requireAdmin, async (req, res) => {
  const tenantKey = engagementTenant(req.user, req.query.college);
  const [settings, permissions, overrides] = await Promise.all([
    getEngagementPolicy(tenantKey, req.query.semester), engagementPermissions(req.user), EngagementPolicy.find({ tenantKey }).select('cohort revision updatedAt updatedBy').lean(),
  ]);
  res.json({ settings, permissions, overrides, badges: BADGES, levels: LEVELS });
});
router.patch('/policy', requireAdmin, async (req, res) => {
  await requireEngagementUniqueIndex(EngagementPolicy, { tenantKey: 1, cohort: 1 });
  const tenantKey = engagementTenant(req.user, req.query.college);
  const cohort = req.body?.cohort || 'all';
  if (!/^(all|semester:([1-9]|1[0-6]))$/.test(cohort)) throw new HttpError(400, 'Invalid semester scope');
  const settings = validatePolicy(req.body?.settings || {});
  if (!Object.keys(settings).length) throw new HttpError(400, 'No policy changes supplied');
  const set = Object.fromEntries(Object.entries(settings).map(([key, value]) => [`settings.${key}`, value]));
  const result = await EngagementPolicy.findOneAndUpdate({ tenantKey, cohort }, {
    $set: { ...set, updatedBy: req.user._id }, $inc: { revision: 1 },
    $push: { history: { $each: [{ changedBy: req.user._id, at: new Date(), changes: settings }], $slice: -30 } },
  }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  res.json({ revision: result.revision, settings: await getEngagementPolicy(tenantKey, cohort.split(':')[1]) });
});
router.get('/analytics', requireAdmin, async (req, res) => {
  const tenantKey = engagementTenant(req.user, req.query.college), since = new Date(Date.now() - 30 * 86400000);
  const [missions, rewards] = await Promise.all([
    MissionAssignment.aggregate([{ $match: { tenantKey, assignedAt: { $gte: since } } }, { $group: { _id: '$kind', assigned: { $sum: 1 }, completed: { $sum: { $cond: [{ $ne: ['$earnedAt', null] }, 1, 0] } } } }]).option({ maxTimeMS: 8000 }),
    EngagementReward.aggregate([{ $match: { tenantKey, earnedAt: { $gte: since } } }, { $group: { _id: null, xp: { $sum: '$points' }, students: { $addToSet: '$studentId' } } }, { $project: { xp: 1, activeStudents: { $size: '$students' } } }]).option({ maxTimeMS: 8000 }),
  ]);
  res.json({ missions, xp: rewards[0]?.xp || 0, activeStudents: rewards[0]?.activeStudents || 0 });
});
export default router;
