// ANVI JD Match: pure helpers shared by the hook, the panel and the tests (no imports).

export const JD_MATCH_FEATURE_KEY = 'resume.jd_match';
export const JD_MIN_CHARS = 300;
export const JD_MAX_CHARS = 12000;

/** A short, stable key for a job description (to compare a re-check with the last one). */
export function jdKey(text) {
  const clean = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  let hash = 2166136261;
  for (let index = 0; index < clean.length; index += 1) { hash ^= clean.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `${clean.length}:${(hash >>> 0).toString(36)}`;
}

/** What the popup should say for a refused start, from the server's error. Nothing was charged. */
export function describeStartError(error) {
  const data = error?.response?.data || {};
  const status = error?.response?.status || 0;
  const message = data.error || data.message || error?.message || 'ANVI could not start this check.';
  if (data.code === 'INSUFFICIENT_PREP_COINS') return { kind: 'shortfall', required: data.required, balance: data.balance, message };
  if (data.code === 'PREP_COIN_PRICE_CHANGED') return { kind: 'price', cost: data.cost, balance: data.balance, message: 'The price of this check changed. Check it and try again.' };
  if (data.code === 'JD_MATCH_DAILY_LIMIT') return { kind: 'limit', message };
  if (['JD_MATCH_JD_TOO_LONG', 'JD_MATCH_RESUME_TOO_LONG'].includes(data.code)) return { kind: 'tooLong', message, jdMaxChars: data.jdMaxChars ?? null };
  if (data.code === 'JD_MATCH_PAUSED') return { kind: 'paused', message };
  if (data.code === 'STUDENT_FEATURE_DISABLED' || status === 403) return { kind: 'disabled', message: 'ANVI JD Match is not turned on for your account. Ask your admin.' };
  return { kind: 'error', message };
}
