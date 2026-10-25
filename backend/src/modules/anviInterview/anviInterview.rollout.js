// Runtime mode for one ANVI attempt (live or hybrid). Pure: chosen once at start and stamped on the
// attempt as runtimeMode; it never changes afterwards. Any failed gate means Live, which is the path
// that works today (DECISIONS #4: with the hybrid flag off nothing changes).
import { createHash } from "node:crypto";

const HYBRID_DEFAULT_LANGUAGE = "English";
const ID_PART = /^[A-Za-z0-9._:-]{1,200}$/;

const idOf = (value) => {
  const text = String(value ?? "").trim();
  return ID_PART.test(text) ? text : "";
};

/**
 * The deterministic rollout bucket 0..99 of a student in a tenant: sha256("tenantKey:studentId"), first
 * 48 bits, modulo 100. The same student always lands in the same bucket, so raising the percent only
 * adds students. Returns null when either id is missing or malformed.
 */
export function rolloutBucket(tenantKey, studentId) {
  const tenant = idOf(tenantKey);
  const student = idOf(studentId);
  if (!tenant || !student) return null;
  return createHash("sha256").update(`${tenant}:${student}`, "utf8").digest().readUIntBE(0, 6) % 100;
}

/** True when the student's bucket is below `percent` (0 admits nobody, 100 admits everyone). */
export function inRollout(tenantKey, studentId, percent) {
  const share = Number(percent);
  if (!Number.isFinite(share) || share <= 0) return false;
  const bucket = rolloutBucket(tenantKey, studentId);
  if (bucket === null) return false;
  return bucket < Math.min(100, Math.floor(share));
}

const gateOf = (value, method) => {
  if (typeof value === "boolean") return value;
  if (value && typeof value[method] === "function") return Boolean(value[method]());
  if (value && typeof value === "object" && "ready" in value) return Boolean(value.ready);
  return false;
};

/**
 * {runtimeMode: "live"|"hybrid", reason} for a new attempt. Gates, in order:
 * flag on → rollout bucket → attempt kind in hybridModes ("scheduled" when `scheduled`, i.e. the attempt
 * has an assignmentId, else its mode) → English → prices complete → R2 ready.
 * `pricing` is a boolean or the anviPricing() object (hybridPricesComplete); `storage` is a boolean or
 * the createAudioStorage() object ({ready}). `reason` is "" for hybrid, else the first gate that failed.
 */
export function chooseRuntimeMode({
  config = {}, tenantKey, studentId, mode, scheduled = false, language = HYBRID_DEFAULT_LANGUAGE, pricing = false, storage = false,
} = {}) {
  const live = (reason) => Object.freeze({ runtimeMode: "live", reason });
  if (!config.hybridEnabled) return live("disabled");
  if (!inRollout(tenantKey, studentId, config.hybridRolloutPercent)) return live("rollout");
  const modes = Array.isArray(config.hybridModes) ? config.hybridModes : [];
  // An assigned attempt is gated by "scheduled", a self-started one by its attempt mode.
  if (!modes.includes(scheduled ? "scheduled" : mode)) return live("mode");
  const languages = Array.isArray(config.hybridLanguages) && config.hybridLanguages.length
    ? config.hybridLanguages : [HYBRID_DEFAULT_LANGUAGE];
  if (!languages.includes(language || HYBRID_DEFAULT_LANGUAGE)) return live("language");
  if (!gateOf(pricing, "hybridPricesComplete")) return live("pricing");
  if (!gateOf(storage, "isReady")) return live("storage");
  return Object.freeze({ runtimeMode: "hybrid", reason: "" });
}

let pricingWarned = false;

/**
 * The runtime mode for a new attempt (§0 of the plan): chooseRuntimeMode, plus one warning per process when
 * hybrid falls back to Live because prices are missing. The warning names the missing variables only.
 * A resumed attempt keeps its stored mode (the caller never calls this for one).
 */
export function runtimeModeFor(options = {}, { log = console } = {}) {
  const chosen = chooseRuntimeMode(options);
  if (chosen.reason === "pricing" && !pricingWarned) {
    pricingWarned = true;
    let missing = [];
    try { missing = options.pricing?.missingHybridPrices?.() || []; } catch { missing = []; }
    log?.warn?.(`[ANVI] Hybrid interviews run Live until these prices are set: ${missing.length ? missing.join(", ") : "pricing"}.`);
  }
  return chosen;
}
