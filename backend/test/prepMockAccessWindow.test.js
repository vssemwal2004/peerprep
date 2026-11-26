import assert from 'node:assert/strict';
import test from 'node:test';
import { effectiveUniversityPermissions, prepMockAccessStatus } from '../src/platform/servicePeriod.js';
import { publishedMockAlwaysOn } from '../src/services/prepMockAvailability.js';

const permissions = { assessments: true, prepmock: true, questions: true };
const university = { permissions, prepMockStartDate: '2026-11-20', prepMockEndDate: '2026-11-26' };
const at = (value) => new Date(value);

test('PrepMock access follows inclusive university dates in India without changing other modules', () => {
  assert.equal(prepMockAccessStatus(university, at('2026-11-19T18:29:59.000Z')), 'upcoming');
  assert.equal(prepMockAccessStatus(university, at('2026-11-19T18:30:00.000Z')), 'active');
  assert.equal(prepMockAccessStatus(university, at('2026-11-26T18:29:59.000Z')), 'active');
  assert.equal(prepMockAccessStatus(university, at('2026-11-26T18:30:00.000Z')), 'expired');
  assert.deepEqual(effectiveUniversityPermissions(university, at('2026-11-26T18:30:00.000Z')),
    { ...permissions, prepmock: false });
  assert.equal(permissions.prepmock, true, 'the stored grant remains for renewal');
  assert.equal(prepMockAccessStatus({ permissions }, at('2026-11-25T00:00:00.000Z')), 'unconfigured');
  assert.equal(prepMockAccessStatus({ ...university, permissions: { ...permissions, prepmock: false } }), 'disabled');
  assert.equal(prepMockAccessStatus({ ...university, permissions: { assessments: false, prepmock: true } }, at('2026-11-26T00:00:00.000Z')), 'active');
});

test('published mocks with an old schedule are delivered as always on', () => {
  const oldMock = { kind: 'mock', lifecycleStatus: 'published', createdAt: at('2026-01-01T00:00:00.000Z'),
    startTime: at('2026-02-01T00:00:00.000Z'), endTime: at('2026-02-02T00:00:00.000Z'), availabilityMode: 'scheduled' };
  const live = publishedMockAlwaysOn(oldMock, at('2026-11-26T00:00:00.000Z'));
  assert.equal(live.availabilityMode, 'always');
  assert.equal(live.startTime.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(live.endTime.toISOString(), '9999-12-31T23:59:59.000Z');
  assert.equal(oldMock.availabilityMode, 'scheduled', 'the stored definition is not changed by delivery');
  assert.equal(publishedMockAlwaysOn({ ...oldMock, lifecycleStatus: 'draft' }).availabilityMode, 'scheduled');
});
