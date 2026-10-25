import { createHash } from "node:crypto";
import { getValkeyClient } from "../../utils/valkey.js";
import { anviConfig } from "./anviInterview.config.js";
import { TRANSCRIBE_PROMPT_VERSION } from "./anviInterview.gemini.js";
import { languageCounts } from "./anviInterview.language.js";

// ANVI hybrid mode: one transcript per answer segment, cached by the hash of its audio and scoped to the
// tenant, attempt, question and (via scopeHash) the student, model, language mode and prompt version, so
// identical audio is never transcribed twice and nothing is shared across students. Lookup order:
// in-flight call, Valkey, a bounded local LRU, the caller's live-doc record, then Flash-Lite. A transcript
// that looks unusable is escalated once to the accurate model when the budget allows it; otherwise (or
// when that call fails) the cheap text is kept with `lowConfidence: true`. Keys never contain text, and
// transcripts, audio and keys are never logged.
const KEY_PREFIX = "peerprep:anvi:transcript:v1";
const CACHE_VERSION = 1;
const LRU_ENTRIES = 200;
const INFLIGHT_MAX = 256;
const TRACKED_ATTEMPTS = 2000;
const TRACKED_KEYS_PER_ATTEMPT = 2000;
const SAFE_PART = /^[A-Za-z0-9_.-]{1,64}$/;
const AUDIO_HASH = /^[a-f0-9]{64}$/;
const DEVANAGARI = /[ऀ-ॿ]/u;
const INAUDIBLE = /\[\s*(?:inaudible|unintelligible|indistinct)[^\]]*\]/gi;
// Escalation thresholds (see shouldEscalate).
const EMPTY_VOICED_SECONDS = 1.5;
const SHORT_VOICED_SECONDS = 4;
const MIN_WORDS_PER_VOICED_SECOND = 0.6;
const MAX_INAUDIBLE_MARKERS = 2;
const MAX_INAUDIBLE_SHARE = 0.2;
// Reasons that mean the transcript is unusable (the budget's economical mode still escalates those).
const UNUSABLE = new Set(["empty", "invalid", "too_short", "inaudible"]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
// A key part that is not plainly safe is replaced by its hash (no raw value, no separator inside).
const keyPart = (value) => {
  const text = String(value ?? "");
  return SAFE_PART.test(text) ? text : `h${sha256(text).slice(0, 24)}`;
};

/** sha256(studentId|model|languageMode|promptVersion), first 16 hex characters. */
export function transcriptScopeHash({ studentId, model, languageMode = "English", promptVersion = TRANSCRIBE_PROMPT_VERSION } = {}) {
  return sha256([studentId, model, languageMode, promptVersion].map((part) => String(part ?? "")).join("|")).slice(0, 16);
}

/** `peerprep:anvi:transcript:v1:{tenantKey}:{attemptId}:{qid}:{audioHash}:{scopeHash}` (placeholders, not hash tags). */
export function transcriptKey({ tenantKey = "platform", attemptId, qid, audioHash, scopeHash }) {
  if (!AUDIO_HASH.test(String(audioHash || ""))) throw Object.assign(new Error("Invalid audio hash"), { code: "ANVI_TRANSCRIPT_KEY" });
  return [KEY_PREFIX, keyPart(tenantKey || "platform"), keyPart(attemptId), keyPart(qid), audioHash, keyPart(scopeHash)].join(":");
}

const wordsOf = (text) => String(text || "").replace(INAUDIBLE, " ").match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'-]*/gu) || [];

/**
 * Whether a cheap transcript should be redone with the accurate model, and why (pure):
 * `{ escalate, reason }` with reason forced | invalid | empty | too_short | inaudible | language | null.
 * `transcript`: { text, invalid }; `options`: { voicedSeconds, language, forceAccurate }.
 */
export function shouldEscalate(transcript, { voicedSeconds = 0, language = "English", forceAccurate = false } = {}) {
  const result = (reason) => ({ escalate: Boolean(reason), reason: reason || null });
  if (forceAccurate) return result("forced");
  const text = String(transcript?.text || "").trim();
  const voiced = Math.max(0, Number(voicedSeconds) || 0);
  // A malformed model response (no text field) is retried on the accurate model.
  if (!transcript || typeof transcript !== "object" || typeof transcript.text !== "string" || transcript.malformed === true) return result("invalid");
  // Empty: worth a second try only when there was meaningful voiced audio (silence stays empty).
  if (!text) return result(voiced >= EMPTY_VOICED_SECONDS ? "empty" : null);
  const words = wordsOf(text).length;
  if (voiced > SHORT_VOICED_SECONDS && words / voiced < MIN_WORDS_PER_VOICED_SECOND) return result("too_short");
  const markers = (text.match(INAUDIBLE) || []).length;
  if (markers >= MAX_INAUDIBLE_MARKERS || (markers && markers / Math.max(1, words + markers) > MAX_INAUDIBLE_SHARE)) return result("inaudible");
  // Script the transcription prompt asked for was not followed: Devanagari in a Hinglish (Roman) answer,
  // or Hindi only in Roman script in a Hindi (Devanagari) answer. English keeps Hindi as spoken.
  const counts = languageCounts(text);
  if (language === "Hinglish" && DEVANAGARI.test(text) && counts.hindi > 0) return result("language");
  if (language === "Hindi" && !DEVANAGARI.test(text) && counts.hindi >= 3) return result("language");
  return result(null);
}

// Bounded LRU over a Map (insertion order).
function createLru(limit) {
  const entries = new Map();
  return {
    get(key) {
      if (!entries.has(key)) return undefined;
      const value = entries.get(key);
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > limit) entries.delete(entries.keys().next().value);
    },
    delete: (key) => entries.delete(key),
    get size() { return entries.size; },
  };
}

