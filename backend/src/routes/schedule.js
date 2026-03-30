import { Router } from 'express';
import { proposeSlots, confirmSlot, rejectSlots } from '../controllers/scheduleController.js';
import { requireAuth } from '../middleware/auth.js';
import { authorizePairAccess } from '../middleware/authorization.js';

const router = Router();

// SECURITY: Add IDOR protection - users can only modify pairs they're part of
router.post('/:pairId/propose', requireAuth, authorizePairAccess('pairId'), proposeSlots);
router.post('/:pairId/confirm', requireAuth, authorizePairAccess('pairId'), confirmSlot);
router.post('/:pairId/reject', requireAuth, authorizePairAccess('pairId'), rejectSlots);

export default router;
