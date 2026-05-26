import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireCoordinatorPermission } from '../middleware/auth.js';
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

router.get('/template', requireAuth, requireCoordinatorPermission('coordinator.company.create'), downloadCompanyBenchmarkTemplate);
router.get('/', requireAuth, requireCoordinatorPermission('coordinator.company.view'), listCompanyBenchmarks);
router.post('/', requireAuth, requireCoordinatorPermission('coordinator.company.create'), createCompanyBenchmark);
router.put('/:id', requireAuth, requireCoordinatorPermission('coordinator.company.create'), updateCompanyBenchmark);
router.delete('/:id', requireAuth, requireCoordinatorPermission('coordinator.company.create'), deleteCompanyBenchmark);
router.post('/upload', requireAuth, requireCoordinatorPermission('coordinator.company.create'), uploadLimiter, bulkOperationLimiter, upload.single('file'), uploadCompanyBenchmarks);

export default router;
