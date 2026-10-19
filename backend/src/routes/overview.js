import { Router } from 'express';
import { requireAuth, requireCoordinatorPermission } from '../middleware/auth.js';
import { buildOverview } from '../services/overviewInsights.js';

const router = Router();

// Admin and coordinator overview: counts and trends already limited to the viewer's modules and scope.
router.get('/', requireAuth, requireCoordinatorPermission('coordinator.dashboard.overview'), async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store').json(await buildOverview(req.user));
  } catch (error) { next(error); }
});

export default router;
