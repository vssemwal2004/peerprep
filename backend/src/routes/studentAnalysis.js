import { Router } from 'express';
import { requireAuth, requireStudent } from '../middleware/auth.js';
import { analyticsRefreshLimiter } from '../middleware/rateLimiter.js';
import {
  getStudentAnalysis,
  getStudentAnalysisHistory,
  getCompanyReadiness,
} from '../controllers/studentAnalysisController.js';
import { listCompanyBenchmarksForStudents } from '../controllers/companyInsightsController.js';

const router = Router();

router.get('/', requireAuth, requireStudent, analyticsRefreshLimiter, getStudentAnalysis);
router.get('/history', requireAuth, requireStudent, getStudentAnalysisHistory);
router.get('/companies', requireAuth, requireStudent, listCompanyBenchmarksForStudents);
router.get('/readiness', requireAuth, requireStudent, analyticsRefreshLimiter, getCompanyReadiness);

export default router;
