import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireAdmin, requireCoordinatorPermission } from '../middleware/auth.js';
import { isUniversity } from '../platform/deployment.js';
import { acceptLogoUpload } from '../platform/universityLogo.js';
import {
  addMockRole, fetchMissingLogos, listMockCatalogCompanies, mockRolesFor, removeCompanyLogo, setLogoFromUpload, setLogoFromWebsite,
} from '../services/prepMockCatalog.js';
import { createPattern, deletePattern, listPatterns, updatePattern } from '../services/prepMockPattern.js';
import { changeMockOwnStudents, mockOwnStudents } from '../services/prepMockOwnStudents.js';
import { bulkChangeOwnStudents, bulkPublishMocks, bulkUnpublishMocks } from '../services/prepMockBulk.js';
import { changeUniversityAssignment, universityAssignment } from '../services/prepMockUniversityAssign.js';
import { universityPolicy } from '../platform/client.js';
import { permissionAllowed } from '../platform/enforcePolicy.js';
import Assessment from '../models/Assessment.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import mongoose from 'mongoose';
import { currentTenant } from '../platform/tenantContext.js';
import { sharedAssessment } from '../platform/sharedContent.js';
import { requirePrepMockSpoc, listPrepMockStudents, uploadPrepMockStudent, uploadPrepMockStudentsBulk } from '../controllers/prepMockStudentController.js';
import QuestionLibrary from '../models/QuestionLibrary.js';
import { HttpError } from '../utils/errors.js';
import { bulkOperationLimiter, uploadLimiter, compilerExecutionLimiter } from '../middleware/rateLimiter.js';
import { cacheJsonResponse, invalidateResponseCache } from '../middleware/responseCache.js';
import {
  createAssessment,
  previewAssessmentStudents,
  listAssessments,
  getAssessment,
  updateAssessment,
  resetMock,
  unpublishMock,
  publishMock,
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
import { getAssessmentRoster, releaseAssessmentResults } from '../controllers/assessmentLiveReportController.js';
import {
  getLibraryQuestion,
  listLibraryQuestions,
  resolveLibraryQuestions,
  createLibraryQuestion,
  createLibraryQuestionsBulk,
  updateLibraryQuestion,
  deleteLibraryQuestion,
  uploadLibraryAsset,
  copySharedQuestion,
  executeSharedCodingPreview,
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
    const moduleName = req.query?.scope === 'mock' ? 'prepmock' : 'questions';
    if (!permissionAllowed(policy.permissions, moduleName)) return res.status(403).json({ error: `${moduleName} is disabled for this university` });
    next();
  } catch (error) { next(error); }
});
const questionAssetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024, files: 1 },
});
const mockStudentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

