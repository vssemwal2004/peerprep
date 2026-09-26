import crypto from 'node:crypto';
import { getValkeyClient } from '../utils/valkey.js';

// Presence is best-effort telemetry, never the source of answers, deadlines or
// terminal state. A checkpoint expires before the 45s active-session lease.
const CHECKPOINT_SECONDS = 25;
function presenceKey(studentId, assessmentId, input) {
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify([
    input.submissionId, input.sessionId, input.attemptGeneration, input.status,
    input.violationScore, input.cameraFlags, input.pauseCount,
  ])).digest('hex');
  return `assessment:presence:v2:${studentId}:${assessmentId}:${fingerprint}`;
}
export async function readPresenceCheckpoint(studentId, assessmentId, input) {
  if (!input.sessionId || !input.attemptGeneration || input.networkPauseStartedAt) return null;
  const client = getValkeyClient();
  if (!client) return null;
  try {
    const raw = await client.sendCommand(['GET', presenceKey(studentId, assessmentId, input)]);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export async function writePresenceCheckpoint(studentId, assessmentId, input, response) {
  if (!input.sessionId || !input.attemptGeneration || input.networkPauseStartedAt || response.pauseStartedAt) return;
  const client = getValkeyClient();
  if (!client) return;
  try {
    await client.sendCommand(['SET', presenceKey(studentId, assessmentId, input), JSON.stringify(response), 'EX', String(CHECKPOINT_SECONDS)]);
  } catch { /* next heartbeat writes directly to MongoDB */ }
}
