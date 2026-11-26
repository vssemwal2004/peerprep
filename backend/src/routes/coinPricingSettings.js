import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { isControlPlane } from '../platform/deployment.js';
import { HttpError } from '../utils/errors.js';
import { coinFeatureCatalog, getCoinPricing, saveCoinPricing } from '../platform/coinSpend.js';
import { getEarningConfig, saveEarningConfig } from '../platform/coinEarn.js';
import { getJdMatchLimits, jdMatchModel, jdMatchSpend, saveJdMatchLimits } from '../modules/resumeReview/jdMatch.limits.js';

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

// Coins students earn: daily login, each counted solve, and each monthly badge level (1-10).
router.get('/earning', asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store').json(await getEarningConfig({ fresh: true }));
}));

router.put('/earning', asyncRoute(async (req, res) => {
  res.json(await saveEarningConfig({
    earning: req.body?.earning, expectedVersion: req.body?.expectedVersion, reason: req.body?.reason, actorId: req.user._id,
  }));
}));

// ANVI Resume JD Match: what one Gemini check may cost, the monthly budget (kill switch) and its spend.
async function jdMatchSettings() {
  const config = await getJdMatchLimits({ fresh: true });
  const { model, inputUsdPerM, outputUsdPerM, thinkingLevel, maxOutputTokens } = jdMatchModel();
  return { ...config, model: { model, inputUsdPerM, outputUsdPerM, thinkingLevel, maxOutputTokens }, spend: await jdMatchSpend({ limits: config.limits }) };
}

router.get('/resume-jd-match', asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store').json(await jdMatchSettings());
}));

router.put('/resume-jd-match', asyncRoute(async (req, res) => {
  await saveJdMatchLimits({ limits: req.body?.limits, expectedVersion: req.body?.expectedVersion, reason: req.body?.reason, actorId: req.user._id });
  res.json(await jdMatchSettings());
}));

export default router;
