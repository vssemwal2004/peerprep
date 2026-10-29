import mongoose from "mongoose";
import AIInterview from "../../models/AIInterview.js";
import { currentTenant, runForPlatform, runForTenant } from "../../platform/tenantContext.js";
import { AnviAudioAsset } from "./anviInterview.audio.models.js";
import { currentTenantKey, defaultAudioAssets } from "./anviInterview.audioAssets.js";
import { anviConfig } from "./anviInterview.config.js";
import { AnviAttempt } from "./anviInterview.models.js";
import { staticSpeakableItems } from "./anviInterview.speakable.js";
import { pregenTemplates } from "./anviInterview.templates.js";
import { defaultUsageLedger } from "./anviInterview.usage.js";

// Publish-time question audio (the pregen outbox). Publishing writes `AIInterview.audioPregen` in the same
// CAS as the snapshot ({ revision, status: "pending" }) and kicks a background pass; a publish never
// awaits TTS and never fails because of it. A pass voices the lines that are identical for every student
// (staticSpeakableItems, the reviewed templates and the number clips) through audioAssets.ensure, two at a
// time, at most one start per second, backing off when Gemini is busy. Already-ready clips are skipped
// without a call, so a re-run costs nothing. The maintenance tick claims due outboxes (pending, partial
// past nextAt, or running with an expired lease) and removes attempt-scope clips 24 h after the attempt
// ended. Static clips are never deleted here: unpublish and archive only mark the outbox inactive, so a
// revision pinned by an assignment or an in-progress attempt keeps its audio.
// English only (DECISIONS #0): no translation pass. Nothing here logs text, keys, URLs or audio.

export const PREGEN_STATUSES = Object.freeze(["pending", "running", "done", "partial", "inactive"]);
export const ATTEMPT_AUDIO_RETENTION_MS = 24 * 60 * 60 * 1000;
export const REGENERATE_COOLDOWN_MS = 60_000;

const LEASE_MS = 15 * 60_000;
const RENEW_MS = 60_000;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 60 * 60_000;
const BUSY_BASE_MS = 2000;
const BUSY_MAX_MS = 30_000;
const BUSY_ABORT_STREAK = 3;
const BUSY_CODE = "GEMINI_UNAVAILABLE";
const OBJECT_ID = /^[a-f0-9]{24}$/i;
// The conductor's persona-voice check.
const VOICE_ID = /^[A-Za-z]{2,30}$/;
const defaultSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms).unref?.(); });

/** The outbox a publish writes (inside its CAS) for `revision`. */
export function pendingOutbox(revision, at = new Date()) {
  return { revision: Number(revision), status: "pending", attempts: 0, nextAt: at, leaseUntil: null, requestedAt: at, counts: { total: 0, ready: 0, failed: 0 } };
}

/** The ensure() spec of a static speakable line (shared with the runtime, so the hashes agree). */
export const revisionAssetSpec = (line, { interviewId, revision }) => ({
  scope: "revision", interviewId: String(interviewId), revision: Number(revision), questionId: line.id, text: line.text, language: line.language,
  ...(line.voice ? { voice: line.voice } : {}),
});
/** The ensure() spec of a template clip. */
export const templateAssetSpec = (template, voice = "") => ({
  scope: "template", templateId: template.id, text: template.text, language: template.language, ...(voice ? { voice } : {}),
});

/** Languages a pass voices: the hybrid languages, which are English only. */
const languagesOf = (config) => {
  const wanted = (config.hybridLanguages || ["English"]).filter((language) => language === "English");
  return wanted.length ? wanted : ["English"];
};

/**
 * The voice an attempt of this snapshot speaks with: the admin's voice (data.anvi.voice.name, which
 * plan.persona.voice carries to the hybrid conductor), else the server TTS voice. Must match the conductor,
 * or the publish-time clips are never found.
 */
export function pregenVoiceOf(data, config = anviConfig()) {
  const chosen = String(data?.anvi?.voice?.name || "");
  return VOICE_ID.test(chosen) ? chosen : String(config.ttsVoice || "");
}

