// Resume JD Match: what one check may cost PeerPrep and how much may be spent each month.
// The Master Admin edits the limits (Prep Coin › Pricing); every billed Gemini response is metered
// here, including ones that were then rejected, so the monthly kill switch sees the real spend.
import { HttpError } from '../../utils/errors.js';
import { PlatformAiSpend, PlatformAudit, PlatformCoinPricing } from '../../platform/models.js';
import { callUsd } from './jdMatch.engine.js';

export const JD_MATCH_FEATURE = 'resume_jd_match';
const LIMITS_DOC = 'resume_jd_match';
const CACHE_MS = 15_000;

/** List prices of the model (USD per 1M tokens). Override only when Google changes them. */
export function jdMatchModel(env = process.env) {
  const positive = (value, fallback) => (Number(value) > 0 ? Number(value) : fallback);
  return Object.freeze({
    model: String(env.RESUME_JD_MODEL || 'gemini-3.1-flash-lite').trim(),
    inputUsdPerM: positive(env.RESUME_JD_INPUT_USD_PER_M, 0.25),
    outputUsdPerM: positive(env.RESUME_JD_OUTPUT_USD_PER_M, 1.5),
    // Thinking tokens are billed as output; "low" is the level already proven on this model here.
    thinkingLevel: ['none', 'minimal', 'low', 'medium'].includes(String(env.RESUME_JD_THINKING || '').trim()) ? String(env.RESUME_JD_THINKING).trim() : 'low',
    maxOutputTokens: Math.min(4096, Math.max(800, Math.floor(positive(env.RESUME_JD_MAX_OUTPUT_TOKENS, 2400)))),
    timeoutMs: Math.min(90_000, Math.max(10_000, Math.floor(positive(env.RESUME_JD_TIMEOUT_MS, 45_000)))),
  });
}

export const DEFAULT_JD_LIMITS = Object.freeze({
  perCheckCapInr: 0.5,
  monthlyBudgetInr: 2000,
  dailyChecksPerStudent: 5,
  usdToInr: 88,
});

const RULES = {
  // Below ~₹0.30 there is no room for a complete answer (≈1,800 output tokens) plus the résumé.
  perCheckCapInr: { min: 0.3, max: 5, label: 'Cost cap per check (₹)' },
  monthlyBudgetInr: { min: 0, max: 1_000_000, label: 'Monthly budget (₹)' },
  dailyChecksPerStudent: { min: 1, max: 50, integer: true, label: 'Checks per student per day' },
  usdToInr: { min: 50, max: 200, label: '₹ per US$' },
};

export function normalizeJdLimits(value = {}) {
  const input = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.entries(RULES).map(([key, rule]) => {
    const number = Number(input[key] ?? DEFAULT_JD_LIMITS[key]);
    if (!Number.isFinite(number) || number < rule.min || number > rule.max || (rule.integer && !Number.isInteger(number))) {
      throw new HttpError(400, `${rule.label} must be ${rule.integer ? 'a whole number ' : ''}from ${rule.min} to ${rule.max}.`);
    }
    return [key, rule.integer ? number : Math.round(number * 100) / 100];
  }));
}

let cache = null;
let cachedAt = 0;
export function clearJdLimitsCache() { cache = null; cachedAt = 0; }

export async function getJdMatchLimits({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < CACHE_MS) return cache;
  const row = await PlatformCoinPricing.findById(LIMITS_DOC).lean();
  let limits;
  try { limits = normalizeJdLimits(row?.limits || {}); } catch { limits = { ...DEFAULT_JD_LIMITS }; }
  cache = { version: row?.version || 0, limits, updatedAt: row?.updatedAt || null };
  cachedAt = Date.now();
  return cache;
}

export async function saveJdMatchLimits({ limits, expectedVersion, reason, actorId }) {
  const normalized = normalizeJdLimits(limits);
  const before = await getJdMatchLimits({ fresh: true });
  if (Number(expectedVersion) !== before.version) throw new HttpError(409, 'These limits were changed elsewhere. Reload to see the latest.');
  const filter = before.version ? { _id: LIMITS_DOC, version: before.version } : { _id: LIMITS_DOC, $or: [{ version: 0 }, { version: { $exists: false } }] };
  try {
    const saved = await PlatformCoinPricing.findOneAndUpdate(filter, {
      $set: { limits: normalized, updatedBy: actorId, reason: String(reason || '').trim().slice(0, 300) }, $inc: { version: 1 },
    }, { upsert: true, new: true }).lean();
    await PlatformAudit.create({ actor: String(actorId), action: 'resume_jd_match.limits_updated', details: { before: before.limits, after: normalized, version: saved.version } });
    clearJdLimitsCache();
    return getJdMatchLimits({ fresh: true });
  } catch (error) {
    if (error?.code === 11000) throw new HttpError(409, 'These limits were changed elsewhere. Reload to see the latest.');
    throw error;
  }
}

/** The calendar month in India (IST). */
export const spendMonth = (date = new Date()) => new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 7);

/** Meters one billed Gemini response. Never throws: metering must not fail a student's check. */
export async function recordJdSpend(tokens, { rates = jdMatchModel(), capUsd = Infinity, now = new Date() } = {}) {
  if (!tokens) return 0;
  const usd = callUsd(tokens, rates);
  const month = spendMonth(now);
  await PlatformAiSpend.updateOne(
    { _id: `${JD_MATCH_FEATURE}:${month}` },
    {
      $setOnInsert: { feature: JD_MATCH_FEATURE, month },
      $inc: { calls: 1, inputTokens: Number(tokens.input) || 0, outputTokens: Number(tokens.output) || 0, thoughtTokens: Number(tokens.thoughts) || 0, usd, overCap: usd > capUsd ? 1 : 0 },
      $max: { maxCallUsd: usd },
    },
    { upsert: true },
  ).catch((error) => console.warn('[resume-jd-match] Spend not recorded:', error.message));
  if (usd > capUsd) console.warn(`[resume-jd-match] A check cost $${usd.toFixed(5)}, above the cap of $${capUsd.toFixed(5)}.`);
  return usd;
}

/** This month's spend in ₹ with the per-check numbers the Master Admin sees. */
export async function jdMatchSpend({ now = new Date(), limits = null } = {}) {
  const current = limits || (await getJdMatchLimits()).limits;
  const row = await PlatformAiSpend.findById(`${JD_MATCH_FEATURE}:${spendMonth(now)}`).lean();
  const inr = (usd) => Math.round((Number(usd) || 0) * current.usdToInr * 100) / 100;
  const calls = row?.calls || 0;
  const spentInr = inr(row?.usd);
  return {
    month: spendMonth(now), calls, spentInr,
    averageInr: calls ? Math.round((spentInr / calls) * 1000) / 1000 : 0,
    maxCallInr: inr(row?.maxCallUsd), overCap: row?.overCap || 0,
    inputTokens: row?.inputTokens || 0, outputTokens: row?.outputTokens || 0, thoughtTokens: row?.thoughtTokens || 0,
    budgetInr: current.monthlyBudgetInr,
    paused: spentInr >= current.monthlyBudgetInr,
  };
}

/** Throws 503 when this month's budget is used up (or the Master Admin set it to 0). */
export async function assertJdBudget(limits) {
  const spend = await jdMatchSpend({ limits });
  if (spend.paused) {
    throw new HttpError(503, 'ANVI JD Match is paused for now because this month\'s check budget is used up. No coins were taken. Please try again later.', { code: 'JD_MATCH_PAUSED' });
  }
  return spend;
}
