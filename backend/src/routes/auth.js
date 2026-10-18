import { Router } from 'express';
import { routeLogin, routePasswordResetRequest } from '../platform/rootLogin.js';
import { getStudentGlobalRanking } from '../services/globalStudentRankingService.js';
import { forcePasswordChange, me, changePassword, changeAdminPassword, resetPassword, updateMe, updateMyAvatar, acknowledgeLearnerProgress, updatePracticeLanguage } from '../controllers/authController.js';
import { getStudentActivity, getStudentStats, debugStudentActivity } from '../controllers/activityController.js';
import { requireAuth, requireStudent, requireFullStudent } from '../middleware/auth.js';
import { getStudentDashboard, getStudentRanking, recordStudentProblemView, recordStudentTopicView, refreshStudentChallenges, getStudentChallengeBadges } from '../controllers/studentDashboardController.js';
import { authLimiter, passwordResetLimiter, uploadLimiter } from '../middleware/rateLimiter.js';
import multer from 'multer';
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

// SECURITY: Logout endpoint to clear HttpOnly cookie
router.post('/logout', (req, res) => {
  res.clearCookie('accessToken', getAuthCookieOptions());
  res.json({ message: 'Logged out successfully' });
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
router.get('/activity', requireAuth, getStudentActivity);
router.get('/stats', requireAuth, getStudentStats);
router.get('/dashboard', requireAuth, requireStudent, requireFullStudent, getStudentDashboard);
router.get('/ranking', requireAuth, requireStudent, requireFullStudent, getStudentRanking);
router.get('/global-ranking', requireAuth, requireStudent, requireFullStudent, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    // Identity and score are server-owned; query/body student IDs and points are ignored.
    res.json({ ranking: await getStudentGlobalRanking(req.user) });
  } catch (error) { next(error); }
});
router.post('/engagement/refresh', requireAuth, requireStudent, requireFullStudent, refreshStudentChallenges);
router.get('/engagement/badges', requireAuth, requireStudent, requireFullStudent, getStudentChallengeBadges);
router.post('/dashboard/problem-view', requireAuth, requireStudent, requireFullStudent, recordStudentProblemView);
router.post('/dashboard/topic-view', requireAuth, requireStudent, requireFullStudent, recordStudentTopicView);

export default router;