/** Every ensure() spec of one published revision: static items first, then templates and number clips. */
export function pregenSpecs(data, { interviewId, revision, config = anviConfig() }) {
  const languages = languagesOf(config);
  const voice = pregenVoiceOf(data, config);
  const items = staticSpeakableItems(data, languages, voice).map((line) => revisionAssetSpec(line, { interviewId, revision }));
  const templates = pregenTemplates(languages)
    .filter((template) => (template.kind !== "number" || config.numberClips !== false) && (template.kind !== "ack" || config.ackClips !== false))
    .map((template) => templateAssetSpec(template, voice));
  return [...items, ...templates];
}

/** The admin view of an outbox (no text, keys or failure detail). */
export function outboxView(outbox, { enabled = false, assets = null } = {}) {
  const box = outbox && typeof outbox === "object" ? outbox : null;
  return {
    enabled: Boolean(enabled),
    revision: Number.isInteger(box?.revision) ? box.revision : null,
    status: PREGEN_STATUSES.includes(box?.status) ? box.status : null,
    attempts: Number(box?.attempts) || 0,
    nextAt: box?.nextAt || null,
    finishedAt: box?.finishedAt || null,
    counts: { total: Number(box?.counts?.total) || 0, ready: Number(box?.counts?.ready) || 0, failed: Number(box?.counts?.failed) || 0 },
    ...(assets ? { assets } : {}),
  };
}

const runIn = (tenant, work) => (tenant?.universityId && tenant?.connection ? runForTenant(tenant, work) : runForPlatform(work));

/**
 * Creates the pregen service. Injectable for tests: `model` (AIInterview), `assetModel`, `attemptModel`,
 * `assets` (audioAssets; default the process store), `config`, `clock`, `sleep`, `log`, `ledger`,
 * `concurrency` (2), `minIntervalMs` (1000: at most one TTS start per second).
 *
 * - `kick(interviewId, revision)`: fire-and-forget under the caller's tenant; returns the run's promise
 *   (resolves to the pass result or null), which callers do not await. Never throws.
 * - `runPass(interviewId, revision)`: claims the outbox and voices it; null when nothing was due.
 * - `ensureRevision({ interviewId, revision })`: an assignment pins `revision`; makes sure its outbox exists
 *   (an interview published before the outbox existed gets one) and kicks it.
 * - `regenerate(interviewId)`: resets the backoff of this revision's failed clips and re-queues the outbox.
 * - `status(interviewId)`: the outbox view plus live asset counts for the published revision.
 * - `maintain({ now, limit })`: claims due outboxes (detached) and cleans up attempt clips.
 */
