// The stored Prep Score allocation for an accepted first solve (rule: quotaRules.js).
//
// Durable and idempotent: one PrepScoreAllocation receipt per (university DB, student, canonical
// problem), protected by a unique index. A retry, a re-accept or the other copy of the same
// problem returns the original receipt; nothing is awarded or reserved twice.
//
// The final slot: each open tag is reserved with a conditional $inc on PrepScoreTopicSlot
// (used < limit), so two solves accepted together can never both take a tag's last slot.
// No multi-document transaction (the local MongoDB is standalone and university databases use
// their own connections), so the steps are ordered to fail safe:
//   1. reserve slots   2. insert the receipt (unique)   3. on a duplicate receipt, release the slots.
// Recovery: a crash between 1 and 2 leaves a slot counted without a receipt. Before reserving,
// repairSlots() lowers any slot that is ahead of the replayed ledger and older than two minutes,
// so a leaked slot heals on the student's next accepted solve that day.
import mongoose from 'mongoose';
import { ensureReadinessIndexes, PrepScoreAllocation, PrepScoreTopicSlot } from '../../models/PrepReadiness.js';
import { catalogueEntry } from '../prepReadiness/catalogue.js';
import { primaryTopic } from '../prepReadiness/engine.js';
import { mappingsFor } from '../prepReadiness/evidence.js';
import { istDay } from './points.js';
import { quotaTags } from './quotaRules.js';

const LEAK_AFTER_MS = 2 * 60_000;
const objectId = (value) => new mongoose.Types.ObjectId(String(value));

/**
 * Credited solves per quota key on `day` that are already decided: receipts (and solves under the
 * older rule). Solves still being allocated are left out — the atomic slot arbitrates between
 * them; counting their replayed shares here would let two concurrent solves block each other.
 */
export function settledUsage(ledger, day, skipKey) {
  const used = new Map();
  for (const event of ledger.events || []) {
    if (event.kind !== 'solve' || event.day !== day || event.key === skipKey) continue;
    if (event.meta?.rule === 'allocation' && !event.meta?.receipt) continue;
    for (const part of event.meta?.parts || []) {
      if (!part.counted) continue;
      const key = part.key || part.topic.toLowerCase();
      used.set(key, (used.get(key) || 0) + 1);
    }
  }
  return used;
}

async function repairSlots(studentId, day, tags, used, now) {
  await Promise.all(tags.map((tag) => PrepScoreTopicSlot.updateOne(
    { studentId, day, topic: tag.key, used: { $gt: used.get(tag.key) || 0 }, updatedAt: { $lt: new Date(now.getTime() - LEAK_AFTER_MS) } },
    { $set: { used: used.get(tag.key) || 0 } },
  )));
}

async function reserve(studentId, day, tag, limit, floor) {
  // Seed from the ledger (monotonic), then take a slot only while below the limit.
  await PrepScoreTopicSlot.updateOne({ studentId, day, topic: tag.key }, { $max: { used: floor } }, { upsert: true }).catch((error) => { if (error?.code !== 11000) throw error; });
  const taken = await PrepScoreTopicSlot.findOneAndUpdate({ studentId, day, topic: tag.key, used: { $lt: limit } }, { $inc: { used: 1 } }, { new: true }).lean();
  return Boolean(taken);
}

const release = (studentId, day, tags) => Promise.all(tags.map((tag) => PrepScoreTopicSlot.updateOne({ studentId, day, topic: tag.key, used: { $gt: 0 } }, { $inc: { used: -1 } })));

/**
 * Allocates (or returns) the receipt for an accepted solve. `ledger`: the student's ledger
 * replayed with this submission included; `config`: the serving Prep Score config.
 * → { receipt, created } or null (before the allocation start day, or a repeat solve).
 */
export async function allocateAcceptedSolve({ student, source, problemId, ledger, config, now = new Date() }) {
  const points = config?.points || {};
  const day = istDay(now);
  if (!points.allocationFrom || day < points.allocationFrom) return null;
  const entry = await catalogueEntry(source, problemId);
  if (!entry?.difficulty) return null;
  await ensureReadinessIndexes(PrepScoreAllocation, PrepScoreTopicSlot);
  const studentId = objectId(student._id);
  const existing = await PrepScoreAllocation.findOne({ studentId, problemKey: entry.problemKey }).lean();
  if (existing) return { receipt: existing, created: false };

  // Only the first solve of the canonical problem gets a receipt: the ledger pays one event per
  // canonical problem, and it must be this submission, today.
  const first = (ledger.events || []).find((event) => event.kind === 'solve' && (event.meta?.problemKey || event.key) === entry.problemKey);
  if (!first || first.key !== entry.sourceKey || first.day !== day) return null;

  const tags = quotaTags(entry.tags);
  const limit = Number(config.modules?.coding?.dailyTopicLimit) || 0;
  const limited = day >= points.topicLimitFrom && limit > 0;
  const base = Number(points.solve?.[entry.difficulty]) || 0;
  const used = settledUsage(ledger, day, entry.sourceKey);
  const open = [];
  if (limited) {
    await repairSlots(studentId, day, tags, used, now);
    for (const tag of tags) if (await reserve(studentId, day, tag, limit, used.get(tag.key) || 0)) open.push(tag);
  } else {
    open.push(...tags);
  }
  const share = open.length ? base / open.length : 0;
  const mappings = await mappingsFor([entry.problemKey]);
  const readiness = primaryTopic({ primary: entry.primary, tags: entry.tags });
  const doc = {
    studentId, problemKey: entry.problemKey, sourceKey: entry.sourceKey, day, difficulty: entry.difficulty, base, limit: limited ? limit : 0,
    tags: tags.map((tag) => tag.key), parts: open.map((tag) => ({ topic: tag.key, label: tag.label, points: share })),
    fullTags: tags.filter((tag) => !open.includes(tag)).map((tag) => tag.label), points: open.length ? base : 0,
    readinessTopic: mappings.get(entry.problemKey) || readiness.topic, solvedAt: first.at ? new Date(first.at) : now,
  };
  try {
    const created = await PrepScoreAllocation.create(doc);
    return { receipt: created.toObject(), created: true };
  } catch (error) {
    if (error?.code !== 11000) { if (limited) await release(studentId, day, open); throw error; }
    // Lost a race with the same solve (retry / double submit): keep the first receipt.
    if (limited) await release(studentId, day, open);
    return { receipt: await PrepScoreAllocation.findOne({ studentId, problemKey: entry.problemKey }).lean(), created: false };
  }
}
