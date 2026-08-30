import { Router } from 'express';
import {
  getMyResume,
  getStudentResume,
  restorePreviousResume,
  saveMyResume,
} from '../controllers/resumeController.js';
import { requireAuth, requireCoordinatorPermission, requireStudent } from '../middleware/auth.js';

const router = Router();

router.get('/me', requireAuth, requireStudent, getMyResume);
router.put('/me', requireAuth, requireStudent, saveMyResume);
router.post('/me/restore', requireAuth, requireStudent, restorePreviousResume);
router.get('/student/:studentId', requireAuth, requireCoordinatorPermission('coordinator.students.profile'), getStudentResume);

export default router;
