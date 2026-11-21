// Versioned Prep Readiness topic policy (Master Admin → Settings → Prep Topic Priority Adjustment).
// One shared draft; publishing promotes it atomically and archives the previous version. A stale
// editor (draft revision changed) or a draft whose base was superseded gets 409 and keeps the draft.
import { ReadinessPolicy } from '../../models/PrepReadiness.js';
import { HttpError } from '../../utils/errors.js';
import { defaultPolicy, policyTotals, validatePolicy } from './engine.js';
import { SEED_TOPICS, TRACK_KEYS } from './seed.js';

const CACHE_MS = 30_000;
let cached = null;
let cachedAt = 0;
let publishedCache = null;
let publishedAt = 0;

const clone = (value) => (value == null ? value : structuredClone(value));
const SEED_BY_KEY = new Map(SEED_TOPICS.map((topic) => [topic.key, topic]));

/** A stored row → the plain policy the engine reads. */
export function policyFromRow(row) {
  if (!row) return null;
  return {
    version: row.version,
    topics: (row.topics || []).map((topic) => ({
      key: topic.key, label: topic.label, category: topic.category,
      sbc: { weight: topic.sbc.weight, target: topic.sbc.target, priority: topic.sbc.priority },
      pbc: { weight: topic.pbc.weight, target: topic.pbc.target, priority: topic.pbc.priority },
    })),
    tracks: clone(row.tracks),
    publishedAt: row.publishedAt || null,
    status: row.status,
  };
}

const builtIn = () => ({ ...defaultPolicy(), publishedAt: null, status: 'active', builtIn: true });

export function clearReadinessPolicyCache() { cached = null; cachedAt = 0; publishedCache = null; publishedAt = 0; }

/** The policy serving now (30 s cache). Without any published row, the built-in default (v1). */
export async function getActiveReadinessPolicy({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() - cachedAt < CACHE_MS) return clone(cached);
  const row = await ReadinessPolicy.findOne({ status: 'active' }).sort({ version: -1 }).lean();
  cached = row ? policyFromRow(row) : builtIn();
  cachedAt = Date.now();
  return clone(cached);
}

/**
 * Every policy that has served, oldest first, for scoring history day by day:
 * [{ version, from: Date|null, policy }]. The built-in default serves from the beginning until the
 * first publication.
 */
export async function getPublishedReadinessPolicies({ fresh = false } = {}) {
  if (!fresh && publishedCache && Date.now() - publishedAt < CACHE_MS) return clone(publishedCache);
  const rows = await ReadinessPolicy.find({ status: { $in: ['active', 'archived'] }, publishedAt: { $ne: null } }).sort({ publishedAt: 1, version: 1 }).lean();
  const list = [{ version: 1, from: null, policy: builtIn() }];
  for (const row of rows) list.push({ version: row.version, from: row.publishedAt, policy: policyFromRow(row) });
  publishedCache = list;
  publishedAt = Date.now();
  return clone(list);
}

/** The policy that served at a moment, from getPublishedReadinessPolicies(). */
export function policyAt(published, moment) {
  const at = new Date(moment).getTime();
  let current = published[0];
  for (const entry of published) if (!entry.from || new Date(entry.from).getTime() <= at) current = entry;
  return current;
}

/**
 * Applies editable fields (weight, target, priority per track) from the posted topics onto a base
 * policy. Labels, categories, cutoffs and multipliers stay as published (read-only in the editor).
 */
export function mergeEdits(base, topics = []) {
  const edits = new Map((Array.isArray(topics) ? topics : []).map((topic) => [String(topic?.key || ''), topic]));
  const unknown = [...edits.keys()].filter((key) => !SEED_BY_KEY.has(key));
  const merged = {
    ...base,
    topics: base.topics.map((topic) => {
      const edit = edits.get(topic.key);
      if (!edit) return topic;
      const next = { ...topic };
      for (const track of TRACK_KEYS) {
        const source = edit[track] || {};
        next[track] = { ...topic[track] };
        for (const field of ['weight', 'target', 'priority']) {
          if (source[field] === undefined) continue;
          const value = source[field] === '' || source[field] === null ? Number.NaN : Number(source[field]);
          next[track][field] = value;
        }
        // An excluded row has no priority.
        if (next[track].weight === 0) next[track].priority = 0;
      }
      return next;
    }),
  };
  return { merged, unknown };
}

function assertValid(policy, unknown = []) {
  const result = validatePolicy(policy);
  const errors = [...unknown.map((key) => ({ topic: key, field: 'key', message: `Unknown topic "${key}"` })), ...result.errors];
  if (errors.length) {
    const error = new HttpError(400, errors[0].message);
    error.details = { errors };
    throw error;
  }
  return result.totals;
}

const view = (row) => (row ? { ...policyFromRow(row), revision: row.revision, baseVersion: row.baseVersion, changeReason: row.changeReason, updatedAt: row.updatedAt, publishedBy: row.publishedBy || null, updatedBy: row.updatedBy || null, totals: policyTotals(policyFromRow(row)) } : null);

