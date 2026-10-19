import mongoose from 'mongoose';
import { runForTenant } from './tenantContext.js';
import { getTenant } from './tenantConnections.js';
import { HttpError } from '../utils/errors.js';
import User from '../models/User.js';
import { University, PlatformCoinCharge, PlatformCoinMovement, PlatformCoinWallet } from './models.js';
import { PLATFORM_WALLET_SCOPE } from './coins.js';
import { COIN_FEATURES } from './coinFeatures.js';
import { getCoinPricing } from './coinSpend.js';
import { coinFlow } from './platformInsights.js';

// Master Admin Prep Coin console: live summary, ledger and account wallets across every scope.

const DAY_MS = 86_400_000;
const QUERY_MS = 8_000;
const KINDS = ['initial', 'topup', 'admin_to_coordinator', 'coordinator_to_student', 'superadmin_to_coordinator', 'superadmin_to_student', 'student_spend', 'student_refund'];
const featureLabel = new Map(COIN_FEATURES.map((feature) => [feature.key, feature.label]));
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Names for wallet owners. University users live in that university's database, so each scope is
// looked up in its own tenant; an unreachable university falls back to a neutral label.
async function ownerNames(pairs) {
  const byScope = new Map();
  for (const { universityId, userId } of pairs) {
    if (!userId || !mongoose.isValidObjectId(userId)) continue;
    if (!byScope.has(universityId)) byScope.set(universityId, new Set());
    byScope.get(universityId).add(String(userId));
  }
  const names = new Map();
  await Promise.all([...byScope].map(async ([universityId, ids]) => {
    const find = () => User.find({ _id: { $in: [...ids] } }).select('name email studentId coordinatorId').lean();
    try {
      const people = universityId === PLATFORM_WALLET_SCOPE ? await find()
        : await runForTenant(await getTenant(universityId, { includeInactive: true }), find);
      for (const person of people) names.set(`${universityId}:${person._id}`, { name: person.name || person.email, accountId: person.studentId || person.coordinatorId || '' });
    } catch { /* names stay unresolved for this scope */ }
  }));
  return names;
}

async function universityNames() {
  const rows = await University.find({ deletedAt: null }).select('universityId name').lean();
  return new Map(rows.map((row) => [row.universityId, row.name]));
}

const scopeLabel = (universities, universityId) => (universityId === PLATFORM_WALLET_SCOPE ? 'PeerPrep main' : universities.get(universityId) || universityId);

function describeParty(role, userId, universityId, names, universities) {
  if (userId) return names.get(`${universityId}:${userId}`)?.name || (role === 'student' ? 'Student' : role === 'coordinator' ? 'Coordinator' : 'Account');
  if (role === 'university') return `${scopeLabel(universities, universityId)} wallet`;
  if (role === 'platform' || role === 'superadmin') return 'PeerPrep';
  return titleRole(role);
}
const titleRole = (role) => String(role || 'PeerPrep').replace(/^\w/, (letter) => letter.toUpperCase());

async function presentMovements(rows) {
  const [names, universities] = await Promise.all([
    ownerNames(rows.flatMap((row) => [{ universityId: row.universityId, userId: row.fromUserId }, { universityId: row.universityId, userId: row.toUserId }])),
    universityNames(),
  ]);
  return rows.map((row) => ({
    id: String(row._id),
    kind: row.kind,
    amount: row.amount,
    createdAt: row.createdAt,
    universityId: row.universityId,
    scope: scopeLabel(universities, row.universityId),
    from: describeParty(row.fromRole, row.fromUserId, row.universityId, names, universities),
    to: describeParty(row.toRole, row.toUserId, row.universityId, names, universities),
    feature: row.featureKey ? featureLabel.get(row.featureKey) || row.featureKey : null,
  }));
}

