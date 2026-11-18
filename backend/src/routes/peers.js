import { Router } from 'express';
import { peerActionLimiter, peerSearchLimiter } from '../middleware/rateLimiter.js';
import {
  cancelPrepMateRequest, ensurePeerIndexes, getNetworkSummary, getPeerProfile, listNetwork,
  removePrepMate, requestPrepMate, respondPrepMateRequest, searchPeers,
} from '../services/peerNetworkService.js';

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

router.post('/requests/:requestId/accept', peerActionLimiter, asyncRoute(async (req, res) => send(res, await respondPrepMateRequest(req.user, req.params.requestId, 'accept'))));
router.post('/requests/:requestId/decline', peerActionLimiter, asyncRoute(async (req, res) => send(res, await respondPrepMateRequest(req.user, req.params.requestId, 'decline'))));

router.get('/:id/network', peerSearchLimiter, asyncRoute(async (req, res) => send(res, await listNetwork(req.user, String(req.query.tab || ''), { before: req.query.before, ownerId: req.params.id }))));
router.get('/:id', peerSearchLimiter, asyncRoute(async (req, res) => send(res, await getPeerProfile(req.user, req.params.id))));
router.post('/:id/mate', peerActionLimiter, asyncRoute(async (req, res) => send(res, await requestPrepMate(req.user, req.params.id))));
router.delete('/:id/mate-request', peerActionLimiter, asyncRoute(async (req, res) => send(res, await cancelPrepMateRequest(req.user, req.params.id))));
router.delete('/:id/mate', peerActionLimiter, asyncRoute(async (req, res) => send(res, await removePrepMate(req.user, req.params.id))));

export default router;
