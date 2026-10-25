import assert from "node:assert/strict";
import { test } from "node:test";
import { anviPricing, pricingTable } from "../src/modules/anviInterview/anviInterview.pricing.js";

// The verified 2026-10-19 prices (USD per 1M tokens; *_MINUTE per minute) plus an illustrative rate.
const VERIFIED = Object.freeze({
  ANVI_PRICE_LIVE_TEXT_INPUT: "0.75", ANVI_PRICE_LIVE_AUDIO_INPUT: "3", ANVI_PRICE_LIVE_AUDIO_INPUT_MINUTE: "0.005",
  ANVI_PRICE_LIVE_TEXT_OUTPUT: "4.5", ANVI_PRICE_LIVE_AUDIO_OUTPUT: "12", ANVI_PRICE_LIVE_AUDIO_OUTPUT_MINUTE: "0.018",
  ANVI_PRICE_TRANSCRIBE_INPUT: "0.3", ANVI_PRICE_TRANSCRIBE_OUTPUT: "2.5",
  ANVI_PRICE_TRANSCRIBE_ACCURATE_AUDIO_MINUTE: "0.005",
  ANVI_PRICE_GENERATE_INPUT: "0.3", ANVI_PRICE_GENERATE_OUTPUT: "2.5",
  ANVI_PRICE_DECISION_INPUT: "0.3", ANVI_PRICE_DECISION_OUTPUT: "2.5",
  ANVI_PRICE_EVALUATE_INPUT: "0.75", ANVI_PRICE_EVALUATE_OUTPUT: "3.75",
  ANVI_PRICE_TTS_TEXT_INPUT: "0.5", ANVI_PRICE_TTS_AUDIO_OUTPUT: "9",
  ANVI_USD_INR_RATE: "88", ANVI_PRICING_REVISION: "2026-10-19", ANVI_PRICING_VALID_UNTIL: "2026-12-31",
});
const without = (...names) => Object.fromEntries(Object.entries(VERIFIED).filter(([name]) => !names.includes(name)));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("estimate prices each modality and reports USD and INR", () => {
  const pricing = anviPricing(VERIFIED);
  const tts = pricing.estimate({ kind: "tts", tokens: { input: 20, output: 250, inputByModality: { TEXT: 20 }, outputByModality: { AUDIO: 250 } } });
  close(tts.usd, (20 * 0.5 + 250 * 9) / 1e6);
  close(tts.inr, tts.usd * 88);
  assert.equal(tts.complete, true);
  assert.deepEqual(tts.unknownParts, []);
  assert.equal(tts.revision, pricing.revision);
  // A ledger row (inputTokens/outputTokens) is priced the same way.
  const row = pricing.estimate({ kind: "decision", inputTokens: 1000, outputTokens: 100 });
  close(row.usd, (1000 * 0.3 + 100 * 2.5) / 1e6);
});

test("a missing price gives usd null and complete false, never 0 (AC12)", () => {
  const pricing = anviPricing(without("ANVI_PRICE_TTS_AUDIO_OUTPUT"));
  const estimate = pricing.estimate({ kind: "tts", tokens: { input: 20, output: 250, inputByModality: { TEXT: 20 }, outputByModality: { AUDIO: 250 } } });
  assert.equal(estimate.usd, null);
  assert.equal(estimate.inr, null);
  assert.equal(estimate.complete, false);
  assert.deepEqual(estimate.unknownParts, ["tts.output.AUDIO"]);
  const unpriced = anviPricing({}).estimate({ kind: "evaluate", tokens: { input: 10, output: 5 } });
  assert.equal(unpriced.usd, null);
  assert.equal(unpriced.complete, false);
  // A known TEXT price is not borrowed for AUDIO when the call reports modalities.
  const live = anviPricing({ ANVI_PRICE_LIVE_TEXT_INPUT: "0.75", ANVI_USD_INR_RATE: "88" })
    .estimate({ kind: "live", tokens: { input: 1500, inputByModality: { AUDIO: 1500 } } });
  assert.equal(live.usd, null);
  assert.deepEqual(live.unknownParts, ["live.input.AUDIO"]);
});

test("INR is null without a rate", () => {
  const estimate = anviPricing(without("ANVI_USD_INR_RATE")).estimate({ kind: "decision", tokens: { input: 1000, output: 100 } });
  close(estimate.usd, 0.00055);
  assert.equal(estimate.inr, null);
  assert.equal(estimate.complete, false);
  assert.deepEqual(estimate.unknownParts, ["usd_inr_rate"]);
  // Zero cost is zero in any currency.
  assert.equal(anviPricing({}).estimate({ kind: "decision", tokens: {} }).inr, 0);
});

