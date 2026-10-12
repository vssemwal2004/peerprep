const SUFFIXES = /\b(inc|incorporated|ltd|limited|pvt|private|llc|llp|plc|corp|corporation|co|company|gmbh|technologies|technology)\b/g;

/** Lowercase, punctuation-free company name without corporate suffixes ("Amazon.com, Inc." -> "amazon com"). */
export function normalizeCompany(name) {
  return String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ')
    .replace(SUFFIXES, ' ').replace(/\s+/g, ' ').trim();
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return a.length || b.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

/** 0..1 similarity of two company names after normalization (spaces ignored). */
export function companySimilarity(a, b) {
  const left = normalizeCompany(a).replace(/\s/g, ''), right = normalizeCompany(b).replace(/\s/g, '');
  if (!left || !right) return 0;
  return 1 - levenshtein(left, right) / Math.max(left.length, right.length);
}

/** Closest catalog name to a typed value, or null when nothing reaches minRatio or the value is already listed. */
export function closestCompany(value, catalog = [], minRatio = 0.75) {
  const typed = String(value || '').trim();
  if (typed.length < 2 || catalog.some((name) => name.toLowerCase() === typed.toLowerCase())) return null;
  let best = null, bestScore = minRatio;
  for (const name of catalog) {
    const score = companySimilarity(typed, name);
    if (score >= bestScore && (!best || score > bestScore)) { best = name; bestScore = score; }
  }
  return best;
}

/** Every option A–Z when nothing is typed; otherwise case-insensitive prefix matches first, then substring matches. */
export function filterOptions(options = [], query = '', limit = Infinity) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return [...options].sort((a, b) => a.localeCompare(b)).slice(0, limit);
  const prefix = [], contains = [];
  for (const option of options) {
    const lower = option.toLowerCase();
    if (lower.startsWith(needle)) prefix.push(option);
    else if (lower.includes(needle)) contains.push(option);
  }
  return [...prefix, ...contains].slice(0, limit);
}

/** Verified interview companies first, then curated tags; deduped case-insensitively. */
export function mergeCompanyTags(verified = [], tags = []) {
  const seen = new Set(), rows = [];
  const add = (name, voters) => {
    const clean = String(name || '').trim(), key = clean.toLowerCase();
    if (!clean || seen.has(key)) return;
    seen.add(key); rows.push({ name: clean, voters, verified: voters > 0 });
  };
  (Array.isArray(verified) ? verified : []).forEach((item) => add(item?.company, Math.max(1, Number(item?.voters) || 0)));
  (Array.isArray(tags) ? tags : []).forEach((tag) => add(tag, 0));
  return rows;
}
