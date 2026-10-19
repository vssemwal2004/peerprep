import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { isControlPlane } from '../platform/deployment.js';
import { PlatformAudit, University } from '../platform/models.js';
import { getTenant, validUniversityId } from '../platform/tenantConnections.js';
import { runForPlatform, runForTenant } from '../platform/tenantContext.js';
import { HttpError } from '../utils/errors.js';
import { scoreFeatures, scoreFromLevelCounts } from '../services/prepScore/engine.js';
import {
  getPrepScorePolicyWorkspace, LEVELS, MODULE_KEYS, normalizePrepScoreConfig, publishPrepScorePolicy,
  restorePrepScorePolicyAsDraft, savePrepScorePolicyDraft,
} from '../services/prepScore/policy.js';
import { prepScoreSyncStatus } from '../services/prepScore/sync.js';
import { previewPolicyImpact } from '../services/prepScore/impact.js';

const router = Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

router.use(requireAuth, requireAdmin, (req, res, next) => {
  if (!isControlPlane()) return next(new HttpError(403, 'Prep Score policy is managed by the Master Admin.'));
  return next();
});

/** Runs work against one university's data, or PeerPrep's own students ('platform'). */
async function inScope(universityId, work) {
  if (!universityId || universityId === 'platform') return runForPlatform(work);
  if (!validUniversityId(universityId)) throw new HttpError(400, 'Unknown university.');
  return runForTenant(await getTenant(universityId), work);
}

router.get('/', asyncRoute(async (req, res) => {
  const [workspace, universities] = await Promise.all([
    getPrepScorePolicyWorkspace(),
    University.find({ active: true, deletedAt: null }).select('universityId name').sort({ name: 1 }).lean(),
  ]);
  res.set('Cache-Control', 'private, no-store').json({
    ...workspace,
    universities: universities.map((row) => ({ id: row.universityId, name: row.name || row.universityId })),
  });
}));

router.put('/draft', asyncRoute(async (req, res) => {
  const draft = await savePrepScorePolicyDraft(req.body?.config, req.user._id, req.body?.changeReason);
  await PlatformAudit.create({ actor: String(req.user._id), action: 'prep_score.draft_saved', details: { version: draft.version } });
  res.json({ draft });
}));

/** Simulator: Easy/Medium/Hard counts per module in, module scores and the overall score out. */
router.post('/simulate', asyncRoute(async (req, res) => {
  const config = normalizePrepScoreConfig(req.body?.config);
  const input = req.body?.counts && typeof req.body.counts === 'object' ? req.body.counts : {};
  const counts = Object.fromEntries(MODULE_KEYS.map((key) => [key, Object.fromEntries(LEVELS.map((level) => {
    const value = Number(input[key]?.[level]);
    return [level, Number.isFinite(value) ? Math.min(100_000, Math.max(0, value)) : 0];
  }))]));
  const result = scoreFromLevelCounts(counts, scoreFeatures(null), config);
  res.json({ total: result.total, modules: Object.fromEntries(Object.entries(result.features).map(([key, value]) => [key, value.score])) });
}));

/** Impact of the draft (or a posted config) on one university's real students, before publishing. */
router.post('/impact', asyncRoute(async (req, res) => {
  const config = normalizePrepScoreConfig(req.body?.config);
  const universityId = String(req.body?.universityId || 'platform');
  res.json(await inScope(universityId, () => previewPolicyImpact(config)));
}));

router.get('/status', asyncRoute(async (req, res) => {
  const universityId = String(req.query?.universityId || 'platform');
  res.set('Cache-Control', 'private, no-store').json(await inScope(universityId, () => prepScoreSyncStatus()));
}));

router.post('/publish', asyncRoute(async (req, res) => {
  const active = await publishPrepScorePolicy(req.user._id, req.body?.changeReason);
  await PlatformAudit.create({ actor: String(req.user._id), action: 'prep_score.policy_published', details: { version: active.version, reason: String(req.body?.changeReason || '') } });
  res.json({ active });
}));

router.post('/versions/:version/restore', asyncRoute(async (req, res) => {
  const draft = await restorePrepScorePolicyAsDraft(req.params.version, req.user._id);
  await PlatformAudit.create({ actor: String(req.user._id), action: 'prep_score.version_restored', details: { from: Number(req.params.version), draft: draft.version } });
  res.json({ draft });
}));

export default router;
