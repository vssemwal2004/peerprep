import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listNotifications, markNotificationRead, markAllRead, clearAllNotifications } from '../controllers/notificationController.js';

const router = Router();

router.get('/', requireAuth, listNotifications);
router.patch('/:id/read', requireAuth, markNotificationRead);
router.patch('/read-all', requireAuth, markAllRead);
router.delete('/clear-all', requireAuth, clearAllNotifications);

export default router;
