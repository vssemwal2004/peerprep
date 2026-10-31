import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middleware/auth.js';
import {
  countPrepAnalysisMatches, createPrepAnalysisView, deletePrepAnalysisView, drillPrepAnalysisChart, exportPrepAnalysisFile, exportPrepAnalysisStudent,
  getPrepAnalysisCatalog, getPrepAnalysisStudent, listPrepAnalysisOptions, listPrepAnalysisViews, updatePrepAnalysisView,
  queryPrepAnalysis,
} from './prepAnalysis.controller.js';

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);
router.get('/catalog', getPrepAnalysisCatalog);
router.get('/options', listPrepAnalysisOptions);
router.post('/query', queryPrepAnalysis);
router.post('/count', countPrepAnalysisMatches);
router.post('/drill', drillPrepAnalysisChart);
router.post('/export', exportPrepAnalysisFile);
router.get('/students/:studentId', getPrepAnalysisStudent);
router.get('/students/:studentId/export', exportPrepAnalysisStudent);
router.get('/views', listPrepAnalysisViews);
router.post('/views', createPrepAnalysisView);
router.patch('/views/:viewId', updatePrepAnalysisView);
router.delete('/views/:viewId', deletePrepAnalysisView);

export default router;