// The cached form of a transcript: text plus the transcript* bookkeeping, nothing else.
function cachedForm(result) {
  return {
    v: CACHE_VERSION,
    text: result.text,
    model: result.model || null,
    attempts: Number(result.attempts) || 0,
    escalated: Boolean(result.escalated),
    lowConfidence: Boolean(result.lowConfidence),
    audioSeconds: Number(result.audioSeconds) || 0,
    tokens: result.tokens ? { input: Number(result.tokens.input) || 0, output: Number(result.tokens.output) || 0 } : null,
  };
}

function fromCached(value) {
  if (!value || typeof value !== "object" || value.v !== CACHE_VERSION || typeof value.text !== "string") return null;
  return cachedForm(value);
}

/**
 * `createTranscripts({ gemini, valkey, config, metric, lruSize })`.
 * - `transcribe(request)` resolves (never rejects) to `{ text, model, attempts, escalated, lowConfidence,
 *   audioSeconds, tokens, cached, source, key, escalationReason, error }` where `source` is inflight |
 *   valkey | lru | record | model, and `error` is a code when no transcript could be made (not cached).
 *   request: { tenantKey, attemptId, studentId, qid, audioHash, pcm, voicedSeconds, language, record,
 *   forceAccurate, accurate (false skips escalation, e.g. while finalizing), budget, onUsage }.
 *   `record` is the transcript already on the live-doc segment record, if any. `onUsage` meters the
 *   calls; its `.metric(name)` (or the factory `metric`) gets the cache and escalation metrics.
 * - `keysFor(attemptId)`: the keys written for an attempt; `forgetAttempt(keysOrAttemptId)` deletes them
 *   (best effort) from Valkey and the LRU.
 */
