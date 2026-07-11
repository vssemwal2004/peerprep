import { Router } from 'express';
import { requireAuth, requireCoordinatorPermission } from '../middleware/auth.js';
import {
  createAssessment,
  listAssessments,
  getAssessment,
  updateAssessment,
  deleteAssessment,
  resetAssessmentSubmissions,
  markAssessmentComplete,
  releaseAssessmentAnswers,
  getAssessmentReports,
  getStudentAssessmentReport,
  getAssessmentReportsExportData,
  exportAssessmentReports,
  getSubmissionViolations,
} from '../controllers/assessmentController.js';
import {
  getLibraryQuestion,
  listLibraryQuestions,
  resolveLibraryQuestions,
  createLibraryQuestion,
  createLibraryQuestionsBulk,
  updateLibraryQuestion,
  deleteLibraryQuestion,
} from '../controllers/questionLibraryController.js';

const router = Router();

router.post('/assessment/create', requireAuth, requireCoordinatorPermission('coordinator.assessment.create'), createAssessment);
router.get('/assessment/list', requireAuth, requireCoordinatorPermission('coordinator.assessment.view'), listAssessments);
router.get('/assessment/reports', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), getAssessmentReports);
router.get('/assessment/reports/submissions/:submissionId', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), getStudentAssessmentReport);
router.get('/assessment/reports/export-data', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), getAssessmentReportsExportData);
router.get('/assessment/reports/export', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), exportAssessmentReports);
router.get('/assessment/submissions/:submissionId/violations', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), getSubmissionViolations);
router.get('/library/questions', requireAuth, requireCoordinatorPermission('coordinator.library.view'), listLibraryQuestions);
router.post('/library/questions', requireAuth, requireCoordinatorPermission('coordinator.library.create'), createLibraryQuestion);
router.post('/library/questions/bulk', requireAuth, requireCoordinatorPermission('coordinator.library.create'), createLibraryQuestionsBulk);
router.post('/library/questions/resolve', requireAuth, requireCoordinatorPermission('coordinator.library.create'), resolveLibraryQuestions);
router.get('/library/questions/:id', requireAuth, requireCoordinatorPermission('coordinator.library.view'), getLibraryQuestion);
router.patch('/library/questions/:id', requireAuth, requireCoordinatorPermission('coordinator.library.create'), updateLibraryQuestion);
router.delete('/library/questions/:id', requireAuth, requireCoordinatorPermission('coordinator.library.create'), deleteLibraryQuestion);
router.get('/assessment/:id', requireAuth, requireCoordinatorPermission('coordinator.assessment.view'), getAssessment);
router.post('/assessment/:id/reset-submissions', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), resetAssessmentSubmissions);
router.post('/assessment/:id/mark-complete', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), markAssessmentComplete);
router.post('/assessment/:id/release-answers', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), releaseAssessmentAnswers);
router.put('/assessment/:id', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), updateAssessment);
router.delete('/assessment/:id', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), deleteAssessment);

export default router;
