import crypto from 'crypto';
import { getValkeyClient } from '../utils/valkey.js';

const CACHE_PREFIX = 'peerprep:response-cache:v1';
const DEFAULT_MAX_MEMORY_ENTRIES = 500;
const DEFAULT_MAX_VALUE_BYTES = 2 * 1024 * 1024;
const VERSION_LOCAL_TTL_MS = 1000;

const memoryCache = new Map();
const memoryVersions = new Map();
const localVersionCache = new Map();

function cacheEnabled() {
  return String(process.env.RESPONSE_CACHE_ENABLED || 'true').toLowerCase() !== 'false';
}

function maxMemoryEntries() {
  const configured = Number(process.env.RESPONSE_CACHE_MEMORY_MAX_ENTRIES);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_MAX_MEMORY_ENTRIES;
}

function maxValueBytes() {
  const configured = Number(process.env.RESPONSE_CACHE_MAX_VALUE_BYTES);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_MAX_VALUE_BYTES;
}

function versionKey(namespace) {
  return `${CACHE_PREFIX}:version:${namespace}`;
}

function dataKey(namespace, version, key) {
  const digest = crypto.createHash('sha256').update(String(key)).digest('hex');
  return `${CACHE_PREFIX}:data:${namespace}:${version}:${digest}`;
}

function pruneMemoryCache() {
  const now = Date.now();
  for (const [key, entry] of memoryCache) {
    if (entry.expiresAt <= now) memoryCache.delete(key);
  }

  const overflow = memoryCache.size - maxMemoryEntries();
  if (overflow <= 0) return;
  const oldest = [...memoryCache.entries()]
    .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt)
    .slice(0, overflow);
  oldest.forEach(([key]) => memoryCache.delete(key));
}

async function redisCommand(args) {
  const client = getValkeyClient();
  if (!client) return null;
  try {
    return await client.sendCommand(args);
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[ResponseCache] Redis command failed: ${error.message}`);
    }
    return null;
  }
}

async function getNamespaceVersion(namespace) {
  const local = localVersionCache.get(namespace);
  if (local && local.expiresAt > Date.now()) return local.value;

  const redisVersion = await redisCommand(['GET', versionKey(namespace)]);
  const value = redisVersion == null
    ? (memoryVersions.get(namespace) || 1)
    : Math.max(1, Number(redisVersion) || 1);

  localVersionCache.set(namespace, {
    value,
    expiresAt: Date.now() + VERSION_LOCAL_TTL_MS,
  });
  return value;
}

export async function getCachedJson(namespace, key) {
  if (!cacheEnabled()) return null;
  const version = await getNamespaceVersion(namespace);
  const storageKey = dataKey(namespace, version, key);
  const redisValue = await redisCommand(['GET', storageKey]);
  if (redisValue != null) {
    try {
      return JSON.parse(redisValue);
    } catch {
      await redisCommand(['DEL', storageKey]);
    }
  }

  const memoryValue = memoryCache.get(storageKey);
  if (!memoryValue) return null;
  if (memoryValue.expiresAt <= Date.now()) {
    memoryCache.delete(storageKey);
    return null;
  }
  memoryValue.lastAccessedAt = Date.now();
  return memoryValue.value;
}

export async function setCachedJson(namespace, key, value, ttlSeconds) {
  if (!cacheEnabled()) return;
  const ttl = Math.max(1, Math.floor(Number(ttlSeconds) || 1));
  const version = await getNamespaceVersion(namespace);
  const storageKey = dataKey(namespace, version, key);
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > maxValueBytes()) return;
  const redisResult = await redisCommand(['SET', storageKey, serialized, 'EX', String(ttl)]);
  if (redisResult != null) return;

  memoryCache.set(storageKey, {
    value,
    expiresAt: Date.now() + (ttl * 1000),
    lastAccessedAt: Date.now(),
  });
  pruneMemoryCache();
}

export async function invalidateCacheNamespaces(namespaces) {
  const uniqueNamespaces = [...new Set((Array.isArray(namespaces) ? namespaces : [namespaces]).filter(Boolean))];
  await Promise.all(uniqueNamespaces.map(async (namespace) => {
    let redisVersion = await redisCommand(['INCR', versionKey(namespace)]);
    // A missing Redis version key increments to 1. Version 1 is also the
    // default used before the key exists, so advance once more to make all
    // earlier entries unreachable on the first invalidation.
    if (Number(redisVersion) === 1) {
      redisVersion = await redisCommand(['INCR', versionKey(namespace)]);
    }
    const nextVersion = redisVersion == null
      ? (memoryVersions.get(namespace) || 1) + 1
      : Math.max(2, Number(redisVersion) || 2);

    memoryVersions.set(namespace, nextVersion);
    localVersionCache.set(namespace, {
      value: nextVersion,
      expiresAt: Date.now() + VERSION_LOCAL_TTL_MS,
    });

    const prefix = `${CACHE_PREFIX}:data:${namespace}:`;
    for (const key of memoryCache.keys()) {
      if (key.startsWith(prefix)) memoryCache.delete(key);
    }
  }));
}

export function resetResponseCacheForTests() {
  memoryCache.clear();
  memoryVersions.clear();
  localVersionCache.clear();
}
