import { Router } from 'express';
import {
  getStudentAssessmentFeedback,
  submitStudentAssessmentFeedback,
  listAssessmentFeedbackAssessments,
  listAssessmentFeedbackForAssessment,
} from '../controllers/assessmentFeedbackController.js';
import { requireAdmin, requireAuth, requireStudent } from '../middleware/auth.js';
import { feedbackLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/student/:assessmentId', requireAuth, requireStudent, getStudentAssessmentFeedback);
router.post('/student/:assessmentId', requireAuth, requireStudent, feedbackLimiter, submitStudentAssessmentFeedback);
router.get('/admin/assessments', requireAuth, requireAdmin, listAssessmentFeedbackAssessments);
router.get('/admin/assessments/:assessmentId', requireAuth, requireAdmin, listAssessmentFeedbackForAssessment);

export default router;
