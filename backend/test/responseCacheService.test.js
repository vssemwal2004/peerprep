import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCachedJson,
  invalidateCacheNamespaces,
  resetResponseCacheForTests,
  setCachedJson,
} from '../src/services/responseCacheService.js';

test.beforeEach(() => {
  delete process.env.VALKEY_URL;
  delete process.env.REDIS_URL;
  delete process.env.VALKEY_HOST;
  delete process.env.REDIS_HOST;
  process.env.RESPONSE_CACHE_ENABLED = 'true';
  resetResponseCacheForTests();
});

test('stores and returns JSON using the bounded memory fallback', async () => {
  await setCachedJson('assessments', 'admin:1:list', { count: 2 }, 30);
  assert.deepEqual(await getCachedJson('assessments', 'admin:1:list'), { count: 2 });
});

test('invalidating a namespace makes earlier entries unreachable', async () => {
  await setCachedJson('events', 'student:1:list', [{ id: 'event-1' }], 30);
  await invalidateCacheNamespaces('events');
  assert.equal(await getCachedJson('events', 'student:1:list'), null);
});

test('keeps cache namespaces isolated', async () => {
  await setCachedJson('events', 'admin:1:list', [{ id: 'event-1' }], 30);
  await setCachedJson('assessments', 'admin:1:list', { count: 1 }, 30);
  await invalidateCacheNamespaces('events');
  assert.equal(await getCachedJson('events', 'admin:1:list'), null);
  assert.deepEqual(await getCachedJson('assessments', 'admin:1:list'), { count: 1 });
});

