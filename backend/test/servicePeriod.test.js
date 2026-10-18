import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceDates, servicePeriodStatus, todayInIndia } from '../src/platform/servicePeriod.js';

test('service dates are inclusive in India time and legacy universities remain accessible', () => {
  const university = serviceDates('2026-10-18', '2026-10-19');
  assert.equal(todayInIndia(new Date('2026-10-17T18:30:00Z')), '2026-10-18');
  assert.equal(servicePeriodStatus(university, new Date('2026-10-17T18:29:59Z')), 'upcoming');
  assert.equal(servicePeriodStatus(university, new Date('2026-10-17T18:30:00Z')), 'active');
  assert.equal(servicePeriodStatus(university, new Date('2026-10-19T18:29:59Z')), 'active');
  assert.equal(servicePeriodStatus(university, new Date('2026-10-19T18:30:00Z')), 'expired');
  assert.equal(servicePeriodStatus({}, new Date('2026-10-19T18:30:00Z')), 'active');
  assert.throws(() => serviceDates('2026-02-30', '2026-03-01'), /valid service start/);
  assert.throws(() => serviceDates('2026-10-20', '2026-10-19'), /on or after/);
});
