import { createClient } from 'redis';

let cacheClient = null;
let cacheConnection = null;
let unavailableUntil = 0;

export function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function buildValkeyUrl(purpose = 'cache') {
  const specific = purpose === 'queue' ? process.env.QUEUE_VALKEY_URL : process.env.CACHE_VALKEY_URL;
  const direct = String(specific || process.env.VALKEY_URL || process.env.REDIS_URL || '').trim();
  if (direct) return direct;
  const host = String(process.env.VALKEY_HOST || process.env.REDIS_HOST || '').trim();
  if (!host) return '';
  const port = positiveInteger(process.env.VALKEY_PORT || process.env.REDIS_PORT, 6379);
  const password = String(process.env.VALKEY_PASSWORD || process.env.REDIS_PASSWORD || '').trim();
  return `redis://${password ? `:${encodeURIComponent(password)}@` : ''}${host}:${port}`;
}

export function isValkeyEnabled(purpose = 'cache') {
  return Boolean(buildValkeyUrl(purpose));
}

// A timeout cannot prove a write was not applied. Queue retry uses durable IDs.
export async function withDeadline(operation, timeoutMs, label = 'Dependency') {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`${label} timed out`);
          error.code = 'DEPENDENCY_TIMEOUT';
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export function createValkeyBaseClient(overrides = {}) {
  const { purpose = 'cache', socket = {}, ...options } = overrides;
  const url = options.url || buildValkeyUrl(purpose);
  if (!url) return null;
  return createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: positiveInteger(process.env.CACHE_CONNECT_TIMEOUT_MS, 1000),
      reconnectStrategy: (retries) => Math.min(100 + retries * 100, 2000),
      ...socket,
    },
    ...options,
  });
}

function ensureCacheConnection() {
  if (!cacheClient) {
    const client = createValkeyBaseClient();
    if (!client) return null;
    cacheClient = client;
    client.on('error', () => { unavailableUntil = Date.now() + 1000; });
    client.on('ready', () => { unavailableUntil = 0; });
    cacheConnection = client.connect().catch(() => null);
  }
  return cacheClient;
}

async function cacheOperation(method, args) {
  if (Date.now() < unavailableUntil) throw new Error('Cache temporarily unavailable');
  const client = ensureCacheConnection();
  if (!client) throw new Error('Cache is not configured');
  const timeout = positiveInteger(process.env.CACHE_COMMAND_TIMEOUT_MS, 250);
  try {
    if (!client.isReady) await withDeadline(cacheConnection, timeout, 'Cache connection');
    if (!client.isReady) throw new Error('Cache is not ready');
    return await withDeadline(client[method](...args), timeout, 'Cache command');
  } catch (error) {
    unavailableUntil = Date.now() + 1000;
    throw error;
  }
}

const cacheFacade = {
  sendCommand: (args) => cacheOperation('sendCommand', [args]),
  set: (...args) => cacheOperation('set', args),
  pTTL: (...args) => cacheOperation('pTTL', args),
};

export function getValkeyClient() { return isValkeyEnabled() ? cacheFacade : null; }

export async function getCacheHealth() {
  if (!isValkeyEnabled()) return { configured: false, ready: false };
  try { return { configured: true, ready: await cacheFacade.sendCommand(['PING']) === 'PONG' }; }
  catch { return { configured: true, ready: false }; }
}

export async function closeValkeyClient() {
  const client = cacheClient;
  cacheClient = null;
  cacheConnection = null;
  unavailableUntil = 0;
  if (client?.isOpen) await client.disconnect().catch(() => {});
}
