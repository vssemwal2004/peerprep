// Student Prep Readiness API (own data only). Mounted at /api/student/prep-readiness behind
// requireAuth, requireStudent, requireFullStudent and the prep_coding feature.
import { Router } from 'express';
import User from '../models/User.js';
import { HttpError } from '../utils/errors.js';
import { getSharedCodingCatalog } from '../services/studentDashboardService.js';
import { ledgerOf } from '../services/prepScore/submitOutcome.js';
import { istDay, topicUsageOn } from '../services/prepScore/points.js';
import { getActiveReadinessPolicy } from '../services/prepReadiness/policy.js';
import { syncEvidence } from '../services/prepReadiness/evidence.js';
import { readinessAccess, readinessFor, readinessSummary } from '../services/prepReadiness/readiness.js';
import { recommendPractice } from '../services/prepReadiness/recommend.js';
import { TRACK_KEYS } from '../services/prepReadiness/seed.js';

const router = Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const noStore = (res) => res.set('Cache-Control', 'private, no-store');

router.get('/', asyncRoute(async (req, res) => {
  noStore(res).json(await readinessFor(req.user, { range: String(req.query.range || '30d') }));
}));

router.get('/summary', asyncRoute(async (req, res) => {
  const summary = await readinessSummary(req.user, { sync: true });
  noStore(res).json({ ...summary, sharing: req.user.sharePrepReadiness === true });
}));

/** ANVI Practice Next for one track, quota-aware for today. */
router.get('/recommendations', asyncRoute(async (req, res) => {
  const track = TRACK_KEYS.includes(String(req.query.track)) ? String(req.query.track) : 'pbc';
  const access = await readinessAccess(req.user);
  if (!access.coding) return noStore(res).json({ track, items: [], empty: 'Prep Coding is not enabled for your account.' });
  const now = new Date();
  const sharedCatalog = await getSharedCodingCatalog().catch(() => []);
  const [policy, evidenceMap, { ledger, config }] = await Promise.all([
    getActiveReadinessPolicy(), syncEvidence([req.user._id], { sharedCatalog, now }), ledgerOf(req.user, now),
  ]);
  const today = istDay(now);
  const limit = Number(config?.modules?.coding?.dailyTopicLimit) || 0;
  const result = await recommendPractice({
    policy, track, evidence: evidenceMap.get(String(req.user._id)) || [], usage: topicUsageOn(ledger, today), limit,
    limited: today >= (config?.points?.topicLimitFrom || '0000'), shared: sharedCatalog.length > 0,
    count: Math.min(10, Math.max(1, Number(req.query.count) || 5)),
  });
  return noStore(res).json(result);
}));

/** Prep Mate sharing (off by default). */
router.put('/sharing', asyncRoute(async (req, res) => {
  if (typeof req.body?.share !== 'boolean') throw new HttpError(400, 'share must be true or false.');
  await User.updateOne({ _id: req.user._id }, { $set: { sharePrepReadiness: req.body.share } });
  res.json({ sharing: req.body.share });
}));

export default router;
