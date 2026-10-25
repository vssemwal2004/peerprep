import assert from "node:assert/strict";
import { test } from "node:test";
import {
  anviConfig, budgetThresholds, durationBucket, liveCapSeconds, safeBudgetInr, USAGE_KINDS,
} from "../src/modules/anviInterview/anviInterview.config.js";

test("anviConfig: hybrid is off by default and the new defaults follow the plan and WP0", () => {
  const config = anviConfig({});
  assert.equal(config.hybridEnabled, false);
  assert.equal(config.hybridRolloutPercent, 0);
  assert.deepEqual(config.hybridModes, ["practice", "adaptive", "mock", "scheduled"]);
  assert.deepEqual(config.hybridLanguages, ["English"]);
  assert.equal(config.hybridLiveEscalation, false);
  assert.equal(config.liveWarmup, false);
  assert.equal(config.budgetEnforceLive, false);
  assert.equal(config.numberClips, true);
  assert.equal(config.ackClips, true);
  assert.equal(config.transcribeAccurateModel, "gemini-3.5-transcribe");
  assert.equal(config.decisionModel, "gemini-3.5-flash-lite");
  assert.deepEqual(config.decisionFallbackModels, []);
  assert.equal(config.evaluateModel, "gemini-3.6-flash");
  assert.deepEqual(config.evaluateFallbackModels, ["gemini-3.5-flash-lite"]);
  assert.equal(config.ttsModel, "gemini-3.8-flash-tts");
  assert.equal(config.ttsFallbackModel, "");
  assert.equal(config.ttsVoice, "Aoede");
  assert.equal(config.ttsLanguageCode, "en-IN");
  assert.deepEqual(config.ttsStyleByLanguage, { English: "" });
  assert.equal(config.ttsStreaming, true);
  assert.deepEqual(config.thinkingByKind, {
    transcribe: "minimal", transcribe_accurate: "none", generate: "low", decision: "minimal", evaluate: "low", tts: "none",
  });
  assert.equal(config.liveUsageSemantics, "delta");
  assert.equal(config.ttsMinWpm, 110);
  assert.equal(config.ttsLoudnessTarget, -17);
  assert.equal(config.ttsTimeoutMs, 20000);
  assert.equal(config.ttsCacheEnabled, true);
  assert.equal(config.ttsCacheSchemaVersion, 1);
  assert.equal(config.ttsSignedUrlSeconds, 600);
  assert.equal(config.audioBucket, "");
  assert.equal(config.hangoverMs, config.silenceMs);
  assert.equal(config.speculativeEndMs, null);
  assert.equal(config.minSpeechMs, 400);
  assert.equal(config.preRollMs, 300);
  assert.equal(config.maxSegmentSeconds, 90);
  assert.equal(config.maxTurnSeconds, 480);
  assert.equal(config.segmentChunkBytes, 32768);
  assert.equal(config.segmentBytesPerSecond, 131072);
  assert.equal(config.segmentBurstBytes, 1048576);
  assert.equal(config.hybridAudioCapMb, 128);
  assert.equal(config.maxFollowupsPerQuestion, 1);
  assert.equal(config.decisionMaxInputTokens, 1200);
  assert.equal(config.decisionMaxOutputTokens, 120);
  assert.equal(config.summaryMaxTokens, 400);
  assert.equal(config.transcriptCacheSeconds, 86400);
  assert.equal(config.evaluationBatchSize, 8);
  assert.equal(config.evaluationMaxInputTokens, 6000);
  assert.equal(config.evaluationMaxOutputTokens, 1500);
  assert.deepEqual(config.maxLiveMinutes, { 10: 1, 15: 2, 30: 3, 45: 4, 60: 5 });
  assert.deepEqual(config.budget, {
    economicalInr: 30, cachedOnlyInr: 40, essentialInr: 45, hardInr: 60, evaluationReserveInr: 5,
    scaleByDuration: true, unknownPriceUsdPerM: 20,
  });
});

