import { randomUUID, createHash } from 'node:crypto';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { buildValkeyUrl, positiveInteger, withDeadline } from '../utils/valkey.js';

export const QUEUE_NAMES = Object.freeze({ compiler: 'compiler', submission: 'submission', assessment: 'assessment' });
export const DEFAULT_ATTEMPTS = positiveInteger(process.env.EXECUTION_JOB_MAX_ATTEMPTS, 3);
export const DEFAULT_BACKOFF_MS = positiveInteger(process.env.EXECUTION_JOB_BACKOFF_MS, 2000);
const queues = new Map();
let legacyCheck = null;

export function queuePrefix() { return process.env.BULLMQ_QUEUE_PREFIX || 'peerprep:bullmq:v1'; }
export function internalJobId(externalId) {
  return `job-${createHash('sha256').update(String(externalId)).digest('hex')}`;
}

export function supportsQueueServer(info) {
  const version = /(?:redis_version|valkey_version):([^\r\n]+)/.exec(String(info))?.[1];
  const [major = 0, minor = 0] = String(version || '').split('.').map(Number);
  return major > 6 || (major === 6 && minor >= 2);
}

export async function assertQueueServer(client) {
  if (!supportsQueueServer(await withDeadline(client.info('server'), 2000, 'Queue version'))) {
    throw new Error('Execution queues require Redis 6.2+ or a compatible Valkey server');
  }
}

export function createQueueConnection({ worker = false, url = buildValkeyUrl('queue') } = {}) {
  if (!url) throw new Error('QUEUE_VALKEY_URL (or legacy REDIS/VALKEY config) is required for execution queues');
  const client = new IORedis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: worker ? null : 1,
    enableOfflineQueue: worker,
    connectTimeout: positiveInteger(process.env.QUEUE_CONNECT_TIMEOUT_MS, 2000),
    ...(worker ? {} : { commandTimeout: positiveInteger(process.env.QUEUE_COMMAND_TIMEOUT_MS, 2000) }),
    retryStrategy: (attempt) => Math.min(100 * attempt, 2000),
  });
  client.on('error', () => {});
  return client;
}

export async function getLegacyQueueCounts(client) {
  const prefix = process.env.EXECUTION_QUEUE_PREFIX || 'peerprep:execution';
  const counts = {};
  for (const name of Object.values(QUEUE_NAMES)) {
    const [waiting, processing, delayed] = await Promise.all([
      client.llen(`${prefix}:queue:${name}:waiting`),
      client.llen(`${prefix}:queue:${name}:processing`),
      client.zcard(`${prefix}:queue:${name}:delayed`),
    ]);
    counts[name] = { waiting, processing, delayed };
  }
  return counts;
}

export function hasLegacyJobs(counts) {
  return Object.values(counts).some((count) => Object.values(count).some((value) => Number(value) > 0));
}

export async function assertLegacyQueuesDrained() {
  if (!legacyCheck) {
    legacyCheck = (async () => {
      const client = createQueueConnection({ url: process.env.LEGACY_QUEUE_URL || buildValkeyUrl('queue') });
      try {
        await withDeadline(client.connect(), 2000, 'Legacy queue connection');
        const counts = await getLegacyQueueCounts(client);
        if (hasLegacyJobs(counts)) {
          const error = new Error('Legacy execution jobs remain. Drain old workers before BullMQ; run npm run queues:legacy-status.');
          error.code = 'LEGACY_QUEUE_NOT_DRAINED';
          throw error;
        }
      } finally { client.disconnect(); }
    })().catch((error) => { legacyCheck = null; throw error; });
  }
  return withDeadline(legacyCheck, positiveInteger(process.env.QUEUE_COMMAND_TIMEOUT_MS, 2000), 'Legacy queue check');
}

async function getQueue(name) {
  if (!queues.has(name)) {
    const entry = (async () => {
      await assertLegacyQueuesDrained();
      const connection = createQueueConnection();
      try {
        await withDeadline(connection.connect(), positiveInteger(process.env.QUEUE_CONNECT_TIMEOUT_MS, 2000), 'Queue connection');
        await assertQueueServer(connection);
        const queue = new Queue(name, { connection, prefix: queuePrefix() });
        queue.on('error', () => {});
        return { queue, connection };
      } catch (error) { connection.disconnect(); throw error; }
    })().catch((error) => { queues.delete(name); throw error; });
    queues.set(name, entry);
  }
  return queues.get(name);
}

function createQueue(name) {
  return {
    name,
    async add(jobName, payload, options = {}) {
      const externalId = String(options.jobId || randomUUID());
      const { queue } = await getQueue(name);
      const result = await withDeadline(queue.add(jobName, { externalId, payload }, {
        jobId: internalJobId(externalId),
        attempts: positiveInteger(options.attempts, DEFAULT_ATTEMPTS),
        backoff: { type: 'exponential', delay: positiveInteger(options.backoffMs, DEFAULT_BACKOFF_MS) },
        removeOnComplete: { age: positiveInteger(process.env.QUEUE_COMPLETED_RETENTION_SECONDS, 604800), count: 100000 },
        removeOnFail: { age: positiveInteger(process.env.QUEUE_FAILED_RETENTION_SECONDS, 2592000), count: 100000 },
      }), positiveInteger(process.env.QUEUE_COMMAND_TIMEOUT_MS, 2000), 'Queue publish');
      if (options.retryFailed === true && await result.getState() === 'failed') {
        const maximumExecutions = positiveInteger(options.attempts, DEFAULT_ATTEMPTS) + positiveInteger(options.recoveryLimit, 3);
        const current = await queue.getJob(internalJobId(externalId));
        if (Math.max(current?.attemptsMade || 0, current?.attemptsStarted || 0) >= maximumExecutions) {
          const error = new Error('Queue recovery exhausted; manual evaluation review required');
          error.code = 'QUEUE_RECOVERY_EXHAUSTED';
          throw error;
        }
        try {
          await withDeadline(result.retry('failed'), positiveInteger(process.env.QUEUE_COMMAND_TIMEOUT_MS, 2000), 'Queue retry');
        } catch (error) {
          // Another dispatcher may already have retried the same job.
          if (await result.getState() === 'failed') throw error;
        }
      }
      return { id: externalId, name: jobName, data: payload, queueName: name };
    },
  };
}

export async function getQueueHealth() {
  if (!buildValkeyUrl('queue')) return { configured: false, ready: false };
  const client = createQueueConnection();
  try {
    await assertLegacyQueuesDrained();
    const ready = await withDeadline((async () => {
      await client.connect();
      return await client.ping() === 'PONG' && supportsQueueServer(await client.info('server'));
    })(), 1000, 'Queue health');
    return { configured: true, ready };
  } catch { return { configured: true, ready: false }; }
  finally { client.disconnect(); }
}

export async function closeQueues() {
  const pending = [...queues.values()];
  queues.clear();
  legacyCheck = null;
  await Promise.all(pending.map(async (entry) => {
    const value = await entry.catch(() => null);
    if (!value) return;
    await withDeadline(value.queue.close(), 2000, 'Queue close').catch(() => {});
    value.connection.disconnect();
  }));
}

export const closeQueueConnections = closeQueues;

export const compilerQueue = createQueue(QUEUE_NAMES.compiler);
export const submissionQueue = createQueue(QUEUE_NAMES.submission);
export const assessmentQueue = createQueue(QUEUE_NAMES.assessment);
