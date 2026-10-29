import assert from 'node:assert/strict';
import test from 'node:test';

// Per-process budget (no queue store configured): same rules as the Valkey path.
for (const key of ['QUEUE_VALKEY_URL', 'VALKEY_URL', 'REDIS_URL', 'VALKEY_HOST', 'REDIS_HOST']) delete process.env[key];
process.env.JUDGE0_URL = 'http://judge-gw.test';
process.env.JUDGE0_POLL_INTERVAL_MS = '1';
process.env.JUDGE0_MAX_INFLIGHT = '3';
process.env.JUDGE0_GATEWAY_ASSESSMENT_MAX = '2';
process.env.JUDGE0_GATEWAY_PRACTICE_MAX = '2';
process.env.JUDGE0_GATEWAY_PRACTICE_MAX_DURING_ASSESSMENT = '1';
process.env.JUDGE0_GATEWAY_MAX_WAIT_MS = '120';
process.env.JUDGE0_CIRCUIT_FAILURES = '3';
process.env.JUDGE0_OUTAGE_RETRY_MS = '5';

const {
  acquireJudge0Slot, closeJudge0Gateway, executionClassForJob, getJudge0GatewaySnapshot,
  queuePriorityForJob, recordJudge0Outcome, runWithExecutionClass,
} = await import('../src/services/judge0Gateway.js');
const { runJudge0 } = await import('../src/services/executionService.js');

const NODE = 'http://judge-gw.test';
const inflight = async () => (await getJudge0GatewaySnapshot([NODE])).nodes[0];

test('jobs map to execution classes and queue priorities (final evaluation first)', () => {
  assert.equal(executionClassForJob('assessment-final-code-submit'), 'critical');
  assert.equal(executionClassForJob('assessment-code-submit'), 'assessment');
  assert.equal(executionClassForJob('assessment-code-run'), 'assessment-run');
  assert.equal(executionClassForJob('run'), 'practice');
  assert.equal(executionClassForJob('submit'), 'practice');
  assert.ok(queuePriorityForJob('assessment-final-code-submit') < queuePriorityForJob('assessment-code-submit'));
  assert.ok(queuePriorityForJob('assessment-code-submit') < queuePriorityForJob('assessment-code-run'));
  assert.equal(queuePriorityForJob('run'), undefined);
});

test('assessment work cannot take the slot reserved for final evaluation', async () => {
  await closeJudge0Gateway();
  const a1 = await acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'assessment' });
  const a2 = await acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'assessment' });
  await assert.rejects(acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'assessment' }), { code: 'JUDGE0_GATEWAY_TIMEOUT' });
  const critical = await acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'critical' });
  assert.deepEqual((await inflight()).byClass, { critical: 1, assessment: 2, 'assessment-run': 0, practice: 0 });
  // Node is now full for every class.
  await assert.rejects(acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'critical' }), { code: 'JUDGE0_GATEWAY_TIMEOUT' });
  await a1.release();
  const again = await acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'assessment' });
  await Promise.all([a2.release(), critical.release(), again.release()]);
  assert.equal((await inflight()).inflight, 0);
});

test('assessment runs cannot fill the assessment budget, so submits always get a slot', async () => {
  await closeJudge0Gateway();
  // assessment budget 2, runs capped at 1 (budget - 2, at least 1)
  const run = await acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'assessment-run' });
  await assert.rejects(acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'assessment-run' }), { code: 'JUDGE0_GATEWAY_TIMEOUT' });
  const submit = await acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'assessment' });
  // Runs and submits share the assessment budget.
  await assert.rejects(acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'assessment' }), { code: 'JUDGE0_GATEWAY_TIMEOUT' });
  const critical = await acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'critical' });
  assert.deepEqual((await inflight()).byClass, { critical: 1, assessment: 1, 'assessment-run': 1, practice: 0 });
  await Promise.all([run.release(), submit.release(), critical.release()]);
});

