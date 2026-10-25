// ANVI runtime configuration. Every model id and voice comes from env so a model change never needs code.
// Defaults were benchmarked in the Phase 0 spike (2026-10-21) against the Gemini API.
// The hybrid (turn-based) defaults follow the WP0 measurement gate of 2026-10-23.
const MODEL_ID = /^[a-zA-Z0-9._-]{1,100}$/;
const VOICE_ID = /^[A-Za-z]{2,40}$/;
const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const BUCKET_NAME = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

const clampInt = (value, min, max, fallback) => {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
const clampNumber = (value, min, max, fallback) => {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
const modelOr = (value, fallback) => (MODEL_ID.test(String(value || "")) ? String(value) : fallback);
const modelList = (value, fallback) => String(value ?? fallback)
  .split(",").map((item) => item.trim()).filter((item) => MODEL_ID.test(item));
const flagOn = (value) => /^(1|true|on|yes)$/i.test(String(value || ""));
const flagOff = (value) => /^(0|false|off|no)$/i.test(String(value || ""));
// A list from env limited to `allowed`; an empty or fully invalid list falls back to `fallback`.
const listOf = (value, allowed, fallback) => {
  const picked = [...new Set(String(value || "").split(",").map((item) => item.trim()).filter((item) => allowed.includes(item)))];
  return Object.freeze(picked.length ? picked : [...fallback]);
};
// A price per million tokens; 0 (the default) means "unknown", never "free".
const priceOf = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(number, 10_000) : 0;
};
export const USAGE_KINDS = Object.freeze(["live", "transcribe", "generate", "evaluate"]);

// REST call kinds that get an explicit thinking level. TTS models reject thinkingConfig (WP0), so it is
// always "none"; gemini-3.5-transcribe rejects every level; Flash-Lite rejects "off" but takes minimal.
export const THINKING_KINDS = Object.freeze(["transcribe", "transcribe_accurate", "generate", "decision", "evaluate", "tts"]);
export const THINKING_LEVELS = Object.freeze(["none", "minimal", "low", "medium", "high"]);
const THINKING_DEFAULTS = Object.freeze({
  transcribe: "minimal", transcribe_accurate: "none", generate: "low", decision: "minimal", evaluate: "low", tts: "none",
});
const ATTEMPT_MODES = Object.freeze(["practice", "adaptive", "mock"]);
// What ANVI_HYBRID_MODES may list: the attempt modes plus "scheduled" (an attempt for an assignment).
const HYBRID_KINDS = Object.freeze([...ATTEMPT_MODES, "scheduled"]);
// DECISIONS #0/#2: every ANVI interview is English, and hybrid runs only for English attempts.
const HYBRID_LANGUAGES = Object.freeze(["English"]);

// Interview durations (minutes) the duration tables are keyed by.
export const DURATION_BUCKETS = Object.freeze([10, 15, 30, 45, 60]);
const LIVE_MINUTES_DEFAULTS = Object.freeze({ 10: 1, 15: 2, 30: 3, 45: 4, 60: 5 });
// Safe API budget (INR) per duration; the 60-minute thresholds are scaled by safe/60 for shorter interviews.
export const SAFE_BUDGET_INR = Object.freeze({ 10: 15, 15: 20, 30: 35, 45: 48, 60: 60 });
const SAFE_BUDGET_BASE_INR = 60;

/** The duration bucket at or below `minutes` (the smallest bucket for anything shorter or invalid). */
export function durationBucket(minutes) {
  const number = Number(minutes);
  if (!Number.isFinite(number)) return DURATION_BUCKETS[0];
  return DURATION_BUCKETS.reduce((picked, bucket) => (number >= bucket ? bucket : picked), DURATION_BUCKETS[0]);
}

/** Seconds of Live audio one attempt may use, from the bucket at or below its duration. */
export function liveCapSeconds(durationMinutes, config = null) {
  const table = config?.maxLiveMinutes || LIVE_MINUTES_DEFAULTS;
  const minutes = Number(table[durationBucket(durationMinutes)]);
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 0;
}

/** The safe API budget in INR for a duration (the bucket at or below it). */
export const safeBudgetInr = (durationMinutes) => SAFE_BUDGET_INR[durationBucket(durationMinutes)];

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * Budget mode thresholds (INR) for one attempt. With `scaleByDuration` every threshold, including the
 * evaluation reserve, is multiplied by safeBudget(duration)/60. `evaluationOnlyAt` = hard - reserve.
 */
export function budgetThresholds(durationMinutes, config = anviConfig()) {
  const budget = config.budget;
  const factor = budget.scaleByDuration ? safeBudgetInr(durationMinutes) / SAFE_BUDGET_BASE_INR : 1;
  const scaled = (value) => round2(value * factor);
  const hard = scaled(budget.hardInr);
  const evaluationReserve = scaled(budget.evaluationReserveInr);
  return Object.freeze({
    factor,
    economical: scaled(budget.economicalInr),
    cachedOnly: scaled(budget.cachedOnlyInr),
    essential: scaled(budget.essentialInr),
    hard,
    evaluationReserve,
    evaluationOnlyAt: round2(Math.max(0, hard - evaluationReserve)),
  });
}

function budgetConfig(env) {
  // Each threshold is at least the one before it, so the modes always come in order.
  const economicalInr = clampNumber(env.ANVI_BUDGET_ECONOMICAL_INR, 0, 10_000, 30);
  const cachedOnlyInr = Math.max(economicalInr, clampNumber(env.ANVI_BUDGET_CACHED_ONLY_INR, 0, 10_000, 40));
  const essentialInr = Math.max(cachedOnlyInr, clampNumber(env.ANVI_BUDGET_ESSENTIAL_INR, 0, 10_000, 45));
  const hardInr = Math.max(essentialInr, clampNumber(env.ANVI_BUDGET_HARD_INR, 0, 10_000, 60));
  return Object.freeze({
    economicalInr,
    cachedOnlyInr,
    essentialInr,
    hardInr,
    evaluationReserveInr: Math.min(hardInr, clampNumber(env.ANVI_BUDGET_EVALUATION_RESERVE_INR, 0, 10_000, 5)),
    scaleByDuration: !flagOff(env.ANVI_BUDGET_SCALE_BY_DURATION),
    // USD per million tokens charged by the budget for any token whose price is unknown. Above every
    // verified 2026-10-19 rate (the highest is $12/M), so an unknown price can only over-count.
    unknownPriceUsdPerM: clampNumber(env.ANVI_BUDGET_UNKNOWN_PRICE_USD_PER_M, 1, 10_000, 20),
  });
}

function thinkingConfig(env) {
  return Object.freeze(Object.fromEntries(THINKING_KINDS.map((kind) => {
    if (kind === "tts") return [kind, "none"];
    const value = String(env[`ANVI_THINKING_${kind.toUpperCase()}`] || "").trim().toLowerCase();
    return [kind, THINKING_LEVELS.includes(value) ? value : THINKING_DEFAULTS[kind]];
  })));
}

export function anviConfig(env = process.env) {
  const liveVoice = VOICE_ID.test(String(env.ANVI_LIVE_VOICE || "")) ? env.ANVI_LIVE_VOICE : "Aoede";
  const silenceMs = clampInt(env.ANVI_SILENCE_MS, 1500, 4000, 2000);
  const hangoverMs = clampInt(env.ANVI_HANGOVER_MS, 600, 4000, silenceMs);
  const speculativeEndMs = String(env.ANVI_SPECULATIVE_END_MS || "").trim()
    ? clampInt(env.ANVI_SPECULATIVE_END_MS, 300, 4000, null) : null;
  const maxFollowUpsPerQuestion = clampInt(env.ANVI_MAX_FOLLOW_UPS_PER_QUESTION, 0, 3, 1);
  const audioBucket = [env.ANVI_AUDIO_R2_BUCKET, env.R2_BUCKET_NAME]
    .map((value) => String(value || "").trim()).find((value) => BUCKET_NAME.test(value)) || "";
  return Object.freeze({
    apiKey: env.GEMINI_API_KEY || "",
    liveModel: modelOr(env.ANVI_LIVE_MODEL, "gemini-3.8-live"),
    liveVoice,
    // Accurate per-answer transcript for the report (Live input transcription is weak on Hinglish tech terms).
    transcribeModel: modelOr(env.ANVI_TRANSCRIBE_MODEL, "gemini-3.5-flash-lite"),
    // Question generation for ANVI-prompt (annu) topics and resume questions at start.
    generateModel: modelOr(env.ANVI_GENERATE_MODEL, "gemini-3.5-flash-lite"),
    // Fallbacks tried in order when a REST model answers 404/429/503.
    fallbackModels: modelList(env.ANVI_FALLBACK_MODELS || "gemini-3.5-flash,gemini-3.1-flash-lite", ""),
    silenceMs,
    // Hard cap for one interview; the admin's rules can only make it shorter. 60-minute interviews need >= 60.
    maxSessionMinutes: clampInt(env.ANVI_MAX_SESSION_MINUTES, 5, 90, 45),
    // Cost guardrails. The plan is trimmed before any model call and follow-ups are capped per prompt.
    maxQuestionsPerInterview: clampInt(env.ANVI_MAX_QUESTIONS_PER_INTERVIEW, 3, 40, 12),
    maxFollowUpsPerQuestion,
    // Live already returns an input transcript. Keep paid second-pass transcription opt-in; when enabled,
    // it is still used only when the Live transcript is missing or too short to be useful.
    accurateTranscription: flagOn(env.ANVI_ACCURATE_TRANSCRIPTION),
    // How long a disconnected interview can be resumed before it is finalised as abandoned.
    resumeWindowMinutes: clampInt(env.ANVI_RESUME_WINDOW_MINUTES, 2, 60, 15),
    // Live session resumption + context compression (long interviews outlive one Live connection).
    liveResumption: !flagOff(env.ANVI_LIVE_RESUMPTION),
    // Compress native-audio history early. Gemini bills the active Live context again on every turn;
    // its default trigger is 80% of the model window, which is too expensive for interview sessions.
    liveContextTriggerTokens: clampInt(env.ANVI_LIVE_CONTEXT_TRIGGER_TOKENS, 5000, 128000, 25000),
    liveContextTargetTokens: clampInt(env.ANVI_LIVE_CONTEXT_TARGET_TOKENS, 0, 128000, 8000),
    // New attempts one student may start for one interview in 24 hours (resuming never counts).
    maxAttemptsPerDay: clampInt(env.ANVI_MAX_ATTEMPTS_PER_DAY, 1, 50, 5),
    // anvi:join calls one student may make per minute across their sockets.
    maxJoinsPerMinute: clampInt(env.ANVI_MAX_JOINS_PER_MINUTE, 2, 60, 8),
    // Live sessions held at once (all universities, and per university). With Valkey configured the caps
    // hold across every backend instance; without it they hold per process. Resumes are never refused.
    maxLiveSessions: clampInt(env.ANVI_MAX_LIVE_SESSIONS, 1, 1000, 25),
    maxLiveSessionsPerTenant: clampInt(env.ANVI_MAX_LIVE_SESSIONS_PER_TENANT, 1, 1000, 15),
    capacityRetrySeconds: clampInt(env.ANVI_CAPACITY_RETRY_SECONDS, 15, 900, 120),
    // Output ceilings per REST call kind; a caller can ask for less, never more.
    maxOutputTokens: Object.freeze({
      transcribe: clampInt(env.ANVI_MAX_OUTPUT_TOKENS_TRANSCRIBE, 256, 32768, 4096),
      generate: clampInt(env.ANVI_MAX_OUTPUT_TOKENS_GENERATE, 256, 32768, 8192),
      evaluate: clampInt(env.ANVI_MAX_OUTPUT_TOKENS_EVALUATE, 256, 32768, 8192),
    }),
    // Identical temperature-0 generateJson calls within this window reuse the first answer (0 turns it off).
    jsonCacheSeconds: clampInt(env.ANVI_JSON_CACHE_SECONDS, 0, 86400, 3600),
    // Legacy per-million-token prices ({kind: {input, output}}, 0 = unknown) for the existing usage report.
    // Modality-aware pricing (null = unknown) lives in anviInterview.pricing.js.
    prices: Object.freeze(Object.fromEntries(USAGE_KINDS.map((kind) => [kind, Object.freeze({
      input: priceOf(env[`ANVI_PRICE_${kind.toUpperCase()}_INPUT`]),
      output: priceOf(env[`ANVI_PRICE_${kind.toUpperCase()}_OUTPUT`]),
    })]))),
    priceCurrency: /^[A-Z]{3}$/.test(String(env.ANVI_PRICE_CURRENCY || "")) ? env.ANVI_PRICE_CURRENCY : "USD",

    // --- Hybrid (turn-based) runtime. Off by default: with hybridEnabled false every attempt runs Live. ---
    hybridEnabled: flagOn(env.ANVI_HYBRID_ENABLED),
    // Share of students (by hash of tenantKey:studentId) that get hybrid once it is enabled.
    hybridRolloutPercent: clampInt(env.ANVI_HYBRID_ROLLOUT_PERCENT, 0, 100, 0),
    // DECISIONS #0: hybrid applies to every interview once enabled, so every kind by default. A
    // scheduled (assigned) attempt is gated by "scheduled", a self-started one by its attempt mode, so
    // the pilot can be ANVI_HYBRID_MODES=practice and later practice,scheduled.
    hybridModes: listOf(env.ANVI_HYBRID_MODES, HYBRID_KINDS, HYBRID_KINDS),
    // English only (DECISIONS #0/#2); any other value is ignored.
    hybridLanguages: listOf(env.ANVI_HYBRID_LANGUAGES, HYBRID_LANGUAGES, HYBRID_LANGUAGES),
    // Short Live blocks inside a hybrid attempt. Off at first rollout (DECISIONS #3).
    hybridLiveEscalation: flagOn(env.ANVI_HYBRID_LIVE_ESCALATION),
    liveWarmup: flagOn(env.ANVI_LIVE_WARMUP),
    // The budget only observes Live-mode attempts unless this is on.
    budgetEnforceLive: flagOn(env.ANVI_BUDGET_ENFORCE_LIVE),
    numberClips: !flagOff(env.ANVI_NUMBER_CLIPS),
    ackClips: !flagOff(env.ANVI_ACK_CLIPS),

    // Hybrid models. Each kind has its own explicit chain; generateModel is never added implicitly.
    transcribeAccurateModel: modelOr(env.ANVI_TRANSCRIBE_ACCURATE_MODEL, "gemini-3.5-transcribe"),
    decisionModel: modelOr(env.ANVI_DECISION_MODEL, "gemini-3.5-flash-lite"),
    decisionFallbackModels: Object.freeze(modelList(env.ANVI_DECISION_FALLBACK_MODELS, "")),
    evaluateModel: modelOr(env.ANVI_EVALUATE_MODEL, "gemini-3.6-flash"),
    evaluateFallbackModels: Object.freeze(modelList(env.ANVI_EVALUATE_FALLBACK_MODELS, "gemini-3.5-flash-lite")),
    // DECISIONS #1: Flash TTS. Flash-Lite TTS measured ~41-60 wpm and may be used only after a >= 120 wpm
    // pace test, so there is no fallback TTS model by default ("" = none).
    ttsModel: modelOr(env.ANVI_TTS_MODEL, "gemini-3.8-flash-tts"),
    ttsFallbackModel: modelOr(env.ANVI_TTS_FALLBACK_MODEL, ""),
    ttsVoice: VOICE_ID.test(String(env.ANVI_TTS_VOICE || "")) ? env.ANVI_TTS_VOICE : liveVoice,
    // English, en-IN accent (DECISIONS #0); WP0 confirmed the TTS API accepts languageCode en-IN.
    ttsLanguageCode: LANGUAGE_CODE.test(String(env.ANVI_TTS_LANGUAGE_CODE || "")) ? env.ANVI_TTS_LANGUAGE_CODE : "en-IN",
    // Optional style directive per language. Empty by default: WP0 found a pace line made speech slower
    // and was sometimes read aloud.
    ttsStyleByLanguage: Object.freeze({
      English: String(env.ANVI_TTS_STYLE_ENGLISH || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200),
    }),
    // WP0 confirmed streamGenerateContent (SSE) works for TTS; first audio p50 1.3 s.
    ttsStreaming: !flagOff(env.ANVI_TTS_STREAMING),
    thinkingByKind: thinkingConfig(env),
    // WP0: Live sends one usage message per turn with that turn's own counts.
    liveUsageSemantics: String(env.ANVI_LIVE_USAGE_SEMANTICS || "").trim().toLowerCase() === "cumulative" ? "cumulative" : "delta",

    // TTS assets.
    // A clip spoken slower than this is rejected (also catches a style directive read aloud).
    ttsMinWpm: clampInt(env.ANVI_TTS_MIN_WPM, 30, 250, 110),
    // Voiced RMS target in dBFS (WP0: Live Aoede median -17).
    ttsLoudnessTarget: clampNumber(env.ANVI_TTS_LOUDNESS_TARGET_DBFS, -40, -6, -17),
    ttsTimeoutMs: clampInt(env.ANVI_TTS_TIMEOUT_MS, 3000, 120000, 20000),
    ttsCacheEnabled: !flagOff(env.ANVI_TTS_CACHE_ENABLED),
    ttsCacheSchemaVersion: clampInt(env.ANVI_TTS_CACHE_SCHEMA_VERSION, 1, 1000, 1),
    // Server-side signed GETs only; browsers receive clip bytes over the socket.
    ttsSignedUrlSeconds: clampInt(env.ANVI_TTS_SIGNED_URL_SECONDS, 60, 3600, 600),
    audioBucket,

    // Client segmenter and segment upload.
    hangoverMs,
    // Optional early part-close before the hangover; null (off) unless set below the hangover.
    speculativeEndMs: speculativeEndMs !== null && speculativeEndMs < hangoverMs ? speculativeEndMs : null,
    minSpeechMs: clampInt(env.ANVI_MIN_SPEECH_MS, 100, 2000, 400),
    preRollMs: clampInt(env.ANVI_PRE_ROLL_MS, 0, 1000, 300),
    maxSegmentSeconds: clampInt(env.ANVI_MAX_SEGMENT_SECONDS, 10, 90, 90),
    maxTurnSeconds: clampInt(env.ANVI_MAX_TURN_SECONDS, 60, 900, 480),
    segmentChunkBytes: clampInt(env.ANVI_SEGMENT_CHUNK_BYTES, 4096, 32768, 32768) & ~1,
    segmentBytesPerSecond: clampInt(env.ANVI_SEGMENT_BYTES_PER_SECOND, 32_000, 1_048_576, 131_072),
    segmentBurstBytes: clampInt(env.ANVI_SEGMENT_BURST_BYTES, 131_072, 8_388_608, 1_048_576),
    // Process-wide memory cap for buffered hybrid answer audio.
    hybridAudioCapMb: clampInt(env.ANVI_HYBRID_AUDIO_CAP_MB, 16, 1024, 128),

    // Hybrid limits.
    maxFollowupsPerQuestion: clampInt(env.ANVI_MAX_FOLLOWUPS_PER_QUESTION, 0, 3, maxFollowUpsPerQuestion),
    decisionMaxInputTokens: clampInt(env.ANVI_DECISION_MAX_INPUT_TOKENS, 200, 8000, 1200),
    decisionMaxOutputTokens: clampInt(env.ANVI_DECISION_MAX_OUTPUT_TOKENS, 32, 1024, 120),
    summaryMaxTokens: clampInt(env.ANVI_SUMMARY_MAX_TOKENS, 100, 2000, 400),
    transcriptCacheSeconds: clampInt(env.ANVI_TRANSCRIPT_CACHE_SECONDS, 60, 604800, 86400),
    evaluationBatchSize: clampInt(env.ANVI_EVALUATION_BATCH_SIZE, 1, 8, 8),
    evaluationMaxInputTokens: clampInt(env.ANVI_EVALUATION_MAX_INPUT_TOKENS, 1000, 32000, 6000),
    evaluationMaxOutputTokens: clampInt(env.ANVI_EVALUATION_MAX_OUTPUT_TOKENS, 256, 8192, 1500),

    // Live minutes per duration bucket (see liveCapSeconds); 0 disables Live for that bucket.
    maxLiveMinutes: Object.freeze(Object.fromEntries(DURATION_BUCKETS.map((bucket) => [
      bucket, clampInt(env[`ANVI_MAX_LIVE_MINUTES_${bucket}`], 0, 15, LIVE_MINUTES_DEFAULTS[bucket]),
    ]))),
    budget: budgetConfig(env),
  });
}

export function anviConfigured(env = process.env) {
  return Boolean(env.GEMINI_API_KEY);
}
