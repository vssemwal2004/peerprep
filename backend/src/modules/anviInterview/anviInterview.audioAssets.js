import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { getValkeyClient } from "../../utils/valkey.js";
import { currentTenant } from "../../platform/tenantContext.js";
import { AnviAudioAsset, AUDIO_ASSET_SCOPES, ensureAnviAudioIndexes } from "./anviInterview.audio.models.js";
import { audioStorageKey, createAudioStorage, MAX_AUDIO_BYTES } from "./anviInterview.audioStorage.js";
import { anviConfig } from "./anviInterview.config.js";
import { createGeminiClient } from "./anviInterview.gemini.js";
import { TEMPLATE_SCHEMA_VERSION } from "./anviInterview.templates.js";
import { normalizeLoudness, parseWav, trimSilence, TTS_SAMPLE_RATE, wpm, wrapWav } from "./anviInterview.wav.js";

// TTS asset cache for ANVI question audio. One clip is synthesized once per (tenant, scope, interview,
// revision, attempt, question, language, voice, style, model, text) and shared by every student who hears
// that exact line; per-student generated questions use the attempt scope and are never shared.
//
// ensure(spec) resolution order:
//   1. this process's in-flight map (at most 256 entries)
//   2. a ready AnviAudioAsset row (hit; lastUsedAt refreshed at most every 6 h)
//   3. Valkey lock `peerprep:anvi:tts-lock:{tenantKey}:{hash}` (SET NX PX, released by compare-and-delete)
//   4. atomic Mongo claim on the unique (tenantKey, hash) index (the guard that still holds when Valkey is
//      down); a loser polls Mongo with backoff (150 ms -> 1 s)
//   5. the winner first tries reuse across revisions (an identical ready clip of an older revision of the
//      same interview is copied in R2, with no TTS), else synthesizes -> trims silence -> normalizes
//      loudness -> checks the pace (below ttsMinWpm: one retry on ttsFallbackModel, else TTS_TOO_SLOW) ->
//      puts the WAV to R2 -> marks the row ready.
//   On failure the row is marked failed with attempts + 1 and a retryAfter from 30 s doubling to 10 min;
//   a failed row is never served and is retried only after retryAfter.
// Every failure resolves to null (the caller shows the text instead); nothing here throws to the interview.
// Rows and logs never hold the spoken text, a URL, a storage key or audio bytes.

const LOCK_SCRIPT_RELEASE = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
const MAX_IN_FLIGHT = 256;
const DEFAULT_LRU_BYTES = 64 * 1024 * 1024;
const LAST_USED_REFRESH_MS = 6 * 60 * 60 * 1000;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 10 * 60_000;
const POLL_START_MS = 150;
const POLL_MAX_MS = 1000;
// The pace guard needs a few words to measure; "Okay." or "Question three." is not judged on pace.
const PACE_MIN_WORDS = 4;
const FAILURE_CODE = /^[A-Z][A-Z0-9_]{1,79}$/;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const defaultSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms).unref?.(); });
const idOf = (value) => (value === null || value === undefined || value === "" ? null : String(value));
const wordCount = (text) => String(text || "").trim().split(/\s+/).filter(Boolean).length;

