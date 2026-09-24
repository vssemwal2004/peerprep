import {
  getCachedJson,
  invalidateCacheNamespaces,
  setCachedJson,
} from '../services/responseCacheService.js';

function stableQueryString(query = {}) {
  return Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(Array.isArray(value) ? value.join(',') : String(value))}`)
    .join('&');
}

function defaultCacheKey(req) {
  const userId = req.user?._id ? String(req.user._id) : 'anonymous';
  const role = req.user?.role || 'unknown';
  const scope = req.user?.coordinatorDataScope || 'default';
  return `${role}:${userId}:${scope}:${req.baseUrl}${req.path}?${stableQueryString(req.query)}`;
}

export function cacheJsonResponse({ namespace, ttlSeconds = 30, keyBuilder = defaultCacheKey }) {
  if (!namespace) throw new Error('cacheJsonResponse requires a namespace');

  return async function responseCacheMiddleware(req, res, next) {
    if (req.method !== 'GET' || req.headers['cache-control']?.includes('no-cache')) return next();

    const key = keyBuilder(req);
    const cached = await getCachedJson(namespace, key);
    if (cached != null) {
      res.setHeader('X-PeerPrep-Cache', 'HIT');
      return res.json(cached);
    }

    res.setHeader('X-PeerPrep-Cache', 'MISS');
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        void setCachedJson(namespace, key, body, ttlSeconds);
      }
      return originalJson(body);
    };
    return next();
  };
}

export function invalidateResponseCache(namespaces) {
  return function invalidateResponseCacheMiddleware(req, res, next) {
    let invalidated = false;
    const invalidateOnce = async () => {
      if (invalidated) return;
      invalidated = true;
      await invalidateCacheNamespaces(namespaces);
    };

    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) await invalidateOnce();
      return originalJson(body);
    };

    res.once('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) void invalidateOnce();
    });
    return next();
  };
}
