// ANVI Practice Next: deterministic practice picks from the real catalogue (no AI service).
//
// Viable: an unsolved practice problem whose readiness primary topic is active in the track and
// not yet at its target, at a suitable difficulty for the student. Open-quota problems come
// first (a problem whose every tag is full today is offered only when nothing else fits).
// Order: topic priority (5 = highest) → expected readiness gain → difficulty fit → stable
// tie-break (catalogue order, then key). Nothing is invented: no problem, no trend, no coverage.
import { allocateSolve, quotaTags } from '../prepScore/quotaRules.js';
import { countsFromEvidence, marginalGain, normaliseDifficulty, scoreTrack, topicIndex } from './engine.js';
import { attribute, mappingsFor } from './evidence.js';
import { practiceCatalogue, problemUrl } from './catalogue.js';
import { TRACKS } from './seed.js';
import { getActiveReadinessPolicy } from './policy.js';
import { storedEvidence } from './evidence.js';
import { getSharedCodingCatalog } from '../studentDashboardService.js';
import { ledgerOf } from '../prepScore/submitOutcome.js';
import { istDay, topicUsageOn } from '../prepScore/points.js';

const LEVELS = ['Easy', 'Medium', 'Hard'];
const round = (value, places = 2) => Math.round((Number(value) + Number.EPSILON) * 10 ** places) / 10 ** places;

/**
 * The difficulty a student is ready for, from their own verified solves: Easy until 3 Medium
 * solves, Medium until 3 Hard or 15 Medium solves, then Hard. Suitable = that level or one below
 * (Easy also allows Medium so a beginner is not stuck).
 */
export function difficultyLevel(evidence) {
  const counts = { Easy: 0, Medium: 0, Hard: 0 };
  for (const row of evidence) { const level = normaliseDifficulty(row.difficulty); if (level) counts[level] += 1; }
  const level = counts.Medium < 3 ? 'Easy' : counts.Hard < 3 && counts.Medium < 15 ? 'Medium' : 'Hard';
  const index = LEVELS.indexOf(level);
  const suitable = level === 'Easy' ? ['Easy', 'Medium'] : LEVELS.filter((_, i) => i === index || i === index - 1);
  return { level, suitable, counts };
}

// Plain names for students (SBC / PBC are only shorthand).
const TRACK_WORDS = { sbc: 'Service-Based Companies', pbc: 'Product-Based Companies' };

function reasonFor({ track, topic, row, gain, difficulty, quota, level }) {
  const parts = [`${topic.label} is a priority ${row.priority} topic for ${TRACK_WORDS[track] || TRACKS[track].label}, at ${Math.round(row.progress * 100)}% of its target.`];
  parts.push(`This ${difficulty} solve adds about +${round(gain)} to that readiness${difficulty === level ? ', at your current level' : ''}.`);
  if (quota.state === 'partial') parts.push(`${quota.fullTags.join(', ')} ${quota.fullTags.length === 1 ? 'is' : 'are'} full today, so its Prep Score goes to ${quota.openTags.join(', ')}.`);
  if (quota.state === 'full') parts.push('All its tags are full for Prep Score today; it still counts toward readiness.');
  return parts.join(' ');
}

/**
 * → { track, level, items: [{ problemKey, source, id, title, difficulty, url, topic, topicLabel,
 *     priority, gain, quota: { state, openTags, fullTags }, reason }], empty: null | reason }
 * usage: today's credited solves per quota key; limit/limited: today's quota rule.
 */
