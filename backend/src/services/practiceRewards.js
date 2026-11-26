// Everything a practice submission can earn or cost, in one place, for both solve paths (local
// compiler jobs and shared library questions):
//   - Prep Score: points for a first solve (topic split), or a small loss for a wrong answer.
//   - Daily challenge: an accepted solve of today's challenge completes it at once (coins, points,
//     Prep Streak) instead of waiting for the challenge panel to be opened.
//   - Badges: monthly and lifetime badges are re-checked in the background.
// Solving a question no longer pays Prep Coins (2026-11-21). Never throws: rewards must not break
// the submission.
import mongoose from 'mongoose';
import User from '../models/User.js';
import { MissionAssignment } from '../models/AdaptiveEngagement.js';
import { periodsAt } from './adaptiveEngagementRules.js';
import { prepScoreAfterSubmit } from './prepScore/submitOutcome.js';
import { evaluateMonthlyBadgesQuietly } from './monthlyBadges.js';
import { evaluateLifetimeBadgesQuietly } from './lifetimeBadges.js';
import { prepStreakFor } from './prepStreak.js';
import { getEarningConfig } from '../platform/coinEarn.js';
import { getActivePrepScorePolicy } from './prepScore/policy.js';
import { studentHasFeature } from './studentFeatureAccess.js';
import { readinessAfterSolve } from './prepReadiness/readiness.js';
import { openQuotaAlternative } from './prepReadiness/recommend.js';
import { coachTip } from './prepScore/coach.js';

async function studentOf(userOrId) {
  if (userOrId && typeof userOrId === 'object' && userOrId.role && userOrId._id) return userOrId;
  if (!mongoose.isValidObjectId(String(userOrId))) return null;
  return User.findById(userOrId).select('-password').lean();
}

/** Completes today's daily challenge if this solve finished it. Returns the completion or null. */
async function settleDailyChallenge(student, now) {
  if (!studentHasFeature(student, 'quickprep')) return null;
  const periodKey = periodsAt(now).daily.periodKey;
  const filter = { studentId: new mongoose.Types.ObjectId(String(student._id)), kind: 'daily', periodKey };
  const before = await MissionAssignment.findOne(filter).select('earnedAt').lean();
  if (!before || before.earnedAt) return null;
  const { refreshAdaptiveEngagement } = await import('./adaptiveEngagementService.js');
  await refreshAdaptiveEngagement(student, now);
  const after = await MissionAssignment.findOne(filter).select('earnedAt').lean();
  if (!after?.earnedAt) return null;
  const [streak, { earning }, policy] = await Promise.all([prepStreakFor(student._id, now), getEarningConfig(), getActivePrepScorePolicy()]);
  return {
    completed: true, periodKey,
    coins: studentHasFeature(student, 'prep_coins') ? Number(earning.challenge) || 0 : 0,
    points: Number(policy.config?.points?.dailyChallenge) || 0,
    streak: streak.current, best: streak.best,
  };
}

/** Today's daily challenge when it is assigned and not finished yet: { open, points, coins }, else null. */
async function openChallenge(student, now) {
  if (!studentHasFeature(student, 'quickprep')) return null;
  const periodKey = periodsAt(now).daily.periodKey;
  const plan = await MissionAssignment.findOne({ studentId: new mongoose.Types.ObjectId(String(student._id)), kind: 'daily', periodKey }).select('earnedAt').lean();
  if (!plan || plan.earnedAt) return null;
  const [{ earning }, policy] = await Promise.all([getEarningConfig(), getActivePrepScorePolicy()]);
  return {
    open: true,
    coins: studentHasFeature(student, 'prep_coins') ? Number(earning.challenge) || 0 : 0,
    // Whether it adds Prep Score at all; the exact change (growth curve) is known only once it is done.
    scores: (Number(policy.config?.points?.dailyChallenge) || 0) > 0,
  };
}

/**
 * After a judged practice submission. Returns { prepScore, challenge } for the result screen.
 * `accepted`: the submission passed. `alreadySolved`: the student had solved this problem before.
 */
export async function afterPracticeSubmit({ user, source, problemId, accepted, alreadySolved = false, now = new Date() }) {
  const result = { prepScore: null, challenge: null, readiness: null };
  try {
    const student = await studentOf(user);
    if (!student || student.role !== 'student' || student.accessScope === 'assessment_only') return result;
    if (accepted && !alreadySolved) {
      result.challenge = await settleDailyChallenge(student, now).catch((error) => {
        console.warn('[practice-rewards] daily challenge:', error.message);
        return null;
      });
    }
    result.prepScore = await prepScoreAfterSubmit(student, { source, problemId, accepted, alreadySolved }, now).catch((error) => {
      console.warn('[practice-rewards] Prep Score:', error.message);
      return null;
    });
    // The challenge's real Prep Score change (on the growth curve), not its activity points.
    if (result.challenge && result.prepScore?.challengePoints !== undefined) result.challenge.points = result.prepScore.challengePoints;
    // Prep Readiness: the solve's primary topic and the SBC/PBC change; and when some or all of its
    // tags were full, a comparable problem that still has open Prep Score quota today.
    if (accepted && result.prepScore?.kind === 'solve') {
      result.readiness = await readinessAfterSolve(student, result.prepScore.problemKey, { now }).catch((error) => {
        console.warn('[practice-rewards] readiness:', error.message);
        return null;
      });
      if (result.prepScore.fullTopics?.length && !result.prepScore.alreadySolved) {
        result.prepScore.alternative = await openQuotaAlternative(student, { now, excludeKeys: [result.prepScore.problemKey] }).catch(() => null);
      }
    }
    // Prep Coach: the one tip shown at the top of the screen (coach.js). Never blocks the result.
    if (result.prepScore) {
      const challenge = accepted && !result.challenge ? await openChallenge(student, now).catch(() => null) : null;
      result.prepScore.coach = coachTip({
        outcome: result.prepScore,
        difficulty: result.prepScore.difficulty,
        difficulties: result.prepScore.difficulties,
        solvePoints: result.prepScore.solvePoints,
        challenge,
        wrongCount: result.prepScore.wrongCount,
      });
    }
    if (accepted) {
      void evaluateMonthlyBadgesQuietly(student);
      void evaluateLifetimeBadgesQuietly(student);
    }
  } catch (error) {
    console.warn('[practice-rewards]', error.message);
  }
  return result;
}