export function createTranscripts({
  gemini,
  valkey = process.env.NODE_TEST_CONTEXT ? null : getValkeyClient(),
  config = anviConfig(),
  metric = null,
  lruSize = LRU_ENTRIES,
  log = console,
} = {}) {
  const inflight = new Map();
  const lru = createLru(Math.max(1, Number(lruSize) || LRU_ENTRIES));
  const tracked = new Map();
  const ttlSeconds = String(Math.max(60, Number(config.transcriptCacheSeconds) || 86400));
  let warned = false;

  const warnOnce = (error) => {
    if (warned) return;
    warned = true;
    log.warn?.(`[ANVI] Transcript cache unavailable; using the local cache (${error?.name || "Error"}).`);
  };
  const count = (onUsage, name) => {
    try {
      if (typeof onUsage?.metric === "function") onUsage.metric(name, 1);
      else metric?.(name, 1);
    } catch { /* metrics never fail a transcript */ }
  };
  // Bounded, so attempts that end without forgetAttempt (a crash, an abandoned socket) cannot grow it;
  // their keys still expire in Valkey after transcriptCacheSeconds.
  const track = (attemptId, key) => {
    const id = String(attemptId);
    let keys = tracked.get(id);
    if (!keys) {
      keys = new Set();
      tracked.set(id, keys);
      while (tracked.size > TRACKED_ATTEMPTS) tracked.delete(tracked.keys().next().value);
    }
    if (keys.size < TRACKED_KEYS_PER_ATTEMPT) keys.add(key);
  };

  async function readRemote(key) {
    if (!valkey) return null;
    try {
      const raw = await valkey.sendCommand(["GET", key]);
      return raw ? fromCached(JSON.parse(String(raw))) : null;
    } catch (error) {
      warnOnce(error);
      return null;
    }
  }

  async function writeRemote(key, value) {
    if (!valkey) return;
    try {
      await valkey.sendCommand(["SET", key, JSON.stringify(value), "EX", ttlSeconds]);
    } catch (error) {
      warnOnce(error);
    }
  }

  async function callModel(request, kind) {
    const result = await gemini.transcribeAudio({
      pcm: request.pcm,
      language: request.language || "English",
      kind,
      ...(kind === "transcribe_accurate" ? { model: config.transcribeAccurateModel } : {}),
      onUsage: request.onUsage || null,
    });
    if (!result || typeof result !== "object" || typeof result.text !== "string") {
      return { text: "", invalid: true, malformed: true, model: result?.model || null, attempts: Number(result?.attempts) || 1, audioSeconds: 0, tokens: null };
    }
    return result;
  }

  async function produce(request) {
    const budget = request.budget || null;
    const allows = (kind, extra) => {
      if (!budget || typeof budget.allow !== "function") return true;
      try { return budget.allow(kind, extra) !== false; } catch { return false; }
    };
    if (!request.pcm || !allows("transcribe")) {
      return { ...cachedForm({ text: "", lowConfidence: true }), error: request.pcm ? "BUDGET_DENIED" : "NO_AUDIO" };
    }
    let cheap;
    let cheapFailed = false;
    try {
      cheap = await callModel(request, "transcribe");
    } catch {
      cheapFailed = true;
      cheap = { text: "", invalid: true, model: null, attempts: 1, audioSeconds: 0, tokens: null };
    }
    const decision = cheapFailed
      ? { escalate: true, reason: "invalid" }
      : shouldEscalate(cheap, { voicedSeconds: request.voicedSeconds, language: request.language, forceAccurate: request.forceAccurate });
    let result = { ...cheap, escalated: false, lowConfidence: false };
    if (decision.escalate) {
      const permitted = request.accurate !== false && allows("transcribe_accurate", { unusable: UNUSABLE.has(decision.reason) });
      let accurate = null;
      if (permitted) {
        count(request.onUsage, "accurateTranscriptionEscalation");
        try { accurate = await callModel(request, "transcribe_accurate"); } catch { accurate = null; }
      }
      const tokens = (a, b) => (a || b ? { input: (a?.input || 0) + (b?.input || 0), output: (a?.output || 0) + (b?.output || 0) } : null);
      if (accurate && !accurate.malformed && accurate.text.trim()) {
        result = {
          ...accurate,
          attempts: (Number(cheap.attempts) || 0) + (Number(accurate.attempts) || 0),
          audioSeconds: Math.max(Number(cheap.audioSeconds) || 0, Number(accurate.audioSeconds) || 0),
          tokens: tokens(cheap.tokens, accurate.tokens),
          escalated: true,
          lowConfidence: false,
        };
      } else {
        // Denied, failed or still empty: keep the cheap text, marked low confidence.
        result = {
          ...cheap,
          attempts: (Number(cheap.attempts) || 0) + (Number(accurate?.attempts) || 0),
          tokens: tokens(cheap.tokens, accurate?.tokens),
          escalated: Boolean(accurate && !accurate.malformed),
          lowConfidence: true,
        };
      }
      if ((cheapFailed || cheap.malformed) && !result.escalated) {
        return { ...cachedForm(result), escalationReason: decision.reason, error: "TRANSCRIBE_FAILED" };
      }
    }
    return { ...cachedForm(result), escalationReason: decision.reason };
  }

  async function lookupAndProduce(request, key) {
    const remote = await readRemote(key);
    if (remote) {
      lru.set(key, remote);
      count(request.onUsage, "transcriptCacheHit");
      return { ...remote, source: "valkey" };
    }
    const local = lru.get(key);
    if (local) {
      count(request.onUsage, "transcriptCacheHit");
      return { ...local, source: "lru" };
    }
    const record = fromCached({ v: CACHE_VERSION, ...(request.record && typeof request.record === "object" ? request.record : {}) });
    if (request.record && record) {
      lru.set(key, record);
      void writeRemote(key, record);
      count(request.onUsage, "transcriptCacheHit");
      return { ...record, source: "record" };
    }
    count(request.onUsage, "transcriptCacheMiss");
    const produced = await produce(request);
    if (!produced.error) {
      const stored = cachedForm(produced);
      lru.set(key, stored);
      await writeRemote(key, stored);
    }
    return { ...produced, source: "model" };
  }

  /** See the factory comment. Never rejects; never logs the transcript. */
  async function transcribe(request = {}) {
    let key;
    try {
      const scopeHash = transcriptScopeHash({ studentId: request.studentId, model: config.transcribeModel, languageMode: request.language || "English" });
      key = transcriptKey({ tenantKey: request.tenantKey, attemptId: request.attemptId, qid: request.qid, audioHash: request.audioHash, scopeHash });
    } catch {
      return { ...cachedForm({ text: "", lowConfidence: true }), cached: false, source: "model", key: null, escalationReason: null, error: "BAD_REQUEST" };
    }
    track(request.attemptId, key);
    const running = inflight.get(key);
    if (running) {
      count(request.onUsage, "transcriptCacheHit");
      const shared = await running;
      return { ...shared, cached: true, source: "inflight", key };
    }
    const work = lookupAndProduce(request, key)
      .catch(() => ({ ...cachedForm({ text: "", lowConfidence: true }), source: "model", error: "TRANSCRIBE_FAILED" }))
      .finally(() => inflight.delete(key));
    if (inflight.size < INFLIGHT_MAX) inflight.set(key, work);
    const result = await work;
    return { escalationReason: null, ...result, cached: result.source !== "model", key };
  }

  const keysFor = (attemptId) => [...(tracked.get(String(attemptId)) || [])];

  // Keys of the attempt's live-doc segment records, so keys another instance wrote (before a reconnect or
  // takeover) are deleted too; tracked keys only cover this instance.
  const keysFromSegments = (attemptId, { segments, tenantKey, studentId, language } = {}) => {
    if (!Array.isArray(segments) || !segments.length) return [];
    const scopeHash = transcriptScopeHash({ studentId, model: config.transcribeModel, languageMode: language || "English" });
    const keys = [];
    for (const entry of segments) {
      try { keys.push(transcriptKey({ tenantKey, attemptId, qid: entry?.qid, audioHash: entry?.audioHash, scopeHash })); } catch { /* no usable hash */ }
    }
    return keys;
  };

  /**
   * Best-effort delete of an attempt's transcript keys (an array of keys, or the attemptId). With the
   * attemptId, `options` ({ segments, tenantKey, studentId, language }) adds the keys of those segment records.
   */
  async function forgetAttempt(keysOrAttemptId, options = {}) {
    const keys = Array.isArray(keysOrAttemptId)
      ? keysOrAttemptId.filter((key) => typeof key === "string" && key.startsWith(`${KEY_PREFIX}:`))
      : [...new Set([...keysFor(keysOrAttemptId), ...keysFromSegments(keysOrAttemptId, options)])];
    if (!Array.isArray(keysOrAttemptId)) tracked.delete(String(keysOrAttemptId));
    for (const key of keys) lru.delete(key);
    if (!valkey || !keys.length) return keys.length;
    try {
      for (let index = 0; index < keys.length; index += 100) await valkey.sendCommand(["DEL", ...keys.slice(index, index + 100)]);
    } catch (error) {
      warnOnce(error);
    }
    return keys.length;
  }

  return { transcribe, keysFor, forgetAttempt, stats: () => ({ inflight: inflight.size, cached: lru.size }) };
}