test('practice is limited further while an assessment is executing', async () => {
  await closeJudge0Gateway();
  const p1 = await acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'practice' });
  const p2 = await acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'practice' });
  await Promise.all([p1.release(), p2.release()]);
  const assessment = await acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'assessment' });
  await assessment.release();
  const p3 = await acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'practice' });
  await assert.rejects(acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'practice' }), { code: 'JUDGE0_GATEWAY_TIMEOUT' });
  await p3.release();
});

test('a waiting submission gets the slot as soon as one is released, and expired leases free themselves', async () => {
  await closeJudge0Gateway();
  process.env.JUDGE0_GATEWAY_MAX_WAIT_MS = '2000';
  try {
    const held = await Promise.all([1, 2].map(() => acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'assessment' })));
    const waiting = acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'assessment' });
    setTimeout(() => { void held[0].release(); }, 50);
    const granted = await waiting;
    assert.ok(granted.waitedMs >= 40);
    // A crashed holder never releases; its short lease expires instead.
    await Promise.all([held[1].release(), granted.release()]);
    await acquireJudge0Slot(NODE, { ttlMs: 1000, executionClass: 'assessment' });
    await acquireJudge0Slot(NODE, { ttlMs: 1000, executionClass: 'assessment' });
    const afterExpiry = await acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'assessment' });
    assert.ok(afterExpiry.waitedMs >= 900);
    await afterExpiry.release();
  } finally {
    process.env.JUDGE0_GATEWAY_MAX_WAIT_MS = '120';
  }
});

test('runJudge0 releases its slot on a verdict but keeps it when Judge0 may still be executing', async () => {
  await closeJudge0Gateway();
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ status: { id: 3 }, stdout: Buffer.from('1').toString('base64') }));
    await runWithExecutionClass('assessment', () => runJudge0('print(1)', 71));
    assert.equal((await inflight()).inflight, 0);

    // Refused connection: the code never reached Judge0, so the slot is free again
    // (HTTP caller, which fails fast instead of waiting out the outage).
    globalThis.fetch = async () => { throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }); };
    await assert.rejects(runJudge0('print(1)', 71), /fetch failed/);
    assert.equal((await inflight()).inflight, 0);

    // Client timeout: Judge0 keeps running it, so the slot stays taken (ghost) until the lease expires.
    globalThis.fetch = async () => { throw new DOMException('The operation was aborted.', 'AbortError'); };
    await assert.rejects(runWithExecutionClass('assessment', () => runJudge0('print(1)', 71)), /timed out/);
    assert.deepEqual((await inflight()).byClass, { critical: 0, assessment: 1, 'assessment-run': 0, practice: 0 });
  } finally {
    globalThis.fetch = originalFetch;
    await closeJudge0Gateway();
  }
});

test('a queued job rides out an unreachable node without spending attempts; an HTTP caller fails fast', async () => {
  await closeJudge0Gateway();
  const originalFetch = globalThis.fetch;
  let posts = 0;
  globalThis.fetch = async () => {
    posts += 1;
    if (posts <= 2) throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    return new Response(JSON.stringify({ status: { id: 3 }, stdout: Buffer.from('ok').toString('base64') }));
  };
  try {
    const result = await runWithExecutionClass('assessment', () => runJudge0('print(1)', 71));
    assert.equal(result.stdout, 'ok');
    assert.equal(posts, 3);
    assert.equal((await inflight()).inflight, 0);

    posts = 0;
    await closeJudge0Gateway();
    await assert.rejects(runJudge0('print(1)', 71), /fetch failed/);
    assert.equal(posts, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await closeJudge0Gateway();
  }
});

test('repeated node failures open the circuit; queued work waits instead of hitting Judge0', async () => {
  await closeJudge0Gateway();
  for (let index = 0; index < 3; index += 1) await recordJudge0Outcome(NODE, false);
  assert.equal((await inflight()).circuitOpen, true);
  await assert.rejects(acquireJudge0Slot(NODE, { ttlMs: 60000, executionClass: 'critical' }), { code: 'JUDGE0_CIRCUIT_OPEN', status: 503 });
  await closeJudge0Gateway();
});
