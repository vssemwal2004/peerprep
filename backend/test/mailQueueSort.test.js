import test from 'node:test';
import assert from 'node:assert/strict';
import { mailJobSort } from '../src/controllers/mailQueueController.js';

test('email queue list sort is whitelisted and defaults to newest first', () => {
  const newest = { field: 'createdAt', sort: { createdAt: -1, _id: -1 } };
  assert.deepEqual(mailJobSort({}), newest);
  assert.deepEqual(mailJobSort({ sortBy: 'payloadEncrypted', sortOrder: 'asc' }), newest);
  assert.deepEqual(mailJobSort({ sortBy: '__proto__' }), newest);
  assert.deepEqual(mailJobSort({ sortBy: 'recipient', sortOrder: 'asc' }).sort, { to: 1, _id: 1 });
  assert.deepEqual(mailJobSort({ sortBy: 'attempts', sortOrder: 'desc' }).sort, { attempts: -1, _id: -1 });
  assert.deepEqual(mailJobSort({ sortBy: 'completed', sortOrder: 'desc' }), { field: 'completedAt', sort: { completedAt: -1, _id: -1 } });
});
