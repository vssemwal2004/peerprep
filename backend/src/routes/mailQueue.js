import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getBatchStatus, listTargetMailStatus, retryFailedBatch } from '../controllers/mailQueueController.js';

const router = Router();

router.get('/batches/:batchId', requireAuth, getBatchStatus);
router.post('/batches/:batchId/retry', requireAuth, retryFailedBatch);
router.get('/targets/:targetType/:targetId', requireAuth, requireAdmin, listTargetMailStatus);

export default router;