test("anviConfig keeps every existing key and default", () => {
  const config = anviConfig({});
  assert.deepEqual(USAGE_KINDS, ["live", "transcribe", "generate", "evaluate"]);
  assert.equal(config.liveModel, "gemini-3.8-live");
  assert.equal(config.transcribeModel, "gemini-3.5-flash-lite");
  assert.equal(config.generateModel, "gemini-3.5-flash-lite");
  assert.deepEqual(config.fallbackModels, ["gemini-3.5-flash", "gemini-3.1-flash-lite"]);
  assert.deepEqual(anviConfig({ ANVI_FALLBACK_MODELS: "" }).fallbackModels, ["gemini-3.5-flash", "gemini-3.1-flash-lite"]);
  assert.deepEqual(anviConfig({ ANVI_FALLBACK_MODELS: "a-1, bad model ,b-2" }).fallbackModels, ["a-1", "b-2"]);
  assert.equal(config.silenceMs, 2000);
  assert.equal(config.maxSessionMinutes, 45);
  assert.equal(config.maxFollowUpsPerQuestion, 1);
  assert.equal(config.accurateTranscription, false);
  assert.equal(config.liveResumption, true);
  assert.deepEqual(config.prices.transcribe, { input: 0, output: 0 });
  assert.deepEqual(Object.keys(config.prices), USAGE_KINDS);
  assert.equal(anviConfig({ ANVI_PRICE_TRANSCRIBE_INPUT: "0.3" }).prices.transcribe.input, 0.3);
});

test("anviConfig clamps and filters the hybrid settings", () => {
  const config = anviConfig({
    ANVI_HYBRID_ENABLED: "true", ANVI_HYBRID_ROLLOUT_PERCENT: "500",
    ANVI_HYBRID_MODES: "mock, bogus,mock", ANVI_HYBRID_LANGUAGES: "Hinglish,Hindi",
    ANVI_LIVE_VOICE: "Kore", ANVI_TTS_MODEL: "bad model!", ANVI_TTS_FALLBACK_MODEL: "gemini-x",
    ANVI_THINKING_TTS: "high", ANVI_THINKING_DECISION: "LOW", ANVI_THINKING_EVALUATE: "max",
    ANVI_LIVE_USAGE_SEMANTICS: "Cumulative", ANVI_TTS_SIGNED_URL_SECONDS: "5", ANVI_TTS_MIN_WPM: "1",
    ANVI_SEGMENT_CHUNK_BYTES: "5001", ANVI_MAX_SEGMENT_SECONDS: "500", ANVI_MAX_LIVE_MINUTES_10: "-1",
    ANVI_MAX_LIVE_MINUTES_60: "99", ANVI_TTS_LOUDNESS_TARGET_DBFS: "3", ANVI_EVALUATION_BATCH_SIZE: "50",
    ANVI_NUMBER_CLIPS: "off", ANVI_TTS_CACHE_ENABLED: "false", ANVI_TTS_LANGUAGE_CODE: "en_in",
    R2_BUCKET_NAME: "peerprep-avatars",
  });
  assert.equal(config.hybridEnabled, true);
  assert.equal(config.hybridRolloutPercent, 100);
  assert.deepEqual(config.hybridModes, ["mock"]);
  assert.deepEqual(config.hybridLanguages, ["English"]);
  assert.equal(config.ttsVoice, "Kore");
  assert.equal(config.ttsModel, "gemini-3.8-flash-tts");
  assert.equal(config.ttsFallbackModel, "gemini-x");
  assert.equal(config.thinkingByKind.tts, "none");
  assert.equal(config.thinkingByKind.decision, "low");
  assert.equal(config.thinkingByKind.evaluate, "low");
  assert.equal(config.liveUsageSemantics, "cumulative");
  assert.equal(config.ttsSignedUrlSeconds, 60);
  assert.equal(anviConfig({ ANVI_TTS_SIGNED_URL_SECONDS: "99999" }).ttsSignedUrlSeconds, 3600);
  assert.equal(config.ttsMinWpm, 30);
  assert.equal(config.segmentChunkBytes, 5000);
  assert.equal(config.maxSegmentSeconds, 90);
  assert.equal(config.maxLiveMinutes[10], 0);
  assert.equal(config.maxLiveMinutes[60], 15);
  assert.equal(config.ttsLoudnessTarget, -6);
  assert.equal(config.evaluationBatchSize, 8);
  assert.equal(config.numberClips, false);
  assert.equal(config.ttsCacheEnabled, false);
  assert.equal(config.ttsLanguageCode, "en-IN");
  assert.equal(config.audioBucket, "peerprep-avatars");
  assert.equal(anviConfig({ ANVI_AUDIO_R2_BUCKET: "anvi-audio", R2_BUCKET_NAME: "other" }).audioBucket, "anvi-audio");
  assert.equal(anviConfig({ ANVI_HYBRID_ROLLOUT_PERCENT: "-3" }).hybridRolloutPercent, 0);
  assert.equal(anviConfig({ ANVI_HYBRID_ENABLED: "yes please" }).hybridEnabled, false);
});

