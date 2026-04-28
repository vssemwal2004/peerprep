import { Router } from 'express';
import multer from 'multer';
import { requireAdmin, requireAdminOrStudent, requireAuth, requireStudent, requireAdminOrCoordinator, requireAdminCoordinatorOrStudent } from '../middleware/auth.js';
import {
  compilerExecutionLimiter,
  compilerRunCooldown,
  compilerRunLimiter,
  compilerSubmitCooldown,
  compilerSubmitLimiter,
} from '../middleware/rateLimiter.js';
import {
  approveProblemPreview,
  createProblem,
  deleteProblem,
  getCompilerOverview,
  getProblemDetail,
  listProblems,
  previewRunProblem,
  runProblemCode,
  submitProblemCode,
  updateProblemStatus,
  updateProblem,
} from '../controllers/problemController.js';
import {
  getAdminCompilerAnalytics,
  getAdminCompilerOverview,
  getCompilerAnalyticsOverview,
  getCompilerProblemAnalytics,
  getCompilerStudentAnalytics,
} from '../controllers/analyticsController.js';
import { getExpectedOutput, getJudge0Health, runCode, submitCode } from '../controllers/compilerController.js';
import {
  getCompilerAnalytics,
  listProblemSubmissions,
  listSubmissions,
} from '../controllers/submissionController.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 60,
  },
});

router.use(requireAuth);

router.get('/overview', requireAdminOrCoordinator, getAdminCompilerOverview);
router.get('/analytics', requireAdminOrCoordinator, getAdminCompilerAnalytics);
router.get('/student/:id', requireAdminOrCoordinator, getCompilerStudentAnalytics);
router.get('/problems/overview', requireAdminOrCoordinator, getCompilerOverview);
router.post('/problems/preview/run', requireAdminOrCoordinator, upload.none(), previewRunProblem);
router.post('/problems/:id/preview/approve', requireAdminOrCoordinator, upload.none(), approveProblemPreview);
router.get('/problems', requireAdminCoordinatorOrStudent, listProblems);
router.post('/problems', requireAdminOrCoordinator, upload.any(), createProblem);
router.get('/problems/:id/submissions', requireStudent, listProblemSubmissions);
router.get('/problems/:id', requireAdminCoordinatorOrStudent, getProblemDetail);
router.put('/problems/:id', requireAdminOrCoordinator, upload.any(), updateProblem);
router.patch('/problems/:id/status', requireAdminOrCoordinator, upload.none(), updateProblemStatus);
router.delete('/problems/:id', requireAdminOrCoordinator, deleteProblem);
router.post('/problems/:id/run', requireAdminOrCoordinator, upload.none(), runProblemCode);
router.post('/problems/:id/submit', requireAdminOrCoordinator, upload.none(), submitProblemCode);
router.post('/problems/:id/expected', requireStudent, compilerExecutionLimiter, getExpectedOutput);

router.post('/run', requireStudent, compilerRunLimiter, compilerRunCooldown, runCode);
router.post('/submit', requireStudent, compilerSubmitLimiter, compilerSubmitCooldown, submitCode);
router.get('/health/judge0', requireAdmin, getJudge0Health);

router.get('/submissions', requireAdminOrCoordinator, listSubmissions);
router.get('/submissions/analytics', requireAdminOrCoordinator, getCompilerAnalytics);
router.get('/analytics/overview', requireAdminOrCoordinator, getCompilerAnalyticsOverview);
router.get('/analytics/problem/:id', requireAdminOrCoordinator, getCompilerProblemAnalytics);

export default router;