export async function coinConsoleSummary(now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [universities, walletTotals, flow, featureSpend, charges, freeUses, distributed, recent, pricing, topWallets] = await Promise.all([
    University.find({ deletedAt: null }).select('universityId name coinBalance active logo').sort({ coinBalance: -1, name: 1 }).lean(),
    PlatformCoinWallet.aggregate([
      { $group: { _id: { platform: { $eq: ['$universityId', PLATFORM_WALLET_SCOPE] }, role: '$role' }, balance: { $sum: '$balance' }, holders: { $sum: { $cond: [{ $gt: ['$balance', 0] }, 1, 0] } } } },
    ]).option({ maxTimeMS: QUERY_MS }),
    coinFlow(now, 30),
    PlatformCoinMovement.aggregate([
      { $match: { kind: { $in: ['student_spend', 'student_refund'] }, createdAt: { $gte: since } } },
      { $group: { _id: { feature: '$featureKey', kind: '$kind' }, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]).option({ maxTimeMS: QUERY_MS }),
    PlatformCoinCharge.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]).option({ maxTimeMS: QUERY_MS }),
    PlatformCoinCharge.countDocuments({ createdAt: { $gte: since }, freeQuota: true, status: 'captured' }).maxTimeMS(QUERY_MS),
    PlatformCoinMovement.aggregate([
      { $match: { kind: { $in: ['admin_to_coordinator', 'coordinator_to_student'] }, createdAt: { $gte: since } } },
      { $group: { _id: '$universityId', amount: { $sum: '$amount' } } },
    ]).option({ maxTimeMS: QUERY_MS }),
    PlatformCoinMovement.find().sort({ createdAt: -1 }).limit(12).lean(),
    getCoinPricing({ fresh: true }).catch(() => null),
    PlatformCoinWallet.find({ balance: { $gt: 0 } }).sort({ balance: -1 }).limit(6).lean(),
  ]);
  const total = (platform, role) => walletTotals.filter((row) => row._id.platform === platform && (!role || row._id.role === role));
  const sumOf = (rows, key) => rows.reduce((sum, row) => sum + row[key], 0);
  const spent = flow.byKind.find((row) => row.kind === 'student_spend')?.amount || 0;
  const refunded = flow.byKind.find((row) => row.kind === 'student_refund')?.amount || 0;
  const issued = flow.byKind.filter((row) => ['initial', 'topup', 'superadmin_to_coordinator', 'superadmin_to_student'].includes(row.kind)).reduce((sum, row) => sum + row.amount, 0);
  const shared = new Map(distributed.map((row) => [row._id, row.amount]));
  const chargeCount = Object.fromEntries(charges.map((row) => [row._id, row.n]));
  const [movements, holderNames, names] = await Promise.all([
    presentMovements(recent),
    ownerNames(topWallets.map((wallet) => ({ universityId: wallet.universityId, userId: wallet.userId }))),
    universityNames(),
  ]);

  return {
    generatedAt: now.toISOString(),
    totals: {
      universityWallets: universities.reduce((sum, row) => sum + (row.coinBalance || 0), 0),
      universityAccounts: sumOf(total(false), 'balance'),
      mainAccounts: sumOf(total(true), 'balance'),
      holders: sumOf(walletTotals, 'holders'),
      students: sumOf(walletTotals.filter((row) => row._id.role === 'student'), 'balance'),
      coordinators: sumOf(walletTotals.filter((row) => row._id.role === 'coordinator'), 'balance'),
    },
    month: { issued, spent, refunded, netSpent: Math.max(0, spent - refunded), charges: chargeCount.captured || 0, refunds: chargeCount.refunded || 0, pending: chargeCount.pending || 0, freeUses },
    trend: flow.trend,
    byKind: flow.byKind,
    features: COIN_FEATURES.map((feature) => {
      const spend = featureSpend.find((row) => row._id.feature === feature.key && row._id.kind === 'student_spend');
      const refund = featureSpend.find((row) => row._id.feature === feature.key && row._id.kind === 'student_refund');
      const price = pricing?.features?.[feature.key] || {};
      return { key: feature.key, label: feature.label, price: Number(price.price) || 0, freePerMonth: Number(price.freePerMonth) || 0, spent: spend?.amount || 0, uses: spend?.count || 0, refunded: refund?.amount || 0 };
    }),
    pricingVersion: pricing?.version ?? 0,
    universities: universities.map((row) => ({ universityId: row.universityId, name: row.name, active: row.active !== false, logo: row.logo?.url || '', balance: row.coinBalance || 0, distributed30d: shared.get(row.universityId) || 0 })),
    topHolders: topWallets.map((wallet) => ({
      id: String(wallet._id), role: wallet.role, balance: wallet.balance,
      scope: wallet.universityId === PLATFORM_WALLET_SCOPE ? 'PeerPrep main' : names.get(wallet.universityId) || wallet.universityId,
      name: holderNames.get(`${wallet.universityId}:${wallet.userId}`)?.name || (wallet.role === 'student' ? 'Student' : 'Coordinator'),
    })),
    recent: movements,
  };
}

