// The Prep Score topic-quota allocation rule (pure). One rule for the ledger replay, the problem
// page chip, the stored receipt and the result card, so they always agree.
//
// For an accepted first solve with base reward B (Easy/Medium/Hard from the serving policy):
//   1. Tags: the problem's tags, matched through the canonical topic aliases and de-duplicated.
//   2. Open tags: tags with fewer than `limit` credited solves that IST day (no limit = all open).
//   3. B is split evenly among the open tags; only open tags take a slot.
//   4. Every tag full: 0 base points (the solve itself and its readiness evidence still count).
// Example, Medium (8) tagged Array + DP: both open → 4 + 4; Array full → DP 8; both full → 0.
import { normaliseTag, topicIndex } from '../prepReadiness/engine.js';
import { SEED_TOPICS } from '../prepReadiness/seed.js';

export const GENERAL_TAG = Object.freeze({ key: 'general', label: 'General' });
const INDEX = topicIndex();
const LABELS = new Map(SEED_TOPICS.map((topic) => [topic.key, topic.label]));

/** Quota key + label for one tag: the canonical topic when recognised, else the normalised tag. */
export function quotaTag(raw) {
  const text = String(raw ?? '').trim();
  const normal = normaliseTag(text);
  if (!normal) return null;
  const canonical = INDEX.get(normal);
  if (canonical) return { key: canonical, label: LABELS.get(canonical) || text };
  return { key: `tag:${normal}`, label: text };
}

/** The problem's quota tags, de-duplicated through aliases; none → General. */
export function quotaTags(tags) {
  const seen = new Set();
  const list = [];
  for (const tag of Array.isArray(tags) ? tags : []) {
    const item = quotaTag(tag);
    if (!item || seen.has(item.key)) continue;
    seen.add(item.key);
    list.push(item);
  }
  return list.length ? list : [GENERAL_TAG];
}

/**
 * Splits `base` across the open tags. `used`: Map(tag key → credited solves that day); mutated for
 * the tags credited unless `dryRun`. → { points, parts: [{ topic, key, share, counted, used }], fullTags }
 */
export function allocateSolve({ base, tags, used, limit, limited = true, dryRun = false }) {
  const list = Array.isArray(tags) && tags.length && typeof tags[0] === 'object' ? tags : quotaTags(tags);
  const capped = limited && limit > 0;
  const open = list.filter((tag) => !capped || (used.get(tag.key) || 0) < limit);
  const share = open.length ? base / open.length : 0;
  const parts = list.map((tag) => {
    const before = used.get(tag.key) || 0;
    const counted = open.includes(tag);
    if (counted && !dryRun) used.set(tag.key, before + 1);
    return { topic: tag.label, key: tag.key, share: counted ? share : 0, counted, used: counted ? before + 1 : before };
  });
  return { points: open.length ? base : 0, parts, fullTags: list.filter((tag) => !open.includes(tag)).map((tag) => tag.label) };
}
