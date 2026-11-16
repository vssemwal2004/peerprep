import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Announcement from '../src/models/Announcement.js';
import {
  createAnnouncement, listAnnouncementsStudent, parseShowAsPopup, updateAnnouncement,
} from '../src/controllers/announcementController.js';

// "Show as popup when students log in": stored on the announcement, editable, sent to students.
let mongo;
const admin = { _id: new mongoose.Types.ObjectId(), role: 'admin', email: 'admin@example.test' };

function capture() {
  const state = { statusCode: 200, body: null };
  return { state, status(code) { state.statusCode = code; return this; }, json(body) { state.body = body; return this; } };
}

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  await mongoose.connect(mongo.getUri(), { dbName: 'announcement_popup_test' });
  await Announcement.init();
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('the popup switch accepts form and JSON values, anything else is off', () => {
  for (const value of [true, 'true', 1, '1', 'on']) assert.equal(parseShowAsPopup(value), true, String(value));
  for (const value of [false, 'false', 0, '', null, undefined, 'yes', { $ne: false }]) assert.equal(parseShowAsPopup(value), false, String(value));
});

test('a popup announcement is created, listed for students and can be switched off', async () => {
  const created = capture();
  await createAnnouncement({ body: { title: 'Placement drive', message: 'Register by Friday', status: 'active', showAsPopup: true }, user: admin }, created);
  assert.equal(created.state.statusCode, 201);
  assert.equal(created.state.body.announcement.showAsPopup, true);

  const plain = capture();
  await createAnnouncement({ body: { title: 'Plain', message: 'No popup', status: 'active' }, user: admin }, plain);
  assert.equal(plain.state.body.announcement.showAsPopup, false, 'off unless asked for');

  const listed = capture();
  await listAnnouncementsStudent({ user: { role: 'student' } }, listed);
  const byTitle = Object.fromEntries(listed.state.body.announcements.map((item) => [item.title, item.showAsPopup]));
  assert.deepEqual(byTitle, { 'Placement drive': true, Plain: false });

  const updated = capture();
  await updateAnnouncement({ params: { id: String(created.state.body.announcement._id) }, body: { showAsPopup: 'false' }, user: admin }, updated);
  assert.equal(updated.state.body.announcement.showAsPopup, false);
});
