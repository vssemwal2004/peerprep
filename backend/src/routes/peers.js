import { Router } from 'express';
import { peerActionLimiter, peerSearchLimiter } from '../middleware/rateLimiter.js';
import {
  cancelPrepMateRequest, ensurePeerIndexes, getNetworkSummary, getPeerProfile, listNetwork,
  removePrepMate, requestPrepMate, respondPrepMateRequest, searchPeers,
} from '../services/peerNetworkService.js';
import { compareWithMate, getCircle, getMateDirectory, getSuggestions, nudgeMate } from '../services/peerCircleService.js';

// Mounted at /student/peers behind requireAuth, requireStudent, requireFullStudent and the
// 'peers' feature. Every query is limited to the caller's university: their university database,
// or in the shared database their institution-managed college (see peerScope).
const router = Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const send = (res, body) => res.set('Cache-Control', 'private, no-store').json(body);

router.use((req, res, next) => ensurePeerIndexes().then(() => next(), next));

router.get('/search', peerSearchLimiter, asyncRoute(async (req, res) => send(res, await searchPeers(req.user, req.query.q))));
router.get('/me/summary', asyncRoute(async (req, res) => send(res, await getNetworkSummary(req.user))));
router.get('/me/network', asyncRoute(async (req, res) => send(res, await listNetwork(req.user, String(req.query.tab || ''), { before: req.query.before }))));

// Prep Mates circle (accepted Prep Mates only, practice-only data): ranking, directory, compare, Prep Ping.
router.get('/me/circle', asyncRoute(async (req, res) => send(res, await getCircle(req.user, {
  period: String(req.query.period || 'week'), page: req.query.page, limit: req.query.limit, q: String(req.query.q || ''),
}))));
router.get('/me/mates', asyncRoute(async (req, res) => send(res, await getMateDirectory(req.user, {
  q: String(req.query.q || ''), sort: String(req.query.sort || 'recent'), page: req.query.page,
}))));
router.get('/me/suggestions', peerSearchLimiter, asyncRoute(async (req, res) => send(res, await getSuggestions(req.user))));
router.get('/:id/compare', peerSearchLimiter, asyncRoute(async (req, res) => send(res, await compareWithMate(req.user, req.params.id))));
router.post('/:id/nudge', peerActionLimiter, asyncRoute(async (req, res) => send(res, await nudgeMate(req.user, req.params.id))));

router.post('/requests/:requestId/accept', peerActionLimiter, asyncRoute(async (req, res) => send(res, await respondPrepMateRequest(req.user, req.params.requestId, 'accept'))));
router.post('/requests/:requestId/decline', peerActionLimiter, asyncRoute(async (req, res) => send(res, await respondPrepMateRequest(req.user, req.params.requestId, 'decline'))));

router.get('/:id/network', peerSearchLimiter, asyncRoute(async (req, res) => send(res, await listNetwork(req.user, String(req.query.tab || ''), { before: req.query.before, ownerId: req.params.id }))));
router.get('/:id', peerSearchLimiter, asyncRoute(async (req, res) => send(res, await getPeerProfile(req.user, req.params.id))));
router.post('/:id/mate', peerActionLimiter, asyncRoute(async (req, res) => send(res, await requestPrepMate(req.user, req.params.id))));
router.delete('/:id/mate-request', peerActionLimiter, asyncRoute(async (req, res) => send(res, await cancelPrepMateRequest(req.user, req.params.id))));
router.delete('/:id/mate', peerActionLimiter, asyncRoute(async (req, res) => send(res, await removePrepMate(req.user, req.params.id))));

export default router;
