import { Router } from 'express';
import { 
  submitJoinRequest, 
  checkJoinRequestStatus, 
  listJoinRequests, 
  approveJoinRequest, 
  rejectJoinRequest 
} from '../controllers/joinController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Public routes (no auth required)
router.post('/submit', submitJoinRequest);
router.get('/status', checkJoinRequestStatus);

// Admin-only routes
router.get('/list', requireAuth, requireAdmin, listJoinRequests);
router.post('/:requestId/approve', requireAuth, requireAdmin, approveJoinRequest);
router.post('/:requestId/reject', requireAuth, requireAdmin, rejectJoinRequest);

export default router;
