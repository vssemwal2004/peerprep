import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { HttpError } from '../utils/errors.js';
import { buildValkeyUrl, positiveInteger } from '../utils/valkey.js';
import { createQueueConnection } from '../queues/queueManager.js';

// Judge0 grades correctly only up to a measured number of parallel executions
// (16 on the i7-13700 node, Oct 2026 load test); above it, correct Java
// solutions start receiving TLE. Every submission to a node therefore holds a
// slot from a node-wide budget shared by all API and worker processes.

// Assessment runs and submits share one budget, but runs have a lower cap so a
// burst of runs already picked up by workers can never starve submits.
export const EXECUTION_CLASSES = Object.freeze(['critical', 'assessment', 'assessment-run', 'practice']);
const ASSESSMENT_GROUP = 'assessment';

const classStorage = new AsyncLocalStorage();

export function runWithExecutionClass(executionClass, work) {
  return classStorage.run(EXECUTION_CLASSES.includes(executionClass) ? executionClass : 'practice', work);
}

export function currentExecutionClass() {
  return classStorage.getStore() || 'practice';
}

// True inside a queue worker job (as opposed to an HTTP request calling Judge0 directly).
export function inExecutionJob() {
  return Boolean(classStorage.getStore());
}

export function executionClassForJob(jobName) {
  if (jobName === 'assessment-final-code-submit') return 'critical';
  if (jobName === 'assessment-code-run') return 'assessment-run';
  if (String(jobName || '').startsWith('assessment-')) return 'assessment';
  return 'practice';
}

// BullMQ: lower number wins; every assessment job gets one because jobs without a
// priority would otherwise jump ahead of all prioritized jobs.
export function queuePriorityForJob(jobName) {
  if (jobName === 'assessment-final-code-submit') return 1;
  if (jobName === 'assessment-code-submit') return 2;
  if (jobName === 'assessment-code-run') return 3;
  return undefined;
}

function gatewayConfig() {
  const maxInflight = positiveInteger(process.env.JUDGE0_MAX_INFLIGHT, 16);
  const assessmentMax = Math.min(maxInflight, positiveInteger(process.env.JUDGE0_GATEWAY_ASSESSMENT_MAX, Math.max(1, maxInflight - 2)));
  return {
    enabled: String(process.env.JUDGE0_GATEWAY_ENABLED || 'true').trim().toLowerCase() !== 'false',
    maxInflight,
    assessmentMax,
    classMax: {
      critical: maxInflight,
      assessment: assessmentMax,
      'assessment-run': Math.min(assessmentMax, positiveInteger(process.env.JUDGE0_GATEWAY_ASSESSMENT_RUN_MAX, Math.max(1, assessmentMax - 2))),
      practice: Math.min(maxInflight, positiveInteger(process.env.JUDGE0_GATEWAY_PRACTICE_MAX, 6)),
    },
    practiceMaxDuringAssessment: positiveInteger(process.env.JUDGE0_GATEWAY_PRACTICE_MAX_DURING_ASSESSMENT, 3),
    assessmentActiveMs: positiveInteger(process.env.JUDGE0_GATEWAY_ASSESSMENT_ACTIVE_MS, 60000),
    maxWaitMs: positiveInteger(process.env.JUDGE0_GATEWAY_MAX_WAIT_MS, 300000),
    circuitFailures: positiveInteger(process.env.JUDGE0_CIRCUIT_FAILURES, 5),
    circuitWindowMs: positiveInteger(process.env.JUDGE0_CIRCUIT_WINDOW_MS, 30000),
    circuitOpenMs: positiveInteger(process.env.JUDGE0_CIRCUIT_OPEN_MS, 15000),
  };
}

function nodeKey(target) {
  const hash = createHash('sha256').update(String(target)).digest('hex').slice(0, 16);
  const prefix = process.env.JUDGE0_GATEWAY_PREFIX || 'peerprep:judge0gw:v1';
  // The hash tag keeps every key of one node in one cluster slot for the Lua script.
  return { leases: `${prefix}:{${hash}}:leases`, active: `${prefix}:{${hash}}:assessment-active`, open: `${prefix}:{${hash}}:circuit-open`, failures: `${prefix}:{${hash}}:failures` };
}