test("anviConfig: VAD timings follow the silence setting and speculative end stays below the hangover", () => {
  assert.equal(anviConfig({ ANVI_SILENCE_MS: "3000" }).hangoverMs, 3000);
  assert.equal(anviConfig({ ANVI_SILENCE_MS: "3000", ANVI_HANGOVER_MS: "1200" }).hangoverMs, 1200);
  assert.equal(anviConfig({ ANVI_SPECULATIVE_END_MS: "900" }).speculativeEndMs, 900);
  assert.equal(anviConfig({ ANVI_SPECULATIVE_END_MS: "2500" }).speculativeEndMs, null);
  assert.equal(anviConfig({ ANVI_SPECULATIVE_END_MS: "abc" }).speculativeEndMs, null);
  assert.equal(anviConfig({ ANVI_MAX_FOLLOW_UPS_PER_QUESTION: "2" }).maxFollowupsPerQuestion, 2);
  assert.equal(anviConfig({ ANVI_MAX_FOLLOW_UPS_PER_QUESTION: "2", ANVI_MAX_FOLLOWUPS_PER_QUESTION: "0" }).maxFollowupsPerQuestion, 0);
});

test("anviConfig: budget thresholds stay in order and the reserve never exceeds the hard limit", () => {
  const budget = anviConfig({
    ANVI_BUDGET_ECONOMICAL_INR: "50", ANVI_BUDGET_CACHED_ONLY_INR: "40", ANVI_BUDGET_ESSENTIAL_INR: "x",
    ANVI_BUDGET_HARD_INR: "10", ANVI_BUDGET_EVALUATION_RESERVE_INR: "500", ANVI_BUDGET_SCALE_BY_DURATION: "false",
    ANVI_BUDGET_UNKNOWN_PRICE_USD_PER_M: "0",
  }).budget;
  assert.equal(budget.economicalInr, 50);
  assert.equal(budget.cachedOnlyInr, 50);
  assert.equal(budget.essentialInr, 50);
  assert.equal(budget.hardInr, 50);
  assert.equal(budget.evaluationReserveInr, 50);
  assert.equal(budget.scaleByDuration, false);
  assert.equal(budget.unknownPriceUsdPerM, 1);
});

test("liveCapSeconds picks the bucket at or below the duration", () => {
  assert.deepEqual([10, 12, 15, 30, 45, 60, 90].map((minutes) => liveCapSeconds(minutes)), [60, 60, 120, 180, 240, 300, 300]);
  assert.equal(liveCapSeconds(5), 60);
  assert.equal(liveCapSeconds(undefined), 60);
  assert.equal(liveCapSeconds(30, anviConfig({ ANVI_MAX_LIVE_MINUTES_30: "0" })), 0);
  assert.equal(liveCapSeconds(45, anviConfig({ ANVI_MAX_LIVE_MINUTES_45: "2" })), 120);
  assert.deepEqual([9, 10, 14, 29, 44, 59, 61].map(durationBucket), [10, 10, 10, 15, 30, 45, 60]);
  assert.deepEqual([10, 15, 30, 45, 60].map(safeBudgetInr), [15, 20, 35, 48, 60]);
});

test("budgetThresholds scale by safeBudget(duration)/60", () => {
  const config = anviConfig({});
  assert.deepEqual(budgetThresholds(60, config), {
    factor: 1, economical: 30, cachedOnly: 40, essential: 45, hard: 60, evaluationReserve: 5, evaluationOnlyAt: 55,
  });
  assert.deepEqual(budgetThresholds(10, config), {
    factor: 0.25, economical: 7.5, cachedOnly: 10, essential: 11.25, hard: 15, evaluationReserve: 1.25, evaluationOnlyAt: 13.75,
  });
  assert.equal(budgetThresholds(45, config).hard, 48);
  assert.equal(budgetThresholds(90, config).hard, 60);
  const flat = anviConfig({ ANVI_BUDGET_SCALE_BY_DURATION: "false" });
  assert.equal(budgetThresholds(10, flat).essential, 45);
  assert.equal(budgetThresholds(10, flat).factor, 1);
});
