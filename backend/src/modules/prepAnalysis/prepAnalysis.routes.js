import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middleware/auth.js';
import {
  comparePrepAnalysisClasses, comparePrepAnalysisClassStudents, exportPrepAnalysisClassComparison,
  countPrepAnalysisMatches, createPrepAnalysisView, deletePrepAnalysisView, drillPrepAnalysisChart, exportPrepAnalysisFile, exportPrepAnalysisStudent,
  getPrepAnalysisCatalog, getPrepAnalysisStudent, listPrepAnalysisOptions, listPrepAnalysisViews, updatePrepAnalysisView,
  queryPrepAnalysis, listMatchingStudentIds, listEmailTemplatesForStudents, previewEmailToStudent, sendEmailToStudents, sendTestEmailToMe,
} from './prepAnalysis.controller.js';
import { studentMailLimiter } from '../../middleware/rateLimiter.js';
import { getGuideProgress, updateGuideProgress } from './prepAnalysis.guides.js';

const router = Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

router.use(requireAuth);
router.use(requireAdmin);
router.get('/catalog', getPrepAnalysisCatalog);
router.get('/options', listPrepAnalysisOptions);
router.post('/query', queryPrepAnalysis);
router.post('/count', countPrepAnalysisMatches);
router.post('/compare', comparePrepAnalysisClasses);
router.post('/compare/students', comparePrepAnalysisClassStudents);
router.post('/compare/export', exportPrepAnalysisClassComparison);
router.post('/drill', drillPrepAnalysisChart);
// Select students and send them one of the admin's email templates.
router.post('/student-ids', listMatchingStudentIds);
router.get('/email/templates', listEmailTemplatesForStudents);
router.post('/email/preview', previewEmailToStudent);
router.post('/email/test', studentMailLimiter, sendTestEmailToMe);
router.post('/email/send', studentMailLimiter, sendEmailToStudents);
router.post('/export', exportPrepAnalysisFile);
router.get('/students/:studentId', getPrepAnalysisStudent);
router.get('/students/:studentId/export', exportPrepAnalysisStudent);
router.get('/views', listPrepAnalysisViews);
router.post('/views', createPrepAnalysisView);
router.patch('/views/:viewId', updatePrepAnalysisView);
router.delete('/views/:viewId', deletePrepAnalysisView);
// Each admin's progress through the page and chart guides.
router.get('/guides/progress', asyncRoute(async (req, res) => res.set('Cache-Control', 'private, no-store').json(await getGuideProgress(req.user))));
router.patch('/guides/progress', asyncRoute(async (req, res) => res.set('Cache-Control', 'private, no-store').json(await updateGuideProgress(req.user, req.body))));

export default router;
