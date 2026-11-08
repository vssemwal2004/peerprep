import { Router } from 'express';
import { requireAuth, requireStudent } from '../middleware/auth.js';
import { analyticsRefreshLimiter, bulkOperationLimiter } from '../middleware/rateLimiter.js';
import {
  getStudentAnalysis,
  getStudentAnalysisHistory,
  getCompanyReadiness,
} from '../controllers/studentAnalysisController.js';
import { listCompanyBenchmarksForStudents } from '../controllers/companyInsightsController.js';
import { downloadInsightsReport, getInsights, getInsightTopic } from '../modules/studentInsights/studentInsights.controller.js';

const router = Router();

// The student's own analysis page: everything is limited to the features the student may use.
router.get('/insights', requireAuth, requireStudent, analyticsRefreshLimiter, getInsights);
router.get('/insights/topics/:key', requireAuth, requireStudent, getInsightTopic);
router.get('/insights/report', requireAuth, requireStudent, bulkOperationLimiter, downloadInsightsReport);

router.get('/', requireAuth, requireStudent, analyticsRefreshLimiter, getStudentAnalysis);
router.get('/history', requireAuth, requireStudent, getStudentAnalysisHistory);
router.get('/companies', requireAuth, requireStudent, listCompanyBenchmarksForStudents);
router.get('/readiness', requireAuth, requireStudent, analyticsRefreshLimiter, getCompanyReadiness);

export default router;
