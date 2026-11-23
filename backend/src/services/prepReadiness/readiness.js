// Prep Readiness read model: the student's SBC/PBC scores, topic breakdown, daily growth and the
// compact summary for profiles. All numbers come from engine.js over stored evidence.
import { dashboardPermissions, getSharedCodingCatalog } from '../studentDashboardService.js';
import { studentHasFeature } from '../studentFeatureAccess.js';
import { ledgerOf } from '../prepScore/submitOutcome.js';
import { storedScoresFor } from '../prepScore/sync.js';
import { istDay, topicUsageOn } from '../prepScore/points.js';
import { nextResetAt } from '../prepScore/topicQuota.js';
import { categoryLabel, countsFromEvidence, displayScore, scoreReadiness } from './engine.js';
import { getActiveReadinessPolicy, getPublishedReadinessPolicies, policyAt } from './policy.js';
import { storedEvidence, syncEvidence } from './evidence.js';
import { TRACK_KEYS, TRACKS } from './seed.js';

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;
export const RANGES = Object.freeze({ '7d': 7, '30d': 30, '90d': 90 });
const round = (value, places = 4) => Math.round((Number(value) + Number.EPSILON) * 10 ** places) / 10 ** places;
/** End of an IST day (YYYY-MM-DD) as a Date. */
const dayEnd = (day) => new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) + DAY_MS - IST_OFFSET_MS - 1);
const shiftDay = (day, delta) => new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) + delta * DAY_MS).toISOString().slice(0, 10);

/**
 * Who may have readiness at all: Prep Coding licensed for the university AND turned on for the
 * student (their own feature access). Without it there are no readiness targets to show.
 */
export async function readinessAccess(student) {
  const permissions = await dashboardPermissions(student);
  return { coding: permissions.questions === true && studentHasFeature(student, 'prep_coding'), permissions };
}

/** Score cards for both tracks: { sbc: { score, display, cutoff, met, remaining, evidence }, pbc }. */
export function trackCards(result) {
  return Object.fromEntries(TRACK_KEYS.map((track) => {
    const value = result[track];
    return [track, {
      key: track, label: TRACKS[track].label, short: TRACKS[track].short,
      score: round(value.score, 6), display: displayScore(value.score, value.cutoff), cutoff: value.cutoff, met: value.met,
      remaining: value.met ? 0 : round(value.cutoff - value.score, 2), evidence: value.evidence,
    }];
  }));
}

/**
 * Daily readiness for both tracks over `days` days ending today, each day scored under the policy
 * serving at that day's end. → { days: [{ day, sbc, pbc, version, reconstructed }], publications }
 */
export function growthSeries(evidence, published, { days = 30, now = new Date(), firstRecordedAt = null } = {}) {
  const today = istDay(now);
  const from = shiftDay(today, -(days - 1));
  const sorted = [...evidence].filter((row) => row.topic).sort((a, b) => new Date(a.solvedAt) - new Date(b.solvedAt));
  const recordedFrom = firstRecordedAt ? istDay(firstRecordedAt) : null;
  const series = [];
  const publications = [];
  let lastVersion = null;
  let index = 0;
  const included = [];
  for (let offset = 0; offset < days; offset += 1) {
    const day = shiftDay(from, offset);
    const end = dayEnd(day);
    while (index < sorted.length && new Date(sorted[index].solvedAt) <= end) included.push(sorted[index++]);
    const serving = policyAt(published, end);
    if (lastVersion !== null && serving.version !== lastVersion) publications.push({ day, version: serving.version });
    lastVersion = serving.version;
    const result = scoreReadiness(serving.policy, countsFromEvidence(included));
    series.push({ day, sbc: round(result.sbc.score, 4), pbc: round(result.pbc.score, 4), version: serving.version, reconstructed: Boolean(recordedFrom && day < recordedFrom) });
  }
  // A publication inside the range that took effect on its first day.
  for (const entry of published) {
    if (!entry.from) continue;
    const day = istDay(entry.from);
    if (day >= from && day <= today && !publications.some((item) => item.day === day)) publications.push({ day, version: entry.version });
  }
  publications.sort((a, b) => a.day.localeCompare(b.day));
  return { days: series, publications };
}

