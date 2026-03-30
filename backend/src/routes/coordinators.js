import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { createCoordinator, listAllCoordinators, updateCoordinator, deleteCoordinator } from '../controllers/coordinatorController.js';

const router = Router();

router.get('/list', requireAuth, requireAdmin, listAllCoordinators);
router.post('/create', requireAuth, requireAdmin, createCoordinator);
router.put('/:coordinatorId', requireAuth, requireAdmin, updateCoordinator);
router.delete('/:coordinatorId', requireAuth, requireAdmin, deleteCoordinator);

export default router;
