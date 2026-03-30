import { Router } from 'express';
import { listPairs, setMeetingLink, getPairDetails } from '../controllers/pairingController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { authorizePairAccess, authorizeEventParticipant } from '../middleware/authorization.js';

const router = Router();

// SECURITY: Add IDOR protection - users can only access pairs they're part of
router.get('/pair/:pairId', requireAuth, authorizePairAccess('pairId'), getPairDetails);
router.post('/pair/:pairId/link', requireAuth, requireAdmin, setMeetingLink);
// SECURITY: Event ID validation for listing pairs
router.get('/:id', requireAuth, authorizeEventParticipant('id'), listPairs);

export default router;
