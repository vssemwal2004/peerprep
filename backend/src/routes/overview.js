import { Router } from 'express';
import { requireAuth, requireCoordinatorPermission } from '../middleware/auth.js';
import { buildOverview, overviewRange } from '../services/overviewInsights.js';

const router = Router();

// Admin and coordinator overview: counts and trends already limited to the viewer's modules and scope.
// ?range=7d|30d|90d|180d|365d or ?range=custom&from&to sets the period (default: last 14 days).
router.get('/', requireAuth, requireCoordinatorPermission('coordinator.dashboard.overview'), async (req, res, next) => {
  try {
    const now = new Date();
    res.set('Cache-Control', 'private, no-store').json(await buildOverview(req.user, now, overviewRange(req.query, now)));
  } catch (error) { next(error); }
});

export default router;
