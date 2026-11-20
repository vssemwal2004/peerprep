import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { getPlatformGuideProgress, updatePlatformGuideProgress } from './guides.service.js';

const router = Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const noStore = (res) => res.set('Cache-Control', 'private, no-store');

// Every signed-in person (student, coordinator, admin) keeps their own guide progress.
router.use(requireAuth);
router.get('/progress', asyncRoute(async (req, res) => noStore(res).json(await getPlatformGuideProgress(req.user))));
router.patch('/progress', asyncRoute(async (req, res) => noStore(res).json(await updatePlatformGuideProgress(req.user, req.body))));

export default router;
