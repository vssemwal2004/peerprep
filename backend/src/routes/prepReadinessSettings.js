// Master Admin → Settings → Prep Topic Priority Adjustment. Control plane only (same guard as the
// Prep Score policy). Preview is read-only: it scores stored evidence under the draft in memory
// and never writes scores, settings or evidence. Every write is recorded in PlatformAudit.
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { isControlPlane } from '../platform/deployment.js';
import { PlatformAudit, University } from '../platform/models.js';
import { getTenant, validUniversityId } from '../platform/tenantConnections.js';
import { runForPlatform, runForTenant } from '../platform/tenantContext.js';
import { HttpError } from '../utils/errors.js';
import User from '../models/User.js';
import { ReadinessTopicMapping } from '../models/PrepReadiness.js';
import { countsFromEvidence, policyTotals, primaryTopic, scoreReadiness } from '../services/prepReadiness/engine.js';
import {
  discardReadinessDraft, draftFromEdits, getReadinessWorkspace, publishReadinessPolicy, saveReadinessDraft,
} from '../services/prepReadiness/policy.js';
import { practiceCatalogue } from '../services/prepReadiness/catalogue.js';
import { mappingsFor, storedEvidence } from '../services/prepReadiness/evidence.js';
import { SEED_TOPICS, TRACK_KEYS } from '../services/prepReadiness/seed.js';

const router = Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const COHORT_LIMIT = 3000;
const KNOWN = new Set(SEED_TOPICS.map((topic) => topic.key));

router.use(requireAuth, requireAdmin, (req, res, next) => {
  if (!isControlPlane()) return next(new HttpError(403, 'Prep Topic Priority is managed by the Master Admin.'));
  return next();
});

async function inScope(universityId, work) {
  if (!universityId || universityId === 'platform') return runForPlatform(work);
  if (!validUniversityId(universityId)) throw new HttpError(400, 'Unknown university.');
  return runForTenant(await getTenant(universityId), work);
}
const audit = (req, action, details) => PlatformAudit.create({ actor: String(req.user._id), action, details }).catch(() => {});

router.get('/', asyncRoute(async (req, res) => {
  const [workspace, universities] = await Promise.all([
    getReadinessWorkspace(),
    University.find({ active: true, deletedAt: null }).select('universityId name').sort({ name: 1 }).lean(),
  ]);
  res.set('Cache-Control', 'private, no-store').json({
    ...workspace,
    universities: universities.map((row) => ({ id: row.universityId, name: row.name || row.universityId })),
  });
}));

router.put('/draft', asyncRoute(async (req, res) => {
  const draft = await saveReadinessDraft({ topics: req.body?.topics, changeReason: req.body?.changeReason, revision: req.body?.revision }, req.user._id);
  await audit(req, 'prep_readiness.draft_saved', { version: draft.version, revision: draft.revision });
  res.json({ draft });
}));

router.delete('/draft', asyncRoute(async (req, res) => {
  await discardReadinessDraft(req.query.revision);
  await audit(req, 'prep_readiness.draft_discarded', { revision: Number(req.query.revision) || 0 });
  res.json({ ok: true });
}));

router.post('/publish', asyncRoute(async (req, res) => {
  const active = await publishReadinessPolicy({ revision: req.body?.revision, changeReason: req.body?.changeReason }, req.user._id);
  await audit(req, 'prep_readiness.policy_published', { version: active.version, reason: active.changeReason });
  res.json({ active });
}));

const bucketsOf = (scores) => {
  const buckets = Array.from({ length: 10 }, (_, index) => ({ from: index * 10, to: index * 10 + 10, count: 0 }));
  for (const score of scores) buckets[Math.min(9, Math.floor(score / 10))].count += 1;
  return buckets;
};
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const round = (value, places = 3) => (value == null ? null : Math.round(value * 10 ** places) / 10 ** places);

/**
 * Server-calculated preview of edits (no writes): totals, normalised weights old → new, catalogue
 * capacity per topic for the chosen university, and the cohort's score distribution before/after.
 */
