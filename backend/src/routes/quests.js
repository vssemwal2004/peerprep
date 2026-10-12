import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAdmin, requireAuth, requireFullStudent, requireStudent } from '../middleware/auth.js';
import { getRateLimitKey } from '../middleware/rateLimiter.js';
import {
  createQuest, getAdminQuest, getStudentQuest, listAdminQuests, listStudentQuests, recordQuestView,
  removeQuest, searchQuestLibrary, startQuest, updateQuest,
} from '../services/questService.js';
import { invalidateCacheNamespaces } from '../services/responseCacheService.js';
import { engagementScope } from '../services/adaptiveEngagementService.js';

const router = Router();
router.use(requireAuth, (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
const writeLimit = rateLimit({ windowMs: 60000, limit: 60, standardHeaders: true, legacyHeaders: false, keyGenerator: getRateLimitKey });
// A completed quest changes XP and badges, so the student's cached progress snapshot is dropped.
const refreshEngagement = (req) => invalidateCacheNamespaces(`adaptive-engagement:${engagementScope(req.user).tenantKey}:${engagementScope(req.user).studentId}`).catch(() => {});

// Admin routes come first so "/admin" is never read as a quest slug.
router.get('/admin/library', requireAdmin, async (req, res) => res.json(await searchQuestLibrary(req.query)));
router.get('/admin', requireAdmin, async (req, res) => res.json({ quests: await listAdminQuests(req.user, req.query.college) }));
router.post('/admin', requireAdmin, writeLimit, async (req, res) => res.status(201).json({ quest: await createQuest(req.user, req.query.college, req.body || {}) }));
router.get('/admin/:id', requireAdmin, async (req, res) => res.json({ quest: await getAdminQuest(req.user, req.query.college, req.params.id) }));
router.patch('/admin/:id', requireAdmin, writeLimit, async (req, res) => res.json({ quest: await updateQuest(req.user, req.query.college, req.params.id, req.body || {}) }));
router.delete('/admin/:id', requireAdmin, writeLimit, async (req, res) => res.json(await removeQuest(req.user, req.query.college, req.params.id)));

router.get('/', requireStudent, requireFullStudent, async (req, res) => res.json(await listStudentQuests(req.user)));
router.get('/:slug', requireStudent, requireFullStudent, async (req, res) => {
  const result = await getStudentQuest(req.user, req.params.slug);
  if (result.quest.completedAt) await refreshEngagement(req);
  res.json(result);
});
router.post('/:slug/start', requireStudent, requireFullStudent, writeLimit, async (req, res) => {
  const result = await startQuest(req.user, req.params.slug);
  await refreshEngagement(req);
  res.json(result);
});
router.post('/:slug/view', requireStudent, requireFullStudent, writeLimit, async (req, res) => res.json(await recordQuestView(req.user, req.params.slug, req.body?.problemKey)));

export default router;
