import test from 'node:test';
import assert from 'node:assert/strict';
import { builderPathFor, mergeAssignResult, mergePublishResult, mocksForScope, NO_ROLE_KEY } from '../src/admin/prepMock/mockAccessModel.js';

test('pattern publish errors open the Basic details pattern dialog', () => {
  const mock = { _id: 'mock-1' };
  assert.equal(builderPathFor(mock, 'Missing exam pattern'), '/admin/prepmock/mock-1/edit?pattern=1');
  assert.equal(builderPathFor(mock, 'Choose the month and year'), '/admin/prepmock/mock-1/edit?pattern=1');
  assert.equal(builderPathFor(mock, 'Add questions'), '/admin/prepmock/mock-1/edit');
});

test('bulk scopes keep roles inside their company and exclude shared mocks', () => {
  const mocks = [
    { _id: 'amazon-sde1-live', company: 'Amazon', role: 'SDE 1', lifecycleStatus: 'published' },
    { _id: 'amazon-sde1-draft', company: 'Amazon', role: 'SDE 1', lifecycleStatus: 'draft' },
    { _id: 'amazon-sde2', company: 'Amazon', role: 'SDE 2' },
    { _id: 'amazon-no-role', company: 'Amazon' },
    { _id: 'google-sde1', company: 'Google', role: 'SDE 1' },
    { _id: 'shared', company: 'Amazon', role: 'SDE 1', shared: true },
  ];
  const targetIds = (scope) => mocksForScope(mocks, scope).map(({ _id }) => _id);

  assert.deepEqual(targetIds({ company: 'amazon', role: 'sde 1' }), ['amazon-sde1-live', 'amazon-sde1-draft']);
  assert.deepEqual(targetIds({ company: 'Amazon', role: NO_ROLE_KEY }), ['amazon-no-role']);
  assert.deepEqual(targetIds({ company: 'Amazon' }), ['amazon-sde1-live', 'amazon-sde1-draft', 'amazon-sde2', 'amazon-no-role']);
  assert.deepEqual(targetIds({ all: true }), ['amazon-sde1-live', 'amazon-sde1-draft', 'amazon-sde2', 'amazon-no-role', 'google-sde1']);
  assert.deepEqual(targetIds({ mockIds: ['amazon-sde2', 'google-sde1', 'shared'] }), ['amazon-sde2', 'google-sde1']);
});

test('assignment batches report skipped and missing mocks and count missing students only once', () => {
  const skipped = { _id: 'blocked', title: 'At capacity', reason: 'Too many students' };
  const first = mergeAssignResult(undefined, { mocks: 1, granted: 2, notFound: 1, skipped: [skipped], prepMockActivationFailed: true });
  const result = mergeAssignResult(first, { mocks: 1, granted: 1, notFound: 1, mocksNotFound: ['deleted'] });

  assert.equal(result.mocks, 2);
  assert.equal(result.granted, 3);
  assert.equal(result.notFound, 1);
  assert.equal(result.prepMockActivationFailed, true);
  assert.deepEqual(result.missingMocks, ['deleted']);
  assert.deepEqual(result.skipped, [skipped]);
});

test('publish and unpublish results retain missing mock IDs and per-mock errors', () => {
  const skipped = { _id: 'draft', title: 'Draft mock', reason: 'Missing exam pattern' };
  const failed = { _id: 'live', title: 'Live mock', reason: 'Could not save' };
  assert.deepEqual(mergePublishResult(undefined, { published: 1, alreadyLive: 2, skipped: [skipped], notFound: ['deleted'] }), {
    changed: 1, unchanged: 2, missingMocks: ['deleted'], skipped: [skipped],
  });
  assert.deepEqual(mergePublishResult(undefined, { unpublished: 1, alreadyOff: 2, failed: [failed], notFound: ['deleted'] }, false), {
    changed: 1, unchanged: 2, missingMocks: ['deleted'], skipped: [failed],
  });
});
