import { Router } from 'express';
import { requireAuth, requireCoordinatorPermission } from '../middleware/auth.js';
import { getBatchStatus, listMailJobs, listTargetMailStatus, retryFailedBatch } from '../controllers/mailQueueController.js';

const router = Router();

router.get('/jobs', requireAuth, requireCoordinatorPermission('coordinator.email-queue.manage'), listMailJobs);
router.get('/batches/:batchId', requireAuth, requireCoordinatorPermission('coordinator.email-queue.manage'), getBatchStatus);
router.post('/batches/:batchId/retry', requireAuth, requireCoordinatorPermission('coordinator.email-queue.manage'), retryFailedBatch);
router.get('/targets/:targetType/:targetId', requireAuth, requireCoordinatorPermission('coordinator.email-queue.manage'), listTargetMailStatus);

export default router;