// Full ledger, newest first. Filters: kind or kind group, scope (university ID or "main"); cursor paging.
export async function coinLedger(query = {}) {
  const filter = {};
  const kind = String(query.kind || '');
  if (kind) {
    const groups = { issued: ['initial', 'topup', 'superadmin_to_coordinator', 'superadmin_to_student'], shared: ['admin_to_coordinator', 'coordinator_to_student'], spent: ['student_spend'], refunded: ['student_refund'] };
    if (groups[kind]) filter.kind = { $in: groups[kind] };
    else if (KINDS.includes(kind)) filter.kind = kind;
    else throw new HttpError(400, 'Invalid movement type');
  }
  const scope = String(query.scope || '');
  if (scope) {
    if (scope === 'main') filter.universityId = PLATFORM_WALLET_SCOPE;
    else if (/^[a-z0-9][a-z0-9-]{1,62}$/.test(scope)) filter.universityId = scope;
    else throw new HttpError(400, 'Invalid wallet scope');
  }
  if (query.before) {
    const before = new Date(String(query.before));
    if (Number.isNaN(before.getTime())) throw new HttpError(400, 'Invalid cursor');
    filter.createdAt = { $lt: before };
  }
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 40));
  const rows = await PlatformCoinMovement.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).maxTimeMS(QUERY_MS).lean();
  const page = rows.slice(0, limit);
  return { entries: await presentMovements(page), nextCursor: rows.length > limit ? page.at(-1).createdAt : null };
}

// Wallets of PeerPrep's own (main database) coordinators and students, largest balance first.
export async function coinAccounts(query = {}) {
  const role = String(query.role || '');
  if (role && !['coordinator', 'student'].includes(role)) throw new HttpError(400, 'Choose coordinators or students');
  const search = String(query.search || '').trim().slice(0, 80);
  const page = Math.max(1, Math.min(10_000, Number.parseInt(query.page, 10) || 1));
  const filter = { universityId: PLATFORM_WALLET_SCOPE, ...(role ? { role } : {}) };
  if (search) {
    const regex = { $regex: escapeRegex(search), $options: 'i' };
    const people = await User.find({ role: role || { $in: ['coordinator', 'student'] }, $or: [{ name: regex }, { email: regex }, { studentId: regex }, { coordinatorId: regex }] }).select('_id').limit(200).lean();
    filter.userId = { $in: people.map((person) => person._id) };
  }
  const [wallets, total] = await Promise.all([
    PlatformCoinWallet.find(filter).sort({ balance: -1, _id: 1 }).skip((page - 1) * 25).limit(25).maxTimeMS(QUERY_MS).lean(),
    PlatformCoinWallet.countDocuments(filter).maxTimeMS(QUERY_MS),
  ]);
  const people = wallets.length ? await User.find({ _id: { $in: wallets.map((wallet) => wallet.userId) } }).select('name email studentId coordinatorId').lean() : [];
  const byId = new Map(people.map((person) => [String(person._id), person]));
  return {
    total, page, pageSize: 25,
    accounts: wallets.map((wallet) => {
      const person = byId.get(String(wallet.userId)) || {};
      return { id: String(wallet.userId), role: wallet.role, balance: wallet.balance, updatedAt: wallet.updatedAt, name: person.name || 'Former user', email: person.email || '', accountId: person.studentId || person.coordinatorId || '' };
    }),
  };
}
