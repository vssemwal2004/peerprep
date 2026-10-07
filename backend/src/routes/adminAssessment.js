import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireAdmin, requireCoordinatorPermission } from '../middleware/auth.js';
import { isUniversity } from '../platform/deployment.js';
import { universityPolicy } from '../platform/client.js';
import { bulkOperationLimiter, uploadLimiter } from '../middleware/rateLimiter.js';
import { cacheJsonResponse, invalidateResponseCache } from '../middleware/responseCache.js';
import {
  createAssessment,
  previewAssessmentStudents,
  listAssessments,
  getAssessment,
  updateAssessment,
  deleteAssessment,
  resetAssessmentSubmissions,
  listAssessmentEligibleStudents,
  addAssessmentEligibleStudents,
  resetAssessmentStudentSubmission,
  removeAssessmentEligibleStudent,
  updateAssessmentStudentSet,
  updateAssessmentStudentSets,
  removeAssessmentEligibleStudents,
  markAssessmentComplete,
  releaseAssessmentAnswers,
  sendAssessmentInvitations,
  getAssessmentInvitationEditor,
  previewAssessmentInvitation,
  updateAssessmentInvitation,
  sendAssessmentInvitationTest,
  sendAssessmentTestEmail,
  getAssessmentReports,
  getStudentAssessmentReport,
  getAssessmentReportsExportData,
  exportAssessmentReports,
  getSubmissionViolations,
  getAssessmentEvidence,
} from '../controllers/assessmentController.js';
import {
  getLibraryQuestion,
  listLibraryQuestions,
  resolveLibraryQuestions,
  createLibraryQuestion,
  createLibraryQuestionsBulk,
  updateLibraryQuestion,
  deleteLibraryQuestion,
  uploadLibraryAsset,
} from '../controllers/questionLibraryController.js';
import {
  archiveCodingTopic,
  assignCodingTopicsBulk,
  createCodingTopic,
  createCodingTag,
  listCodingTags,
  listCodingTopics,
  updateCodingTopic,
} from '../controllers/codingTopicController.js';

const router = Router();
router.use('/library/questions', async (req, res, next) => {
  if (!isUniversity()) return next();
  try {
    const policy = await universityPolicy();
    if (!policy.permissions?.questions) return res.status(403).json({ error: 'Question library is disabled' });
    next();
  } catch (error) { next(error); }
});
const questionAssetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