/** { active, draft, history, defaults } for the editor. */
export async function getReadinessWorkspace() {
  const [active, draft, history] = await Promise.all([
    getActiveReadinessPolicy({ fresh: true }),
    ReadinessPolicy.findOne({ status: 'draft' }).lean(),
    ReadinessPolicy.find({ status: { $in: ['active', 'archived'] } }).sort({ version: -1 }).limit(20).select('version status changeReason publishedAt publishedBy').lean(),
  ]);
  return {
    active: { ...active, totals: policyTotals(active) },
    draft: view(draft),
    history: history.map((row) => ({ version: row.version, status: row.status, changeReason: row.changeReason, publishedAt: row.publishedAt, publishedBy: row.publishedBy || null })),
    defaults: { ...defaultPolicy(), totals: policyTotals(defaultPolicy()) },
  };
}

/** Validates edits against the active policy without saving (preview input). */
export async function draftFromEdits(topics) {
  const active = await getActiveReadinessPolicy({ fresh: true });
  const { merged, unknown } = mergeEdits(active, topics);
  const totals = assertValid(merged, unknown);
  return { policy: merged, totals, base: active };
}

/**
 * Saves the shared draft. `revision`: the draft revision the editor loaded (0 / missing = no
 * draft yet). A different current revision means someone else saved first → 409, nothing written.
 */
export async function saveReadinessDraft({ topics, changeReason = '', revision = 0 }, actorId) {
  const active = await getActiveReadinessPolicy({ fresh: true });
  const existing = await ReadinessPolicy.findOne({ status: 'draft' }).lean();
  const { merged, unknown } = mergeEdits(existing ? policyFromRow(existing) : active, topics);
  assertValid(merged, unknown);
  const reason = String(changeReason || '').slice(0, 500);
  if (existing) {
    const updated = await ReadinessPolicy.findOneAndUpdate(
      { _id: existing._id, status: 'draft', revision: Number(revision) || 0 },
      { $set: { topics: merged.topics, changeReason: reason, updatedBy: actorId }, $inc: { revision: 1 } },
      { new: true },
    ).lean();
    if (!updated) throw Object.assign(new HttpError(409, 'Another admin changed this draft. Reload to see their version; your edits are still on screen.'), { details: { conflict: 'draft', current: view(await ReadinessPolicy.findOne({ status: 'draft' }).lean()) } });
    return view(updated);
  }
  if (Number(revision) > 0) throw Object.assign(new HttpError(409, 'The draft you were editing was published or discarded. Reload to continue.'), { details: { conflict: 'draft', current: null } });
  const top = await ReadinessPolicy.findOne().sort({ version: -1 }).select('version').lean();
  const version = Math.max(2, (top?.version || 1) + 1);
  try {
    const row = await ReadinessPolicy.create({
      version, status: 'draft', topics: merged.topics, tracks: active.tracks, baseVersion: active.version,
      revision: 1, changeReason: reason, createdBy: actorId, updatedBy: actorId,
    });
    return view(row.toObject());
  } catch (error) {
    if (error?.code === 11000) throw new HttpError(409, 'Another admin started a draft at the same moment. Reload to continue.');
    throw error;
  }
}

export async function discardReadinessDraft(revision) {
  const result = await ReadinessPolicy.deleteOne({ status: 'draft', revision: Number(revision) || 0 });
  if (!result.deletedCount) throw new HttpError(409, 'The draft changed or no longer exists. Reload to continue.');
}

/**
 * Publishes the draft. Fails with 409 (draft kept) when the draft changed since the editor loaded
 * it, or when the active version is no longer the one the draft was based on.
 */
export async function publishReadinessPolicy({ revision, changeReason }, actorId) {
  const reason = String(changeReason || '').trim();
  if (reason.length < 5) throw new HttpError(400, 'Add a short reason (at least 5 characters) for the change log.');
  const draft = await ReadinessPolicy.findOne({ status: 'draft' }).lean();
  if (!draft) throw Object.assign(new HttpError(409, 'There is no draft to publish. It may have been published by another admin.'), { details: { conflict: 'missing' } });
  if (draft.revision !== Number(revision)) throw Object.assign(new HttpError(409, 'The draft changed since you loaded it. Compare and reload before publishing.'), { details: { conflict: 'draft', current: view(draft) } });
  const active = await getActiveReadinessPolicy({ fresh: true });
  if (active.version !== draft.baseVersion) {
    throw Object.assign(new HttpError(409, `Version ${active.version} was published after this draft was started. Compare and reload before publishing.`), { details: { conflict: 'base', active, draft: view(draft) } });
  }
  assertValid(policyFromRow(draft));
  const now = new Date();
  const promoted = await ReadinessPolicy.findOneAndUpdate(
    { _id: draft._id, status: 'draft', revision: draft.revision },
    { $set: { status: 'active', publishedAt: now, publishedBy: actorId, changeReason: reason.slice(0, 500) } },
    { new: true },
  ).lean();
  if (!promoted) throw Object.assign(new HttpError(409, 'Another admin published or changed this draft a moment ago. Reload to continue.'), { details: { conflict: 'race' } });
  await ReadinessPolicy.updateMany({ status: 'active', _id: { $ne: promoted._id } }, { $set: { status: 'archived' } });
  clearReadinessPolicyCache();
  return view(promoted);
}
