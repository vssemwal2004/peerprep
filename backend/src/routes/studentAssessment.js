import { Router } from 'express';
import { requireAuth, requireStudent } from '../middleware/auth.js';
import { listStudentAssessments, getStudentAssessment, getStudentAssessmentDashboard, submitAssessment } from '../controllers/assessmentController.js';
import { getAssessmentRules } from '../controllers/assessmentRulesController.js';

const router = Router();

router.get('/assessments', requireAuth, requireStudent, listStudentAssessments);
router.get('/assessment-dashboard', requireAuth, requireStudent, getStudentAssessmentDashboard);
router.get('/assessment/rules', requireAuth, requireStudent, getAssessmentRules);
router.get('/assessment/:id', requireAuth, requireStudent, getStudentAssessment);
router.post('/assessment/submit', requireAuth, requireStudent, submitAssessment);

export default router;

