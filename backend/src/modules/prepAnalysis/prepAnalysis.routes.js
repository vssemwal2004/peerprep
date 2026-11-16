import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middleware/auth.js';
import {
  comparePrepAnalysisClasses, comparePrepAnalysisClassStudents, exportPrepAnalysisClassComparison,
  countPrepAnalysisMatches, createPrepAnalysisView, deletePrepAnalysisView, drillPrepAnalysisChart, exportPrepAnalysisFile, exportPrepAnalysisStudent,
  getPrepAnalysisCatalog, getPrepAnalysisStudent, listPrepAnalysisOptions, listPrepAnalysisViews, updatePrepAnalysisView,
  queryPrepAnalysis, listMatchingStudentIds, listEmailTemplatesForStudents, previewEmailToStudent, sendEmailToStudents,
} from './prepAnalysis.controller.js';

const router = Router();

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
router.post('/email/send', sendEmailToStudents);
router.post('/export', exportPrepAnalysisFile);
router.get('/students/:studentId', getPrepAnalysisStudent);
router.get('/students/:studentId/export', exportPrepAnalysisStudent);
router.get('/views', listPrepAnalysisViews);
router.post('/views', createPrepAnalysisView);
router.patch('/views/:viewId', updatePrepAnalysisView);
router.delete('/views/:viewId', deletePrepAnalysisView);

export default router;