router.post('/assessment/students/preview', requireAuth, requireCoordinatorPermission('coordinator.assessment.create'), previewAssessmentStudents);
// ---- Prep Mock catalogue: companies (= the companies students see on Prep Coding, plus companies
// that already have mocks) with logos, job roles, and logo upload/fetch. Anyone who creates mocks.
const spocCannotEditMock = (req, _res, next) => {
  if (currentTenant() || req.user?.role !== 'admin') {
    return next(new HttpError(403, 'Only the Master Admin can create or edit PrepMocks.'));
  }
  return next();
};
const mockViewer = [requireAuth, requireCoordinatorPermission('coordinator.assessment.view')];
const mockAuthor = [requireAuth, requireCoordinatorPermission('coordinator.assessment.create'), spocCannotEditMock];
const noStore = (res) => res.set('Cache-Control', 'private, no-store');
const route = (handler) => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };
router.get('/assessment/mock-students', requireAuth, requireAdmin, requirePrepMockSpoc, route(listPrepMockStudents));
router.post('/assessment/mock-students', requireAuth, requireAdmin, requirePrepMockSpoc, route(uploadPrepMockStudent));
router.post('/assessment/mock-students/bulk', requireAuth, requireAdmin, requirePrepMockSpoc, uploadLimiter, bulkOperationLimiter, mockStudentUpload.single('file'), route(uploadPrepMockStudentsBulk));
router.use('/assessment/:id', requireAuth, async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return next();
  try {
    const assessment = await Assessment.findById(req.params.id).select('kind').lean();
    if (assessment?.kind === 'mock' && isUniversity()) {
      return res.status(404).json({ error: 'Mock not found' });
    }
    if (assessment?.kind === 'mock' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can view PrepMocks.' });
    }
    if (assessment?.kind === 'mock' && isUniversity() && !permissionAllowed((await universityPolicy()).permissions, 'prepmock')) {
      return res.status(403).json({ error: 'PrepMock is disabled for this university' });
    }
    return next();
  } catch (error) { return next(error); }
});
router.use('/library/questions', requireAuth, (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.query?.scope !== 'mock') return next();
  return spocCannotEditMock(req, _res, next);
});
router.use('/library/questions/:id', requireAuth, async (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !mongoose.isValidObjectId(req.params.id)) return next();
  try {
    const question = await QuestionLibrary.findById(req.params.id).select('scope').lean();
    return question?.scope === 'mock' ? spocCannotEditMock(req, res, next) : next();
  } catch (error) { return next(error); }
});
router.use(['/assessment/reports/submissions/:submissionId', '/assessment/submissions/:submissionId/violations'], async (req, res, next) => {
  if (!isUniversity() || !mongoose.isValidObjectId(req.params.submissionId)) return next();
  try {
    const submission = await AssessmentSubmission.findById(req.params.submissionId).select('assessmentId').lean();
    if (!submission) return next();
    const assessment = await Assessment.findById(submission.assessmentId).select('kind').lean();
    if (assessment?.kind === 'mock') return res.status(404).json({ error: 'Mock report not found' });
    if (!assessment) {
      const shared = await sharedAssessment(submission.assessmentId);
      if (shared?.kind === 'mock' && (shared.platformPublished === false || !permissionAllowed((await universityPolicy()).permissions, 'prepmock'))) {
        return res.status(404).json({ error: 'Mock report not found' });
      }
    }
    return next();
  } catch (error) { return next(error); }
});
const universityMockReportScope = async (req, res, next) => {
  if (!isUniversity() || req.query?.kind !== 'mock') return next();
  try {
    const id = req.query?.assessmentId;
    if (!id) return res.status(400).json({ error: 'Select a published PrepMock to view its report' });
    if (!mongoose.isValidObjectId(id)) return next();
    const local = await Assessment.findById(id).select('kind').lean();
    if (local?.kind === 'mock') return res.status(404).json({ error: 'Mock report not found' });
    const shared = await sharedAssessment(id);
    if (!shared || shared.kind !== 'mock' || shared.platformPublished === false
      || !permissionAllowed((await universityPolicy()).permissions, 'prepmock')) {
      return res.status(404).json({ error: 'Mock report not found' });
    }
    return next();
  } catch (error) { return next(error); }
};
router.get('/assessment/mock-companies', ...mockViewer, route(async (req, res) => {
  const search = String(req.query.search || '').trim().toLowerCase().slice(0, 80);
  const requested = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 2000) : 2000;
  const companies = (await listMockCatalogCompanies())
    .filter((row) => !search || row.company.toLowerCase().includes(search))
    .slice(0, limit)
    .map((row) => ({ ...row, count: row.questions }));
  noStore(res).json({ companies });
}));
router.get('/assessment/mock-roles', ...mockViewer, route(async (req, res) => {
  noStore(res).json(await mockRolesFor(String(req.query.company || '')));
}));
router.post('/assessment/mock-roles', ...mockAuthor, route(async (req, res) => {
  noStore(res).status(201).json(await addMockRole({ name: req.body?.name, company: req.body?.company, userId: req.user?._id }));
}));
router.post('/assessment/mock-companies/logo/website', ...mockAuthor, route(async (req, res) => {
  noStore(res).json(await setLogoFromWebsite({ company: req.body?.company, website: req.body?.website, userId: req.user?._id }));
}));
router.post('/assessment/mock-companies/logo/upload', ...mockAuthor, acceptLogoUpload, route(async (req, res) => {
  noStore(res).json(await setLogoFromUpload({ company: req.query.company, file: req.file, userId: req.user?._id }));
}));
router.delete('/assessment/mock-companies/logo', ...mockAuthor, route(async (req, res) => {
  noStore(res).json(await removeCompanyLogo({ company: req.query.company }));
}));
router.post('/assessment/mock-companies/logos/fetch-missing', ...mockAuthor, route(async (req, res) => {
  noStore(res).json(await fetchMissingLogos({ limit: req.body?.limit, skip: req.body?.skip, userId: req.user?._id }));
}));
router.post('/assessment/create', requireAuth, requireCoordinatorPermission('coordinator.assessment.create'), (req, res, next) => req.body?.kind === 'mock' ? spocCannotEditMock(req, res, next) : next(), invalidateResponseCache('assessments'), createAssessment);
// ---- Prep Mock exam patterns (Master Admin; per company + role, one per OA month/year). Editing
// one refreshes the copy on every mock that uses it, so the assessments cache is cleared too.
// Reading patterns is Master Admin only as well: patterns carry admin-only notes and draft layouts,
// and only the mock builder (Master Admin, platform) reads them; universities never author them.
const patternViewer = [...mockViewer, (req, _res, next) => (currentTenant() || req.user?.role !== 'admin'
  ? next(new HttpError(403, 'Only the Master Admin can view Prep Mock exam patterns.'))
  : next())];