test("Live takes the higher of the token and the per-minute price", () => {
  const pricing = anviPricing(VERIFIED);
  // 60 s of input audio: tokens 1500 x $3/M = $0.0045 < 1 min x $0.005.
  const input = pricing.estimate({ kind: "live", tokens: { input: 1500, inputByModality: { AUDIO: 1500 } } });
  close(input.usd, 0.005);
  // Open seconds (forwarded silence) raise the per-minute side: 120 s x $0.005/min.
  close(pricing.estimate({ kind: "live", sessionSeconds: 120, tokens: { input: 1500, inputByModality: { AUDIO: 1500 } } }).usd, 0.01);
  // Output audio above the minute rate: 1500 tokens x $12/M = $0.018 = 1 min x $0.018; text is extra.
  const output = pricing.estimate({ kind: "live", tokens: { input: 100, output: 1600, inputByModality: { TEXT: 100 }, outputByModality: { AUDIO: 1500, TEXT: 100 } } });
  close(output.usd, (100 * 0.75) / 1e6 + 0.018 + (100 * 4.5) / 1e6);
  // With a higher token price the token side wins.
  const pricey = anviPricing({ ...VERIFIED, ANVI_PRICE_LIVE_AUDIO_OUTPUT: "20" });
  close(pricey.estimate({ kind: "live", tokens: { output: 1500, outputByModality: { AUDIO: 1500 } } }).usd, (1500 * 20) / 1e6);
  // A per-minute price alone is enough for the audio part.
  const minuteOnly = anviPricing(without("ANVI_PRICE_LIVE_AUDIO_INPUT"));
  const estimate = minuteOnly.estimate({ kind: "live", tokens: { input: 750, inputByModality: { AUDIO: 750 } } });
  assert.equal(estimate.complete, true);
  close(estimate.usd, 0.0025);
});

test("without modality detail the highest price for the direction is used", () => {
  const pricing = anviPricing(VERIFIED);
  close(pricing.estimate({ kind: "live", tokens: { input: 1000, output: 1000 } }).usd, (1000 * 3 + 1000 * 12) / 1e6);
  // Tokens outside the modality breakdown (thinking) are priced at the highest rate.
  close(pricing.estimate({ kind: "live", tokens: { output: 130, outputByModality: { TEXT: 100 } } }).usd, (100 * 4.5 + 30 * 12) / 1e6);
});

test("transcribe_accurate is priced per minute of audio", () => {
  const pricing = anviPricing(VERIFIED);
  const estimate = pricing.estimate({ kind: "transcribe_accurate", audioSeconds: 30, tokens: { input: 760, output: 80, inputByModality: { AUDIO: 750, TEXT: 10 } } });
  assert.equal(estimate.complete, true);
  close(estimate.usd, 0.0025);
  // Token prices, when set and higher, win over the minute price.
  const tokens = anviPricing({ ...VERIFIED, ANVI_PRICE_TRANSCRIBE_ACCURATE_AUDIO_INPUT: "2", ANVI_PRICE_TRANSCRIBE_ACCURATE_OUTPUT: "40" });
  close(tokens.estimate({ kind: "transcribe_accurate", audioSeconds: 30, tokens: { input: 750, output: 100, inputByModality: { AUDIO: 750 } } }).usd, (750 * 2 + 100 * 40) / 1e6);
  assert.equal(anviPricing(without("ANVI_PRICE_TRANSCRIBE_ACCURATE_AUDIO_MINUTE"))
    .estimate({ kind: "transcribe_accurate", audioSeconds: 30, tokens: { input: 750, output: 80 } }).usd, null);
});

test("kinds without a price are free and complete", () => {
  const pricing = anviPricing({});
  assert.deepEqual({ ...pricing.estimate({ kind: "session", sessionSeconds: 600 }) }, {
    usd: 0, inr: 0, complete: true, revision: pricing.revision, unknownParts: [],
  });
  assert.equal(pricing.conservativeUsd({ kind: "metric" }), 0);
});

test("an unpriced kind that reports tokens is unknown, and the budget charges it at the ceiling", () => {
  const pricing = anviPricing({ ...VERIFIED, ANVI_BUDGET_UNKNOWN_PRICE_USD_PER_M: "20" });
  const estimate = pricing.estimate({ kind: "transcribe-accurate", tokens: { input: 1000, output: 100 } });
  assert.equal(estimate.usd, null);
  assert.equal(estimate.inr, null);
  assert.equal(estimate.complete, false);
  assert.deepEqual([...estimate.unknownParts], ["kind.unpriced"]);
  close(pricing.conservativeUsd({ kind: "transcribe-accurate", inputTokens: 1000, outputTokens: 100 }), (1100 * 20) / 1e6);
});

test("conservativeUsd charges unknown prices at the ceiling", () => {
  const pricing = anviPricing({ ...without("ANVI_PRICE_TTS_AUDIO_OUTPUT"), ANVI_BUDGET_UNKNOWN_PRICE_USD_PER_M: "20" });
  const usage = { kind: "tts", tokens: { input: 20, output: 1000, inputByModality: { TEXT: 20 }, outputByModality: { AUDIO: 1000 } } };
  close(pricing.conservativeUsd(usage), (20 * 0.5 + 1000 * 20) / 1e6);
  close(pricing.conservativeInr(usage), ((20 * 0.5 + 1000 * 20) / 1e6) * 88);
  // Known prices are used as they are.
  close(anviPricing(VERIFIED).conservativeUsd(usage), (20 * 0.5 + 1000 * 9) / 1e6);
  // A per-minute part with no price is charged by its audio-token equivalent (60 s = 1500 tokens).
  const minuteUnknown = anviPricing({ ANVI_PRICE_LIVE_TEXT_INPUT: "0.75", ANVI_BUDGET_UNKNOWN_PRICE_USD_PER_M: "20" });
  close(minuteUnknown.conservativeUsd({ kind: "live", tokens: { input: 1500, inputByModality: { AUDIO: 1500 } } }), (1500 * 20) / 1e6);
  assert.equal(anviPricing({ ANVI_USD_INR_RATE: "" }).conservativeInr({ kind: "decision", tokens: { input: 10 } }), null);
});