router.post('/preview', asyncRoute(async (req, res) => {
  const { policy: draft, base: active } = await draftFromEdits(req.body?.topics);
  const universityId = String(req.body?.universityId || 'platform');
  const totals = { active: policyTotals(active), draft: policyTotals(draft) };
  const topics = draft.topics.map((topic) => {
    const old = active.topics.find((row) => row.key === topic.key);
    return {
      key: topic.key,
      ...Object.fromEntries(TRACK_KEYS.map((track) => [track, {
        before: { ...old[track], share: totals.active[track].weight ? round((100 * old[track].weight) / totals.active[track].weight, 4) : 0 },
        after: { ...topic[track], share: totals.draft[track].weight ? round((100 * topic[track].weight) / totals.draft[track].weight, 4) : 0 },
        changed: ['weight', 'target', 'priority'].some((field) => old[track][field] !== topic[track][field]),
      }])),
    };
  });

  const scoped = await inScope(universityId, async () => {
    const catalogue = await practiceCatalogue({ shared: universityId !== 'platform' });
    const mappings = await mappingsFor(catalogue.map((entry) => entry.problemKey));
    const supply = new Map();
    let unmapped = 0;
    for (const entry of catalogue) {
      const topic = mappings.get(entry.problemKey) || primaryTopic({ primary: entry.primary, tags: entry.tags }).topic;
      if (!topic) { unmapped += 1; continue; }
      const row = supply.get(topic) || { Easy: 0, Medium: 0, Hard: 0 };
      row[entry.difficulty] += 1;
      supply.set(topic, row);
    }
    // Capacity: the most target points the catalogue can supply for each topic.
    const capacity = draft.topics.map((topic) => {
      const counts = supply.get(topic.key) || { Easy: 0, Medium: 0, Hard: 0 };
      return {
        key: topic.key, counts,
        ...Object.fromEntries(TRACK_KEYS.map((track) => {
          const row = topic[track];
          const multipliers = draft.tracks[track].multipliers;
          const points = counts.Easy * multipliers.Easy + counts.Medium * multipliers.Medium + counts.Hard * multipliers.Hard;
          return [track, { excluded: !(row.weight > 0), points, target: row.target, short: row.weight > 0 && points < row.target, missing: row.weight > 0 ? Math.max(0, row.target - points) : 0 }];
        })),
      };
    });
    const students = await User.find({ role: 'student', isActive: { $ne: false }, accessScope: { $ne: 'assessment_only' } }).select('_id').limit(COHORT_LIMIT).lean();
    const evidence = await storedEvidence(students.map((row) => row._id));
    const before = { sbc: [], pbc: [] };
    const after = { sbc: [], pbc: [] };
    let withEvidence = 0;
    for (const rows of evidence.values()) {
      const mapped = rows.filter((row) => row.topic);
      if (!mapped.length) continue;
      withEvidence += 1;
      const counts = countsFromEvidence(mapped);
      const oldScores = scoreReadiness(active, counts);
      const newScores = scoreReadiness(draft, counts);
      for (const track of TRACK_KEYS) { before[track].push(oldScores[track].score); after[track].push(newScores[track].score); }
    }
    const summarise = (scores, cutoff) => ({ count: scores.length, met: scores.filter((score) => score >= cutoff).length, median: round(median(scores)), mean: round(scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null), buckets: bucketsOf(scores) });
    return {
      catalogue: { total: catalogue.length, unmapped, capacity },
      cohort: {
        students: students.length, withEvidence, capped: students.length >= COHORT_LIMIT,
        ...Object.fromEntries(TRACK_KEYS.map((track) => [track, { before: summarise(before[track], active.tracks[track].cutoff), after: summarise(after[track], draft.tracks[track].cutoff) }])),
      },
    };
  });
  res.json({ totals, topics, universityId, ...scoped });
}));

/** Practice problems whose tags match no canonical topic (and have no admin mapping yet). */
router.get('/unmapped', asyncRoute(async (req, res) => {
  const universityId = String(req.query.universityId || 'platform');
  const rows = await inScope(universityId, async () => {
    const catalogue = await practiceCatalogue({ shared: universityId !== 'platform' });
    const mappings = await mappingsFor(catalogue.map((entry) => entry.problemKey));
    return catalogue
      .map((entry) => ({ entry, result: primaryTopic({ primary: entry.primary, tags: entry.tags }) }))
      .filter(({ entry, result }) => !result.topic && !mappings.has(entry.problemKey))
      .slice(0, 500)
      .map(({ entry, result }) => ({ problemKey: entry.problemKey, title: entry.title, difficulty: entry.difficulty, tags: entry.tags, unmapped: result.unmapped, source: entry.source }));
  });
  res.set('Cache-Control', 'private, no-store').json({ universityId, items: rows });
}));

router.put('/mappings', asyncRoute(async (req, res) => {
  const problemKey = String(req.body?.problemKey || '').trim();
  const topic = String(req.body?.topic || '').trim();
  if (!/^(lc:\d+|local:[a-f0-9]{24}|shared:[a-f0-9]{24})$/.test(problemKey)) throw new HttpError(400, 'Unknown problem.');
  if (!KNOWN.has(topic)) throw new HttpError(400, 'Choose a canonical topic.');
  const mapping = await ReadinessTopicMapping.findOneAndUpdate(
    { problemKey },
    { $set: { topic, title: String(req.body?.title || '').slice(0, 200), note: String(req.body?.note || '').slice(0, 300), setBy: req.user._id } },
    { upsert: true, new: true },
  ).lean();
  await audit(req, 'prep_readiness.topic_mapped', { problemKey, topic });
  res.json({ mapping });
}));

export default router;
