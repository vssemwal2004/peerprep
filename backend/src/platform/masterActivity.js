// Master Admin activity log: one timeline for the control plane, merged from
//   platform  — PlatformAudit (university management, shared content, Prep Score / Prep Coin /
//               Prep Readiness policy changes)
//   workspace — Activity rows written by admins in PeerPrep's own workspace (sign-ins, students,
//               assessments, coordinators, events, master data …)
// University databases are never read here; their admin and coordinator logs stay isolated.
import User from '../models/User.js';
import Activity from '../models/Activity.js';
import { PlatformAudit } from './models.js';
import { HttpError } from '../utils/errors.js';

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;
export const RANGE_DAYS = Object.freeze([1, 7, 10, 30]);
const PLATFORM_CATEGORIES = new Set(['university', 'publication', 'prep_score', 'prep_coin', 'prep_readiness', 'wallet', 'pricing']);
const SENSITIVE_PLATFORM = /delete|remove|restore|rotat|discard|revoke|disable/i;
const SENSITIVE_WORKSPACE = ['DELETE', 'BULK_DELETE', 'ARCHIVE', 'PASSWORD_CHANGE'];
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const istDay = (date) => new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Start of the window: midnight IST, `days` calendar days including today. */
export function windowStart(days, now = new Date()) {
  const today = istDay(now);
  return new Date(Date.parse(`${today}T00:00:00Z`) - IST_OFFSET_MS - (days - 1) * DAY_MS);
}

function platformDetail(details = {}) {
  return String(details.reason || details.name || details.title || details.email || details.universityName || '').slice(0, 240);
}

/** Validated query → filters for both sources. */
export function parseQuery(query = {}) {
  const days = RANGE_DAYS.includes(Number(query.days)) ? Number(query.days) : 10;
  const source = ['platform', 'workspace'].includes(String(query.source)) ? String(query.source) : 'all';
  const category = String(query.category || query.action || '').trim().toLowerCase();
  if (category && !/^[a-z_]{2,40}$/.test(category)) throw new HttpError(400, 'Invalid category');
  const actor = String(query.actor || '').trim().toLowerCase().slice(0, 200);
  const q = String(query.q || '').trim().slice(0, 80);
  let before = null;
  if (query.before) {
    before = new Date(String(query.before));
    if (Number.isNaN(before.getTime())) throw new HttpError(400, 'Invalid cursor');
  }
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 50));
  return { days, source, category, actor, q, before, limit };
}

/**
 * Mongo filters for each source (null = source excluded by the filters). `admins`: Map(email →
 * user) of control-plane admins.
 */
function sourceFilters({ days, source, category, actor, q }, admins, now) {
  const since = windowStart(days, now);
  let platform = source === 'workspace' ? null : { createdAt: { $gte: since } };
  let workspace = source === 'platform' ? null : { createdAt: { $gte: since }, userRole: 'admin' };
  if (category) {
    if (PLATFORM_CATEGORIES.has(category)) {
      workspace = null;
      if (platform) platform.action = { $regex: `^${escapeRegex(category)}(\\.|$)` };
    } else {
      platform = null;
      if (workspace) {
        if (category === 'login') workspace.actionType = { $in: ['LOGIN', 'LOGOUT'] };
        else workspace.targetType = category.toUpperCase();
      }
    }
  }
  if (actor) {
    const user = admins.get(actor);
    if (platform) platform.actor = user ? String(user._id) : '__none__';
    if (workspace) workspace.userEmail = actor;
  }
  if (q) {
    const pattern = { $regex: escapeRegex(q), $options: 'i' };
    if (platform) platform.$or = [{ action: pattern }, { 'details.reason': pattern }, { 'details.name': pattern }, { universityId: pattern }];
    if (workspace) workspace.$or = [{ description: pattern }, { userEmail: pattern }, { targetType: pattern }];
  }
  return { platform, workspace, since };
}

function platformEntry(row, people) {
  const person = people.get(String(row.actor));
  const [category, verb = ''] = String(row.action || '').split('.');
  return {
    id: `p:${row._id}`, source: 'platform', category, action: row.action, verb,
    title: row.action, detail: platformDetail(row.details), universityId: row.universityId || '',
    actorName: person?.name || person?.email || (row.actor ? 'Master Admin' : 'System'), actorEmail: person?.email || '',
    createdAt: row.createdAt, sensitive: SENSITIVE_PLATFORM.test(row.action || ''),
  };
}

function workspaceEntry(row, admins) {
  const person = admins.get(String(row.userEmail || '').toLowerCase());
  const category = ['LOGIN', 'LOGOUT'].includes(row.actionType) ? 'login' : String(row.targetType || '').toLowerCase();
  return {
    id: `w:${row._id}`, source: 'workspace', category, action: `${category}.${String(row.actionType || '').toLowerCase()}`, verb: row.actionType,
    title: row.description || `${row.actionType} ${row.targetType}`, detail: row.targetType ? row.targetType.replace(/_/g, ' ').toLowerCase() : '',
    universityId: '', actorName: person?.name || row.userEmail || 'Admin', actorEmail: row.userEmail || '',
    createdAt: row.createdAt, sensitive: SENSITIVE_WORKSPACE.includes(row.actionType),
  };
}

async function countsByDay(model, filter, field = 'createdAt') {
  if (!filter) return [];
  return model.aggregate([
    { $match: filter },
    { $group: { _id: { $dateToString: { date: `$${field}`, format: '%Y-%m-%d', timezone: '+05:30' } }, count: { $sum: 1 } } },
  ]).option({ maxTimeMS: 8000 });
}

