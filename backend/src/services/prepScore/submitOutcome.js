// What a practice submission did to the student's Prep Score, for the result screen: points earned
// per topic (and which topics were already full today), or the small loss for a wrong answer
// (given back if the problem is solved the same day). Replayed from the same ledger as the score.
import mongoose from 'mongoose';
import User from '../../models/User.js';
import { dashboardPermissions, getSharedCodingCatalog } from '../studentDashboardService.js';
import { scoreFeatures } from './engine.js';
import { ensurePrepScoreStore, servingPolicy } from './sync.js';
import { loadPointFacts } from './pointFacts.js';
import { cleanTopics, istDay, ledgerFor, topicUsageOn } from './points.js';
import { allocateAcceptedSolve } from './allocation.js';
import { quotaTag } from './quotaRules.js';
import { nextResetAt, tagFrequencies } from './topicQuota.js';
import { todayDifficulties } from './coach.js';

// Prep Score changes are small (growth curve), so two decimals.
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export async function studentFor(userOrId) {
  if (userOrId && typeof userOrId === 'object' && userOrId.role) return userOrId;
  if (!mongoose.isValidObjectId(String(userOrId))) return null;
  return User.findById(userOrId).select('_id role accessScope college isActive').lean();
}

export async function ledgerOf(student, now) {
  const permissions = await dashboardPermissions(student);
  const sharedCatalog = permissions.questions ? await getSharedCodingCatalog() : [];
  const policy = await servingPolicy(await ensurePrepScoreStore());
  const facts = (await loadPointFacts([student._id], { coding: permissions.questions === true, sharedCatalog })).get(String(student._id));
  return { ledger: ledgerFor(facts, policy, { now, features: scoreFeatures(permissions) }), config: policy.config };
}

/** Up to `count` popular topics with room left today (suggestions when a topic is full). */
async function openTopics(used, limit, exclude, count = 3) {
  if (!limit) return [];
  const frequencies = await tagFrequencies().catch(() => new Map());
  const keyOf = (topic) => quotaTag(topic)?.key || topic.toLowerCase();
  const skip = new Set(exclude.map(keyOf));
  const seen = new Set();
  return [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic)
    .filter((topic) => {
      const key = keyOf(topic);
      if (skip.has(key) || seen.has(key) || (used.get(key) || 0) >= limit) return false;
      seen.add(key);
      return true;
    })
    .slice(0, count);
}

/**
 * accepted: { kind: 'solve', alreadySolved, points, total, parts[{topic, share, counted, used}],
 *             limit, fullTopics, suggestions, resetsAt }
 * wrong:    { kind: 'wrong', lost, refundable, total, capped }
 * Returns null when nothing applies (no student, Prep Coding not licensed).
 */
