import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resultsPollLimiter } from '../middleware/rateLimiter.js';
import { getExecutionResult } from '../controllers/resultsController.js';

const router = Router();

router.use(requireAuth);
router.get('/:jobId', resultsPollLimiter, getExecutionResult);

export default router;
