import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middleware/auth.js';
import {
  createAdminAnalyticsExport, estimateAdminAnalytics, getAdminAnalyticsExport,
  getAdminAnalyticsGraphDetails, listAdminAnalyticsOptions, queryAdminAnalytics,
} from './adminAnalytics.controller.js';

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);
router.post('/query', queryAdminAnalytics);
router.post('/estimate', estimateAdminAnalytics);
router.get('/options', listAdminAnalyticsOptions);
router.post('/graphs/:graphId/details', getAdminAnalyticsGraphDetails);
router.post('/exports', createAdminAnalyticsExport);
router.get('/exports/:jobId', getAdminAnalyticsExport);

export default router;
