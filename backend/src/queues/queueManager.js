import { randomUUID } from 'crypto';
import { createValkeyBaseClient, isValkeyEnabled } from '../utils/valkey.js';

const QUEUE_PREFIX = process.env.EXECUTION_QUEUE_PREFIX || 'peerprep:execution';
const DEFAULT_ATTEMPTS = Number(process.env.EXECUTION_JOB_MAX_ATTEMPTS || 3);
const DEFAULT_BACKOFF_MS = Number(process.env.EXECUTION_JOB_BACKOFF_MS || 2000);

const QUEUE_NAMES = {
  compiler: 'compiler',
  submission: 'submission',
  assessment: 'assessment',
};

let commandClientPromise = null;
let blockingMoveCommand = null;
let loggedBlockingMoveFallback = false;

function flattenHash(fields) {
  return Object.entries(fields || {}).flatMap(([field, value]) => [String(field), String(value)]);
}

function hmsetCommand(key, fields) {
  return ['HMSET', key, ...flattenHash(fields)];
}

function queueKey(queueName, suffix) {
  return `${QUEUE_PREFIX}:queue:${queueName}:${suffix}`;
}

function jobKey(jobId) {
  return `${QUEUE_PREFIX}:job:${jobId}`;
}

function delayedKey(queueName) {
  return `${QUEUE_PREFIX}:queue:${queueName}:delayed`;
}

async function getCommandClient() {
  if (!isValkeyEnabled()) {
    throw new Error('Valkey is required for the execution queue, but no REDIS/VALKEY env was configured.');
  }

  if (!commandClientPromise) {
    const client = createValkeyBaseClient();
    client.on('error', (error) => {
      console.warn(`[QueueManager] Valkey command client error: ${error.message}`);
    });
    commandClientPromise = client.connect().then(() => client).catch((error) => {
      commandClientPromise = null;
      throw error;
    });
  }

  return commandClientPromise;
}

function createQueue(queueName) {
  const waitingListKey = queueKey(queueName, 'waiting');

  return {
    name: queueName,
    async add(jobName, payload, options = {}) {
      const client = await getCommandClient();
      const jobId = String(options.jobId || randomUUID());
      const attempts = Math.max(1, Number(options.attempts || DEFAULT_ATTEMPTS));
      const backoffMs = Math.max(0, Number(options.backoffMs || DEFAULT_BACKOFF_MS));
      const now = Date.now();

      const jobRecord = {
        id: jobId,
        name: jobName,
        queueName,
        payload: JSON.stringify(payload || {}),
        attemptsMade: '0',
        maxAttempts: String(attempts),
        backoffMs: String(backoffMs),
        status: 'queued',
        createdAt: String(now),
        updatedAt: String(now),
      };

      await client.multi()
        // Redis 3.x does NOT support multi-field HSET; use HMSET for compatibility.
        .addCommand(hmsetCommand(jobKey(jobId), jobRecord))
        .rPush(waitingListKey, jobId)
        .exec();

      return {
        id: jobId,
        name: jobName,
        data: payload,
        queueName,
      };
    },
  };
}

async function createBlockingClient(label) {
  const client = createValkeyBaseClient();
  if (!client) {
    throw new Error('Valkey is required for queue workers.');
  }

  client.on('error', (error) => {
    console.warn(`[QueueManager] ${label} error: ${error.message}`);
  });
  await client.connect();
  return client;
}

async function loadJobRecord(client, jobId) {
  const record = await client.hGetAll(jobKey(jobId));
  if (!record || !record.id) {
    return null;
  }

  let payload = {};
  try {
    payload = record.payload ? JSON.parse(record.payload) : {};
  } catch {
    payload = {};
  }

  return {
    id: record.id,
    name: record.name,
    queueName: record.queueName,
    data: payload,
    attemptsMade: Number(record.attemptsMade || 0),
    maxAttempts: Number(record.maxAttempts || DEFAULT_ATTEMPTS),
    backoffMs: Number(record.backoffMs || DEFAULT_BACKOFF_MS),
    status: record.status || 'queued',
  };
}

