export function normalizeEmailAddress(value) {
  if (value === undefined || value === null) return value;
  return String(value).trim().toLowerCase();
}

export function exactEmailPattern(value) {
  const normalized = normalizeEmailAddress(value) || '';
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
}
