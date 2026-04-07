import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { createAnnouncement, listAnnouncementsAdmin, updateAnnouncement, deleteAnnouncement } from '../controllers/announcementController.js';

const router = Router();

router.post('/create', requireAuth, requireAdmin, createAnnouncement);
router.get('/', requireAuth, requireAdmin, listAnnouncementsAdmin);
router.put('/:id', requireAuth, requireAdmin, updateAnnouncement);
router.delete('/:id', requireAuth, requireAdmin, deleteAnnouncement);

export default router;