export async function fetchNextQueueJob(queueName, blockingClient, commandClient) {
  const waitingKey = queueKey(queueName, 'waiting');
  const processingKey = queueKey(queueName, 'processing');

  const moveWithBlmove = () => blockingClient.sendCommand([
    'BLMOVE',
    waitingKey,
    processingKey,
    'RIGHT',
    'LEFT',
    '0',
  ]);

  const moveWithBrpoplpush = () => blockingClient.sendCommand([
    'BRPOPLPUSH',
    waitingKey,
    processingKey,
    '0',
  ]);

  let response;
  if (blockingMoveCommand === 'BRPOPLPUSH') {
    response = await moveWithBrpoplpush();
  } else if (blockingMoveCommand === 'BLMOVE') {
    response = await moveWithBlmove();
  } else {
    try {
      response = await moveWithBlmove();
      blockingMoveCommand = 'BLMOVE';
    } catch (error) {
      const message = String(error?.message || '');
      const lower = message.toLowerCase();
      const isUnknownBlmove = lower.includes('unknown command') && lower.includes('blmove');
      if (!isUnknownBlmove) {
        throw error;
      }

      blockingMoveCommand = 'BRPOPLPUSH';
      if (!loggedBlockingMoveFallback) {
        console.warn('[QueueManager] Redis/Valkey does not support BLMOVE; falling back to BRPOPLPUSH. (Upgrade Redis to 6.2+ to enable BLMOVE.)');
        loggedBlockingMoveFallback = true;
      }
      response = await moveWithBrpoplpush();
    }
  }

  if (!response) {
    return null;
  }

  const job = await loadJobRecord(commandClient, response);
  if (!job) {
    await commandClient.lRem(processingKey, 0, response);
    return null;
  }

  await commandClient.sendCommand(hmsetCommand(jobKey(job.id), {
    status: 'processing',
    updatedAt: String(Date.now()),
  }));

  return job;
}

export async function completeQueueJob(queueName, commandClient, jobId) {
  const processingKey = queueKey(queueName, 'processing');
  await commandClient.multi()
    .lRem(processingKey, 0, jobId)
    .del(jobKey(jobId))
    .exec();
}

export async function retryQueueJob(queueName, commandClient, job, errorMessage = '') {
  const processingKey = queueKey(queueName, 'processing');
  const waitingKey = queueKey(queueName, 'waiting');
  const nextAttemptsMade = job.attemptsMade + 1;
  const nextBackoffMs = Math.max(250, job.backoffMs * nextAttemptsMade);
  const nextAvailableAt = Date.now() + nextBackoffMs;

  const multi = commandClient.multi()
    .lRem(processingKey, 0, job.id)
    .addCommand(hmsetCommand(jobKey(job.id), {
      attemptsMade: String(nextAttemptsMade),
      status: 'queued',
      lastError: String(errorMessage || ''),
      updatedAt: String(Date.now()),
    }));

  if (nextBackoffMs > 0) {
    multi.zAdd(delayedKey(queueName), [{ score: nextAvailableAt, value: job.id }]);
  } else {
    multi.rPush(waitingKey, job.id);
  }

  await multi.exec();
  return {
    attemptsMade: nextAttemptsMade,
    willRetry: nextAttemptsMade < job.maxAttempts,
  };
}

export async function failQueueJob(queueName, commandClient, jobId, details = {}) {
  const processingKey = queueKey(queueName, 'processing');
  await commandClient.multi()
    .lRem(processingKey, 0, jobId)
    .addCommand(hmsetCommand(jobKey(jobId), {
      status: 'failed',
      updatedAt: String(Date.now()),
      lastError: String(details.message || ''),
    }))
    .exec();
}

export async function startDelayedJobPromoter(queueName, { intervalMs = 1000, stopSignal } = {}) {
  const client = await getCommandClient();
  const delayedJobsKey = delayedKey(queueName);
  const waitingKey = queueKey(queueName, 'waiting');

  while (!stopSignal?.aborted) {
    try {
      const now = Date.now();
      const dueJobIds = await client.zRangeByScore(delayedJobsKey, 0, now);

      if (dueJobIds.length > 0) {
        const multi = client.multi();
        dueJobIds.forEach((jobId) => {
          multi.zRem(delayedJobsKey, jobId);
          multi.rPush(waitingKey, jobId);
          multi.addCommand(hmsetCommand(jobKey(jobId), {
            status: 'queued',
            updatedAt: String(Date.now()),
          }));
        });
        await multi.exec();
      }
    } catch (error) {
      console.warn(`[QueueManager] Delayed promoter failed for ${queueName}: ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export async function createWorkerClients(queueName, concurrency = 1) {
  const commandClient = await getCommandClient();
  const blockingClients = await Promise.all(
    Array.from({ length: concurrency }, (_, index) => createBlockingClient(`${queueName}-blocking-${index + 1}`)),
  );

  return {
    commandClient,
    blockingClients,
  };
}

export const compilerQueue = createQueue(QUEUE_NAMES.compiler);
export const submissionQueue = createQueue(QUEUE_NAMES.submission);
export const assessmentQueue = createQueue(QUEUE_NAMES.assessment);

export { QUEUE_NAMES, DEFAULT_ATTEMPTS, DEFAULT_BACKOFF_MS };
