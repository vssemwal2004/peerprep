import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

// Explicit opt-in against an isolated local Redis/Valkey; the gateway script needs
// only basic commands, so any version with EVAL works.
const testUrl = process.env.TEST_GATEWAY_REDIS_URL;

test('slot budget is shared through Valkey across gateway clients', { skip: !testUrl, timeout: 20000 }, async () => {
  const parsed = new URL(testUrl);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname), 'TEST_GATEWAY_REDIS_URL must point at an isolated local Redis/Valkey');
  const prefix = `peerprep:test-gw:${randomUUID()}`;
  process.env.QUEUE_VALKEY_URL = testUrl;
  process.env.JUDGE0_GATEWAY_PREFIX = prefix;
  process.env.JUDGE0_MAX_INFLIGHT = '2';
  process.env.JUDGE0_GATEWAY_ASSESSMENT_MAX = '1';
  process.env.JUDGE0_GATEWAY_MAX_WAIT_MS = '150';
  const { acquireJudge0Slot, closeJudge0Gateway, getJudge0GatewaySnapshot, recordJudge0Outcome } = await import('../src/services/judge0Gateway.js');
  const IORedis = (await import('ioredis')).default;
  const inspect = new IORedis(testUrl);
  const node = `http://judge-${randomUUID()}.test`;
  try {
    const a = await acquireJudge0Slot(node, { ttlMs: 60000, executionClass: 'assessment' });
    await assert.rejects(acquireJudge0Slot(node, { ttlMs: 60000, executionClass: 'assessment' }), { code: 'JUDGE0_GATEWAY_TIMEOUT' });
    const c = await acquireJudge0Slot(node, { ttlMs: 60000, executionClass: 'critical' });
    const snapshot = (await getJudge0GatewaySnapshot([node])).nodes[0];
    assert.equal(snapshot.store, 'valkey');
    assert.deepEqual(snapshot.byClass, { critical: 1, assessment: 1, 'assessment-run': 0, practice: 0 });
    // Group budget: with the single assessment slot taken, a run cannot start either.
    await assert.rejects(acquireJudge0Slot(node, { ttlMs: 60000, executionClass: 'assessment-run' }), { code: 'JUDGE0_GATEWAY_TIMEOUT' });
    // A second process sees the same leases in Valkey.
    const keys = await inspect.keys(`${prefix}:*`);
    assert.ok(keys.some((key) => key.endsWith(':leases')));
    await Promise.all([a.release(), c.release()]);
    assert.equal((await getJudge0GatewaySnapshot([node])).nodes[0].inflight, 0);

    process.env.JUDGE0_CIRCUIT_FAILURES = '2';
    await recordJudge0Outcome(node, false);
    await recordJudge0Outcome(node, false);
    await assert.rejects(acquireJudge0Slot(node, { ttlMs: 60000, executionClass: 'critical' }), { code: 'JUDGE0_CIRCUIT_OPEN' });
  } finally {
    await closeJudge0Gateway();
    const keys = await inspect.keys(`${prefix}:*`);
    if (keys.length) await inspect.del(...keys);
    inspect.disconnect();
  }
});
