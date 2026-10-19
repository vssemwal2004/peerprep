import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { isControlPlane } from '../platform/deployment.js';
import { currentTenant } from '../platform/tenantContext.js';
import { HttpError } from '../utils/errors.js';
import { coinAccounts, coinConsoleSummary, coinLedger } from '../platform/coinConsole.js';

// Master Admin Prep Coin console. University admins manage their own wallet at /api/wallet.
const router = Router();
const send = (work) => (req, res, next) => Promise.resolve(work(req))
  .then((body) => res.set('Cache-Control', 'private, no-store').json(body)).catch(next);

router.use(requireAuth, requireAdmin, (req, res, next) => (isControlPlane() && !currentTenant()
  ? next() : next(new HttpError(404, 'Not found'))));

router.get('/summary', send(() => coinConsoleSummary()));
router.get('/ledger', send((req) => coinLedger(req.query)));
router.get('/accounts', send((req) => coinAccounts(req.query)));

export default router;
