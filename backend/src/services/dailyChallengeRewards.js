// What completing the daily challenge pays (once per challenge day): Prep Coins, Prep Score (the
// points ledger counts the completed mission itself) and the Prep Streak. Called from the one place
// a daily challenge is settled (adaptiveEngagementService.refresh), so it runs exactly once.
import { creditEarningSafely, getEarningConfig } from '../platform/coinEarn.js';
import { getIo } from '../utils/io.js';
import { personalRoom } from '../utils/realtime.js';
import { scoreGainFor } from './prepScore/submitOutcome.js';
import { prepStreakFor } from './prepStreak.js';
import { evaluateLifetimeBadgesQuietly } from './lifetimeBadges.js';

/** Returns { coins, points, streak } for the completion notice. Never throws. */
export async function rewardDailyChallenge(student, periodKey, now = new Date()) {
  try {
    const { earning } = await getEarningConfig();
    const paid = await creditEarningSafely({ user: student, kind: 'challenge', key: periodKey, amount: earning.challenge, note: 'Daily challenge completed' });
    const [streak, points] = await Promise.all([
      prepStreakFor(student._id, now),
      // The real Prep Score change (growth curve), already counting this completed challenge.
      scoreGainFor(student, { kind: 'challenge', day: periodKey }, now).catch(() => 0),
    ]);
    const coins = paid && !paid.duplicate ? paid.amount : 0;
    // Open tabs show the completion popup at once (the submit response also carries it).
    getIo()?.to(personalRoom(String(student._id))).emit('challenge:completed', { periodKey, coins, points, streak: streak.current, best: streak.best });
    void evaluateLifetimeBadgesQuietly(student);
    return { coins, points, streak };
  } catch (error) {
    console.warn('[daily-challenge] reward failed:', error.message);
    return { coins: 0, points: 0, streak: null };
  }
}
