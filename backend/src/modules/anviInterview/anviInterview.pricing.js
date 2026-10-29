// Modality-aware ANVI pricing (pure: a function of env only). Prices are USD per million tokens, or USD per
// minute for the *_MINUTE settings. A missing price is unknown: the estimate is null, never 0.
import { createHash } from "node:crypto";
import { anviConfig } from "./anviInterview.config.js";

export const PRICED_KINDS = Object.freeze(["live", "transcribe", "transcribe_accurate", "generate", "decision", "evaluate", "tts"]);
const MODALITIES = Object.freeze(["TEXT", "AUDIO"]);
const DIRECTIONS = Object.freeze(["input", "output"]);
// Gemini bills audio at 25 tokens per second (1,500 per minute); confirmed in the 2026-10 probes.
export const AUDIO_TOKENS_PER_SECOND = 25;

const priceOrNull = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(number, 10_000) : null;
};
const positive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};
const whole = (value) => Math.round(positive(value));
const money = (value) => (value === null ? null : Math.round(value * 1e10) / 1e10);
const maxKnown = (...values) => {
  const known = values.filter((value) => value !== null);
  return known.length ? Math.max(...known) : null;
};

/**
 * The price table from env. Per kind: `input`/`output` hold `base` (ANVI_PRICE_{KIND}_{DIR}, the legacy
 * name) and per-modality overrides (ANVI_PRICE_{KIND}_{TEXT|AUDIO}_{DIR}); `minute` holds per-minute
 * audio prices: `input`/`output` (ANVI_PRICE_{KIND}_AUDIO_{DIR}_MINUTE) and `call`
 * (ANVI_PRICE_{KIND}_AUDIO_MINUTE, the whole call per minute of audio).
 */
export function pricingTable(env = process.env) {
  return Object.freeze(Object.fromEntries(PRICED_KINDS.map((kind) => {
    const key = kind.toUpperCase();
    const direction = (dir) => Object.freeze({
      base: priceOrNull(env[`ANVI_PRICE_${key}_${dir}`]),
      ...Object.fromEntries(MODALITIES.map((mod) => [mod, priceOrNull(env[`ANVI_PRICE_${key}_${mod}_${dir}`])])),
    });
    return [kind, Object.freeze({
      input: direction("INPUT"),
      output: direction("OUTPUT"),
      minute: Object.freeze({
        input: priceOrNull(env[`ANVI_PRICE_${key}_AUDIO_INPUT_MINUTE`]),
        output: priceOrNull(env[`ANVI_PRICE_${key}_AUDIO_OUTPUT_MINUTE`]),
        call: priceOrNull(env[`ANVI_PRICE_${key}_AUDIO_MINUTE`]),
      }),
    })];
  })));
}

// Accepts an onUsage payload ({kind, tokens: {input, output, inputByModality, ...}, audioSeconds}) or a
// stored ledger row ({kind, inputTokens, outputTokens, inputByModality, ...}).
function usageOf(usage = {}) {
  const tokens = usage.tokens || {};
  const modalities = (value) => (value && typeof value === "object" ? Object.entries(value)
    .map(([mod, count]) => [String(mod).toUpperCase(), whole(count)]).filter(([, count]) => count > 0) : null);
  return {
    kind: String(usage.kind || ""),
    input: whole(tokens.input ?? usage.inputTokens),
    output: whole(tokens.output ?? usage.outputTokens),
    inputByModality: modalities(tokens.inputByModality ?? usage.inputByModality),
    outputByModality: modalities(tokens.outputByModality ?? usage.outputByModality),
    audioSeconds: positive(usage.audioSeconds),
    sessionSeconds: positive(usage.sessionSeconds),
    outputAudioSeconds: positive(usage.outputAudioSeconds),
  };
}