export async function prepScoreAfterSubmit(userOrId, { source, problemId, accepted, alreadySolved = false }, now = new Date()) {
  const student = await studentFor(userOrId);
  if (!student || (student.role && student.role !== 'student')) return null;
  let { ledger, config } = await ledgerOf(student, now);
  const limit = Number(config?.modules?.coding?.dailyTopicLimit) || 0;
  const today = istDay(now);
  const key = `${source}:${problemId}`;
  if (accepted) {
    // The one authoritative decision (stored receipt); the ledger then reads it back.
    const allocation = await allocateAcceptedSolve({ student, source, problemId, ledger, config, now })
      .catch((error) => { console.warn('[prep-score] allocation failed:', error.message); return null; });
    if (allocation?.created) ({ ledger, config } = await ledgerOf(student, now));
    const problemKey = allocation?.receipt?.problemKey || null;
    const event = ledger.events.find((item) => item.kind === 'solve' && (item.key === key || (problemKey && item.meta?.problemKey === problemKey)));
    if (!event) return null;
    const used = topicUsageOn(ledger, today);
    // Topic shares are activity points; each topic's part of the actual Prep Score change.
    const toScore = event.raw > 0 ? event.delta / event.raw : 0;
    const parts = (event.meta?.parts || []).map((part) => ({ topic: part.topic, key: part.key || null, points: round(part.counted ? part.share * toScore : 0), counted: part.counted, used: Math.min(limit || part.used, part.used) }));
    const fullTopics = event.meta?.rule === 'allocation'
      ? parts.filter((part) => !part.counted).map((part) => part.topic)
      : cleanTopics(parts.map((part) => part.topic)).filter((topic) => limit && (used.get(topic.toLowerCase()) || 0) >= limit);
    // Already solved: an earlier day, or the other copy of this problem already paid.
    const repeat = alreadySolved || event.day !== today || event.key !== key || (allocation && !allocation.created && allocation.receipt?.sourceKey !== key);
    // A topic whose last counted slot this solve just used: suggest other topics before the next one is wasted.
    const justFilled = !repeat && limit > 0 && parts.some((part) => part.counted && part.used >= limit);
    return {
      difficulty: event.meta?.difficulty || 'Easy',
      difficulties: todayDifficulties(ledger, today),
      solvePoints: { ...(config?.points?.solve || {}) },
      kind: 'solve', alreadySolved: Boolean(repeat), credited: event.raw > 0, points: repeat ? 0 : round(event.delta), total: ledger.total,
      basePoints: repeat ? 0 : round(event.raw), challengePoints: round(todayGain(ledger, 'challenge', today)),
      parts, limit, limited: Boolean(event.meta?.limited), fullTopics, allFull: parts.length > 0 && parts.every((part) => !part.counted),
      problemKey: problemKey || event.meta?.problemKey || key,
      readinessTopic: allocation?.receipt?.readinessTopic || null,
      suggestions: fullTopics.length || justFilled ? await openTopics(used, limit, parts.map((part) => part.topic)) : [],
      resetsAt: nextResetAt(now).toISOString(),
    };
  }
  const points = config?.points || {};
  const solvedBefore = ledger.events.some((item) => item.kind === 'solve' && item.key === key);
  if (solvedBefore) return { kind: 'wrong', lost: 0, refundable: false, total: ledger.total, capped: false, alreadySolved: true };
  const wrongToday = ledger.events.find((item) => item.kind === 'wrong' && item.day === today);
  const countToday = Number(wrongToday?.meta?.count) || 0;
  const cap = Number(points.wrongDailyCap) || 0;
  const each = Number(points.wrongSubmission) || 0;
  // This answer's share of today's wrong-answer loss, on the Prep Score (curve) scale.
  const rawToday = Math.min(cap, countToday * each);
  const rawNow = Math.max(0, rawToday - Math.min(cap, Math.max(0, countToday - 1) * each));
  const scoreLoss = wrongToday ? -wrongToday.delta : 0;
  const lost = round(rawToday > 0 ? scoreLoss * (rawNow / rawToday) : 0);
  return { kind: 'wrong', lost: lost > 0 ? Math.max(0.01, lost) : 0, refundable: points.refundSameDay !== false && lost > 0, total: ledger.total, capped: countToday * each >= cap, wrongCount: countToday };
}

/** The Prep Score change from one kind of event today (e.g. the daily challenge). */
export function todayGain(ledger, kind, day, key = null) {
  return ledger.events.filter((item) => item.kind === kind && item.day === day && (!key || item.key === key)).reduce((sum, item) => sum + item.delta, 0);
}

/** The Prep Score change an event gave (score scale), for notices: kind + optional key/day. */
export async function scoreGainFor(userOrId, { kind, key = null, day = null }, now = new Date()) {
  const student = await studentFor(userOrId);
  if (!student) return 0;
  const { ledger } = await ledgerOf(student, now);
  const match = ledger.events.filter((item) => item.kind === kind && (!key || item.key === key) && (!day || item.day === day));
  return round(match.reduce((sum, item) => sum + item.delta, 0));
}