test("the revision changes when any price changes", () => {
  const base = anviPricing(VERIFIED).revision;
  assert.match(base, /^2026-10-19:[0-9a-f]{12}$/);
  assert.equal(anviPricing({ ...VERIFIED }).revision, base);
  for (const name of Object.keys(VERIFIED).filter((key) => key.startsWith("ANVI_PRICE_") || key === "ANVI_USD_INR_RATE")) {
    assert.notEqual(anviPricing({ ...VERIFIED, [name]: String(Number(VERIFIED[name]) + 1) }).revision, base, name);
  }
  assert.notEqual(anviPricing({ ...VERIFIED, ANVI_PRICE_TTS_TEXT_OUTPUT: "1" }).revision, base);
  assert.match(anviPricing({}).revision, /^env:[0-9a-f]{12}$/);
  assert.equal(pricingTable(VERIFIED).tts.output.AUDIO, 9);
  assert.equal(pricingTable({}).tts.output.AUDIO, null);
});

test("hybridPricesComplete is false when any hybrid price or the rate is missing", () => {
  assert.equal(anviPricing(VERIFIED).hybridPricesComplete(), true);
  assert.deepEqual(anviPricing(VERIFIED).missingHybridPrices(), []);
  assert.deepEqual(anviPricing({}).missingHybridPrices(), [
    "ANVI_PRICE_TRANSCRIBE_INPUT", "ANVI_PRICE_TRANSCRIBE_OUTPUT", "ANVI_PRICE_TRANSCRIBE_ACCURATE_AUDIO_MINUTE",
    "ANVI_PRICE_GENERATE_INPUT", "ANVI_PRICE_GENERATE_OUTPUT", "ANVI_PRICE_DECISION_INPUT", "ANVI_PRICE_DECISION_OUTPUT", "ANVI_PRICE_EVALUATE_INPUT", "ANVI_PRICE_EVALUATE_OUTPUT",
    "ANVI_PRICE_TTS_TEXT_INPUT", "ANVI_PRICE_TTS_AUDIO_OUTPUT", "ANVI_USD_INR_RATE",
  ]);
  for (const name of ["ANVI_PRICE_TRANSCRIBE_INPUT", "ANVI_PRICE_TRANSCRIBE_ACCURATE_AUDIO_MINUTE", "ANVI_PRICE_GENERATE_OUTPUT", "ANVI_PRICE_DECISION_OUTPUT",
    "ANVI_PRICE_EVALUATE_INPUT", "ANVI_PRICE_TTS_TEXT_INPUT", "ANVI_PRICE_TTS_AUDIO_OUTPUT", "ANVI_USD_INR_RATE"]) {
    const pricing = anviPricing(without(name));
    assert.equal(pricing.hybridPricesComplete(), false, name);
    assert.deepEqual(pricing.missingHybridPrices(), [name]);
  }
  // Live prices are needed only when Live escalation is on.
  const noLive = without("ANVI_PRICE_LIVE_AUDIO_OUTPUT", "ANVI_PRICE_LIVE_AUDIO_OUTPUT_MINUTE");
  assert.equal(anviPricing(noLive).hybridPricesComplete(), true);
  assert.equal(anviPricing({ ...noLive, ANVI_HYBRID_LIVE_ESCALATION: "true" }).hybridPricesComplete(), false);
  assert.deepEqual(anviPricing(noLive).missingHybridPrices({ liveEscalation: true }), ["ANVI_PRICE_LIVE_AUDIO_OUTPUT"]);
  // The missing names never carry values.
  assert.ok(anviPricing(without("ANVI_USD_INR_RATE")).missingHybridPrices().every((name) => /^ANVI_[A-Z_]+$/.test(name)));
});

test("pricing validity expires after ANVI_PRICING_VALID_UNTIL", () => {
  const pricing = anviPricing(VERIFIED);
  assert.equal(pricing.validUntil.toISOString(), "2026-12-31T23:59:59.999Z");
  assert.equal(pricing.expired(new Date("2026-12-31T12:00:00Z")), false);
  assert.equal(pricing.expired(new Date("2027-01-01T00:00:01Z")), true);
  assert.equal(anviPricing({}).validUntil, null);
  assert.equal(anviPricing({}).expired(new Date("2099-01-01")), false);
  assert.equal(anviPricing({ ANVI_PRICING_VALID_UNTIL: "31/12/2026" }).validUntil, null);
  assert.equal(anviPricing({}).currency, "USD");
  assert.equal(anviPricing(VERIFIED).usdInrRate, 88);
});