export async function recommendPractice({ policy, track, evidence, usage = new Map(), limit = 0, limited = true, shared = true, count = 5, excludeKeys = [] }) {
  const catalogue = await practiceCatalogue({ shared });
  const solved = new Set([...evidence.map((row) => row.problemKey), ...excludeKeys]);
  const mappedEvidence = evidence.filter((row) => row.topic);
  const counts = countsFromEvidence(mappedEvidence);
  const trackScore = scoreTrack(policy, track, counts);
  const topicRows = new Map(trackScore.topics.map((row) => [row.key, row]));
  const { level, suitable } = difficultyLevel(mappedEvidence);
  const open = catalogue.filter((entry) => !solved.has(entry.problemKey) && suitable.includes(entry.difficulty));
  const mappings = await mappingsFor(open.map((entry) => entry.problemKey));
  const index = topicIndex(policy);
  const candidates = [];
  for (const entry of open) {
    const { topic } = attribute(entry, mappings, index);
    const row = topic && topicRows.get(topic);
    if (!row || row.excluded || row.complete || !(row.priority > 0)) continue;
    const gain = marginalGain(policy, track, counts, topic, entry.difficulty);
    if (!(gain > 0)) continue;
    const preview = allocateSolve({ base: 1, tags: quotaTags(entry.tags), used: usage, limit, limited, dryRun: true });
    const openTags = preview.parts.filter((part) => part.counted).map((part) => part.topic);
    const quota = { state: !preview.fullTags.length ? 'open' : openTags.length ? 'partial' : 'full', openTags, fullTags: preview.fullTags };
    candidates.push({ entry, topic, row, gain, quota, fit: Math.abs(LEVELS.indexOf(entry.difficulty) - LEVELS.indexOf(level)) });
  }
  const rank = (a, b) => (b.row.priority - a.row.priority) || (b.gain - a.gain) || (a.fit - b.fit) || (a.entry.order - b.entry.order) || a.entry.problemKey.localeCompare(b.entry.problemKey);
  const withQuota = candidates.filter((item) => item.quota.state !== 'full').sort(rank);
  const capped = candidates.filter((item) => item.quota.state === 'full').sort(rank);
  // One pick per topic first (breadth), then the rest in rank order.
  const ordered = withQuota.length ? withQuota : capped;
  const picks = [];
  const topicsUsed = new Set();
  for (const item of ordered) if (picks.length < count && !topicsUsed.has(item.topic)) { picks.push(item); topicsUsed.add(item.topic); }
  for (const item of ordered) if (picks.length < count && !picks.includes(item)) picks.push(item);
  const items = picks.map((item) => ({
    problemKey: item.entry.problemKey, source: item.entry.source, id: item.entry.id, title: item.entry.title, difficulty: item.entry.difficulty,
    url: problemUrl(item.entry), topic: item.topic, topicLabel: item.row.label, priority: item.row.priority, gain: round(item.gain, 4),
    quota: item.quota, reason: reasonFor({ track, topic: item.row, row: item.row, gain: item.gain, difficulty: item.entry.difficulty, quota: item.quota, level }),
  }));
  let empty = null;
  if (!items.length) {
    empty = trackScore.topics.every((row) => row.excluded || row.complete)
      ? 'Every active topic in this track is at its target. More practice keeps your skills fresh but cannot raise this score.'
      : catalogue.length ? 'No unsolved problem at your level can raise this track right now. Try a different difficulty from the topic table.' : 'The practice catalogue is not available right now.';
  }
  return { track, level, items, empty, allCapped: !withQuota.length && capped.length > 0 };
}

/**
 * One comparable problem with open Prep Score quota today (PBC first, then SBC), for the problem
 * page and the result card when a problem's tags are full. Null when nothing fits.
 */
export async function openQuotaAlternative(student, { now = new Date(), excludeKeys = [] } = {}) {
  const sharedCatalog = await getSharedCodingCatalog().catch(() => []);
  const [policy, evidenceMap, { ledger, config }] = await Promise.all([
    getActiveReadinessPolicy(), storedEvidence([student._id]), ledgerOf(student, now),
  ]);
  const today = istDay(now);
  const options = {
    policy, evidence: evidenceMap.get(String(student._id)) || [], usage: topicUsageOn(ledger, today),
    limit: Number(config?.modules?.coding?.dailyTopicLimit) || 0, limited: today >= (config?.points?.topicLimitFrom || '0000'),
    shared: sharedCatalog.length > 0, count: 3, excludeKeys,
  };
  for (const track of ['pbc', 'sbc']) {
    const result = await recommendPractice({ ...options, track });
    const pick = result.items.find((item) => item.quota.state === 'open') || result.items.find((item) => item.quota.state === 'partial');
    if (pick) return { ...pick, track };
  }
  return null;
}
