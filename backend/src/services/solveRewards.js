// What an accepted practice solve earns besides the Prep Score: Prep Coins (first solve of a
// problem, within the daily topic limit) and a monthly badge re-check. Never throws.
import { creditEarningSafely, getEarningConfig } from '../platform/coinEarn.js';
import { evaluateMonthlyBadgesQuietly } from './monthlyBadges.js';

/**
 * `outcome` is recordAcceptedSolve's result. Returns { amount, balance } when coins were paid now,
 * otherwise null (re-solve, over the topic limit, Prep Coin off, or already paid).
 */
export async function rewardAcceptedSolve({ userId, source, problemId, title = '', outcome }) {
  let coins = null;
  try {
    if (outcome && !outcome.alreadySolved && outcome.counted === true) {
      const { earning } = await getEarningConfig();
      const paid = await creditEarningSafely({
        user: userId, kind: 'solve', key: `${source}:${problemId}`, amount: earning.solve,
        note: title ? `Solved ${String(title).slice(0, 90)}` : 'Problem solved',
      });
      if (paid && !paid.duplicate) coins = { amount: paid.amount, balance: paid.balance };
    }
  } catch (error) {
    console.warn(`[PrepCoin] solve reward failed: ${error.message}`);
  }
  // Badge levels can move on any accepted solve; checked in the background.
  void evaluateMonthlyBadgesQuietly(userId);
  return coins;
}
