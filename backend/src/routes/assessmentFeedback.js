import { Router } from 'express';
import {
  getStudentAssessmentFeedback,
  submitStudentAssessmentFeedback,
  listAssessmentFeedbackAssessments,
  listAssessmentFeedbackForAssessment,
} from '../controllers/assessmentFeedbackController.js';
import { requireAnyStudentFeature, requireAuth, requireCoordinatorPermission, requireStudent } from '../middleware/auth.js';
import { feedbackLimiter } from '../middleware/rateLimiter.js';

const router = Router();
// Prep Assessment or Prep Mock; the controller then checks the test itself (a mock needs Prep Mock).
const requireTestFeature = requireAnyStudentFeature('assessments', 'prep_mock');

router.get('/student/:assessmentId', requireAuth, requireStudent, requireTestFeature, getStudentAssessmentFeedback);
router.post('/student/:assessmentId', requireAuth, requireStudent, requireTestFeature, feedbackLimiter, submitStudentAssessmentFeedback);
router.get('/admin/assessments', requireAuth, requireCoordinatorPermission('coordinator.assessment.feedback'), listAssessmentFeedbackAssessments);
router.get('/admin/assessments/:assessmentId', requireAuth, requireCoordinatorPermission('coordinator.assessment.feedback'), listAssessmentFeedbackForAssessment);

export default router;