/** Topic rows for both tracks with today's Prep Score quota per topic. */
function topicRows(result, usage, limit) {
  return result.sbc.topics.map((sbcRow, index) => {
    const pbcRow = result.pbc.topics[index];
    const used = usage.get(sbcRow.key) || 0;
    const pick = (row) => ({
      weight: row.weight, target: row.target, priority: row.priority, excluded: row.excluded,
      points: round(row.points, 2), progress: round(row.progress, 4), contribution: round(row.contribution, 4),
      maxContribution: round(row.maxContribution, 4), complete: row.complete,
    });
    return {
      key: sbcRow.key, label: sbcRow.label, category: sbcRow.category, categoryLabel: categoryLabel(sbcRow.category),
      counts: sbcRow.counts, sbc: pick(sbcRow), pbc: pick(pbcRow),
      quota: { used: limit ? Math.min(used, limit) : used, limit, remaining: limit ? Math.max(0, limit - used) : null },
    };
  });
}

/** Strengths (well along, real evidence) and topics that improved in the recent window, per track. */
export function strengthsAndGains(policy, evidence, { now = new Date(), windowDays = 14 } = {}) {
  const cutoff = new Date(now.getTime() - windowDays * DAY_MS);
  const mapped = evidence.filter((row) => row.topic);
  const before = scoreReadiness(policy, countsFromEvidence(mapped.filter((row) => new Date(row.solvedAt) < cutoff)));
  const after = scoreReadiness(policy, countsFromEvidence(mapped));
  return Object.fromEntries(TRACK_KEYS.map((track) => {
    const rows = after[track].topics.filter((row) => !row.excluded && (row.counts.Easy + row.counts.Medium + row.counts.Hard) > 0);
    const strengths = rows.filter((row) => row.progress >= 0.6)
      .sort((a, b) => b.progress - a.progress || b.contribution - a.contribution || a.key.localeCompare(b.key))
      .slice(0, 4).map((row) => ({ key: row.key, label: row.label, progress: round(row.progress, 4), complete: row.complete }));
    const improved = rows.map((row) => {
      const old = before[track].topics.find((item) => item.key === row.key);
      return { key: row.key, label: row.label, from: round(old?.progress || 0, 4), to: round(row.progress, 4), gain: round(row.contribution - (old?.contribution || 0), 4) };
    }).filter((row) => row.gain > 0).sort((a, b) => b.gain - a.gain || a.key.localeCompare(b.key)).slice(0, 4);
    return [track, { strengths, improved, windowDays }];
  }));
}

/**
 * Everything the Prep Readiness page needs for one student.
 * options: { range: '7d'|'30d'|'90d', sync: write missing evidence first (student's own reads) }
 */
export async function readinessFor(student, { range = '30d', sync = true, now = new Date(), withQuota = true } = {}) {
  const access = await readinessAccess(student);
  if (!access.coding) return { available: false, reason: 'not_licensed' };
  const sharedCatalog = await getSharedCodingCatalog().catch(() => []);
  const [policy, published, evidenceMap] = await Promise.all([
    getActiveReadinessPolicy(),
    getPublishedReadinessPolicies(),
    sync ? syncEvidence([student._id], { sharedCatalog, now }) : storedEvidence([student._id]),
  ]);
  const evidence = evidenceMap.get(String(student._id)) || [];
  const mapped = evidence.filter((row) => row.topic);
  const result = scoreReadiness(policy, countsFromEvidence(mapped));
  let usage = new Map();
  let limit = 0;
  if (withQuota) {
    const { ledger, config } = await ledgerOf(student, now);
    usage = topicUsageOn(ledger, istDay(now));
    limit = Number(config?.modules?.coding?.dailyTopicLimit) || 0;
  }
  const days = RANGES[range] || 30;
  const firstRecordedAt = evidence.reduce((min, row) => (row.createdAt && (!min || row.createdAt < min) ? row.createdAt : min), null);
  const lastSolveAt = mapped.reduce((max, row) => (!max || row.solvedAt > max ? row.solvedAt : max), null);
  return {
    available: true,
    computedAt: now.toISOString(),
    policy: { version: policy.version, publishedAt: policy.publishedAt || null, builtIn: Boolean(policy.builtIn), tracks: policy.tracks },
    tracks: trackCards(result),
    hasEvidence: mapped.length > 0,
    evidenceCount: mapped.length,
    unmappedCount: evidence.length - mapped.length,
    lastSolveAt,
    topics: topicRows(result, usage, limit),
    quota: { limit, resetsAt: nextResetAt(now).toISOString() },
    growth: { range: RANGES[range] ? range : '30d', ...growthSeries(evidence, published, { days, now, firstRecordedAt }) },
    insights: strengthsAndGains(policy, evidence, { now }),
  };
}

