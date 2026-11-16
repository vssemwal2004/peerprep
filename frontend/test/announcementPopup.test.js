import assert from 'node:assert/strict';
import { test } from 'node:test';
import { popupAllowedOn, popupQueue, popupSeenKey, readSeen, writeSeen } from '../src/student/announcementPopupModel.js';

const memoryStorage = () => {
  const map = new Map();
  return { getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), map };
};

test('only active popup announcements that are not seen or expired are queued, most important first', () => {
  const now = new Date(2026, 10, 14, 10);
  const list = [
    { _id: 'a', title: 'Old normal', showAsPopup: true, priority: 'normal', createdAt: '2026-11-01T00:00:00Z' },
    { _id: 'b', title: 'Not a popup', showAsPopup: false, priority: 'high' },
    { _id: 'c', title: 'High', showAsPopup: true, priority: 'high', createdAt: '2026-10-01T00:00:00Z' },
    { _id: 'd', title: 'New normal', showAsPopup: true, priority: 'normal', createdAt: '2026-11-10T00:00:00Z' },
    { _id: 'e', title: 'Seen', showAsPopup: true },
    { _id: 'f', title: 'Expired', showAsPopup: true, expiryDate: '2026-11-13T23:59:59' },
    { _id: 'g', title: 'Inactive', showAsPopup: true, status: 'inactive' },
    { _id: 'h', title: 'Expires today', showAsPopup: true, priority: 'low', expiryDate: new Date(2026, 10, 14, 23, 59).toISOString() },
  ];
  assert.deepEqual(popupQueue(list, new Set(['e']), now).map((item) => item._id), ['c', 'd', 'a', 'h']);
  assert.deepEqual(popupQueue(null), []);
});

test('seen ids are stored per student and survive bad storage', () => {
  const storage = memoryStorage();
  assert.equal(readSeen(storage, 's1').size, 0);
  writeSeen(storage, 's1', new Set(['a', 'b']));
  assert.deepEqual([...readSeen(storage, 's1')], ['a', 'b']);
  assert.equal(readSeen(storage, 's2').size, 0, 'another student on the same browser still sees it');
  storage.setItem(popupSeenKey('s3'), '{not json');
  assert.equal(readSeen(storage, 's3').size, 0);
  assert.doesNotThrow(() => writeSeen({ setItem() { throw new Error('blocked'); } }, 's1', ['x']));
  assert.doesNotThrow(() => readSeen(null, 's1'));
});

test('popups never interrupt tests, interview rooms, live sessions or the code editor', () => {
  for (const path of ['/student/dashboard', '/student/quickprep', '/problems', '/student/analysis/coding', '/student/assessments']) assert.equal(popupAllowedOn(path), true, path);
  for (const path of ['/student/assessment/abc', '/student/ai-interviews/room/1', '/student/session', '/student/change-password', '/problems/p1']) assert.equal(popupAllowedOn(path), false, path);
});
