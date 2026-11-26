// /api/resume/review/jd-match — ANVI Resume JD Match (opt-in, paid in Prep Coins).
// Mounted under /resume (full student + Prep Resume); this router also needs the opt-in feature,
// checked before anything else so a student without it is never charged.
import { Router } from 'express';
import { requireStudentFeature } from '../../middleware/auth.js';
import { pendingResumeAction } from '../../middleware/pendingResumeAction.js';
import { resultsPollLimiter } from '../../middleware/rateLimiter.js';
import { HttpError } from '../../utils/errors.js';
import { jdMatchService } from './jdMatch.service.js';
import { JD_MATCH_FEATURE } from './jdMatch.limits.js';

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

export function createJdMatchRouter({ service = null } = {}) {
  const router = Router();
  const jobs = () => service || jdMatchService();
  router.use(requireStudentFeature(JD_MATCH_FEATURE));
  router.use((req, res, next) => (req.user?.role === 'student' ? next() : next(new HttpError(403, 'ANVI JD Match is for student accounts.'))));
  router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

  router.get('/', asyncRoute(async (req, res) => res.json(await jobs().overview(req.user))));

  router.post('/', pendingResumeAction(), asyncRoute(async (req, res) => {
    const header = req.get('X-Prep-Coin-Cost');
    const expectedCost = header === undefined || header === '' ? undefined : Number(header);
    const result = await jobs().start(req.user, req.body || {}, { expectedCost: Number.isFinite(expectedCost) ? expectedCost : undefined });
    res.status(result.match.status === 'done' ? 200 : 202).json(result);
  }));

  router.get('/:id', resultsPollLimiter, asyncRoute(async (req, res) => {
    const match = await jobs().read(req.user, req.params.id);
    if (!match) throw new HttpError(404, 'This check was not found.');
    res.json({ match });
  }));
  return router;
}

export default createJdMatchRouter();
