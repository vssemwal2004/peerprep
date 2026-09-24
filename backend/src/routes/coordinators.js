import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import {
  createCoordinator,
  bulkCreateCoordinators,
  getCoordinatorAccess,
  listAllCoordinators,
  updateCoordinator,
  updateCoordinatorAccess,
  updateCoordinatorStatus,
  deleteCoordinator,
  resendCoordinatorCredentials,
} from '../controllers/coordinatorController.js';
import { bulkOperationLimiter } from '../middleware/rateLimiter.js';
import { cacheJsonResponse, invalidateResponseCache } from '../middleware/responseCache.js';

const router = Router();

router.get('/list', requireAuth, requireAdmin, cacheJsonResponse({ namespace: 'coordinators', ttlSeconds: Number(process.env.RESPONSE_CACHE_COORDINATORS_TTL_SECONDS || 30) }), listAllCoordinators);
router.post('/create', requireAuth, requireAdmin, invalidateResponseCache('coordinators'), createCoordinator);
router.post('/bulk-create', requireAuth, requireAdmin, bulkOperationLimiter, invalidateResponseCache('coordinators'), bulkCreateCoordinators);
router.post('/resend-credentials', requireAuth, requireAdmin, bulkOperationLimiter, resendCoordinatorCredentials);
router.get('/:coordinatorId/access', requireAuth, requireAdmin, getCoordinatorAccess);
router.put('/:coordinatorId/access', requireAuth, requireAdmin, invalidateResponseCache('coordinators'), updateCoordinatorAccess);
router.patch('/:coordinatorId/status', requireAuth, requireAdmin, invalidateResponseCache('coordinators'), updateCoordinatorStatus);
router.put('/:coordinatorId', requireAuth, requireAdmin, invalidateResponseCache('coordinators'), updateCoordinator);
router.delete('/:coordinatorId', requireAuth, requireAdmin, invalidateResponseCache('coordinators'), deleteCoordinator);

export default router;
