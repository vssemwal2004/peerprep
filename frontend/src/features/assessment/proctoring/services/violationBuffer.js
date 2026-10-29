import { getCooldownMs } from '../rules/cooldownRules';

export const DEFAULT_REPEAT_AFTER_MS = 60000;
// A pending episode whose last positive sample is older than this restarts
// instead of resuming (detection stalled, camera outage, paused tab).
const STALE_PENDING_MS = 10000;

function toTimestamp(value) {
  const next = typeof value === 'number' ? value : Number(value ?? NaN);
  return Number.isFinite(next) ? next : Date.now();
}

export const VIOLATION_PHASES = Object.freeze({
  IDLE: 'idle',
  PENDING: 'pending',
  ACTIVE: 'active',
});

// One episode state machine per event type: idle -> pending -> active -> idle.
// observe() must be called only with fresh samples of the rule's source.
// - pending -> active once confirmCount positives span >= confirmAfterMs. A run
//   of misses is tolerated while it spans less than gapToleranceMs (so a single
//   missed frame never resets when gapToleranceMs > 0; 0 = any miss resets).
// - active -> idle after clearCount consecutive misses spanning >= clearAfterMs.
// - One emission per episode. A continuous episode re-emits every repeatAfterMs
//   (>= cooldown); re-entering within cooldownMs of the end is the same episode.
export class ViolationBuffer {
  constructor(options = {}) {
    this.cooldownMs = Number.isFinite(Number(options.cooldownMs)) && options.cooldownMs !== null
      ? Number(options.cooldownMs)
      : getCooldownMs({ violationCooldownSec: options.violationCooldownSec });
    const repeatAfterMs = Number(options.repeatAfterMs);
    this.repeatAfterMs = Math.max(
      Number.isFinite(repeatAfterMs) && repeatAfterMs > 0 ? repeatAfterMs : DEFAULT_REPEAT_AFTER_MS,
      this.cooldownMs,
    );
    this.states = new Map();
  }

  observe(type, present, timestamp = Date.now(), rule = {}) {
    if (!type) return null;
    const now = toTimestamp(timestamp);
    const state = this.getOrCreateState(type);

    if (present) return this.observePresent(state, now, rule);

    if (state.phase === VIOLATION_PHASES.PENDING) {
      const gapToleranceMs = Math.max(0, Number(rule.gapToleranceMs || 0));
      if (state.missSince === null) state.missSince = now;
      if (gapToleranceMs <= 0 || now - state.missSince >= gapToleranceMs) this.toIdle(state, null);
    } else if (state.phase === VIOLATION_PHASES.ACTIVE) {
      const clearCount = Math.max(1, Number(rule.clearCount || 1));
      const clearAfterMs = Math.max(0, Number(rule.clearAfterMs || 0));
      state.misses += 1;
      if (state.missSince === null) state.missSince = now;
      if (state.misses >= clearCount && now - state.missSince >= clearAfterMs) this.toIdle(state, now);
    }
    return null;
  }

  observePresent(state, now, rule = {}) {
    const confirmCount = Math.max(1, Number(rule.confirmCount || 1));
    const confirmAfterMs = Math.max(0, Number(rule.confirmAfterMs || 0));
    state.misses = 0;
    state.missSince = null;

    const stale = state.phase === VIOLATION_PHASES.PENDING
      && state.lastSeenAt !== null
      && now - state.lastSeenAt > STALE_PENDING_MS;
    if (state.phase === VIOLATION_PHASES.IDLE || stale) {
      state.phase = VIOLATION_PHASES.PENDING;
      state.firstSeenAt = now;
      state.hits = 0;
    }
    state.hits += 1;
    state.lastSeenAt = now;

    if (state.phase === VIOLATION_PHASES.PENDING) {
      const countReady = state.hits >= confirmCount;
      const durationReady = now - state.firstSeenAt >= confirmAfterMs;
      if (!countReady || !durationReady) return null;

      state.phase = VIOLATION_PHASES.ACTIVE;
      state.repeatAnchorAt = now;
      const reentry = state.endedAt !== null && now - state.endedAt < this.cooldownMs;
      if (reentry) return null;
      return this.emit(state, now, 'episode_start');
    }

    if (now - state.repeatAnchorAt >= this.repeatAfterMs) return this.emit(state, now, 'still_present');
    return null;
  }

  // Immediate confirmation (camera blocked); latched like any other episode.
  confirmNow(type, timestamp = Date.now()) {
    return this.observe(type, true, timestamp, { confirmCount: 1, confirmAfterMs: 0 });
  }

  emit(state, now, reason) {
    state.lastEmitAt = now;
    state.repeatAnchorAt = now;
    state.emitCount += 1;
    return {
      type: state.type,
      reason,
      firstSeenAt: state.firstSeenAt,
      lastSeenAt: state.lastSeenAt,
      count: state.hits,
      consecutiveCount: state.hits,
      durationMs: Math.max(0, now - state.firstSeenAt),
      cooldownUntil: now + this.cooldownMs,
      confirmedBy: reason === 'episode_start' ? ['duration', 'consecutive_count'] : ['still_present'],
    };
  }

  toIdle(state, endedAt) {
    state.phase = VIOLATION_PHASES.IDLE;
    state.hits = 0;
    state.misses = 0;
    state.missSince = null;
    state.firstSeenAt = null;
    state.repeatAnchorAt = null;
    if (endedAt !== null) state.endedAt = endedAt;
  }

  // Ends every episode without emitting (camera outage): pending ones are
  // dropped, active ones end now so a quick return stays the same episode.
  suspend(timestamp = Date.now(), options = {}) {
    const keep = new Set(options.exceptTypes || []);
    for (const state of this.states.values()) {
      if (keep.has(state.type)) continue;
      if (state.phase === VIOLATION_PHASES.ACTIVE) this.toIdle(state, toTimestamp(timestamp));
      else if (state.phase === VIOLATION_PHASES.PENDING) this.toIdle(state, null);
    }
  }

  getPhase(type) {
    return this.states.get(type)?.phase || VIOLATION_PHASES.IDLE;
  }

  isActive(type) {
    return this.getPhase(type) === VIOLATION_PHASES.ACTIVE;
  }

  isPending(type) {
    return this.getPhase(type) === VIOLATION_PHASES.PENDING;
  }

  getState(type) {
    return type ? this.states.get(type) || null : null;
  }

  isCoolingDown(type, timestamp = Date.now()) {
    const lastEmitAt = this.states.get(type)?.lastEmitAt;
    return Boolean(lastEmitAt) && timestamp - lastEmitAt < this.cooldownMs;
  }

  reset(type) {
    if (!type) return;
    this.states.delete(type);
  }

  clear() {
    this.states.clear();
  }

  getOrCreateState(type) {
    let state = this.states.get(type);
    if (!state) {
      state = {
        type,
        phase: VIOLATION_PHASES.IDLE,
        firstSeenAt: null,
        lastSeenAt: null,
        hits: 0,
        misses: 0,
        missSince: null,
        repeatAnchorAt: null,
        lastEmitAt: null,
        endedAt: null,
        emitCount: 0,
      };
      this.states.set(type, state);
    }
    return state;
  }
}
