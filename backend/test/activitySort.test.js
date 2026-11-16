import test from 'node:test';
import assert from 'node:assert/strict';
import Activity from '../src/models/Activity.js';
import { activitySort, getActivities } from '../src/controllers/adminActivityController.js';

test('activity sort keeps newest-first by default and ignores unknown keys', () => {
  assert.deepEqual(activitySort({}), { createdAt: -1 });
  assert.deepEqual(activitySort({ sortBy: 'ipAddress', sortOrder: 'asc' }), { createdAt: -1 });
  assert.deepEqual(activitySort({ sortBy: '__proto__' }), { createdAt: -1 });
});

test('activity sort maps table columns to stored fields', () => {
  assert.deepEqual(activitySort({ sortBy: 'time', sortOrder: 'asc' }), { createdAt: 1, _id: 1 });
  assert.deepEqual(activitySort({ sortBy: 'time', sortOrder: 'desc' }), { createdAt: -1, _id: -1 });
  assert.deepEqual(activitySort({ sortBy: 'actor', sortOrder: 'asc' }), { userEmail: 1, createdAt: -1, _id: -1 });
  assert.deepEqual(activitySort({ sortBy: 'action', sortOrder: 'desc' }), { actionType: -1, createdAt: -1, _id: -1 });
  assert.deepEqual(activitySort({ sortBy: 'record', sortOrder: 'bogus' }), { targetType: -1, createdAt: -1, _id: -1 });
  assert.deepEqual(activitySort({ sortBy: 'description', sortOrder: 'asc' }), { description: 1, createdAt: -1, _id: -1 });
});

test('getActivities passes the whitelisted sort to the query', async (t) => {
  const originalFind = Activity.find;
  const originalCount = Activity.countDocuments;
  let seenSort = null;
  const chain = {
    sort(value) { seenSort = value; return chain; },
    skip() { return chain; },
    limit() { return chain; },
    lean: async () => [],
  };
  Activity.find = () => chain;
  Activity.countDocuments = async () => 0;
  t.after(() => { Activity.find = originalFind; Activity.countDocuments = originalCount; });

  const respond = () => {
    const res = { body: null, statusCode: 200 };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
  };
  const user = { role: 'admin', email: 'admin@example.test' };

  const sorted = respond();
  await getActivities({ query: { sortBy: 'actor', sortOrder: 'asc', limit: '25' }, user }, sorted);
  assert.equal(sorted.statusCode, 200);
  assert.deepEqual(seenSort, { userEmail: 1, createdAt: -1, _id: -1 });

  await getActivities({ query: {}, user }, respond());
  assert.deepEqual(seenSort, { createdAt: -1 });
});
