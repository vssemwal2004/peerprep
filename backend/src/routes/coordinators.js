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

const router = Router();

router.get('/list', requireAuth, requireAdmin, listAllCoordinators);
router.post('/create', requireAuth, requireAdmin, createCoordinator);
router.post('/bulk-create', requireAuth, requireAdmin, bulkOperationLimiter, bulkCreateCoordinators);
router.post('/resend-credentials', requireAuth, requireAdmin, bulkOperationLimiter, resendCoordinatorCredentials);
router.get('/:coordinatorId/access', requireAuth, requireAdmin, getCoordinatorAccess);
router.put('/:coordinatorId/access', requireAuth, requireAdmin, updateCoordinatorAccess);
router.patch('/:coordinatorId/status', requireAuth, requireAdmin, updateCoordinatorStatus);
router.put('/:coordinatorId', requireAuth, requireAdmin, updateCoordinator);
router.delete('/:coordinatorId', requireAuth, requireAdmin, deleteCoordinator);

export default router;
