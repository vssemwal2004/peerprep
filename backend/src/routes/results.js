import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getExecutionResult } from '../controllers/resultsController.js';

const router = Router();

router.use(requireAuth);
router.get('/:jobId', getExecutionResult);

export default router;
