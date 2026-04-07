import { Router } from 'express';
import { requireAuth, requireStudent } from '../middleware/auth.js';
import { getStudentAnalysis, getCompanyReadiness } from '../controllers/studentAnalysisController.js';
import { listCompanyBenchmarksForStudents } from '../controllers/companyInsightsController.js';

const router = Router();

router.get('/', requireAuth, requireStudent, getStudentAnalysis);
router.get('/companies', requireAuth, requireStudent, listCompanyBenchmarksForStudents);
router.get('/readiness', requireAuth, requireStudent, getCompanyReadiness);

export default router;
