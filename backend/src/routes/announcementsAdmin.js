import { Router } from 'express';
import { requireAuth, requireCoordinatorPermission } from '../middleware/auth.js';
import { createAnnouncement, listAnnouncementsAdmin, updateAnnouncement, deleteAnnouncement } from '../controllers/announcementController.js';

const router = Router();

router.post('/create', requireAuth, requireCoordinatorPermission('coordinator.announcements.create'), createAnnouncement);
router.get('/', requireAuth, requireCoordinatorPermission('coordinator.announcements.manage'), listAnnouncementsAdmin);
router.put('/:id', requireAuth, requireCoordinatorPermission('coordinator.announcements.manage'), updateAnnouncement);
router.delete('/:id', requireAuth, requireCoordinatorPermission('coordinator.announcements.manage'), deleteAnnouncement);

export default router;