/**
 * Compact summary (profile cards, staff, Prep Mates): scores only, from stored evidence.
 * withTrend adds the last `trendDays` daily values per track (the card's up/down line), the same
 * series as the growth chart. Prep Mates never get it (sharedSummaryFor picks fields).
 */
export async function readinessSummary(student, { sync = false, now = new Date(), withTrend = false, trendDays = 30 } = {}) {
  const access = await readinessAccess(student);
  if (!access.coding) return { available: false, reason: 'not_licensed' };
  const sharedCatalog = sync ? await getSharedCodingCatalog().catch(() => []) : [];
  const [policy, evidenceMap, published] = await Promise.all([
    getActiveReadinessPolicy(),
    sync ? syncEvidence([student._id], { sharedCatalog, now }) : storedEvidence([student._id]),
    withTrend ? getPublishedReadinessPolicies() : null,
  ]);
  const evidence = evidenceMap.get(String(student._id)) || [];
  const mapped = evidence.filter((row) => row.topic);
  const result = scoreReadiness(policy, countsFromEvidence(mapped));
  const lastSolveAt = mapped.reduce((max, row) => (!max || row.solvedAt > max ? row.solvedAt : max), null);
  const summary = { available: true, computedAt: now.toISOString(), policyVersion: policy.version, tracks: trackCards(result), hasEvidence: mapped.length > 0, evidenceCount: mapped.length, lastSolveAt };
  if (withTrend) {
    const firstRecordedAt = evidence.reduce((min, row) => (row.createdAt && (!min || row.createdAt < min) ? row.createdAt : min), null);
    const { days } = growthSeries(evidence, published, { days: trendDays, now, firstRecordedAt });
    summary.trend = { days: days.map((row) => ({ day: row.day, sbc: round(row.sbc, 2), pbc: round(row.pbc, 2) })) };
  }
  return summary;
}

/**
 * What an accepted Prep Mate may see when the student opted in: the Prep Score total and the
 * SBC/PBC values only (no topics, attempts or notes). Stored data, no writes.
 */
export async function sharedSummaryFor(student) {
  const id = String(student._id);
  const [{ scores }, summary] = await Promise.all([
    storedScoresFor([id]).catch(() => ({ scores: new Map() })),
    readinessSummary(student, { sync: false }).catch(() => ({ available: false })),
  ]);
  const total = scores.get(id)?.total;
  return {
    prepScore: Number.isFinite(Number(total)) ? Number(total) : null,
    readiness: summary.available ? Object.fromEntries(TRACK_KEYS.map((track) => {
      const row = summary.tracks[track];
      return [track, { score: row.score, display: row.display, met: row.met, cutoff: row.cutoff, remaining: row.remaining }];
    })) : null,
    hasEvidence: Boolean(summary.hasEvidence),
  };
}

/** Readiness change from one accepted solve (result card): before/after per track for its problem. */
export async function readinessAfterSolve(student, problemKey, { now = new Date() } = {}) {
  const access = await readinessAccess(student);
  if (!access.coding || !problemKey) return null;
  const sharedCatalog = await getSharedCodingCatalog().catch(() => []);
  const [policy, evidenceMap] = await Promise.all([getActiveReadinessPolicy(), syncEvidence([student._id], { sharedCatalog, now })]);
  const evidence = (evidenceMap.get(String(student._id)) || []).filter((row) => row.topic);
  const row = evidence.find((item) => item.problemKey === problemKey);
  if (!row) return null;
  const after = scoreReadiness(policy, countsFromEvidence(evidence));
  const before = scoreReadiness(policy, countsFromEvidence(evidence.filter((item) => item !== row)));
  return {
    topic: row.topic, label: after.sbc.topics.find((item) => item.key === row.topic)?.label || row.topic,
    tracks: Object.fromEntries(TRACK_KEYS.map((track) => {
      const topic = after[track].topics.find((item) => item.key === row.topic);
      const old = before[track].topics.find((item) => item.key === row.topic);
      return [track, {
        before: round(before[track].score, 4), after: round(after[track].score, 4), delta: round(after[track].score - before[track].score, 4),
        display: displayScore(after[track].score, after[track].cutoff), excluded: Boolean(topic?.excluded),
        topicComplete: Boolean(topic?.complete), wasComplete: Boolean(old?.complete),
      }];
    })),
  };
}
