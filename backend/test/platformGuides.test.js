import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import GuideProgress from '../src/models/GuideProgress.js';
import { getPlatformGuideProgress, updatePlatformGuideProgress, validatePlatformGuideProgress } from '../src/modules/guides/guides.service.js';

let mongo;
let skipped = false;
const student = { _id: new mongoose.Types.ObjectId(), role: 'student' };
const coordinator = { _id: new mongoose.Types.ObjectId(), role: 'coordinator' };

before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } }); } catch (error) { if (error?.code === 'EPERM') { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: 'platform_guides_test' });
  await GuideProgress.init();
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('only well-formed guide ids are kept, once each', () => {
  const clean = validatePlatformGuideProgress({ completed: ['student.dashboard', 'student.dashboard', 'bad id!', '<x>'], dismissed: ['admin.library:quick'], nudgesOff: 'yes' });
  assert.deepEqual(clean, { completed: ['student.dashboard'], dismissed: ['admin.library:quick'] });
  assert.deepEqual(validatePlatformGuideProgress({ nudgesOff: true }), { completed: [], dismissed: [], nudgesOff: true });
  assert.deepEqual(validatePlatformGuideProgress(null), { completed: [], dismissed: [] });
});

test('each person keeps their own progress; finished tours are never lost; nudges can be switched back on', async (t) => {
  if (skipped) return t.skip('MongoDB memory server is not available here');
  assert.deepEqual(await getPlatformGuideProgress(student), { completed: [], dismissed: [], nudgesOff: false });
  await updatePlatformGuideProgress(student, { completed: ['student.dashboard'], dismissed: ['student.problems'] });
  const next = await updatePlatformGuideProgress(student, { completed: ['student.problems', 'student.dashboard'] });
  assert.deepEqual(next.completed, ['student.dashboard', 'student.problems']);
  assert.deepEqual(next.dismissed, ['student.problems']);
  assert.equal((await updatePlatformGuideProgress(student, { nudgesOff: true })).nudgesOff, true);
  assert.equal((await updatePlatformGuideProgress(student, { nudgesOff: false })).nudgesOff, false);
  assert.deepEqual((await getPlatformGuideProgress(coordinator)).completed, [], 'another person starts fresh');
  assert.equal(await GuideProgress.countDocuments({ userId: student._id }), 1);
  await assert.rejects(() => getPlatformGuideProgress({ _id: 'nope' }), /Sign in again/);
});
