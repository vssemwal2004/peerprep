import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fromLocalInput, hasWindow, questWindowStatus, sortByWindow, toLocalInput, windowError, windowNote, windowText,
} from '../src/student/quests/questWindow.js';

const DAY = 86400000;
const now = new Date(2026, 10, 13, 12, 0, 0);
const at = (days) => new Date(now.getTime() + days * DAY).toISOString();

test('datetime-local text converts to and from ISO in local time, never via Date string parsing', () => {
  const iso = fromLocalInput('2026-11-20T09:30');
  const local = new Date(iso);
  assert.deepEqual([local.getFullYear(), local.getMonth(), local.getDate(), local.getHours(), local.getMinutes()], [2026, 10, 20, 9, 30]);
  assert.equal(toLocalInput(iso), '2026-11-20T09:30', 'Round trip');
  assert.equal(fromLocalInput('2026-11-20 09:30'), null, 'The Safari-unsafe space form is rejected, not guessed');
  assert.equal(fromLocalInput('2026-02-31T10:00'), null, 'Impossible dates are rejected');
  assert.equal(fromLocalInput(''), null);
  assert.equal(toLocalInput(null), '');
  assert.equal(toLocalInput('not a date'), '');
});

test('status is Upcoming before the start, Ended after the end, Open otherwise (and without a window)', () => {
  assert.equal(questWindowStatus({}, now), 'open');
  assert.equal(hasWindow({}), false);
  assert.equal(questWindowStatus({ startsAt: at(1) }, now), 'upcoming');
  assert.equal(questWindowStatus({ startsAt: at(-1), endsAt: at(1) }, now), 'open');
  assert.equal(questWindowStatus({ endsAt: at(-1) }, now), 'ended');
  assert.equal(windowText({}), 'No time limit');
  assert.match(windowText({ startsAt: at(1) }), /^From /);
  assert.match(windowText({ endsAt: at(1) }), /^Until /);
  assert.match(windowText({ startsAt: at(-1), endsAt: at(1) }), / – /);
  assert.match(windowNote({ startsAt: at(1) }, now), /^Opens /);
  assert.match(windowNote({ endsAt: at(-1) }, now), /^Ended /);
  assert.match(windowNote({ endsAt: at(1) }, now), /^Ends /);
  assert.equal(windowNote({}, now), '');
});

test('the wizard validates the window: both optional, end after start', () => {
  assert.equal(windowError('', ''), '');
  assert.equal(windowError('2026-11-20T09:30', ''), '');
  assert.equal(windowError('', '2026-11-20T09:30'), '');
  assert.equal(windowError('2026-11-20T09:30', '2026-11-20T09:30'), 'The end must be after the start.');
  assert.equal(windowError('2026-11-21T09:30', '2026-11-20T09:30'), 'The end must be after the start.');
  assert.equal(windowError('2026-11-20T09:30', '2026-11-20T10:00'), '');
  assert.equal(windowError('garbage', ''), 'Enter a valid start date and time.');
});

test('students see open sheets first, then upcoming (soonest first), then ended (latest first)', () => {
  const quests = [
    { id: 'ended-old', endsAt: at(-9) }, { id: 'later', startsAt: at(5) }, { id: 'always' }, { id: 'ended-new', endsAt: at(-1) },
    { id: 'soon', startsAt: at(1) }, { id: 'open-window', startsAt: at(-1), endsAt: at(2) },
  ];
  assert.deepEqual(sortByWindow(quests, now).map((quest) => quest.id), ['always', 'open-window', 'soon', 'later', 'ended-new', 'ended-old']);
});
