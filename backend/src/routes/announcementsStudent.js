import { Router } from 'express';
import { requireAuth, requireStudent } from '../middleware/auth.js';
import { listAnnouncementsStudent } from '../controllers/announcementController.js';

const router = Router();

router.get('/', requireAuth, requireStudent, listAnnouncementsStudent);

export default router;
