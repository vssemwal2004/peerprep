import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDeploymentConfig } from '../src/platform/deployment.js';
import { controlRequest } from '../src/platform/client.js';

test('university configuration rejects missing identity and weak shared key', () => {
  const previous = { ...process.env };
  try {
    process.env.PEERPREP_DEPLOYMENT_ROLE = 'university';
    process.env.PEERPREP_CONTROL_URL = 'https://control.example.com';
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/university';
    delete process.env.PEERPREP_UNIVERSITY_ID;
    assert.throws(validateDeploymentConfig, /UNIVERSITY_ID/);
    process.env.PEERPREP_UNIVERSITY_ID = 'university-one';
    process.env.PEERPREP_SHARED_API_KEY = 'weak';
    assert.throws(validateDeploymentConfig, /SHARED_API_KEY/);
  } finally { process.env = previous; }
});

test('production university requires an explicitly configured Judge0 service', () => {
  const previous = { ...process.env };
  try {
    Object.assign(process.env, { PEERPREP_DEPLOYMENT_ROLE: 'university', PEERPREP_UNIVERSITY_ID: 'university-one',
      PEERPREP_CONTROL_URL: 'https://control.example.com', PEERPREP_SHARED_API_KEY: 'a'.repeat(40),
      MONGODB_URI: 'mongodb://127.0.0.1:27017/university', NODE_ENV: 'production' });
    delete process.env.JUDGE0_URL;
    delete process.env.JUDGE0_BASE_URLS;
    delete process.env.JUDGE0_BASE_URL;
    assert.throws(validateDeploymentConfig, /JUDGE0_URL/);
    process.env.JUDGE0_URL = 'http://127.0.0.1:2358';
    assert.doesNotThrow(validateDeploymentConfig);
  } finally { process.env = previous; }
});

test('university central request sends its identity and key only to the configured central host', async () => {
  const previous = { ...process.env };
  const originalFetch = globalThis.fetch;
  let captured;
  try {
    process.env.PEERPREP_DEPLOYMENT_ROLE = 'university';
    process.env.PEERPREP_CONTROL_URL = 'https://control.example.com';
    process.env.PEERPREP_UNIVERSITY_ID = 'university-one';
    process.env.PEERPREP_SHARED_API_KEY = 'a'.repeat(40);
    globalThis.fetch = async (url, options) => {
      captured = { url: String(url), options };
      return new Response(JSON.stringify({ permissions: { learning: true } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const response = await controlRequest('policy');
    assert.equal(captured.url, 'https://control.example.com/api/platform/tenant/policy');
    assert.equal(captured.options.headers['X-PeerPrep-University'], 'university-one');
    assert.equal(captured.options.headers['X-PeerPrep-Key'], 'a'.repeat(40));
    assert.equal(response.permissions.learning, true);
  } finally { globalThis.fetch = originalFetch; process.env = previous; }
});