// Returns 1 granted, 0 full, -1 circuit open. ARGV[10] is a group prefix ('' for
// none) whose members together may hold at most ARGV[11] slots.
const ACQUIRE_SCRIPT = `
if redis.call('EXISTS', KEYS[3]) == 1 then return -1 end
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
local members = redis.call('ZRANGE', KEYS[1], 0, -1)
if #members >= tonumber(ARGV[5]) then return 0 end
local prefix = ARGV[4] .. '|'
local group = ARGV[10]
local mine = 0
local grouped = 0
for _, member in ipairs(members) do
  if string.sub(member, 1, #prefix) == prefix then mine = mine + 1 end
  if group ~= '' and string.sub(member, 1, #group) == group then grouped = grouped + 1 end
end
local classMax = tonumber(ARGV[6])
if ARGV[4] == 'practice' and redis.call('EXISTS', KEYS[2]) == 1 then
  classMax = math.min(classMax, tonumber(ARGV[7]))
end
if mine >= classMax then return 0 end
if group ~= '' and grouped >= tonumber(ARGV[11]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[3], ARGV[2])
redis.call('PEXPIRE', KEYS[1], ARGV[9])
if ARGV[4] ~= 'practice' then redis.call('SET', KEYS[2], '1', 'PX', ARGV[8]) end
return 1
`;

let client = null;
let clientReady = null;
let idleTimer = null;
const CLIENT_IDLE_MS = 5000;

function gatewayClient() {
  if (!buildValkeyUrl('queue')) return null;
  if (!client) {
    client = createQueueConnection();
    clientReady = client.connect().catch(() => null);
  }
  return client;
}

// An open connection would keep scripts and test processes alive after their last
// execution, so an idle gateway disconnects and reconnects on next use.
function touchClient() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const idle = client;
    client = null;
    clientReady = null;
    idle?.disconnect();
  }, CLIENT_IDLE_MS);
  idleTimer.unref?.();
}

async function readyClient() {
  const redis = gatewayClient();
  if (!redis) return null;
  touchClient();
  await clientReady;
  return redis.status === 'ready' ? redis : null;
}

// In-process fallback for deployments without a queue store (and for Valkey
// outages): same limits, enforced per process instead of per node.
const local = new Map();

function localNode(target) {
  if (!local.has(target)) local.set(target, { leases: new Map(), assessmentActiveUntil: 0, openUntil: 0, failures: [] });
  return local.get(target);
}

function groupOf(executionClass) {
  return executionClass.startsWith(ASSESSMENT_GROUP) ? ASSESSMENT_GROUP : '';
}

function localAcquire(target, executionClass, member, expiresAt, config, now) {
  const node = localNode(target);
  if (node.openUntil > now) return -1;
  for (const [key, lease] of node.leases) if (lease.expiresAt <= now) node.leases.delete(key);
  if (node.leases.size >= config.maxInflight) return 0;
  let classMax = config.classMax[executionClass];
  if (executionClass === 'practice' && node.assessmentActiveUntil > now) classMax = Math.min(classMax, config.practiceMaxDuringAssessment);
  const leases = [...node.leases.values()];
  if (leases.filter((lease) => lease.executionClass === executionClass).length >= classMax) return 0;
  const group = groupOf(executionClass);
  if (group && leases.filter((lease) => lease.executionClass.startsWith(group)).length >= config.assessmentMax) return 0;
  node.leases.set(member, { executionClass, expiresAt });
  if (executionClass !== 'practice') node.assessmentActiveUntil = now + config.assessmentActiveMs;
  return 1;
}

async function tryAcquire(target, executionClass, member, ttlMs, config) {
  const now = Date.now();
  const expiresAt = now + ttlMs;
  const redis = await readyClient().catch(() => null);
  if (redis) {
    try {
      const keys = nodeKey(target);
      const granted = await redis.eval(ACQUIRE_SCRIPT, 3, keys.leases, keys.active, keys.open,
        now, member, expiresAt, executionClass, config.maxInflight, config.classMax[executionClass],
        config.practiceMaxDuringAssessment, config.assessmentActiveMs, ttlMs + 60000,
        groupOf(executionClass), config.assessmentMax);
      return { granted: Number(granted), store: 'valkey' };
    } catch { /* fall through to the per-process budget */ }
  }
  return { granted: localAcquire(target, executionClass, member, expiresAt, config, now), store: 'local' };
}