/** NFC, trimmed, whitespace collapsed; punctuation kept. The form that is spoken and hashed. */
export function normalizeSpokenText(text) {
  return String(text ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

export const textHashOf = (text) => sha256(normalizeSpokenText(text));

/** The tenant key of the current request or job ("platform" outside a university). */
export const currentTenantKey = () => {
  const tenant = currentTenant();
  return tenant?.universityId ? String(tenant.universityId) : "platform";
};

export const ttsLockKey = (tenantKey, hash) => `peerprep:anvi:tts-lock:${tenantKey}:${hash}`;

/**
 * The asset hash: sha256 over [schemaVersion, tenantKey, scope, interviewId, revision, attemptId|null,
 * questionId|templateId, language, voice, style, model, textHash]. Template clips also carry the template
 * catalogue version in the first element, so a catalogue bump gives new hashes.
 */
export function assetHash({ schemaVersion, tenantKey, scope, interviewId = null, revision = null, attemptId = null, questionId, language, voice, style = "", model, textHash }) {
  const version = scope === "template" ? `${schemaVersion}.t${TEMPLATE_SCHEMA_VERSION}` : schemaVersion;
  return sha256(JSON.stringify([
    version, String(tenantKey), scope, idOf(interviewId), revision === null || revision === undefined ? null : Number(revision),
    idOf(attemptId), String(questionId), String(language), String(voice), String(style || ""), String(model), textHash,
  ]));
}

function failureCodeOf(error) {
  const code = String(error?.code || "");
  return FAILURE_CODE.test(code) ? code : "TTS_FAILED";
}

// A byte-bounded LRU of WAV files keyed by `${tenantKey}:${hash}`.
function createLru(maxBytes) {
  const entries = new Map();
  let bytes = 0;
  return {
    get(key) {
      const value = entries.get(key);
      if (!value) return null;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      if (!value?.wav || value.wav.length > maxBytes) return;
      const old = entries.get(key);
      if (old) { bytes -= old.wav.length; entries.delete(key); }
      entries.set(key, value);
      bytes += value.wav.length;
      for (const [oldest, entry] of entries) {
        if (bytes <= maxBytes) break;
        entries.delete(oldest);
        bytes -= entry.wav.length;
      }
    },
    delete(key) {
      const old = entries.get(key);
      if (old) { bytes -= old.wav.length; entries.delete(key); }
    },
    stats: () => ({ entries: entries.size, bytes }),
  };
}

/**
 * Creates the asset store. Dependencies are injectable for tests: `model` (AnviAudioAsset), `storage`
 * (audioStorage), `gemini` (needs synthesizeSpeech; created lazily), `valkey` (sendCommand; null = Mongo
 * claim only), `clock`, `sleep`, `log`, `metric(name, n)` (a default metric sink), `lruBytes`.
 *
 * Returns:
 * - `ensure(spec)` -> { assetId, hash, scope, status, durationMs, stored } | null. spec: { scope
 *   (revision|template|attempt), interviewId, revision, attemptId, questionId (or templateId), text,
 *   language, voice, style, model, budget, onUsage, metric }. Attempt scope needs budget.allow('tts');
 *   static and template scope on a miss need budget.allow('tts_static') when a budget is given. An
 *   attempt-scope clip resolves as soon as it is synthesized (playable from this process's cache);
 *   `stored` resolves to whether the R2 put and ready mark succeeded.
 * - `load(assetId, attempt)` -> { assetId, wav, pcm, sampleRate, durationMs, mimeType, size } | null. The
 *   asset must be in the current tenant and belong to the attempt's interview and snapshotRevision, be a
 *   tenant template, or belong to this attempt. Never throws.
 * - `cleanupAttemptAssets(attemptIds)` -> { removed, failed }: deletes attempt-scope rows and objects.
 * - `stats()`.
 */
export function createAudioAssets({
  model = AnviAudioAsset,
  storage = null,
  gemini = null,
  valkey = process.env.NODE_TEST_CONTEXT ? null : getValkeyClient(),
  config = anviConfig(),
  clock = Date,
  sleep = defaultSleep,
  log = console,
  metric = null,
  lruBytes = DEFAULT_LRU_BYTES,
  ensureIndexes = ensureAnviAudioIndexes,
} = {}) {
  let store = storage;
  let client = gemini;
  const storageNow = () => (store ||= createAudioStorage({ config }));
  const geminiNow = () => (client ||= createGeminiClient({ config }));
  const inFlight = new Map();
  const lru = createLru(Math.max(1, Number(lruBytes) || DEFAULT_LRU_BYTES));
  const leaseMs = 2 * (Number(config.ttsTimeoutMs) || 20000) + 10_000;
  const warned = new Set();

  const now = () => new Date(clock.now());
  const warn = (message) => { try { log.warn?.(`[ANVI] ${message}`); } catch { /* logging never fails a call */ } };
  const warnOnce = (key, message) => { if (!warned.has(key)) { warned.add(key); warn(message); } };
  const emit = (spec, name) => {
    for (const sink of [spec?.metric || spec?.onUsage?.metric, metric]) {
      try { sink?.(name, 1); } catch { /* metrics never fail a call */ }
    }
  };
  const resultOf = (row, extra = {}) => ({
    assetId: String(row._id), hash: row.hash, scope: row.scope, status: row.status, durationMs: row.durationMs || 0, stored: Promise.resolve(row.status === "ready"), ...extra,
  });

  function describe(spec = {}) {
    const scope = spec.scope;
    if (!AUDIO_ASSET_SCOPES.includes(scope)) return null;
    const text = normalizeSpokenText(spec.text);
    const questionId = String(spec.questionId ?? spec.templateId ?? "").slice(0, 200);
    if (!text || !questionId) return null;
    const language = String(spec.language || "English");
    const tenantKey = currentTenantKey();
    const interviewId = scope === "template" ? null : idOf(spec.interviewId);
    const revision = scope === "revision" ? Number(spec.revision) : null;
    const attemptId = scope === "attempt" ? idOf(spec.attemptId) : null;
    if (interviewId && !OBJECT_ID.test(interviewId)) return null;
    if (scope === "revision" && (!interviewId || !Number.isInteger(revision) || revision < 0)) return null;
    if (scope === "attempt" && !(attemptId && OBJECT_ID.test(attemptId))) return null;
    const fields = {
      tenantKey, scope, interviewId, revision, attemptId, questionId, language,
      voice: String(spec.voice || config.ttsVoice || config.liveVoice || "Aoede"),
      style: String(spec.style ?? config.ttsStyleByLanguage?.[language] ?? ""),
      model: String(spec.model || config.ttsModel),
      schemaVersion: Number(config.ttsCacheSchemaVersion) || 1,
      textHash: sha256(text),
    };
    const hash = assetHash(fields);
    return { ...fields, hash, text, storageKey: audioStorageKey({ ...fields, hash }) };
  }

  /** The hash a spec resolves to (null for an invalid spec). */
  function hashFor(spec) {
    try { return describe(spec)?.hash || null; } catch { return null; }
  }

  async function ensure(spec = {}) {
    try {
      if (config.ttsCacheEnabled === false) return null;
      const asset = describe(spec);
      if (!asset) return null;
      const key = `${asset.tenantKey}:${asset.hash}`;
      const running = inFlight.get(key);
      if (running) {
        const shared = await running;
        if (shared) emit(spec, "ttsCacheHit");
        return shared;
      }
      const work = resolve(asset, spec).catch((error) => {
        warn(`Question audio not available (${failureCodeOf(error)}).`);
        return null;
      });
      if (inFlight.size < MAX_IN_FLIGHT) {
        inFlight.set(key, work);
        work.finally(() => { if (inFlight.get(key) === work) inFlight.delete(key); });
      }
      return await work;
    } catch (error) {
      warn(`Question audio not available (${failureCodeOf(error)}).`);
      return null;
    }
  }

  function touch(row) {
    const last = row.lastUsedAt ? new Date(row.lastUsedAt).getTime() : 0;
    if (clock.now() - last < LAST_USED_REFRESH_MS) return;
    Promise.resolve()
      .then(() => model.updateOne({ _id: row._id }, { $set: { lastUsedAt: now() } }))
      .catch(() => {});
  }

  const findRow = (asset) => model.findOne({ tenantKey: asset.tenantKey, hash: asset.hash }).lean();
  const retryBlocked = (row) => row?.status === "failed" && row.retryAfter && new Date(row.retryAfter).getTime() > clock.now();

  async function resolve(asset, spec) {
    let row = await findRow(asset);
    if (row?.status === "ready") {
      emit(spec, "ttsCacheHit");
      touch(row);
      return resultOf(row);
    }
    if (retryBlocked(row)) return null;
    if (row?.status === "generating" && row.scope === "attempt" && lru.get(`${asset.tenantKey}:${asset.hash}`)) {
      // Synthesized here, still being stored: already playable.
      emit(spec, "ttsCacheHit");
      return resultOf(row);
    }
    if (!storageNow().ready) {
      warnOnce("storage", "Question audio storage is not configured; prompts fall back to text.");
      return null;
    }
    if (spec.budget && typeof spec.budget.allow === "function" && !spec.budget.allow(asset.scope === "attempt" ? "tts" : "tts_static")) return null;

    const lock = await acquireLock(asset);
    try {
      if (lock === false) return await waitForReady(asset, spec);
      await ensureIndexes().catch(() => warnOnce("indexes", "Question audio indexes not created; the claim may not be exclusive."));
      const claimed = await claim(asset);
      if (!claimed) return await waitForReady(asset, spec);
      emit(spec, "ttsCacheMiss");
      return await produce(asset, claimed, spec);
    } finally {
      if (lock) releaseLock(asset, lock);
    }
  }

  // A token when the lock was taken, false when another holder has it, null when Valkey is unavailable
  // (the Mongo claim alone then keeps generation single).
  async function acquireLock(asset) {
    if (!valkey) return null;
    const token = randomBytes(16).toString("base64url");
    try {
      const reply = await valkey.sendCommand(["SET", ttsLockKey(asset.tenantKey, asset.hash), token, "NX", "PX", String(leaseMs)]);
      return reply === "OK" ? token : false;
    } catch {
      warnOnce("valkey", "Valkey unavailable for the question audio lock; using the database claim.");
      return null;
    }
  }

  function releaseLock(asset, token) {
    Promise.resolve()
      .then(() => valkey.sendCommand(["EVAL", LOCK_SCRIPT_RELEASE, "1", ttsLockKey(asset.tenantKey, asset.hash), token]))
      .catch(() => {});
  }

  // Atomic claim: takes a missing row, a failed row past retryAfter or a generating row whose lease
  // expired. Any other existing row makes the upsert collide on the unique index (another holder).
  async function claim(asset) {
    const at = now();
    const leaseUntil = new Date(at.getTime() + leaseMs);
    try {
      return await model.findOneAndUpdate(
        {
          tenantKey: asset.tenantKey,
          hash: asset.hash,
          $or: [
            { status: "failed", $or: [{ retryAfter: null }, { retryAfter: { $lte: at } }] },
            { status: "generating", $or: [{ leaseUntil: null }, { leaseUntil: { $lte: at } }] },
          ],
        },
        {
          $set: {
            scope: asset.scope,
            interviewId: asset.interviewId ? new mongoose.Types.ObjectId(asset.interviewId) : null,
            revision: asset.revision,
            ...(asset.attemptId ? { attemptId: new mongoose.Types.ObjectId(asset.attemptId) } : {}),
            questionId: asset.questionId,
            textHash: asset.textHash,
            language: asset.language,
            voice: asset.voice,
            style: asset.style,
            model: asset.model,
            schemaVersion: asset.schemaVersion,
            mimeType: "audio/wav",
            storageKey: asset.storageKey,
            status: "generating",
            failureCode: null,
            leaseUntil,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
    } catch (error) {
      if (error?.code === 11000) return null;
      throw error;
    }
  }

  // Polls until another holder finishes: ready -> hit; failed -> null; gives up after the lease.
  async function waitForReady(asset, spec) {
    const deadline = clock.now() + leaseMs;
    // Also bounded by count, so a frozen test clock cannot poll forever.
    const maxPolls = Math.ceil(leaseMs / POLL_MAX_MS) + 4;
    let delay = POLL_START_MS;
    for (let poll = 0; poll < maxPolls && clock.now() < deadline; poll += 1) {
      await sleep(delay);
      delay = Math.min(POLL_MAX_MS, delay * 2);
      const row = await findRow(asset);
      if (row?.status === "ready") {
        emit(spec, "ttsCacheHit");
        return resultOf(row);
      }
      if (row?.status === "failed") return null;
      if (row?.status === "generating" && row.leaseUntil && new Date(row.leaseUntil).getTime() <= clock.now()) {
        // The holder died: take over once.
        const claimed = await claim(asset);
        if (claimed) { emit(spec, "ttsCacheMiss"); return produce(asset, claimed, spec); }
      }
    }
    return null;
  }

  async function markFailed(claimed, error) {
    const code = failureCodeOf(error);
    const attempts = (Number(claimed.attempts) || 0) + 1;
    const backoff = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempts - 1));
    await model.updateOne(
      { _id: claimed._id, status: "generating", leaseUntil: claimed.leaseUntil },
      { $set: { status: "failed", failureCode: code, retryAfter: new Date(clock.now() + backoff), leaseUntil: null }, $inc: { attempts: 1 } },
    ).catch(() => {});
    warn(`Question audio not generated (${code}).`);
    return null;
  }

  async function markReady(claimed, fields) {
    const result = await model.updateOne(
      { _id: claimed._id, status: "generating", leaseUntil: claimed.leaseUntil },
      { $set: { ...fields, status: "ready", failureCode: null, retryAfter: null, leaseUntil: null, lastUsedAt: now() } },
    );
    return Boolean(result?.matchedCount ?? result?.n);
  }

  // Reuse across revisions: an identical, ready clip of an older revision of the same interview.
  async function copyFromOlderRevision(asset, claimed) {
    if (asset.scope !== "revision") return null;
    const source = await model.findOne({
      tenantKey: asset.tenantKey, scope: "revision", status: "ready",
      interviewId: new mongoose.Types.ObjectId(asset.interviewId), revision: { $lt: asset.revision },
      textHash: asset.textHash, voice: asset.voice, model: asset.model, language: asset.language, style: asset.style,
      schemaVersion: asset.schemaVersion,
    }).sort({ revision: -1 }).lean();
    if (!source?.storageKey) return null;
    try {
      await storageNow().copy(source.storageKey, asset.storageKey);
    } catch (error) {
      warn(`Question audio copy failed (${failureCodeOf(error)}); synthesizing instead.`);
      return null;
    }
    const fields = { size: source.size, durationMs: source.durationMs, wpm: source.wpm, mimeType: "audio/wav", storageKey: asset.storageKey };
    if (!(await markReady(claimed, fields))) return null;
    return { ...claimed, ...fields, status: "ready" };
  }

  async function synthesize(asset, spec, options = {}) {
    const clip = await geminiNow().synthesizeSpeech({
      text: asset.text, voice: asset.voice, languageCode: config.ttsLanguageCode, style: asset.style, model: asset.model,
      timeoutMs: config.ttsTimeoutMs, onUsage: spec.onUsage || null, ...options,
    });
    const sampleRate = Number(clip?.sampleRate) || TTS_SAMPLE_RATE;
    if (!clip?.pcm?.length) throw Object.assign(new Error("empty audio"), { code: "TTS_EMPTY" });
    const trimmed = trimSilence(clip.pcm, { sampleRate });
    const pcm = normalizeLoudness(trimmed, config.ttsLoudnessTarget, { sampleRate });
    const pace = wordCount(asset.text) >= PACE_MIN_WORDS ? wpm(asset.text, pcm, { sampleRate }) : null;
    return { pcm, sampleRate, pace, model: clip.model || options.model || asset.model };
  }

  async function produce(asset, claimed, spec) {
    try {
      const copied = await copyFromOlderRevision(asset, claimed);
      if (copied) {
        emit(spec, "avoidedTtsCall");
        return resultOf(copied);
      }
      let clip = await synthesize(asset, spec);
      const minWpm = Number(config.ttsMinWpm) || 0;
      if (clip.pace !== null && clip.pace < minWpm) {
        const fallback = config.ttsFallbackModel;
        if (!fallback || clip.model === fallback) throw Object.assign(new Error("slow"), { code: "TTS_TOO_SLOW" });
        clip = await synthesize(asset, spec, { model: fallback, fallbackModel: null });
        if (clip.pace !== null && clip.pace < minWpm) throw Object.assign(new Error("slow"), { code: "TTS_TOO_SLOW" });
      }
      const wav = wrapWav(clip.pcm, { sampleRate: clip.sampleRate });
      if (wav.length > MAX_AUDIO_BYTES) throw Object.assign(new Error("large"), { code: "ANVI_AUDIO_TOO_LARGE" });
      const durationMs = Math.round((clip.pcm.length / 2 / clip.sampleRate) * 1000);
      const cacheKey = `${asset.tenantKey}:${asset.hash}`;
      lru.set(cacheKey, { wav, pcmOffset: wav.length - clip.pcm.length, sampleRate: clip.sampleRate, durationMs });
      const fields = { size: wav.length, durationMs, wpm: clip.pace, mimeType: "audio/wav", storageKey: asset.storageKey };
      const stored = (async () => {
        try {
          await storageNow().put(asset.storageKey, wav);
        } catch (error) {
          lru.delete(cacheKey);
          await markFailed(claimed, error);
          return false;
        }
        return markReady(claimed, fields).catch(() => false);
      })();
      // Attempt clips are playable from this process's cache before the put completes.
      if (asset.scope === "attempt") return resultOf({ ...claimed, ...fields, status: "generating" }, { stored });
      if (!(await stored)) return null;
      return resultOf({ ...claimed, ...fields, status: "ready" });
    } catch (error) {
      return markFailed(claimed, error);
    }
  }

  function authorized(row, attempt) {
    if (row.scope === "template") return true;
    if (row.scope === "revision") {
      return Boolean(attempt?.interviewId) && String(row.interviewId) === String(attempt.interviewId)
        && Number(row.revision) === Number(attempt.snapshotRevision);
    }
    if (row.scope === "attempt") return Boolean(attempt?._id) && String(row.attemptId) === String(attempt._id);
    return false;
  }

  async function load(assetId, attempt) {
    try {
      const id = String(assetId || "");
      if (!OBJECT_ID.test(id) || !attempt) return null;
      const tenantKey = currentTenantKey();
      const row = await model.findOne({ _id: id, tenantKey }).lean();
      if (!row || !authorized(row, attempt)) return null;
      if (row.status === "failed") return null;
      const cacheKey = `${tenantKey}:${row.hash}`;
      let entry = lru.get(cacheKey);
      if (!entry) {
        if (row.status !== "ready" || !row.storageKey) return null;
        const file = await storageNow().get(row.storageKey, { maxBytes: MAX_AUDIO_BYTES });
        if (!file) return null;
        const parsed = parseWav(file, { sampleRate: null, maxBytes: MAX_AUDIO_BYTES });
        entry = { wav: file, pcmOffset: file.length - parsed.pcm.length, sampleRate: parsed.sampleRate, durationMs: parsed.durationMs };
        lru.set(cacheKey, entry);
      }
      return {
        assetId: id,
        wav: entry.wav,
        pcm: entry.wav.subarray(entry.pcmOffset),
        sampleRate: entry.sampleRate,
        durationMs: entry.durationMs,
        mimeType: "audio/wav",
        size: entry.wav.length,
      };
    } catch (error) {
      warn(`Question audio could not be loaded (${failureCodeOf(error)}).`);
      return null;
    }
  }

  async function cleanupAttemptAssets(attemptIds = []) {
    const ids = (Array.isArray(attemptIds) ? attemptIds : [attemptIds])
      .map(idOf).filter((value) => value && OBJECT_ID.test(value))
      .map((value) => new mongoose.Types.ObjectId(value));
    if (!ids.length) return { removed: 0, failed: 0 };
    const tenantKey = currentTenantKey();
    let removed = 0;
    let failed = 0;
    try {
      const rows = await model.find({ tenantKey, scope: "attempt", attemptId: { $in: ids } }, { _id: 1, hash: 1, storageKey: 1 }).limit(5000).lean();
      for (const row of rows) {
        try {
          if (row.storageKey) await storageNow().remove(row.storageKey);
          await model.deleteOne({ _id: row._id, scope: "attempt" });
          lru.delete(`${tenantKey}:${row.hash}`);
          removed += 1;
        } catch {
          failed += 1;
        }
      }
    } catch (error) {
      warn(`Attempt audio cleanup failed (${failureCodeOf(error)}).`);
    }
    return { removed, failed };
  }

  return { ensure, load, hashFor, cleanupAttemptAssets, stats: () => ({ inFlight: inFlight.size, lru: lru.stats() }) };
}

let shared = null;
/** The process-wide asset store (one in-flight map and one LRU per process). */
export const defaultAudioAssets = () => (shared ||= createAudioAssets());
