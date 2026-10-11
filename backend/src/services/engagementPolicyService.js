import crypto from 'node:crypto';
import { EngagementPolicy } from '../models/AdaptiveEngagement.js';
import { isUniversity } from '../platform/deployment.js';
import { universityPolicy } from '../platform/client.js';
import { DEFAULT_POLICY, DOMAIN_ACCESS, BADGES } from './adaptiveEngagementRules.js';
import { HttpError } from '../utils/errors.js';

export function engagementTenant(user, collegeOverride) {
  if (isUniversity()) return `university:${process.env.PEERPREP_UNIVERSITY_ID}`;
  const college = String(collegeOverride ?? user.college ?? '').trim().toLowerCase();
  return college ? `college:${crypto.createHash('sha256').update(college).digest('hex').slice(0, 24)}` : 'standalone';
}
export async function engagementPermissions(student) {
  if (student.accessScope === 'assessment_only') return { assessments: true };
  if (!isUniversity()) return Object.fromEntries(Object.values(DOMAIN_ACCESS).map((key) => [key, true]));
  const policy = await universityPolicy();
  if (policy.active !== true || !policy.permissions) throw new HttpError(503, 'University access is currently unavailable');
  return policy.permissions;
}
export async function getEngagementPolicy(tenantKey, semester) {
  const rows = await EngagementPolicy.find({ tenantKey, cohort: { $in: ['all', `semester:${Number(semester) || 0}`] } }).maxTimeMS(5000).lean();
  const base = rows.find((row) => row.cohort === 'all');
  const override = rows.find((row) => row.cohort !== 'all');
  return { ...DEFAULT_POLICY, ...base?.settings, ...override?.settings,
    revision: `${base?.revision || 0}:${override?.revision || 0}`, tenantKey };
}
export function validatePolicy(input) {
  const result = {};
  for (const [key, min, max] of [['dailyMinutes', 10, 45], ['weeklyDays', 1, 7], ['monthlyDays', 1, 28], ['dailyXp', 0, 100], ['weeklyXp', 0, 300], ['monthlyXp', 0, 1000], ['stretchXp', 0, 30]]) {
    if (input[key] === undefined) continue;
    if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) throw new HttpError(400, `${key} must be an integer between ${min} and ${max}`);
    result[key] = input[key];
  }
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') throw new HttpError(400, 'enabled must be a boolean');
    result.enabled = input.enabled;
  }
  if (input.domains !== undefined) {
    if (!Array.isArray(input.domains) || input.domains.some((domain) => !Object.hasOwn(DOMAIN_ACCESS, domain))) throw new HttpError(400, 'Invalid mission domains');
    result.domains = [...new Set(input.domains)];
  }
  if (input.maxDifficulty !== undefined) {
    if (!['Easy', 'Medium', 'Hard'].includes(input.maxDifficulty)) throw new HttpError(400, 'Invalid difficulty ceiling');
    result.maxDifficulty = input.maxDifficulty;
  }
  if (input.pauseUntil !== undefined) {
    if (input.pauseUntil !== null && !Number.isFinite(new Date(input.pauseUntil).getTime())) throw new HttpError(400, 'Invalid pause date');
    result.pauseUntil = input.pauseUntil ? new Date(input.pauseUntil).toISOString() : null;
  }
  if (input.customBadges !== undefined) {
    const metrics = new Set(BADGES.map((badge) => badge.metric));
    if (!Array.isArray(input.customBadges) || input.customBadges.length > 12) throw new HttpError(400, 'At most 12 custom badges are supported');
    result.customBadges = input.customBadges.map((badge) => {
      if (!badge || typeof badge !== 'object' || !/^[a-z0-9-]{1,32}$/.test(badge.id || '') || typeof badge.title !== 'string' || !badge.title.trim() || badge.title.length > 60 || !metrics.has(badge.metric)
        || !Number.isInteger(badge.target) || badge.target < 1 || badge.target > 10000) throw new HttpError(400, 'Invalid custom badge rule');
      // Metric determines feature access; clients cannot disguise a coding badge as a general badge.
      const category = BADGES.find((item) => item.metric === badge.metric).category;
      return { id: `university-${badge.id}`, title: badge.title.trim(), description: `Reach ${badge.target} ${badge.metric}.`, metric: badge.metric,
        category, target: badge.target, minimumLevel: 1, rarity: 'Special', rewardXp: 0 };
    });
    if (new Set(result.customBadges.map((b) => b.id)).size !== result.customBadges.length) throw new HttpError(400, 'Badge identifiers must be unique');
  }
  return result;
}
