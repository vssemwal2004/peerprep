import { Router } from 'express';
import { requireAuth, requireStudent, requireStudentFeature } from '../middleware/auth.js';
import { assessmentAdmission } from '../middleware/assessmentAdmission.js';
import { beginStudentAssessment, listStudentAssessments, getStudentAssessment, getStudentAssessmentDashboard, logStudentHeartbeat, logStudentMonitoring, logStudentViolation, markStudentAssessmentSetupStep, saveAssessmentProgress, startStudentAssessment, submitAssessment, createStudentEvidenceUpload } from '../controllers/assessmentController.js';

const router = Router();
const requireAssessments = requireStudentFeature('assessments');

router.get('/assessments', requireAuth, requireStudent, requireAssessments, listStudentAssessments);
router.get('/assessment-dashboard', requireAuth, requireStudent, requireAssessments, getStudentAssessmentDashboard);
router.post('/assessment/:id/start', assessmentAdmission([requireAuth, requireStudent, requireAssessments, startStudentAssessment]));
router.post('/assessment/:id/setup-step', assessmentAdmission([requireAuth, requireStudent, requireAssessments, markStudentAssessmentSetupStep]));
router.post('/assessment/:id/begin', assessmentAdmission([requireAuth, requireStudent, requireAssessments, beginStudentAssessment]));
router.patch('/assessment/:id/answers', assessmentAdmission([requireAuth, requireStudent, requireAssessments, saveAssessmentProgress]));
router.post('/assessment/:id/violations', assessmentAdmission([requireAuth, requireStudent, requireAssessments, logStudentViolation]));
router.post('/assessment/:id/heartbeat', assessmentAdmission([requireAuth, requireStudent, requireAssessments, logStudentHeartbeat]));
router.post('/assessment/:id/monitoring', assessmentAdmission([requireAuth, requireStudent, requireAssessments, logStudentMonitoring]));
router.post('/assessment/:id/evidence/upload-url', assessmentAdmission([requireAuth, requireStudent, requireAssessments, createStudentEvidenceUpload]));
router.get('/assessment/:id', assessmentAdmission([requireAuth, requireStudent, requireAssessments, getStudentAssessment]));
router.post('/assessment/submit', assessmentAdmission([requireAuth, requireStudent, requireAssessments, submitAssessment], { group: 'final' }));

export default router;

