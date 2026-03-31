import { Router } from 'express';
import multer from 'multer';
import { requireAdmin, requireAdminOrStudent, requireAuth, requireStudent } from '../middleware/auth.js';
import {
  compilerExecutionLimiter,
  compilerRunCooldown,
  compilerRunLimiter,
  compilerSubmitCooldown,
  compilerSubmitLimiter,
} from '../middleware/rateLimiter.js';
import {
  createProblem,
  getCompilerOverview,
  getProblemDetail,
  listProblems,
  previewRunProblem,
  runProblemCode,
  submitProblemCode,
  updateProblem,
} from '../controllers/problemController.js';
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

router.get('/problems/overview', requireAdmin, getCompilerOverview);
router.post('/problems/preview/run', requireAdmin, upload.none(), previewRunProblem);
router.get('/problems', requireAdminOrStudent, listProblems);
router.post('/problems', requireAdmin, upload.any(), createProblem);
router.get('/problems/:id/submissions', requireStudent, listProblemSubmissions);
router.get('/problems/:id', requireAdminOrStudent, getProblemDetail);
router.put('/problems/:id', requireAdmin, upload.any(), updateProblem);
router.post('/problems/:id/run', requireAdmin, upload.none(), runProblemCode);
router.post('/problems/:id/submit', requireAdmin, upload.none(), submitProblemCode);
router.post('/problems/:id/expected', requireStudent, compilerExecutionLimiter, getExpectedOutput);

router.post('/run', requireStudent, compilerRunLimiter, compilerRunCooldown, runCode);
router.post('/submit', requireStudent, compilerSubmitLimiter, compilerSubmitCooldown, submitCode);
router.get('/health/judge0', requireAdmin, getJudge0Health);

router.get('/submissions', requireAdmin, listSubmissions);
router.get('/submissions/analytics', requireAdmin, getCompilerAnalytics);

export default router;
