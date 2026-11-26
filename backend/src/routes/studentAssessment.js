import { Router } from 'express';
import { requireAnyStudentFeature, requireAuth, requireStudent, requireStudentFeature } from '../middleware/auth.js';
import { assessmentAdmission } from '../middleware/assessmentAdmission.js';
import Assessment from '../models/Assessment.js';
import mongoose from 'mongoose';
import { isUniversity } from '../platform/deployment.js';
import { beginStudentAssessment, listStudentAssessments, getStudentAssessment, getStudentAssessmentDashboard, logStudentHeartbeat, logStudentMonitoring, logStudentViolation, markStudentAssessmentSetupStep, saveAssessmentProgress, startStudentAssessment, submitAssessment, createStudentEvidenceUpload } from '../controllers/assessmentController.js';

const router = Router();
const requireAssessmentList = requireStudentFeature('assessments');
// Taking a test: Prep Assessment or Prep Mock. The controller then checks the test itself
// (assertStudentFeatureForAssessment): a company mock needs Prep Mock, any other test Prep Assessment.
const requireAssessments = requireAnyStudentFeature('assessments', 'prep_mock');
router.use('/assessment/:id', async (req, res, next) => {
  if (!isUniversity()) return next();
  const id = req.params.id === 'submit' ? req.body?.assessmentId : req.params.id;
  if (!mongoose.isValidObjectId(id)) return next();
  try {
    const assessment = await Assessment.findById(id).select('kind').lean();
    if (assessment?.kind === 'mock') return res.status(404).json({ error: 'Mock not found' });
    return next();
  } catch (error) { return next(error); }
});

router.get('/assessments', requireAuth, requireStudent, requireAssessmentList, listStudentAssessments);
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

