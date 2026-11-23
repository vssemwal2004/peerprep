import { Router } from 'express';
import {
  getMyResume,
  getStudentResume,
  restorePreviousResume,
  saveMyResume,
} from '../controllers/resumeController.js';
import { requireAuth, requireCoordinatorPermission, requireStudent } from '../middleware/auth.js';
import resumeReviewRouter from '../modules/resumeReview/resumeReview.routes.js';
import resumeImportRouter from '../modules/resumeImport/resumeImport.routes.js';

const router = Router();

router.get('/me', requireAuth, requireStudent, getMyResume);
router.put('/me', requireAuth, requireStudent, saveMyResume);
router.post('/me/restore', requireAuth, requireStudent, restorePreviousResume);
router.use('/import', requireAuth, requireStudent, resumeImportRouter);
router.get('/student/:studentId', requireAuth, requireCoordinatorPermission('coordinator.students.profile'), getStudentResume);
// ANVI resume check: ATS read of the exported PDF + explanation.
router.use('/review', requireAuth, requireStudent, resumeReviewRouter);

export default router;