export function anviPricing(env = process.env, config = anviConfig(env)) {
  const table = pricingTable(env);
  const rateNumber = Number(env.ANVI_USD_INR_RATE);
  const usdInrRate = Number.isFinite(rateNumber) && rateNumber > 0 ? Math.min(rateNumber, 1000) : null;
  const currency = config.priceCurrency;
  const label = /^[A-Za-z0-9._-]{1,40}$/.test(String(env.ANVI_PRICING_REVISION || "")) ? env.ANVI_PRICING_REVISION : "env";
  const hash = createHash("sha256").update(JSON.stringify({ table, usdInrRate, currency })).digest("hex");
  const revision = `${label}:${hash.slice(0, 12)}`;
  const validUntilText = String(env.ANVI_PRICING_VALID_UNTIL || "").trim();
  const validUntil = /^\d{4}-\d{2}-\d{2}$/.test(validUntilText) && Number.isFinite(Date.parse(`${validUntilText}T23:59:59.999Z`))
    ? new Date(`${validUntilText}T23:59:59.999Z`) : null;
  const ceiling = config.budget.unknownPriceUsdPerM;

  // TEXT and AUDIO use their own price, else the base price. Any other modality (IMAGE, VIDEO) has no
  // price of its own, so it falls back to the highest price for the direction.
  const rateOf = (kind, dir, mod) => {
    const prices = table[kind][dir];
    return MODALITIES.includes(mod) ? prices[mod] ?? prices.base : prices.base ?? highestOf(kind, dir);
  };
  const highestOf = (kind, dir) => maxKnown(table[kind][dir].base, ...MODALITIES.map((mod) => table[kind][dir][mod]));
  // Explicit audio seconds for a direction: TTS reports its output audio in audioSeconds.
  const secondsOf = (kind, dir, u) => {
    if (kind === "tts") return dir === "output" ? Math.max(u.audioSeconds, u.outputAudioSeconds) : 0;
    return dir === "input" ? Math.max(u.sessionSeconds, u.audioSeconds) : u.outputAudioSeconds;
  };

  // Components of one call: {name, usd|null, tokens, seconds}. With `conservative`, unknown prices are
  // charged at the ceiling instead of returning null.
  function components(u, conservative) {
    const kind = u.kind;
    const prices = table[kind];
    const unknownUsd = (tokens, seconds) => ((tokens || seconds * AUDIO_TOKENS_PER_SECOND) * ceiling) / 1_000_000;
    const priced = (tokens, rate) => (rate === null ? null : (tokens * rate) / 1_000_000);
    const parts = [];
    for (const dir of DIRECTIONS) {
      const total = u[dir];
      const byModality = u[`${dir}ByModality`];
      const minuteRate = prices.minute[dir];
      const explicitSeconds = secondsOf(kind, dir, u);
      const minuteUsd = (seconds) => (minuteRate !== null && seconds > 0 ? (seconds / 60) * minuteRate : null);
      const push = (name, tokens, usd, seconds = 0) => parts.push({ name: `${kind}.${dir}.${name}`, tokens, seconds, usd });
      if (byModality && byModality.length) {
        let counted = 0;
        for (const [mod, tokens] of byModality) {
          counted += tokens;
          const tokenUsd = priced(tokens, rateOf(kind, dir, mod));
          if (mod === "AUDIO") {
            const seconds = Math.max(explicitSeconds, tokens / AUDIO_TOKENS_PER_SECOND);
            push(mod, tokens, maxKnown(tokenUsd, minuteUsd(seconds)), seconds);
          } else push(mod, tokens, tokenUsd);
        }
        // Tokens without a modality (e.g. thinking) are priced at the highest rate for the direction.
        const rest = Math.max(0, total - counted);
        if (rest > 0) push("other", rest, priced(rest, highestOf(kind, dir)));
      } else if (total > 0 || minuteUsd(explicitSeconds) !== null) {
        // No modality detail: the highest price for the direction, or the per-minute price when higher.
        push("all", total, maxKnown(priced(total, highestOf(kind, dir)), minuteUsd(explicitSeconds)), explicitSeconds);
      }
    }
    // A per-minute price for the whole call (accurate transcription): the higher of it and the tokens.
    if (prices.minute.call !== null) {
      const audioTokens = (u.inputByModality || []).filter(([mod]) => mod === "AUDIO").reduce((sum, [, count]) => sum + count, 0);
      const seconds = Math.max(u.audioSeconds, audioTokens / AUDIO_TOKENS_PER_SECOND);
      const callUsd = seconds > 0 ? (seconds / 60) * prices.minute.call : null;
      const tokenUsd = parts.filter((part) => part.usd !== null).reduce((sum, part) => sum + part.usd, 0);
      if (callUsd !== null) return [{ name: `${kind}.call`, tokens: 0, seconds, usd: Math.max(callUsd, tokenUsd) }];
    }
    if (!conservative) return parts;
    return parts.map((part) => (part.usd === null ? { ...part, usd: unknownUsd(part.tokens, part.seconds) } : part));
  }

  const inrOf = (usd) => (usd === null ? null : usd === 0 ? 0 : usdInrRate === null ? null : usd * usdInrRate);
  // A kind with no price table that still reports tokens (a typo or a new kind) is unknown, never free.
  const unpricedTokens = (u) => u.input + u.output;

  /** {usd|null, inr|null, complete, revision, unknownParts[]} for one call. */
  function estimate(usage) {
    const u = usageOf(usage);
    if (!PRICED_KINDS.includes(u.kind)) {
      if (unpricedTokens(u) > 0) return Object.freeze({ usd: null, inr: null, complete: false, revision, unknownParts: Object.freeze(["kind.unpriced"]) });
      return Object.freeze({ usd: 0, inr: 0, complete: true, revision, unknownParts: Object.freeze([]) });
    }
    const parts = components(u, false);
    const unknownParts = parts.filter((part) => part.usd === null).map((part) => part.name);
    const usd = unknownParts.length ? null : parts.reduce((sum, part) => sum + part.usd, 0);
    const inr = inrOf(usd);
    if (usd !== null && inr === null) unknownParts.push("usd_inr_rate");
    return Object.freeze({ usd: money(usd), inr: money(inr), complete: unknownParts.length === 0, revision, unknownParts: Object.freeze(unknownParts) });
  }

  /** The budget's USD for one call: unknown prices are charged at ANVI_BUDGET_UNKNOWN_PRICE_USD_PER_M. */
  function conservativeUsd(usage) {
    const u = usageOf(usage);
    if (!PRICED_KINDS.includes(u.kind)) return money((unpricedTokens(u) * ceiling) / 1_000_000);
    return money(components(u, true).reduce((sum, part) => sum + part.usd, 0));
  }

  /** conservativeUsd in INR, or null without ANVI_USD_INR_RATE. */
  const conservativeInr = (usage) => money(inrOf(conservativeUsd(usage)));

  // What hybrid needs priced: [kind, direction, modality]. A per-minute price covers the audio parts.
  // Generation (per-student questions, resume profile) is paid in hybrid attempts too, so a missing
  // generate price would leave the attempt's cost "Incomplete".
  const HYBRID_NEEDS = [
    ["transcribe", "input", "AUDIO"], ["transcribe", "input", "TEXT"], ["transcribe", "output", "TEXT"],
    ["transcribe_accurate", "input", "AUDIO"], ["transcribe_accurate", "input", "TEXT"], ["transcribe_accurate", "output", "TEXT"],
    ["generate", "input", "TEXT"], ["generate", "output", "TEXT"],
    ["decision", "input", "TEXT"], ["decision", "output", "TEXT"],
    ["evaluate", "input", "TEXT"], ["evaluate", "output", "TEXT"],
    ["tts", "input", "TEXT"], ["tts", "output", "AUDIO"],
  ];
  const LIVE_NEEDS = [["live", "input", "TEXT"], ["live", "input", "AUDIO"], ["live", "output", "TEXT"], ["live", "output", "AUDIO"]];
  // The env name to report for a missing price (the spec's names).
  const MODALITY_NAMED = new Set(["live", "tts"]);
  const envNameOf = (kind, dir, mod) => {
    if (kind === "transcribe_accurate") return "ANVI_PRICE_TRANSCRIBE_ACCURATE_AUDIO_MINUTE";
    const key = kind.toUpperCase();
    return MODALITY_NAMED.has(kind) ? `ANVI_PRICE_${key}_${mod}_${dir.toUpperCase()}` : `ANVI_PRICE_${key}_${dir.toUpperCase()}`;
  };
  const covered = (kind, dir, mod) => {
    const prices = table[kind];
    if (prices.minute.call !== null) return true;
    if ((prices[dir][mod] ?? prices[dir].base) !== null) return true;
    return mod === "AUDIO" && prices.minute[dir] !== null;
  };

  /** Env names of the prices (and rate) hybrid still needs; names only, never values. */
  function missingHybridPrices({ liveEscalation = config.hybridLiveEscalation } = {}) {
    const needs = liveEscalation ? [...HYBRID_NEEDS, ...LIVE_NEEDS] : HYBRID_NEEDS;
    const missing = new Set(needs.filter(([kind, dir, mod]) => !covered(kind, dir, mod)).map((need) => envNameOf(...need)));
    if (usdInrRate === null) missing.add("ANVI_USD_INR_RATE");
    return Object.freeze([...missing]);
  }
  const hybridPricesComplete = (options) => missingHybridPrices(options).length === 0;

  return Object.freeze({
    table,
    currency,
    usdInrRate,
    revision,
    validUntil,
    /** True once ANVI_PRICING_VALID_UNTIL (end of that UTC day) has passed. */
    expired: (now = new Date()) => Boolean(validUntil && now.getTime() > validUntil.getTime()),
    estimate,
    conservativeUsd,
    conservativeInr,
    hybridPricesComplete,
    missingHybridPrices,
  });
}
