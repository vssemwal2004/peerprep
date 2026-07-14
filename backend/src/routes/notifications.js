import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listNotifications, markNotificationRead, markAllRead, clearAllNotifications } from '../controllers/notificationController.js';

const router = Router();

router.get('/', requireAuth, listNotifications);
router.patch('/read-all', requireAuth, markAllRead);
router.delete('/clear-all', requireAuth, clearAllNotifications);
router.patch('/:id/read', requireAuth, markNotificationRead);

export default router;
