import { PLATFORM_WALLET_SCOPE } from '../platform/coins.js';
import { captureCharge, chargeFeature, refundCharge } from '../platform/coinSpend.js';
import { currentTenant, runForPlatform, runForTenant } from '../platform/tenantContext.js';

export const walletScope = () => currentTenant()?.universityId || PLATFORM_WALLET_SCOPE;

/** Re-enters the request's university context: response listeners run outside it. */
function inContext(tenant, work) {
  return tenant ? runForTenant(tenant, work) : runForPlatform(work);
}

/**
 * Charges a student for a priced feature before the handler runs and settles when the response
 * ends: 2xx captures, 4xx refunds, 5xx or a dropped connection asks `verify` whether the action
 * happened. Free features (price 0) pass straight through, so nothing changes until priced.
 *
 * options.resourceKey(req)        what is being bought (an interview or event id)
 * options.exempt(req)             true when this use is never charged (e.g. coordinator-assigned)
 * options.alreadyEntitled(req)    true when the student already started/joined it before pricing
 * options.verify(req)             true when the action really happened (used after 5xx/abort)
 */
export function requireCoins(featureKey, { resourceKey, exempt, alreadyEntitled, verify } = {}) {
  return async (req, res, next) => {
    try {
      if (req.user?.role !== 'student') return next();
      if (exempt && await exempt(req)) return next();
      if (alreadyEntitled && await alreadyEntitled(req)) return next();
      const header = req.get('X-Prep-Coin-Cost');
      const result = await chargeFeature({
        scope: walletScope(), userId: req.user._id, featureKey, resourceKey: String(resourceKey(req)),
        expectedCost: header === undefined || header === '' ? undefined : Number(header),
      });
      if (!result?.charge) return next();
      const chargeId = result.charge._id;
      const tenant = currentTenant();
      let settled = false;
      const settle = (aborted) => {
        if (settled) return;
        settled = true;
        const status = res.statusCode;
        inContext(tenant, async () => {
          if (!aborted && status >= 200 && status < 300) return captureCharge(chargeId);
          if (!aborted && status >= 400 && status < 500) return refundCharge(chargeId, `Request failed (${status})`);
          const happened = verify ? await verify(req).catch(() => false) : false;
          return happened ? captureCharge(chargeId) : refundCharge(chargeId, aborted ? 'Connection closed' : `Request failed (${status})`);
        }).catch((error) => console.warn(`[PrepCoin] Charge ${chargeId} left pending for the sweeper: ${error.message}`));
      };
      res.once('finish', () => settle(false));
      res.once('close', () => settle(!res.writableFinished));
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