async function releaseMember(target, member, store) {
  if (store === 'local') {
    localNode(target).leases.delete(member);
    return;
  }
  const redis = await readyClient().catch(() => null);
  // If Valkey is unreachable the lease simply expires at its TTL.
  if (redis) await redis.zrem(nodeKey(target).leases, member).catch(() => {});
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits for a slot on `target`. The returned lease must be released once Judge0
 * has answered; a lease whose request timed out is left to expire at `ttlMs`,
 * because Judge0 keeps executing that submission.
 */
export async function acquireJudge0Slot(target, { ttlMs, executionClass = currentExecutionClass() } = {}) {
  const config = gatewayConfig();
  if (!config.enabled) return null;
  const member = `${executionClass}|${randomUUID()}`;
  const leaseTtl = Math.max(1000, Number(ttlMs) || 60000);
  const startedAt = Date.now();
  let delay = 25;
  for (;;) {
    const { granted, store } = await tryAcquire(target, executionClass, member, leaseTtl, config);
    if (granted === 1) {
      let settled = false;
      return {
        executionClass,
        waitedMs: Date.now() - startedAt,
        async release() {
          if (settled) return;
          settled = true;
          await releaseMember(target, member, store);
        },
        abandon() { settled = true; },
      };
    }
    if (Date.now() - startedAt >= config.maxWaitMs) {
      const error = new HttpError(503, granted === -1
        ? 'Code execution is temporarily unavailable. Your code is saved; please retry shortly.'
        : 'Code execution is busy. Your code is saved; please retry shortly.');
      error.code = granted === -1 ? 'JUDGE0_CIRCUIT_OPEN' : 'JUDGE0_GATEWAY_TIMEOUT';
      throw error;
    }
    await sleep(granted === -1 ? 500 : delay + Math.floor(Math.random() * delay));
    delay = Math.min(250, delay * 2);
  }
}

export async function recordJudge0Outcome(target, ok) {
  const config = gatewayConfig();
  if (!config.enabled) return;
  const now = Date.now();
  const redis = await readyClient().catch(() => null);
  if (redis) {
    const keys = nodeKey(target);
    try {
      if (ok) { await redis.del(keys.failures); return; }
      const failures = await redis.incr(keys.failures);
      if (failures === 1) await redis.pexpire(keys.failures, config.circuitWindowMs);
      if (failures >= config.circuitFailures) {
        await redis.set(keys.open, '1', 'PX', config.circuitOpenMs);
        await redis.del(keys.failures);
        console.warn(`[Judge0Gateway] Circuit opened for ${config.circuitOpenMs}ms after ${failures} failures.`);
      }
      return;
    } catch { /* fall through */ }
  }
  const node = localNode(target);
  if (ok) { node.failures = []; return; }
  node.failures = node.failures.filter((at) => at > now - config.circuitWindowMs);
  node.failures.push(now);
  if (node.failures.length >= config.circuitFailures) {
    node.openUntil = now + config.circuitOpenMs;
    node.failures = [];
  }
}

export async function getJudge0GatewaySnapshot(targets = []) {
  const config = gatewayConfig();
  const now = Date.now();
  const redis = await readyClient().catch(() => null);
  const nodes = await Promise.all(targets.map(async (target) => {
    const counts = { critical: 0, assessment: 0, 'assessment-run': 0, practice: 0 };
    let circuitOpen = false;
    let store = 'local';
    if (redis) {
      try {
        const keys = nodeKey(target);
        const members = await redis.zrangebyscore(keys.leases, now, '+inf');
        members.forEach((member) => { const cls = member.split('|')[0]; if (cls in counts) counts[cls] += 1; });
        circuitOpen = (await redis.exists(keys.open)) === 1;
        store = 'valkey';
      } catch { /* report the local view */ }
    }
    if (store === 'local') {
      const node = localNode(target);
      for (const lease of node.leases.values()) if (lease.expiresAt > now) counts[lease.executionClass] += 1;
      circuitOpen = node.openUntil > now;
    }
    const inflight = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return { inflight, byClass: counts, circuitOpen, store };
  }));
  return { enabled: config.enabled, maxInflight: config.maxInflight, classMax: config.classMax, nodes };
}

export async function closeJudge0Gateway() {
  const current = client;
  clearTimeout(idleTimer);
  client = null;
  clientReady = null;
  local.clear();
  if (current) current.disconnect();
}
