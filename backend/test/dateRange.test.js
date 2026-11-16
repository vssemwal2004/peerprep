import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_MS, dayKeyOf, inRange, parseDateRange, parseDayKey, rangeDayKeys, rangeEcho, rangeMatch,
} from '../src/utils/dateRange.js';

const now = new Date('2026-11-13T10:00:00.000Z');

test('presets count back from now; all is unbounded; default applies when nothing is sent', () => {
  const week = parseDateRange({ range: '7d' }, { now });
  assert.equal(week.preset, '7d');
  assert.equal(week.days, 7);
  assert.equal(week.from.getTime(), now.getTime() - 7 * DAY_MS);
  assert.equal(week.to, null);
  assert.deepEqual(parseDateRange({ range: 'all' }, { now }), { preset: 'all', from: null, to: null, days: null });
  assert.equal(parseDateRange({}, { now, defaultPreset: '30d' }).preset, '30d');
  assert.equal(parseDateRange('90d', { now }).preset, '90d');
  assert.equal(parseDateRange({ preset: '365d' }, { now }).days, 365);
});

test('unknown or narrowed-out presets are refused; legacy aliases still work', () => {
  assert.throws(() => parseDateRange({ range: '2d' }, { now }), (error) => error.status === 400);
  assert.throws(() => parseDateRange({ range: 'all' }, { now, presets: ['7d', '30d'] }), (error) => error.status === 400);
  const legacy = parseDateRange({ range: '14d' }, { now, aliases: { '14d': 14 } });
  assert.equal(legacy.preset, '14d');
  assert.equal(legacy.from.getTime(), now.getTime() - 14 * DAY_MS);
  assert.equal(parseDateRange({ range: 'month' }, { now, aliases: { month: '30d' } }).preset, '30d');
});

test('custom: YYYY-MM-DD, inclusive end of day, open ends allowed', () => {
  const range = parseDateRange({ range: 'custom', from: '2026-10-01', to: '2026-10-31' }, { now });
  assert.equal(range.from.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(range.to.toISOString(), '2026-10-31T23:59:59.999Z');
  const sameDay = parseDateRange({ range: 'custom', from: '2026-10-05', to: '2026-10-05' }, { now });
  assert.equal(sameDay.to - sameDay.from, DAY_MS - 1);
  assert.equal(parseDateRange({ range: 'custom', from: '2026-10-01' }, { now }).to, null);
  assert.equal(parseDateRange({ range: 'custom', to: '2026-10-01' }, { now }).from, null);
  // from/to without a range means custom.
  assert.equal(parseDateRange({ from: '2026-10-01' }, { now }).preset, 'custom');
});

test('custom: IST offset moves the day boundaries', () => {
  const range = parseDateRange({ range: 'custom', from: '2026-10-01', to: '2026-10-01' }, { now, offsetMinutes: 330 });
  assert.equal(range.from.toISOString(), '2026-09-30T18:30:00.000Z');
  assert.equal(range.to.toISOString(), '2026-10-01T18:29:59.999Z');
});

test('custom: invalid input is a 400', () => {
  const bad = (input) => assert.throws(() => parseDateRange(input, { now }), (error) => error.status === 400, JSON.stringify(input));
  bad({ range: 'custom' });
  bad({ range: 'custom', from: '01-10-2026' });
  bad({ range: 'custom', from: '2026-02-31' });
  bad({ range: 'custom', from: '2026-10-02', to: '2026-10-01' });
  bad({ range: 'custom', from: '2023-01-01', to: '2026-10-01' });
  bad({ range: 'custom', from: '2022-01-01' });
  // Exactly three years is allowed.
  assert.equal(parseDateRange({ range: 'custom', from: '2023-10-02', to: '2026-10-01' }, { now }).preset, 'custom');
});

test('rangeMatch, inRange and rangeEcho', () => {
  const range = parseDateRange({ range: 'custom', from: '2026-10-01', to: '2026-10-31' }, { now });
  assert.deepEqual(rangeMatch('createdAt', range), { createdAt: { $gte: range.from, $lte: range.to } });
  assert.deepEqual(rangeMatch('createdAt', { preset: 'all', from: null, to: null }), {});
  assert.equal(inRange('2026-10-31T23:00:00Z', range), true);
  assert.equal(inRange('2026-11-01T00:00:00Z', range), false);
  assert.equal(inRange(null, range), false);
  assert.equal(inRange(null, { from: null, to: null }), true);
  assert.deepEqual(rangeEcho(range), { range: 'custom', from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(rangeEcho(parseDateRange({ range: '7d' }, { now })), { range: '7d' });
});

test('rangeDayKeys lists every day; open start falls back; future end stops today', () => {
  const custom = parseDateRange({ range: 'custom', from: '2026-10-30', to: '2026-11-02' }, { now });
  assert.deepEqual(rangeDayKeys(custom, { now }), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  const toFuture = parseDateRange({ range: 'custom', from: '2026-11-11', to: '2026-12-31' }, { now });
  assert.deepEqual(rangeDayKeys(toFuture, { now }), ['2026-11-11', '2026-11-12', '2026-11-13']);
  assert.equal(rangeDayKeys({ preset: 'all', from: null, to: null }, { now, fallbackDays: 14 }).length, 14);
  assert.deepEqual(rangeDayKeys(parseDateRange({ range: '7d' }, { now }), { now }).at(0), '2026-11-07');
  assert.equal(rangeDayKeys(parseDateRange({ range: '7d' }, { now }), { now }).length, 7);
  assert.equal(dayKeyOf(new Date('2026-10-31T20:00:00Z'), 330), '2026-11-01');
  assert.equal(parseDayKey('2026-13-01'), null);
});
