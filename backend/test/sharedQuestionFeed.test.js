import test from 'node:test';
import assert from 'node:assert/strict';

test('malformed central question feed is reported as unavailable', async () => {
  const previous = {
    role: process.env.PEERPREP_DEPLOYMENT_ROLE,
    url: process.env.PEERPREP_CONTROL_URL,
    id: process.env.PEERPREP_UNIVERSITY_ID,
    key: process.env.PEERPREP_SHARED_API_KEY,
    fetch: globalThis.fetch,
  };
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'university';
  process.env.PEERPREP_CONTROL_URL = 'https://control.example.test';
  process.env.PEERPREP_UNIVERSITY_ID = 'test-university';
  process.env.PEERPREP_SHARED_API_KEY = 'a'.repeat(48);
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).endsWith('/policy')
    ? { permissions: { questions: true } } : {}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const { sharedQuestions } = await import('../src/platform/sharedContent.js');
    await assert.rejects(sharedQuestions(), (error) => error.status === 503 && /invalid response/.test(error.message));
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({ PEERPREP_DEPLOYMENT_ROLE: previous.role,
      PEERPREP_CONTROL_URL: previous.url, PEERPREP_UNIVERSITY_ID: previous.id,
      PEERPREP_SHARED_API_KEY: previous.key })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
