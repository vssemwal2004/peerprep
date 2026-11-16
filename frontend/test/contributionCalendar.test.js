import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { test } from 'node:test';

// The calendar must give the same day keys whatever zone the browser's clock is in, so each case
// runs in a child process with its own TZ (IST, a negative offset, a DST zone and one whose DST
// starts at midnight).
const modelUrl = new URL('../src/components/contributionCalendarModel.js', import.meta.url).href;
const rangeUrl = new URL('../src/components/dateRange/dateRangeModel.js', import.meta.url).href;

function inZone(tz, { now, endingDayKey = null }) {
  const script = `
    const { rollingYearMonths } = await import(${JSON.stringify(modelUrl)});
    const { dayKey } = await import(${JSON.stringify(rangeUrl)});
    const months = rollingYearMonths(${JSON.stringify(endingDayKey)}, new Date(${JSON.stringify(now)}));
    const keys = months.flatMap((month) => month.days.filter(Boolean).map((date) => dayKey(date)));
    const padding = months[0].days.findIndex(Boolean);
    const labels = months.map((month) => month.year + '-' + (month.month + 1));
    console.log(JSON.stringify({ keys, padding, labels }));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
  return JSON.parse(output);
}

const nextKey = (key) => new Date(Date.parse(`${key}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
function assertConsecutive(keys, first, last) {
  assert.equal(keys.length, 365);
  assert.equal(keys[0], first);
  assert.equal(keys.at(-1), last);
  for (let index = 1; index < keys.length; index += 1) assert.equal(keys[index], nextKey(keys[index - 1]), `day after ${keys[index - 1]}`);
}

test('without an ending day the window ends on the UTC day the activity API buckets by', () => {
  // 01:30 IST on 13 Nov is still 12 Nov in UTC: activity done now is stored under 2026-11-12.
  const ist = inZone('Asia/Kolkata', { now: '2026-11-12T20:00:00Z' });
  assertConsecutive(ist.keys, '2025-11-13', '2026-11-12');
  // 19:00 on 12 Nov in California is already 13 Nov in UTC: today's activity needs a 2026-11-13 cell.
  const pacific = inZone('America/Los_Angeles', { now: '2026-11-13T03:00:00Z' });
  assertConsecutive(pacific.keys, '2025-11-14', '2026-11-13');
});

test('an ending day key gives the same cells in every time zone', () => {
  const results = ['Asia/Kolkata', 'America/Los_Angeles', 'America/New_York', 'America/Santiago', 'UTC']
    .map((tz) => inZone(tz, { now: '2026-11-12T20:00:00Z', endingDayKey: '2026-11-13' }));
  for (const result of results) {
    assertConsecutive(result.keys, '2025-11-14', '2026-11-13');
    assert.equal(result.padding, 5, '14 Nov 2025 is a Friday: five blank rows before it');
    assert.equal(result.labels[0], '2025-11');
    assert.equal(result.labels.at(-1), '2026-11');
    assert.equal(result.labels.length, 13);
  }
});

test('an invalid ending day falls back to today instead of drawing an empty grid', () => {
  const result = inZone('Asia/Kolkata', { now: '2026-11-13T06:00:00Z', endingDayKey: 'not-a-day' });
  assertConsecutive(result.keys, '2025-11-14', '2026-11-13');
});

test('every contribution calendar is given its activity under the prop it reads', () => {
  for (const file of ['../src/admin/StudentDirectory.jsx', '../src/coordinator/CoordinatorStudents.jsx', '../src/student/profile/ActivitySection.jsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const usages = source.match(/<ContributionCalendar[\s\S]*?\/>/g) || [];
    assert.ok(usages.length, `${file} renders the calendar`);
    for (const usage of usages) assert.match(usage, /\sactivity=\{/, `${file} passes activity={...}`);
  }
});
