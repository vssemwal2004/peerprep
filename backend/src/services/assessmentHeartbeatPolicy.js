// A client timestamp is evidence of a reconnect, never an authority to extend
// exam time. Automatic network credit is disabled unless explicitly enabled.
export function networkPauseCreditFields(assessment, now, requestedAt, {
  enabled = process.env.ASSESSMENT_NETWORK_PAUSE_CREDIT_ENABLED === 'true',
} = {}) {
  const requestedMs = requestedAt ? new Date(requestedAt).getTime() : NaN;
  const end = new Date(assessment.endTime);
  if (!enabled || assessment.manuallyCompletedAt || !Number.isFinite(requestedMs) || requestedMs > now.getTime()
    || !Number.isFinite(end.getTime()) || !Number.isFinite(Number(assessment.duration)) || Number(assessment.duration) <= 0) return {};
  const previous = { $convert: { input: '$securityHeartbeat.at', to: 'date', onError: null, onNull: null } };
  const started = { $convert: { input: '$startedAt', to: 'date', onError: null, onNull: null } };
  const paused = { $max: [0, { $ifNull: ['$pausedDurationMs', 0] }] };
  const allowedEnd = { $add: [
    { $min: [{ $add: [started, Number(assessment.duration) * 60000] }, end] },
    paused,
  ] };
  // 60s covers normal heartbeat jitter and the 25s persisted-checkpoint skip.
  // Existing security pauses also consume the conservative 10-minute ceiling.
  const credit = { $min: [
    300000,
    { $max: [0, { $subtract: [{ $subtract: [now, previous] }, 60000] }] },
    { $max: [0, { $subtract: [600000, paused] }] },
  ] };
  const eligible = { $and: [
    { $ne: [previous, null] },
    { $ne: [started, null] },
    { $eq: [{ $ifNull: ['$pauseStartedAt', null] }, null] },
    { $gt: [allowedEnd, now] },
    { $gt: [credit, 0] },
  ] };
  return {
    pausedDurationMs: { $cond: [eligible, { $add: [paused, credit] }, paused] },
    pauseCount: { $cond: [eligible, { $add: [{ $ifNull: ['$pauseCount', 0] }, 1] }, { $ifNull: ['$pauseCount', 0] }] },
    lastNetworkPauseAt: { $cond: [eligible, now, '$lastNetworkPauseAt'] },
    lastPauseAt: { $cond: [eligible, now, '$lastPauseAt'] },
    deadlineAt: { $cond: [eligible, { $add: [allowedEnd, credit] }, '$deadlineAt'] },
  };
}