router.get('/assessment/mock-patterns', ...patternViewer, route(async (req, res) => {
  noStore(res).json(await listPatterns({ company: req.query.company, role: req.query.role }));
}));
router.post('/assessment/mock-patterns', ...mockAuthor, route(async (req, res) => {
  noStore(res).status(201).json(await createPattern(req.body || {}, req.user));
}));
router.put('/assessment/mock-patterns/:patternId', ...mockAuthor, invalidateResponseCache('assessments'), route(async (req, res) => {
  noStore(res).json(await updatePattern(req.params.patternId, req.body || {}, req.user));
}));
router.delete('/assessment/mock-patterns/:patternId', ...mockAuthor, route(async (req, res) => {
  noStore(res).json(await deletePattern(req.params.patternId));
}));
// ---- University "Assign students" for a live Prep Mock (university SPOC): chosen Prep Mock
// students and a date-time window. Every enrolled student still sees every live mock.
router.get('/assessment/mock-assignments/:mockId', requireAuth, requireAdmin, route(async (req, res) => {
  noStore(res).json(await universityAssignment(req.params.mockId, req.user));
}));
router.post('/assessment/mock-assignments/:mockId', requireAuth, requireAdmin, route(async (req, res) => {
  noStore(res).json(await changeUniversityAssignment(req.params.mockId, req.body || {}, req.user));
}));
router.post('/assessment/test-email', requireAuth, requireCoordinatorPermission('coordinator.assessment.create'), sendAssessmentTestEmail);
router.get('/assessment/list', requireAuth, requireCoordinatorPermission('coordinator.assessment.view'), cacheJsonResponse({ namespace: 'assessments', ttlSeconds: Number(process.env.RESPONSE_CACHE_ASSESSMENTS_TTL_SECONDS || 30) }), listAssessments);
router.get('/assessment/reports', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), universityMockReportScope, cacheJsonResponse({ namespace: 'assessments', ttlSeconds: Number(process.env.RESPONSE_CACHE_ASSESSMENT_REPORTS_TTL_SECONDS || 15) }), getAssessmentReports);
router.get('/assessment/reports/submissions/:submissionId', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), getStudentAssessmentReport);
router.get('/assessment/reports/export-data', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), universityMockReportScope, getAssessmentReportsExportData);
router.get('/assessment/reports/export', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), universityMockReportScope, exportAssessmentReports);
router.get('/assessment/submissions/:submissionId/violations', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), getSubmissionViolations);
router.get('/assessment/evidence/:eventId', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), getAssessmentEvidence);
// Live report: never response-cached (Cache-Control: no-store); scope checked by authorizeAssessmentReportAccess.
router.get('/assessment/:id/report/roster', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), getAssessmentRoster);
router.post('/assessment/:id/release-results', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), invalidateResponseCache('assessments'), releaseAssessmentResults);
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
router.post('/library/questions/:id/copy', requireAuth, requireAdmin, copySharedQuestion);
router.post('/library/questions/:id/shared-coding/:action', requireAuth, requireCoordinatorPermission('coordinator.library.view'), compilerExecutionLimiter, executeSharedCodingPreview);
router.get('/library/questions/:id', requireAuth, requireCoordinatorPermission('coordinator.library.view'), getLibraryQuestion);
router.patch('/library/questions/:id', requireAuth, requireCoordinatorPermission('coordinator.library.create'), updateLibraryQuestion);
router.delete('/library/questions/:id', requireAuth, requireCoordinatorPermission('coordinator.library.create'), deleteLibraryQuestion);
router.get('/assessment/:id', requireAuth, requireCoordinatorPermission('coordinator.assessment.view'), cacheJsonResponse({ namespace: 'assessments', ttlSeconds: Number(process.env.RESPONSE_CACHE_ASSESSMENTS_TTL_SECONDS || 30) }), getAssessment);
router.get('/assessment/:id/eligible-students', requireAuth, requireCoordinatorPermission('coordinator.assessment.view'), listAssessmentEligibleStudents);
router.post('/assessment/:id/reset-submissions', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), invalidateResponseCache('assessments'), resetAssessmentSubmissions);
router.post('/assessment/:id/reset-mock', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), invalidateResponseCache('assessments'), resetMock);
// ---- Prep Mock bulk actions (Master Admin, platform): scope = { mockIds } | { company[, role] } | { all }
// (+ statuses). Registered before '/assessment/:id/…' so "mock-bulk" is never read as a mock id.
const mockBulk = [requireAuth, requireAdmin, spocCannotEditMock, invalidateResponseCache('assessments')];
router.post('/assessment/mock-bulk/own-students', ...mockBulk, route(async (req, res) => {
  noStore(res).json(await bulkChangeOwnStudents(req.body || {}, req.user));
}));
router.post('/assessment/mock-bulk/publish', ...mockBulk, route(async (req, res) => {
  noStore(res).json(await bulkPublishMocks(req.body || {}, req.user));
}));
router.post('/assessment/mock-bulk/unpublish', ...mockBulk, route(async (req, res) => {
  noStore(res).json(await bulkUnpublishMocks(req.body || {}, req.user));
}));
router.post('/assessment/:id/unpublish-mock', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), invalidateResponseCache('assessments'), unpublishMock);
router.post('/assessment/:id/publish-mock', requireAuth, requireCoordinatorPermission('coordinator.assessment.edit'), spocCannotEditMock, invalidateResponseCache('assessments'), publishMock);
// Prep Mock "Assign own students": Master Admin's platform students and their date-time window.
router.get('/assessment/:id/own-students', requireAuth, requireAdmin, spocCannotEditMock, route(async (req, res) => {
  noStore(res).json(await mockOwnStudents(req.params.id, req.user));
}));
router.post('/assessment/:id/own-students', requireAuth, requireAdmin, spocCannotEditMock, invalidateResponseCache('assessments'), route(async (req, res) => {
  noStore(res).json(await changeMockOwnStudents(req.params.id, req.body || {}, req.user));
}));
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
