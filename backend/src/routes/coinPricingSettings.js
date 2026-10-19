import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { isControlPlane } from '../platform/deployment.js';
import { HttpError } from '../utils/errors.js';
import { coinFeatureCatalog, getCoinPricing, saveCoinPricing } from '../platform/coinSpend.js';

const router = Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

router.use(requireAuth, requireAdmin, (req, res, next) => {
  if (!isControlPlane()) return next(new HttpError(403, 'Prep Coin prices are managed by the Master Admin.'));
  return next();
});

router.get('/', asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store').json({ ...(await getCoinPricing({ fresh: true })), catalog: coinFeatureCatalog() });
}));

router.put('/', asyncRoute(async (req, res) => {
  const pricing = await saveCoinPricing({
    features: req.body?.features, expectedVersion: req.body?.expectedVersion, reason: req.body?.reason, actorId: req.user._id,
  });
  res.json({ ...pricing, catalog: coinFeatureCatalog() });
}));

export default router;
