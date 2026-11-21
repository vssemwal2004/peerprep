// Problem page chip: what solving this problem would earn today, tag by tag, under the same
// allocation rule the receipt will use (quotaRules.js), or that it is already solved. Also the
// problem's readiness primary topic and, when tags are full, a comparable open-quota problem.
import { nextResetAt } from './topicQuota.js';
import { allocateSolve, quotaTags } from './quotaRules.js';
import { curveValue, istDay, topicUsageOn } from './points.js';
import { ledgerOf, studentFor } from './submitOutcome.js';
import { catalogueEntry } from '../prepReadiness/catalogue.js';
import { mappingsFor, attribute } from '../prepReadiness/evidence.js';
import { SEED_TOPICS } from '../prepReadiness/seed.js';
import { openQuotaAlternative } from '../prepReadiness/recommend.js';

const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const LABELS = new Map(SEED_TOPICS.map((topic) => [topic.key, topic.label]));

/**
 * { solved, credited, limit, resetsAt, difficulty, points (if solved now), maxPoints, allFull,
 *   topics: [{ topic, key, used, limit, full, share }], readinessTopic: { key, label } | null,
 *   problemKey } or null when the problem is unknown.
 */
export async function topicStatusForProblem(userOrId, source, id, now = new Date()) {
  const [entry, student] = await Promise.all([catalogueEntry(source, id), studentFor(userOrId)]);
  if (!entry || !student) return null;
  const { ledger, config } = await ledgerOf(student, now);
  const limit = Number(config?.modules?.coding?.dailyTopicLimit) || 0;
  const today = istDay(now);
  const used = topicUsageOn(ledger, today);
  const solve = ledger.events.find((event) => event.kind === 'solve' && (event.key === entry.sourceKey || event.meta?.problemKey === entry.problemKey));
  const level = entry.difficulty || 'Easy';
  const base = Number(config?.points?.solve?.[level]) || 0;
  const limited = today >= (config?.points?.topicLimitFrom || '0000') && limit > 0;
  const tags = quotaTags(entry.tags);
  const preview = allocateSolve({ base, tags, used, limit, limited, dryRun: true });
  const topics = preview.parts.map((part) => ({
    topic: part.topic, key: part.key, used: limit ? Math.min(used.get(part.key) || 0, limit) : used.get(part.key) || 0,
    limit, full: !part.counted, share: round(part.share),
  }));
  const mapped = attribute(entry, await mappingsFor([entry.problemKey]));
  // Tags full before the student starts: lead with a comparable problem that still pays today.
  const alternative = !solve && preview.fullTags.length
    ? await openQuotaAlternative(student, { now, excludeKeys: [entry.problemKey] }).catch(() => null)
    : null;
  // What the Prep Score would rise by now (growth curve on top of the student's current points).
  const gain = (activity) => round(curveValue(ledger.rawTotal + activity, config.points) - curveValue(ledger.rawTotal, config.points));
  return {
    solved: Boolean(solve), credited: solve ? solve.raw > 0 : null, limit, resetsAt: nextResetAt(now).toISOString(), difficulty: level,
    points: solve ? 0 : gain(preview.points), maxPoints: gain(base), basePoints: base, allFull: preview.points === 0 && base > 0,
    redistributed: preview.fullTags.length > 0 && preview.points > 0,
    topics, problemKey: entry.problemKey, alternative,
    readinessTopic: mapped.topic ? { key: mapped.topic, label: LABELS.get(mapped.topic) || mapped.topic } : null,
  };
}
