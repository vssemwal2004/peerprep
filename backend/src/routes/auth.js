import { Router } from 'express';
import { routeLogin, routePasswordResetRequest } from '../platform/rootLogin.js';
import { getStudentGlobalRanking } from '../services/globalStudentRankingService.js';
import { forcePasswordChange, me, changePassword, changeAdminPassword, resetPassword, updateMe, updateMyAvatar, acknowledgeLearnerProgress, updatePracticeLanguage } from '../controllers/authController.js';
import { getStudentActivity, getStudentStats, debugStudentActivity } from '../controllers/activityController.js';
import { invalidateUserCache, requireAuth, requireStudent, requireFullStudent, requireStudentFeature, requireAnyStudentFeature } from '../middleware/auth.js';
import { getPrepScoreHistory, getStudentDashboard, getStudentRanking, recordStudentProblemView, recordStudentTopicView, refreshStudentChallenges, getStudentChallengeBadges } from '../controllers/studentDashboardController.js';
import { authLimiter, passwordResetLimiter, uploadLimiter } from '../middleware/rateLimiter.js';
import multer from 'multer';
import { endSession } from '../services/userSessions.js';
import { verifyToken } from '../utils/jwt.js';
import { deploymentRole } from '../platform/deployment.js';
import { currentTenant, runForPlatform, runForTenant } from '../platform/tenantContext.js';
import { getTenant } from '../platform/tenantConnections.js';
import { dailyCheckIn } from '../services/dailyCheckIn.js';
import { badgeHistory, evaluateMonthlyBadges } from '../services/monthlyBadges.js';
import { evaluateLifetimeBadges, lifetimeBadgeBoard } from '../services/lifetimeBadges.js';
const upload = multer();

function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

const router = Router();

// SECURITY: Rate limit authentication endpoints
router.post('/login', authLimiter, (req, res, next) => Promise.resolve(routeLogin(req, res)).catch(next));

// Signing out ends this session on the server too, so the next sign-in elsewhere is not asked to
// "end the other session". Only the session holding this cookie ends: an older, already replaced
// session signing out leaves the newer one alone (endSession matches the token).
async function endCookieSession(token) {
  let payload;
  try { payload = verifyToken(token); } catch { return; }
  const end = async () => { if (await endSession(payload.sub, token)) invalidateUserCache(payload.sub); };
  if (deploymentRole() !== 'shared') return end();
  const owner = payload.tenantId || 'platform';
  const here = currentTenant()?.universityId || 'platform';
  if (owner === here) return end();
  if (owner === 'platform') return runForPlatform(end);
  return runForTenant(await getTenant(owner), end);
}

// SECURITY: Logout endpoint to clear HttpOnly cookie
router.post('/logout', async (req, res) => {
  const token = req.cookies?.accessToken;
  if (token) await endCookieSession(token).catch((error) => console.warn('[AUTH] Session end failed:', error.message));
  res.clearCookie('accessToken', getAuthCookieOptions());
  res.json({ message: 'Logged out successfully' });
});

// A light "is this session still mine?" check pages make on focus and on a timer.
router.get('/session', requireAuth, (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json({ ok: true });
});

router.post('/password/change', requireAuth, changePassword);
router.post('/password/admin-change', requireAuth, changeAdminPassword);
router.post('/password/request-reset', passwordResetLimiter, (req, res, next) => Promise.resolve(routePasswordResetRequest(req, res)).catch(next));
router.post('/password/reset', passwordResetLimiter, resetPassword);
router.get('/me', requireAuth, me);
router.put('/me', requireAuth, updateMe);
router.put('/me/avatar', requireAuth, uploadLimiter, upload.single('avatar'), updateMyAvatar);
router.put('/me/learner-progress', requireAuth, acknowledgeLearnerProgress);
router.put('/me/practice-language', requireAuth, updatePracticeLanguage);
router.get('/activity/debug', requireAuth, debugStudentActivity);
router.get('/activity', requireAuth, requireAnyStudentFeature('dashboard', 'analysis', 'prep_coding', 'quickprep'), getStudentActivity);
router.get('/stats', requireAuth, requireStudentFeature('prep_coding'), getStudentStats);
router.get('/dashboard', requireAuth, requireStudent, requireFullStudent, requireStudentFeature('dashboard'), getStudentDashboard);
router.get('/ranking', requireAuth, requireStudent, requireFullStudent, requireAnyStudentFeature('rankings', 'prep_coins'), getStudentRanking);
// The student's own Prep Score history (profile graph); same access rule as the score itself.
router.get('/prep-score/history', requireAuth, requireStudent, requireFullStudent, requireAnyStudentFeature('rankings', 'prep_coins'), getPrepScoreHistory);
router.get('/global-ranking', requireAuth, requireStudent, requireFullStudent, requireStudentFeature('rankings'), async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    // Identity and score are server-owned; query/body student IDs and points are ignored.
    res.json({ ranking: await getStudentGlobalRanking(req.user) });
  } catch (error) { next(error); }
});
router.post('/engagement/refresh', requireAuth, requireStudent, requireFullStudent, requireStudentFeature('quickprep'), refreshStudentChallenges);
router.get('/engagement/badges', requireAuth, requireStudent, requireFullStudent, requireStudentFeature('quickprep'), getStudentChallengeBadges);
// First app open of the day: heatmap login day, daily login coin, badge re-check. Idempotent per day.
router.post('/daily-checkin', requireAuth, requireStudent, requireFullStudent, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    res.json(await dailyCheckIn(req.user) || { firstToday: false, coins: null });
  } catch (error) { next(error); }
});
// Monthly badges: levels 1-10 per badge, targets from the student's own recent months.
router.get('/badges/monthly', requireAuth, requireStudent, requireFullStudent, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    const [current, history] = await Promise.all([evaluateMonthlyBadges(req.user), badgeHistory(req.user._id)]);
    res.json({ ...current, history });
  } catch (error) { next(error); }
});
// Lifetime milestone badges (permanent): progress per track, earned badges. Awards anything newly crossed.
router.get('/badges/lifetime', requireAuth, requireStudent, requireFullStudent, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    await evaluateLifetimeBadges(req.user);
    res.json({ tracks: await lifetimeBadgeBoard(req.user) });
  } catch (error) { next(error); }
});
router.post('/dashboard/problem-view', requireAuth, requireStudent, requireFullStudent, requireStudentFeature('prep_coding'), recordStudentProblemView);
router.post('/dashboard/topic-view', requireAuth, requireStudent, requireFullStudent, requireStudentFeature('learning'), recordStudentTopicView);

export default router;
