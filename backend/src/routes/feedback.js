import { Router } from 'express';
import { submitFeedback, exportEventFeedback, listFeedback, exportFilteredFeedback, listMyFeedback, listFeedbackForMe, listCoordinatorFeedback, exportCoordinatorFeedback } from '../controllers/feedbackController.js';
import { requireAuth, requireAdmin, requireCoordinator } from '../middleware/auth.js';
import { feedbackLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// SECURITY: Rate limit feedback submissions to prevent spam
router.post('/submit', requireAuth, feedbackLimiter, submitFeedback);
router.get('/event/:id.csv', requireAuth, requireAdmin, exportEventFeedback);
router.get('/admin/list', requireAuth, requireAdmin, listFeedback);
router.get('/admin/export.csv', requireAuth, requireAdmin, exportFilteredFeedback);
router.get('/coordinator/list', requireAuth, requireCoordinator, listCoordinatorFeedback);
router.get('/coordinator/export.csv', requireAuth, requireCoordinator, exportCoordinatorFeedback);
router.get('/mine', requireAuth, listMyFeedback);
router.get('/for-me', requireAuth, listFeedbackForMe);

export default router;