router.post('/assessment/students/preview', requireAuth, requireCoordinatorPermission('coordinator.assessment.create'), previewAssessmentStudents);
router.post('/assessment/create', requireAuth, requireCoordinatorPermission('coordinator.assessment.create'), invalidateResponseCache('assessments'), createAssessment);
router.post('/assessment/test-email', requireAuth, requireCoordinatorPermission('coordinator.assessment.create'), sendAssessmentTestEmail);
router.get('/assessment/list', requireAuth, requireCoordinatorPermission('coordinator.assessment.view'), cacheJsonResponse({ namespace: 'assessments', ttlSeconds: Number(process.env.RESPONSE_CACHE_ASSESSMENTS_TTL_SECONDS || 30) }), listAssessments);
router.get('/assessment/reports', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), cacheJsonResponse({ namespace: 'assessments', ttlSeconds: Number(process.env.RESPONSE_CACHE_ASSESSMENT_REPORTS_TTL_SECONDS || 15) }), getAssessmentReports);
router.get('/assessment/reports/submissions/:submissionId', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), getStudentAssessmentReport);
router.get('/assessment/reports/export-data', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), getAssessmentReportsExportData);
router.get('/assessment/reports/export', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), exportAssessmentReports);
router.get('/assessment/submissions/:submissionId/violations', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), getSubmissionViolations);
router.get('/assessment/evidence/:eventId', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), getAssessmentEvidence);
router.get('/library/questions', requireAuth, requireCoordinatorPermission('coordinator.library.view'), listLibraryQuestions);
router.get('/library/coding-topics', requireAuth, requireCoordinatorPermission('coordinator.library.view'), listCodingTopics);
router.post('/library/coding-topics', requireAuth, requireAdmin, createCodingTopic);
router.get('/library/coding-tags', requireAuth, requireCoordinatorPermission('coordinator.library.view'), listCodingTags);
router.post('/library/coding-tags', requireAuth, requireAdmin, createCodingTag);
router.patch('/library/coding-topics/:id', requireAuth, requireAdmin, updateCodingTopic);
router.delete('/library/coding-topics/:id', requireAuth, requireAdmin, archiveCodingTopic);
router.post('/library/questions/topics/bulk', requireAuth, requireAdmin, assignCodingTopicsBulk);
router.post('/library/questions', requireAuth, requireCoordinatorPermission('coordinator.library.create'), createLibraryQuestion);
router.post('/library/questions/bulk', requireAuth, requireCoordinatorPermission('coordinator.library.create'), createLibraryQuestionsBulk);
router.post('/library/assets', requireAuth, requireCoordinatorPermission('coordinator.library.create'), uploadLimiter, questionAssetUpload.single('image'), uploadLibraryAsset);
router.post('/library/questions/resolve', requireAuth, requireCoordinatorPermission('coordinator.library.create'), resolveLibraryQuestions);
router.get('/library/questions/:id', requireAuth, requireCoordinatorPermission('coordinator.library.view'), getLibraryQuestion);
router.patch('/library/questions/:id', requireAuth, requireCoordinatorPermission('coordinator.library.create'), updateLibraryQuestion);
router.delete('/library/questions/:id', requireAuth, requireCoordinatorPermission('coordinator.library.create'), deleteLibraryQuestion);
router.get('/assessment/:id', requireAuth, requireCoordinatorPermission('coordinator.assessment.view'), cacheJsonResponse({ namespace: 'assessments', ttlSeconds: Number(process.env.RESPONSE_CACHE_ASSESSMENTS_TTL_SECONDS || 30) }), getAssessment);
router.get('/assessment/:id/eligible-students', requireAuth, requireCoordinatorPermission('coordinator.assessment.view'), listAssessmentEligibleStudents);
router.post('/assessment/:id/reset-submissions', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), invalidateResponseCache('assessments'), resetAssessmentSubmissions);
router.post('/assessment/:id/students', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), invalidateResponseCache('assessments'), addAssessmentEligibleStudents);
router.patch('/assessment/:id/students/sets', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), invalidateResponseCache('assessments'), updateAssessmentStudentSets);
router.post('/assessment/:id/students/remove', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), invalidateResponseCache('assessments'), removeAssessmentEligibleStudents);
router.post('/assessment/:id/students/:studentId/reset-submission', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), invalidateResponseCache('assessments'), resetAssessmentStudentSubmission);
router.delete('/assessment/:id/students/:studentId', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), invalidateResponseCache('assessments'), removeAssessmentEligibleStudent);
router.patch('/assessment/:id/students/:studentId/set', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), invalidateResponseCache('assessments'), updateAssessmentStudentSet);
router.post('/assessment/:id/mark-complete', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), invalidateResponseCache('assessments'), markAssessmentComplete);
router.post('/assessment/:id/release-answers', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), invalidateResponseCache('assessments'), releaseAssessmentAnswers);
router.post('/assessment/:id/send-invitations', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), sendAssessmentInvitations);
router.get('/assessment/:id/invitation', requireAuth, requireCoordinatorPermission('coordinator.assessment.view'), getAssessmentInvitationEditor);
router.post('/assessment/:id/invitation/preview', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), previewAssessmentInvitation);
router.put('/assessment/:id/invitation', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), updateAssessmentInvitation);
router.post('/assessment/:id/invitation/test', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), bulkOperationLimiter, sendAssessmentInvitationTest);
router.put('/assessment/:id', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), invalidateResponseCache('assessments'), updateAssessment);
router.delete('/assessment/:id', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), invalidateResponseCache('assessments'), deleteAssessment);

export default router;
