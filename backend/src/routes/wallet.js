import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../utils/errors.js';
import { currentTenant } from '../platform/tenantContext.js';
import { allocateCoins, walletBalance, walletMovements } from '../platform/coins.js';
import User from '../models/User.js';

const router = Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.use(requireAuth, (req, res, next) => currentTenant()
  ? next() : next(new HttpError(404, 'Wallet is available in a university account')));

router.get('/', asyncRoute(async (req, res) => {
  const universityId = currentTenant().universityId;
  const [balance, movements] = await Promise.all([
    walletBalance(universityId, req.user), walletMovements(universityId, req.user),
  ]);
  const ids = [...new Set(movements.flatMap((row) => [row.fromUserId, row.toUserId]).filter(Boolean).map(String))];
  const people = ids.length ? await User.find({ _id: { $in: ids } }).select('name role').lean() : [];
  const names = new Map(people.map((person) => [String(person._id), person.name]));
  res.set('Cache-Control', 'private, no-store').json({
    universityId, role: req.user.role, balance,
    movements: movements.map((row) => ({
      id: row._id, kind: row.kind, amount: row.amount, createdAt: row.createdAt,
      fromRole: row.fromRole, toRole: row.toRole,
      fromName: row.fromUserId ? names.get(String(row.fromUserId)) || 'Former user' : 'PeerPrep',
      toName: row.toUserId ? names.get(String(row.toUserId)) || 'Former user' : 'University wallet',
    })),
  });
}));

router.get('/recipients', asyncRoute(async (req, res) => {
  if (!['admin', 'coordinator'].includes(req.user.role)) throw new HttpError(403, 'Only university admins and coordinators can allocate coins');
  const search = String(req.query.search || '').trim().slice(0, 80);
  const role = req.user.role === 'admin' ? 'coordinator' : 'student';
  const scope = req.user.role === 'coordinator' ? { teacherIds: req.user.coordinatorId } : {};
  const filter = { role, isActive: { $ne: false }, ...scope,
    ...(search ? { $or: ['name', 'email', role === 'student' ? 'studentId' : 'coordinatorId']
      .map((field) => ({ [field]: { $regex: escapeRegex(search), $options: 'i' } })) } : {}) };
  const users = await User.find(filter).select('name email studentId coordinatorId role').sort({ name: 1 }).limit(25).lean();
  res.set('Cache-Control', 'private, no-store').json({ recipients: users.map((user) => ({
    id: user._id, name: user.name, email: user.email,
    accountId: user.studentId || user.coordinatorId || '',
  })) });
}));

router.post('/allocate', asyncRoute(async (req, res) => {
  if (!['admin', 'coordinator'].includes(req.user.role)) throw new HttpError(403, 'Only university admins and coordinators can allocate coins');
  const targetId = String(req.body?.targetUserId || '');
  if (!mongoose.isValidObjectId(targetId)) throw new HttpError(400, 'Choose a valid recipient');
  const role = req.user.role === 'admin' ? 'coordinator' : 'student';
  const scope = req.user.role === 'coordinator' ? { teacherIds: req.user.coordinatorId } : {};
  const target = await User.findOne({ _id: targetId, role, isActive: { $ne: false }, ...scope }).select('_id').lean();
  if (!target) throw new HttpError(404, 'Recipient is not available for your account');
  const universityId = currentTenant().universityId;
  const result = await allocateCoins({
    universityId, actorId: req.user._id,
    fromRole: req.user.role === 'admin' ? 'university' : 'coordinator',
    fromUserId: req.user.role === 'coordinator' ? req.user._id : null,
    toRole: role, toUserId: target._id,
    amount: req.body?.amount, requestId: req.body?.requestId,
  });
  res.set('Cache-Control', 'private, no-store').json({ ...result, balance: await walletBalance(universityId, req.user) });
}));

export default router;
