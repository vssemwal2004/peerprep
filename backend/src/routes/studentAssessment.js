import { Router } from 'express';
import { requireAuth, requireStudent } from '../middleware/auth.js';
import { assessmentAdmission } from '../middleware/assessmentAdmission.js';
import { beginStudentAssessment, listStudentAssessments, getStudentAssessment, getStudentAssessmentDashboard, logStudentHeartbeat, logStudentMonitoring, logStudentViolation, markStudentAssessmentSetupStep, saveAssessmentProgress, startStudentAssessment, submitAssessment, createStudentEvidenceUpload } from '../controllers/assessmentController.js';

const router = Router();

router.get('/assessments', requireAuth, requireStudent, listStudentAssessments);
router.get('/assessment-dashboard', requireAuth, requireStudent, getStudentAssessmentDashboard);
router.post('/assessment/:id/start', assessmentAdmission([requireAuth, requireStudent, startStudentAssessment]));
router.post('/assessment/:id/setup-step', assessmentAdmission([requireAuth, requireStudent, markStudentAssessmentSetupStep]));
router.post('/assessment/:id/begin', assessmentAdmission([requireAuth, requireStudent, beginStudentAssessment]));
router.patch('/assessment/:id/answers', assessmentAdmission([requireAuth, requireStudent, saveAssessmentProgress]));
router.post('/assessment/:id/violations', assessmentAdmission([requireAuth, requireStudent, logStudentViolation]));
router.post('/assessment/:id/heartbeat', assessmentAdmission([requireAuth, requireStudent, logStudentHeartbeat]));
router.post('/assessment/:id/monitoring', assessmentAdmission([requireAuth, requireStudent, logStudentMonitoring]));
router.post('/assessment/:id/evidence/upload-url', assessmentAdmission([requireAuth, requireStudent, createStudentEvidenceUpload]));
router.get('/assessment/:id', assessmentAdmission([requireAuth, requireStudent, getStudentAssessment]));
router.post('/assessment/submit', assessmentAdmission([requireAuth, requireStudent, submitAssessment], { group: 'final' }));

export default router;

