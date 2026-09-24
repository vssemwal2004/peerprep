import { Router } from 'express';
import multer from 'multer';
import { requireAdmin, requireAuth, requireStudent, requireFullStudent, requireAssessmentCompilerStudent, requireAdminCoordinatorOrStudent, requireCoordinatorPermission } from '../middleware/auth.js';
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
  updateProblemVisibility,
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
import { cacheJsonResponse, invalidateResponseCache } from '../middleware/responseCache.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 60,
  },
});

router.use(requireAuth);

const compilerCache = cacheJsonResponse({
  namespace: 'compiler',
  ttlSeconds: Number(process.env.RESPONSE_CACHE_COMPILER_TTL_SECONDS || 30),
});
const invalidateCompilerCache = invalidateResponseCache('compiler');

router.get('/overview', requireCoordinatorPermission('coordinator.compiler.view'), compilerCache, getAdminCompilerOverview);
router.get('/analytics', requireCoordinatorPermission('coordinator.compiler.analytics'), compilerCache, getAdminCompilerAnalytics);
router.get('/student/:id', requireCoordinatorPermission('coordinator.compiler.analytics'), getCompilerStudentAnalytics);
router.get('/problems/overview', requireCoordinatorPermission('coordinator.compiler.view'), compilerCache, getCompilerOverview);
router.post('/problems/preview/run', requireCoordinatorPermission('coordinator.compiler.manage'), upload.none(), previewRunProblem);
router.post('/problems/:id/preview/approve', requireCoordinatorPermission('coordinator.compiler.manage'), invalidateCompilerCache, upload.none(), approveProblemPreview);
router.get('/problems', requireAdminCoordinatorOrStudent, requireFullStudent, listProblems);
router.post('/problems', requireCoordinatorPermission('coordinator.compiler.create'), invalidateCompilerCache, upload.any(), createProblem);
router.get('/problems/:id/submissions', requireStudent, requireFullStudent, listProblemSubmissions);
router.get('/problems/:id', requireAdminCoordinatorOrStudent, requireFullStudent, getProblemDetail);
router.put('/problems/:id', requireCoordinatorPermission('coordinator.compiler.manage'), invalidateCompilerCache, upload.any(), updateProblem);
router.patch('/problems/:id/status', requireCoordinatorPermission('coordinator.compiler.manage'), invalidateCompilerCache, upload.none(), updateProblemStatus);
router.patch('/problems/:id/visibility', requireCoordinatorPermission('coordinator.compiler.manage'), invalidateCompilerCache, upload.none(), updateProblemVisibility);
router.delete('/problems/:id', requireCoordinatorPermission('coordinator.compiler.manage'), invalidateCompilerCache, deleteProblem);
router.post('/problems/:id/run', requireCoordinatorPermission('coordinator.compiler.manage'), upload.none(), runProblemCode);
router.post('/problems/:id/submit', requireCoordinatorPermission('coordinator.compiler.manage'), upload.none(), submitProblemCode);
router.post('/problems/:id/expected', requireAssessmentCompilerStudent, compilerExecutionLimiter, getExpectedOutput);

router.post('/run', requireAssessmentCompilerStudent, compilerRunLimiter, compilerRunCooldown, runCode);
router.post('/submit', requireAssessmentCompilerStudent, compilerSubmitLimiter, compilerSubmitCooldown, submitCode);
router.get('/health/judge0', requireAdmin, getJudge0Health);

router.get('/submissions', requireCoordinatorPermission('coordinator.compiler.analytics'), listSubmissions);
router.get('/submissions/analytics', requireCoordinatorPermission('coordinator.compiler.analytics'), getCompilerAnalytics);
router.get('/analytics/overview', requireCoordinatorPermission('coordinator.compiler.analytics'), compilerCache, getCompilerAnalyticsOverview);
router.get('/analytics/problem/:id', requireCoordinatorPermission('coordinator.compiler.analytics'), getCompilerProblemAnalytics);

export default router;
