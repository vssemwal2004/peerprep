// AI Proctoring placeholder - implementation will be added in later steps.
import { getCooldownMs, getCooldownUntil, isCooldownComplete } from '../rules/cooldownRules';

export class ViolationBuffer {
  constructor(options = {}) {
    this.cooldownMs = Number.isFinite(Number(options.cooldownMs))
      ? Number(options.cooldownMs)
      : getCooldownMs({ violationCooldownSec: options.violationCooldownSec });
    this.events = new Map();
    this.lastConfirmedAt = new Map();
  }

  record(type, options = {}) {
    if (!type) return null;

    const now = Number(options.timestamp) || Date.now();
    const confirmAfterMs = Math.max(0, Number(options.confirmAfterMs || 0));
    const confirmCount = Math.max(1, Number(options.confirmCount || 1));
    const repeatCount = Number.isFinite(Number(options.repeatCount)) ? Math.max(1, Number(options.repeatCount)) : null;
    const repeatWindowMs = Number.isFinite(Number(options.repeatWindowMs)) ? Math.max(0, Number(options.repeatWindowMs)) : 0;
    const confirmStrategy = options.confirmStrategy === 'any' ? 'any' : 'all';
    const state = this.getOrCreateState(type, now);

    if (!state.firstSeenAt) state.firstSeenAt = now;
    state.lastSeenAt = now;
    state.count += 1;
    state.consecutiveCount += 1;
    state.activeDuration = Math.max(0, state.lastSeenAt - state.firstSeenAt);

    if (repeatCount) {
      if (!state.windowStartedAt || now - state.windowStartedAt > repeatWindowMs) {
        state.windowStartedAt = now;
        state.windowCount = 0;
      }
      state.windowCount += 1;
    }

    this.events.set(type, state);

    const lastConfirmed = this.lastConfirmedAt.get(type);
    const countReady = state.consecutiveCount >= confirmCount;
    const durationReady = state.activeDuration >= confirmAfterMs;
    const repeatReady = repeatCount ? state.windowCount >= repeatCount : false;
    const strategyReady = confirmStrategy === 'any'
      ? durationReady || countReady || repeatReady
      : durationReady && countReady;

    state.cooldownUntil = getCooldownUntil(lastConfirmed, this.cooldownMs);

    if (!strategyReady || !isCooldownComplete(lastConfirmed, now, this.cooldownMs)) {
      return null;
    }

    this.lastConfirmedAt.set(type, now);
    state.cooldownUntil = getCooldownUntil(now, this.cooldownMs);
    return {
      type,
      firstSeenAt: state.firstSeenAt,
      lastSeenAt: state.lastSeenAt,
      count: state.count,
      consecutiveCount: state.consecutiveCount,
      durationMs: state.activeDuration,
      cooldownUntil: state.cooldownUntil,
      confirmedBy: getConfirmationReasons({ durationReady, countReady, repeatReady }),
    };
  }

  confirmNow(type, timestamp = Date.now()) {
    return this.record(type, {
      timestamp,
      confirmAfterMs: 0,
      confirmCount: 1,
    });
  }

  reset(type) {
    if (!type) return;
    this.events.delete(type);
  }

  recordInactive(type) {
    const state = this.events.get(type);
    if (!state) return;

    state.firstSeenAt = null;
    state.consecutiveCount = 0;
    state.activeDuration = 0;
    this.events.set(type, state);
  }

  resetExcept(activeTypes = [], options = {}) {
    const active = new Set(activeTypes);
    const preserve = new Set(options.preserveTypes || []);
    for (const type of this.events.keys()) {
      if (active.has(type)) continue;
      if (preserve.has(type)) this.recordInactive(type);
      else this.reset(type);
    }
  }

  getState(type) {
    return type ? this.events.get(type) || null : null;
  }

  isCoolingDown(type, timestamp = Date.now()) {
    const lastConfirmed = this.lastConfirmedAt.get(type);
    return !isCooldownComplete(lastConfirmed, timestamp, this.cooldownMs);
  }

  clear() {
    this.events.clear();
    this.lastConfirmedAt.clear();
  }

  getOrCreateState(type, timestamp = Date.now()) {
    return this.events.get(type) || {
      type,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      count: 0,
      consecutiveCount: 0,
      activeDuration: 0,
      cooldownUntil: null,
      windowStartedAt: null,
      windowCount: 0,
    };
  }
}

export const createViolationBuffer = (options) => new ViolationBuffer(options);

function getConfirmationReasons({ durationReady, countReady, repeatReady }) {
  return [
    durationReady ? 'duration' : null,
    countReady ? 'consecutive_count' : null,
    repeatReady ? 'repeat_window' : null,
  ].filter(Boolean);
}
