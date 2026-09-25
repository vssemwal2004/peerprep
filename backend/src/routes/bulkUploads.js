import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import {
  deleteBulkUpload,
  downloadBulkUpload,
  getBulkUploadDeletePreview,
  listBulkUploads,
  renameBulkUpload,
  updateBulkUploadStatus,
} from '../controllers/bulkUploadController.js';

const router = Router();
router.use(requireAuth, requireAdmin);
router.get('/', listBulkUploads);
router.get('/:batchId/delete-preview', getBulkUploadDeletePreview);
router.get('/:batchId/download', downloadBulkUpload);
router.patch('/:batchId', renameBulkUpload);
router.patch('/:batchId/status', updateBulkUploadStatus);
router.delete('/:batchId', deleteBulkUpload);

export default router;
