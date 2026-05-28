// AI Proctoring placeholder - implementation will be added in later steps.
export const DEFAULT_VIOLATION_COOLDOWN_SEC = 20;

export function getCooldownMs(settings = {}) {
  const cooldownSec = Number(settings.violationCooldownSec);
  if (!Number.isFinite(cooldownSec)) return DEFAULT_VIOLATION_COOLDOWN_SEC * 1000;
  return Math.max(5, Math.min(120, cooldownSec)) * 1000;
}

export function isCooldownComplete(lastConfirmedAt, now = Date.now(), cooldownMs = DEFAULT_VIOLATION_COOLDOWN_SEC * 1000) {
  if (!lastConfirmedAt) return true;
  return now - lastConfirmedAt >= cooldownMs;
}

export function getCooldownUntil(lastConfirmedAt, cooldownMs = DEFAULT_VIOLATION_COOLDOWN_SEC * 1000) {
  if (!lastConfirmedAt) return null;
  return Number(lastConfirmedAt) + Number(cooldownMs || 0);
}
