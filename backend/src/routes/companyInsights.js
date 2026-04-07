import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { uploadLimiter, bulkOperationLimiter } from '../middleware/rateLimiter.js';
import {
  listCompanyBenchmarks,
  createCompanyBenchmark,
  updateCompanyBenchmark,
  deleteCompanyBenchmark,
  uploadCompanyBenchmarks,
  downloadCompanyBenchmarkTemplate,
} from '../controllers/companyInsightsController.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/template', requireAuth, requireAdmin, downloadCompanyBenchmarkTemplate);
router.get('/', requireAuth, requireAdmin, listCompanyBenchmarks);
router.post('/', requireAuth, requireAdmin, createCompanyBenchmark);
router.put('/:id', requireAuth, requireAdmin, updateCompanyBenchmark);
router.delete('/:id', requireAuth, requireAdmin, deleteCompanyBenchmark);
router.post('/upload', requireAuth, requireAdmin, uploadLimiter, bulkOperationLimiter, upload.single('file'), uploadCompanyBenchmarks);

export default router;
