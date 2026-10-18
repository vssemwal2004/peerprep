import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middleware/auth.js';
import {
  countPrepAnalysisMatches, exportPrepAnalysisFile, getPrepAnalysisCatalog, getPrepAnalysisStudent, listPrepAnalysisOptions, queryPrepAnalysis,
} from './prepAnalysis.controller.js';

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);
router.get('/catalog', getPrepAnalysisCatalog);
router.get('/options', listPrepAnalysisOptions);
router.post('/query', queryPrepAnalysis);
router.post('/count', countPrepAnalysisMatches);
router.post('/export', exportPrepAnalysisFile);
router.get('/students/:studentId', getPrepAnalysisStudent);

export default router;
