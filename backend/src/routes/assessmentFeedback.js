import { Router } from 'express';
import {
  getStudentAssessmentFeedback,
  submitStudentAssessmentFeedback,
  listAssessmentFeedbackAssessments,
  listAssessmentFeedbackForAssessment,
} from '../controllers/assessmentFeedbackController.js';
import { requireAuth, requireCoordinatorPermission, requireStudent, requireStudentFeature } from '../middleware/auth.js';
import { feedbackLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/student/:assessmentId', requireAuth, requireStudent, requireStudentFeature('assessments'), getStudentAssessmentFeedback);
router.post('/student/:assessmentId', requireAuth, requireStudent, requireStudentFeature('assessments'), feedbackLimiter, submitStudentAssessmentFeedback);
router.get('/admin/assessments', requireAuth, requireCoordinatorPermission('coordinator.assessment.feedback'), listAssessmentFeedbackAssessments);
router.get('/admin/assessments/:assessmentId', requireAuth, requireCoordinatorPermission('coordinator.assessment.feedback'), listAssessmentFeedbackForAssessment);

export default router;
