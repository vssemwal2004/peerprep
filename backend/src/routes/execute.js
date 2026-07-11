import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { compilerExecutionLimiter } from '../middleware/rateLimiter.js';
import { executeCode } from '../controllers/compilerController.js';

const router = Router();

router.post('/', requireAuth, compilerExecutionLimiter, executeCode);

export default router;
