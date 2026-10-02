import crypto from 'crypto';
import { getValkeyClient } from '../../utils/valkey.js';

const CACHE_NAMESPACE = 'peerprep:admin-analytics:v2';
const CACHE_SCHEMA_VERSION = 1;
const memoryCache = new Map();
const inFlight = new Map();
let localVersion = 1;
let lastInvalidatedAt = null;

function ttlMs() {
  const value = Number(process.env.ADMIN_ANALYTICS_CACHE_TTL_MS);
  return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 1000), 300000) : 30000;
}

function maxEntries() {
  const value = Number(process.env.ADMIN_ANALYTICS_CACHE_MAX_ENTRIES);
  return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 1), 500) : 64;
}

function maxBytes() {
  const value = Number(process.env.ADMIN_ANALYTICS_CACHE_MAX_BYTES);
  return Number.isFinite(value) ? Math.max(Math.floor(value), 65536) : 5 * 1024 * 1024;
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function storageKey(version, key) {
  return `${CACHE_NAMESPACE}:${version}:${key}`;
}

async function valkeyCommand(args) {
  const client = getValkeyClient();
  if (!client) return null;
  try { return await client.sendCommand(args); }
  catch { return null; }
}

async function readVersion() {
  const shared = await valkeyCommand(['GET', `${CACHE_NAMESPACE}:version`]);
  return shared == null ? localVersion : Math.max(1, Number(shared) || 1);
}

function readMemory(key, scopeHash) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.staleAt <= Date.now() || entry.scopeHash !== scopeHash) {
    memoryCache.delete(key);
    return null;
  }
  memoryCache.delete(key);
  memoryCache.set(key, entry);
  return entry;
}

function writeMemory(key, entry) {
  memoryCache.delete(key);
  memoryCache.set(key, entry);
  while (memoryCache.size > maxEntries()) memoryCache.delete(memoryCache.keys().next().value);
}

function cacheMetadata(status, source, entry, version) {
  const now = Date.now();
  return {
    status,
    source,
    ageMs: entry ? Math.max(0, now - entry.createdAt) : 0,
    ttlMs: ttlMs(),
    staleAt: entry ? new Date(entry.staleAt).toISOString() : new Date(now + ttlMs()).toISOString(),
    isStale: Boolean(entry && entry.staleAt <= now),
    version,
    lastInvalidatedAt,
  };
}

function attachMetadata(payload, status, source, entry, version) {
  const response = clone(payload);
  response.meta ||= {};
  response.meta.cache = cacheMetadata(status, source, entry, version);
  return response;
}

export function analyticsAuthorizationScope(user = {}) {
  const permissions = Array.isArray(user.coordinatorPermissions) ? [...user.coordinatorPermissions].sort() : [];
  const raw = JSON.stringify({
    id: String(user._id || user.id || ''), role: String(user.role || ''),
    coordinatorId: String(user.coordinatorId || ''), dataScope: String(user.coordinatorDataScope || ''),
    college: String(user.college || ''), permissions,
  });
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function withAdminAnalyticsCache({ key, scopeHash, loader, bypass = false }) {
  const version = await readVersion();
  const keyWithVersion = storageKey(version, key);
  if (!bypass) {
    const sharedValue = await valkeyCommand(['GET', keyWithVersion]);
    if (sharedValue) {
      try {
        const entry = JSON.parse(sharedValue);
        if (entry.schemaVersion === CACHE_SCHEMA_VERSION && entry.scopeHash === scopeHash && entry.staleAt > Date.now()) {
          writeMemory(keyWithVersion, entry);
          return attachMetadata(entry.payload, 'hit', 'valkey', entry, version);
        }
      } catch {
        // Ignore malformed or old cache entries and recalculate safely.
      }
    }

    const memoryEntry = readMemory(keyWithVersion, scopeHash);
    if (memoryEntry) return attachMetadata(memoryEntry.payload, 'hit', 'memory', memoryEntry, version);
  }

  const flightKey = `${scopeHash}:${keyWithVersion}${bypass ? ':refresh' : ''}`;
  if (inFlight.has(flightKey)) {
    const entry = await inFlight.get(flightKey);
    return attachMetadata(entry.payload, 'coalesced', 'origin', entry, version);
  }

  const promise = Promise.resolve().then(loader).then(async (payload) => {
    const createdAt = Date.now();
    const entry = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      scopeHash,
      createdAt,
      staleAt: createdAt + ttlMs(),
      payload: clone(payload),
    };
    const serialized = JSON.stringify(entry);
    if (Buffer.byteLength(serialized, 'utf8') <= maxBytes()) {
      writeMemory(keyWithVersion, entry);
      await valkeyCommand(['SET', keyWithVersion, serialized, 'PX', String(ttlMs())]);
    }
    return entry;
  }).finally(() => inFlight.delete(flightKey));
  inFlight.set(flightKey, promise);
  const entry = await promise;
  return attachMetadata(entry.payload, bypass ? 'refresh' : 'miss', 'origin', entry, version);
}

export async function invalidateAdminAnalyticsCache() {
  let sharedVersion = await valkeyCommand(['INCR', `${CACHE_NAMESPACE}:version`]);
  if (Number(sharedVersion) === 1) sharedVersion = await valkeyCommand(['INCR', `${CACHE_NAMESPACE}:version`]);
  localVersion = sharedVersion == null ? localVersion + 1 : Math.max(2, Number(sharedVersion) || 2);
  lastInvalidatedAt = new Date().toISOString();
  memoryCache.clear();
  return { version: localVersion, invalidatedAt: lastInvalidatedAt };
}

export function resetAdminAnalyticsCacheForTests() {
  memoryCache.clear();
  inFlight.clear();
  localVersion = 1;
  lastInvalidatedAt = null;
}
