import { Router } from 'express';
import { requireAuth, requireStudent } from '../middleware/auth.js';
import { beginStudentAssessment, listStudentAssessments, getStudentAssessment, getStudentAssessmentDashboard, logStudentViolation, markStudentAssessmentSetupStep, startStudentAssessment, submitAssessment } from '../controllers/assessmentController.js';
import { getAssessmentRules } from '../controllers/assessmentRulesController.js';

const router = Router();

router.get('/assessments', requireAuth, requireStudent, listStudentAssessments);
router.get('/assessment-dashboard', requireAuth, requireStudent, getStudentAssessmentDashboard);
router.get('/assessment/rules', requireAuth, requireStudent, getAssessmentRules);
router.post('/assessment/:id/start', requireAuth, requireStudent, startStudentAssessment);
router.post('/assessment/:id/setup-step', requireAuth, requireStudent, markStudentAssessmentSetupStep);
router.post('/assessment/:id/begin', requireAuth, requireStudent, beginStudentAssessment);
router.post('/assessment/:id/violations', requireAuth, requireStudent, logStudentViolation);
router.get('/assessment/:id', requireAuth, requireStudent, getStudentAssessment);
router.post('/assessment/submit', requireAuth, requireStudent, submitAssessment);

export default router;