/**
 * One page of the merged timeline plus window statistics.
 * → { entries, nextCursor, total, today, sensitive, byDay: [{ day, count }], operators, categories, windowDays }
 */
export async function masterActivityFeed(query, now = new Date()) {
  const options = parseQuery(query);
  const adminUsers = await User.find({ role: 'admin' }).select('_id name email isActive').lean();
  const admins = new Map(adminUsers.map((user) => [String(user.email || '').toLowerCase(), user]));
  const people = new Map(adminUsers.map((user) => [String(user._id), user]));
  const { platform, workspace, since } = sourceFilters(options, admins, now);
  const page = (filter) => (filter && options.before ? { ...filter, createdAt: { ...filter.createdAt, $lt: options.before } } : filter);

  const [platformRows, workspaceRows, platformTotal, workspaceTotal, platformDays, workspaceDays, platformOps, workspaceOps, platformSensitive, workspaceSensitive, platformCats, workspaceCats] = await Promise.all([
    platform ? PlatformAudit.find(page(platform)).sort({ createdAt: -1 }).limit(options.limit + 1).lean() : [],
    workspace ? Activity.find(page(workspace)).sort({ createdAt: -1 }).limit(options.limit + 1).lean() : [],
    platform ? PlatformAudit.countDocuments(platform) : 0,
    workspace ? Activity.countDocuments(workspace) : 0,
    countsByDay(PlatformAudit, platform),
    countsByDay(Activity, workspace),
    platform ? PlatformAudit.aggregate([{ $match: platform }, { $group: { _id: '$actor', count: { $sum: 1 }, last: { $max: '$createdAt' } } }]) : [],
    workspace ? Activity.aggregate([{ $match: workspace }, { $group: { _id: { $toLower: '$userEmail' }, count: { $sum: 1 }, last: { $max: '$createdAt' }, logins: { $sum: { $cond: [{ $eq: ['$actionType', 'LOGIN'] }, 1, 0] } }, lastLogin: { $max: { $cond: [{ $eq: ['$actionType', 'LOGIN'] }, '$createdAt', null] } } } }]) : [],
    platform ? PlatformAudit.countDocuments({ ...platform, action: { $regex: SENSITIVE_PLATFORM.source, $options: 'i' } }) : 0,
    workspace ? Activity.countDocuments({ ...workspace, actionType: { $in: SENSITIVE_WORKSPACE } }) : 0,
    platform ? PlatformAudit.aggregate([{ $match: platform }, { $group: { _id: { $arrayElemAt: [{ $split: ['$action', '.'] }, 0] }, count: { $sum: 1 } } }]) : [],
    workspace ? Activity.aggregate([{ $match: workspace }, { $group: { _id: { $cond: [{ $in: ['$actionType', ['LOGIN', 'LOGOUT']] }, 'login', { $toLower: '$targetType' }] }, count: { $sum: 1 } } }]) : [],
  ]);

  const merged = [...platformRows.map((row) => platformEntry(row, people)), ...workspaceRows.map((row) => workspaceEntry(row, admins))]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const entries = merged.slice(0, options.limit);
  const more = merged.length > options.limit || platformRows.length > options.limit || workspaceRows.length > options.limit;

  const dayMap = new Map();
  for (const row of [...platformDays, ...workspaceDays]) dayMap.set(row._id, (dayMap.get(row._id) || 0) + row.count);
  const byDay = Array.from({ length: options.days }, (_, index) => {
    const day = istDay(new Date(since.getTime() + index * DAY_MS + IST_OFFSET_MS));
    return { day, count: dayMap.get(day) || 0 };
  });

  // Every control-plane admin, active or not in this window, so all Master Admins are visible.
  const operatorStats = new Map(adminUsers.map((user) => [String(user.email || '').toLowerCase(), { id: String(user._id), name: user.name || user.email, email: user.email, active: user.isActive !== false, actions: 0, logins: 0, lastActiveAt: null, lastLoginAt: null }]));
  for (const row of platformOps) {
    const person = people.get(String(row._id));
    const stat = person && operatorStats.get(String(person.email || '').toLowerCase());
    if (!stat) continue;
    stat.actions += row.count;
    if (!stat.lastActiveAt || row.last > stat.lastActiveAt) stat.lastActiveAt = row.last;
  }
  for (const row of workspaceOps) {
    const stat = operatorStats.get(String(row._id || ''));
    if (!stat) continue;
    stat.actions += row.count - row.logins;
    stat.logins += row.logins;
    if (!stat.lastActiveAt || row.last > stat.lastActiveAt) stat.lastActiveAt = row.last;
    if (row.lastLogin && (!stat.lastLoginAt || row.lastLogin > stat.lastLoginAt)) stat.lastLoginAt = row.lastLogin;
  }
  const operators = [...operatorStats.values()].sort((a, b) => (b.actions + b.logins) - (a.actions + a.logins) || String(a.name).localeCompare(String(b.name)));

  const categories = [...platformCats.map((row) => ({ key: row._id, source: 'platform', count: row.count })), ...workspaceCats.map((row) => ({ key: row._id, source: 'workspace', count: row.count }))]
    .filter((row) => row.key).sort((a, b) => b.count - a.count);
  const today = byDay.at(-1)?.count || 0;
  return {
    entries, nextCursor: more && entries.length ? entries.at(-1).createdAt : null,
    total: platformTotal + workspaceTotal, today, sensitive: platformSensitive + workspaceSensitive,
    byDay, operators, categories, windowDays: options.days, scope: 'platform',
  };
}
