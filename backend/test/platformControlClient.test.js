import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDeploymentConfig } from '../src/platform/deployment.js';
import { controlRequest } from '../src/platform/client.js';
import { runForTenant } from '../src/platform/tenantContext.js';

test('only the shared deployment can start and it needs its main DB and encryption key', () => {
  const previous = { ...process.env };
  try {
    for (const role of ['control', 'university', 'standalone']) {
      process.env.PEERPREP_DEPLOYMENT_ROLE = role;
      assert.throws(validateDeploymentConfig, /one shared deployment/);
    }
    process.env.PEERPREP_DEPLOYMENT_ROLE = 'shared';
    delete process.env.MONGODB_URI;
    assert.throws(validateDeploymentConfig, /MONGODB_URI/);
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/platform';
    delete process.env.PEERPREP_TENANT_SECRET_KEY;
    assert.throws(validateDeploymentConfig, /PEERPREP_TENANT_SECRET_KEY/);
    process.env.PEERPREP_TENANT_SECRET_KEY = Buffer.alloc(32, 1).toString('base64');
    assert.doesNotThrow(validateDeploymentConfig);
  } finally { process.env = previous; }
});

test('a tenant reads shared content through the signed internal API', async () => {
  const previous = { ...process.env };
  const originalFetch = globalThis.fetch;
  let captured;
  try {
    process.env.PEERPREP_DEPLOYMENT_ROLE = 'shared';
    process.env.PEERPREP_SHARED_API_ORIGIN = 'https://peerprep.co.in';
    process.env.JWT_SECRET = 'shared-test-secret';
    globalThis.fetch = async (url, options) => {
      captured = { url: String(url), options };
      return new Response(JSON.stringify({ permissions: { learning: true } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    };
    const response = await runForTenant({ universityId: 'north-campus', connection: {} }, () => controlRequest('policy'));
    assert.equal(captured.url, 'https://peerprep.co.in/api/platform/tenant/policy');
    assert.equal(captured.options.headers['X-PeerPrep-University'], 'north-campus');
    assert.match(captured.options.headers['X-PeerPrep-Internal-Signature'], /^[a-f0-9]{64}$/);
    assert.equal(captured.options.headers['X-PeerPrep-Key'], undefined);
    assert.equal(response.permissions.learning, true);
  } finally { globalThis.fetch = originalFetch; process.env = previous; }
});
