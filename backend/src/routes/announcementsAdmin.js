import { Router } from 'express';
import { requireAuth, requireCoordinatorPermission } from '../middleware/auth.js';
import { studentMailLimiter } from '../middleware/rateLimiter.js';
import {
  acceptAnnouncementImage, createAnnouncement, deleteAnnouncement, listAnnouncementsAdmin, updateAnnouncement, uploadAnnouncementImageHandler,
} from '../controllers/announcementController.js';
import {
  listAnnouncementMailTemplates, previewAnnouncementMail, sendAnnouncementMail, sendAnnouncementTestMail,
} from '../services/announcementEmail.js';

const router = Router();
const canCreate = requireCoordinatorPermission('coordinator.announcements.create');
// Emailing students also needs permission to see them (the selector lists them).
const canEmailStudents = requireCoordinatorPermission('coordinator.students.view');
const mailInput = (req) => ({ user: req.user, templateId: req.body?.templateId, draft: req.body?.draft, announcement: req.body?.announcement, studentId: req.body?.studentId });

router.post('/create', requireAuth, canCreate, createAnnouncement);
router.post('/image', requireAuth, canCreate, acceptAnnouncementImage, uploadAnnouncementImageHandler);

// "Also send as email": templates, preview, test to me, send to chosen students (mail queue).
router.get('/email/templates', requireAuth, canCreate, async (req, res) => res.json(await listAnnouncementMailTemplates()));
router.post('/email/preview', requireAuth, canCreate, async (req, res) => res.json(await previewAnnouncementMail(mailInput(req))));
router.post('/email/test', requireAuth, canCreate, studentMailLimiter, async (req, res) => res.status(202).json(await sendAnnouncementTestMail(mailInput(req))));
router.post('/email/send', requireAuth, canCreate, canEmailStudents, studentMailLimiter, async (req, res) => res.status(202).json(await sendAnnouncementMail({
  ...mailInput(req), announcementId: req.body?.announcementId, studentIds: req.body?.studentIds,
})));

router.get('/', requireAuth, requireCoordinatorPermission('coordinator.announcements.manage'), listAnnouncementsAdmin);
router.put('/:id', requireAuth, requireCoordinatorPermission('coordinator.announcements.manage'), updateAnnouncement);
router.delete('/:id', requireAuth, requireCoordinatorPermission('coordinator.announcements.manage'), deleteAnnouncement);

export default router;