export function createAudioPregen({
  model = AIInterview,
  assetModel = AnviAudioAsset,
  attemptModel = AnviAttempt,
  assets = null,
  config = anviConfig(),
  clock = Date,
  sleep = defaultSleep,
  log = console,
  ledger = null,
  concurrency = 2,
  minIntervalMs = 1000,
} = {}) {
  const store = () => (assets ||= defaultAudioAssets());
  const usage = () => (ledger || defaultUsageLedger());
  const now = () => new Date(clock.now());
  const warn = (message) => { try { log.warn?.(`[ANVI] ${message}`); } catch { /* logging never fails a pass */ } };
  const running = new Set();
  const enabled = () => Boolean(config.hybridEnabled) && config.ttsCacheEnabled !== false;
  const validId = (id) => OBJECT_ID.test(String(id || ""));

  function kick(interviewId, revision) {
    if (!enabled() || !validId(interviewId)) return Promise.resolve(null);
    const tenant = currentTenant();
    return new Promise((resolve) => { setImmediate(resolve); })
      .then(() => runIn(tenant, () => runPass(interviewId, revision)))
      .catch((error) => { warn(`Question audio pass failed (${error?.name || "Error"}).`); return null; });
  }

  // Atomic claim: only a due outbox of this revision, on a published draft. A second publish of the same
  // revision cannot exist (each publish bumps the revision), and a concurrent kick loses the claim.
  async function claim(interviewId, revision) {
    const at = now();
    const leaseUntil = new Date(at.getTime() + LEASE_MS);
    return model.findOneAndUpdate(
      {
        _id: interviewId,
        lifecycle: "draft",
        publishedRevision: Number(revision),
        "audioPregen.revision": Number(revision),
        $or: [
          { "audioPregen.status": { $in: ["pending", "partial"] }, $or: [{ "audioPregen.nextAt": null }, { "audioPregen.nextAt": { $lte: at } }] },
          { "audioPregen.status": "running", "audioPregen.leaseUntil": { $lte: at } },
        ],
      },
      { $set: { "audioPregen.status": "running", "audioPregen.leaseUntil": leaseUntil, "audioPregen.startedAt": at }, $inc: { "audioPregen.attempts": 1 } },
      { new: true, projection: { publishedSnapshot: 1, publishedRevision: 1, audioPregen: 1 } },
    ).lean();
  }

  async function runPass(interviewId, revision) {
    const key = `${currentTenantKey()}:${interviewId}:${revision}`;
    if (running.has(key)) return null;
    running.add(key);
    try {
      const doc = await claim(interviewId, revision);
      if (!doc?.publishedSnapshot?.data) return null;
      return await voice(doc, Number(revision));
    } finally {
      running.delete(key);
    }
  }

  async function voice(doc, revision) {
    let leaseUntil = doc.audioPregen.leaseUntil;
    const lease = () => ({ _id: doc._id, "audioPregen.revision": revision, "audioPregen.status": "running", "audioPregen.leaseUntil": leaseUntil });
    const specs = pregenSpecs(doc.publishedSnapshot.data, { interviewId: doc._id, revision, config });
    const tenantKey = currentTenantKey();
    const hashes = specs.map((spec) => store().hashFor(spec));
    const ready = new Set((await assetModel.find({ tenantKey, hash: { $in: hashes.filter(Boolean) }, status: "ready" }, { hash: 1 }).lean()).map((row) => row.hash));
    const todo = specs.map((spec, index) => ({ spec, hash: hashes[index] })).filter((entry) => entry.hash && !ready.has(entry.hash));
    const onUsage = usage().recorder({ interviewId: doc._id });
    let readyCount = specs.length - todo.length - hashes.filter((hash) => !hash).length;
    let failed = hashes.filter((hash) => !hash).length;
    let nextStart = 0;
    let busy = 0;
    let busyDelay = BUSY_BASE_MS;
    let aborted = false;
    let lost = false;
    let renewedAt = clock.now();
    let cursor = 0;

    // At most one start per second across both workers; a busy reply pushes the next start back.
    async function gate() {
      const at = clock.now();
      const wait = Math.max(0, nextStart - at);
      nextStart = Math.max(at, nextStart) + Math.max(0, Number(minIntervalMs) || 0);
      if (wait > 0) await sleep(wait);
    }
    async function renew() {
      if (clock.now() - renewedAt < RENEW_MS) return;
      renewedAt = clock.now();
      const next = new Date(clock.now() + LEASE_MS);
      const result = await model.updateOne(lease(), { $set: { "audioPregen.leaseUntil": next } }).catch(() => null);
      if (result?.matchedCount) leaseUntil = next;
      else lost = true;
    }
    async function busyFailure(hash, startedAt) {
      const row = await assetModel.findOne({ tenantKey, hash }, { status: 1, failureCode: 1, updatedAt: 1 }).lean().catch(() => null);
      return row?.status === "failed" && row.failureCode === BUSY_CODE && new Date(row.updatedAt).getTime() >= startedAt;
    }
    async function worker() {
      while (!aborted && !lost && cursor < todo.length) {
        const entry = todo[cursor++];
        await gate();
        const startedAt = clock.now();
        const result = await store().ensure({ ...entry.spec, onUsage, metric: onUsage.metric }).catch(() => null);
        if (result) { readyCount += 1; busy = 0; busyDelay = BUSY_BASE_MS; }
        else {
          failed += 1;
          if (await busyFailure(entry.hash, startedAt)) {
            busy += 1;
            if (busy >= BUSY_ABORT_STREAK) aborted = true;
            nextStart = Math.max(nextStart, clock.now() + busyDelay);
            busyDelay = Math.min(BUSY_MAX_MS, busyDelay * 2);
          }
        }
        await renew();
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(4, Number(concurrency) || 2)) }, worker));

    const skipped = todo.length - Math.min(cursor, todo.length);
    failed += skipped;
    const counts = { total: specs.length, ready: readyCount, failed };
    const complete = failed === 0;
    const attempts = Number(doc.audioPregen.attempts) || 1;
    const backoff = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1));
    const at = now();
    const set = complete
      ? { "audioPregen.status": "done", "audioPregen.nextAt": null, "audioPregen.leaseUntil": null, "audioPregen.counts": counts, "audioPregen.finishedAt": at }
      : { "audioPregen.status": "partial", "audioPregen.nextAt": new Date(at.getTime() + backoff), "audioPregen.leaseUntil": null, "audioPregen.counts": counts, "audioPregen.finishedAt": at };
    // A republish, unpublish or takeover replaced the outbox meanwhile: it is left as it is.
    if (!lost) await model.updateOne(lease(), { $set: set }).catch(() => null);
    if (!complete) warn(`Question audio pass incomplete (${failed} of ${specs.length} clips missing).`);
    return { status: complete ? "done" : "partial", counts, lost };
  }

  async function ensureRevision({ interviewId, revision } = {}) {
    try {
      if (!enabled() || !validId(interviewId) || !Number.isInteger(Number(revision))) return null;
      const rev = Number(revision);
      // Only creates or replaces an older outbox; a newer revision's outbox is never overwritten.
      await model.updateOne(
        { _id: interviewId, publishedRevision: rev, $or: [{ audioPregen: null }, { "audioPregen.revision": { $lt: rev } }] },
        { $set: { audioPregen: pendingOutbox(rev, now()) } },
      );
      return kick(interviewId, rev);
    } catch (error) {
      warn(`Question audio could not be queued (${error?.name || "Error"}).`);
      return null;
    }
  }

  /** Returns { ok, code?, outbox?, retryAt? }. The caller has already checked ownership. */
  async function regenerate(interviewId) {
    const doc = await model.findOne({ _id: interviewId }, { lifecycle: 1, publishedRevision: 1, publishedAt: 1, audioPregen: 1 }).lean();
    if (!doc || doc.lifecycle !== "draft" || !doc.publishedAt || !Number.isInteger(doc.publishedRevision))
      return { ok: false, code: "INTERVIEW_NOT_PUBLISHED" };
    const at = now();
    const box = doc.audioPregen;
    const since = box?.requestedAt ? at.getTime() - new Date(box.requestedAt).getTime() : Infinity;
    if (since < REGENERATE_COOLDOWN_MS) return { ok: false, code: "RATE_LIMITED", retryAt: new Date(at.getTime() + REGENERATE_COOLDOWN_MS - since) };
    // A pass of this revision is already running: nothing to re-queue.
    if (box?.revision === doc.publishedRevision && box.status === "running" && box.leaseUntil && new Date(box.leaseUntil) > at)
      return { ok: true, outbox: box, alreadyRunning: true };
    const outbox = pendingOutbox(doc.publishedRevision, at);
    const updated = await model.findOneAndUpdate(
      { _id: interviewId, publishedRevision: doc.publishedRevision, ...(box?.requestedAt ? { "audioPregen.requestedAt": box.requestedAt } : {}) },
      { $set: { audioPregen: outbox } },
      { new: true, projection: { audioPregen: 1 } },
    ).lean();
    if (!updated) return { ok: false, code: "RATE_LIMITED", retryAt: new Date(at.getTime() + REGENERATE_COOLDOWN_MS) };
    // Failed clips of this revision may be retried now instead of after their backoff.
    await assetModel.updateMany(
      { tenantKey: currentTenantKey(), scope: "revision", interviewId: new mongoose.Types.ObjectId(String(interviewId)), revision: doc.publishedRevision, status: "failed" },
      { $set: { retryAfter: null } },
    ).catch(() => null);
    kick(interviewId, doc.publishedRevision);
    return { ok: true, outbox: updated.audioPregen };
  }

  async function status(interviewId) {
    const doc = await model.findOne({ _id: interviewId }, { publishedRevision: 1, audioPregen: 1 }).lean();
    if (!doc) return null;
    let counts = null;
    if (Number.isInteger(doc.publishedRevision)) {
      const rows = await assetModel.aggregate([
        { $match: { tenantKey: currentTenantKey(), scope: "revision", interviewId: new mongoose.Types.ObjectId(String(interviewId)), revision: doc.publishedRevision } },
        { $group: { _id: "$status", n: { $sum: 1 } } },
      ]).catch(() => []);
      counts = { ready: 0, generating: 0, failed: 0 };
      for (const row of rows) if (row._id in counts) counts[row._id] = row.n;
    }
    return outboxView(doc.audioPregen, { enabled: enabled(), assets: counts });
  }

  // Attempt clips of attempts that ended at least 24 h ago (or no longer exist).
  async function cleanupAttempts(at, limit) {
    const rows = await assetModel.find({ tenantKey: currentTenantKey(), scope: "attempt", attemptId: { $exists: true } }, { attemptId: 1 })
      .sort({ createdAt: 1 }).limit(Math.max(1, limit * 10)).lean();
    const ids = [...new Set(rows.map((row) => String(row.attemptId)))].slice(0, limit);
    if (!ids.length) return { removed: 0, failed: 0 };
    const attempts = await attemptModel.find({ _id: { $in: ids } }, { status: 1, endedAt: 1 }).lean();
    const byId = new Map(attempts.map((row) => [String(row._id), row]));
    const cutoff = at.getTime() - ATTEMPT_AUDIO_RETENTION_MS;
    const due = ids.filter((id) => {
      const attempt = byId.get(id);
      if (!attempt) return true;
      return attempt.status !== "in_progress" && attempt.endedAt && new Date(attempt.endedAt).getTime() <= cutoff;
    });
    return due.length ? store().cleanupAttemptAssets(due) : { removed: 0, failed: 0 };
  }

  async function maintain({ now: at = now(), limit = 3 } = {}) {
    if (!enabled()) return { claimed: 0, cleaned: { removed: 0, failed: 0 }, skipped: true };
    const due = await model.find({
      lifecycle: "draft",
      publishedAt: { $ne: null },
      $or: [
        { "audioPregen.status": { $in: ["pending", "partial"] }, $or: [{ "audioPregen.nextAt": null }, { "audioPregen.nextAt": { $lte: at } }] },
        { "audioPregen.status": "running", "audioPregen.leaseUntil": { $lte: at } },
      ],
    }, { _id: 1, publishedRevision: 1, audioPregen: 1 }).limit(Math.max(1, limit)).lean();
    let claimed = 0;
    for (const row of due) {
      if (row.audioPregen?.revision !== row.publishedRevision) continue;
      claimed += 1;
      // Detached: the maintenance tick only claims; the TTS work continues in the background.
      kick(String(row._id), row.publishedRevision);
    }
    const cleaned = await cleanupAttempts(at, 50).catch((error) => {
      warn(`Attempt audio cleanup failed (${error?.name || "Error"}).`);
      return { removed: 0, failed: 0 };
    });
    return { claimed, cleaned };
  }

  return { enabled, kick, runPass, ensureRevision, regenerate, status, maintain };
}

let shared = null;
/** The process-wide pregen service. */
export const defaultAudioPregen = () => (shared ||= createAudioPregen());
