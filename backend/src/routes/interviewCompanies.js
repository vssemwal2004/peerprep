import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { HttpError } from '../utils/errors.js';
import { isUniversity } from '../platform/deployment.js';
import { companyTagProgress, decideCompany, listCompanySuggestions, setVoteThreshold } from '../platform/interviewCompanies.js';

const router = Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
// Interview reports live centrally, so only the super admin (control plane) or a standalone admin moderates companies.
const requireSuperAdmin = (req, res, next) => (isUniversity()
  ? next(new HttpError(403, 'Interview companies are managed by the super admin.')) : requireAdmin(req, res, next));

router.use(asyncRoute(requireAuth), requireSuperAdmin, (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.get('/admin/suggestions', asyncRoute(async (req, res) => res.json(await listCompanySuggestions(req.query))));
router.post('/admin/suggestions/:key/decision', asyncRoute(async (req, res) => res.json(await decideCompany(req.user, req.params.key, req.body || {}))));
router.get('/admin/tag-progress', asyncRoute(async (req, res) => res.json(await companyTagProgress(req.query))));
router.put('/admin/settings', asyncRoute(async (req, res) => res.json({ threshold: await setVoteThreshold(req.body?.voteThreshold) })));

export default router;
