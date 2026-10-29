import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ecosystem from '../ecosystem.production.config.cjs';

test('production API keeps a mail queue consumer enabled', () => {
  const api = ecosystem.apps.find((app) => app.name === 'peerprep-backend');
  assert.ok(api, 'peerprep-backend process definition is required');
  assert.equal(api.env?.START_MAIL_WORKER, 'true');
});

test('single-process environment example enables mail delivery by default', async () => {
  const example = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(example, /^START_MAIL_WORKER=true$/m);
});
