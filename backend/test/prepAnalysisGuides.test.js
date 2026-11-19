import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import PrepAnalysisGuideProgress from '../src/models/PrepAnalysisGuideProgress.js';
import { GUIDE_MILESTONES, getGuideProgress, updateGuideProgress, validateGuideProgress } from '../src/modules/prepAnalysis/prepAnalysis.guides.js';

let mongo;
let skipped = false;
const asha = { _id: new mongoose.Types.ObjectId(), role: 'admin' };
const bilal = { _id: new mongoose.Types.ObjectId(), role: 'admin' };

before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } }); } catch (error) { if (error?.code === 'EPERM') { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: 'prep_analysis_guides_test' });
  await PrepAnalysisGuideProgress.init();
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('progress only accepts known milestones and well-formed guide ids', () => {
  const clean = validateGuideProgress({ completed: ['chart:top-students', 'chart:top-students', 'bad id!', 7], milestones: ['filter', 'hack'], welcomeDismissed: 'yes', checklistDismissed: true });
  assert.deepEqual(clean, { completed: ['chart:top-students', '7'], milestones: ['filter'], checklistDismissed: true });
  assert.ok(GUIDE_MILESTONES.includes('savedView'));
});

test('each admin keeps their own progress; it only grows, and the cards can be closed and reopened', async (t) => {
  if (skipped) return t.skip('MongoDB memory server is not available here');
  assert.deepEqual(await getGuideProgress(asha), { completed: [], milestones: [], welcomeDismissed: false, checklistDismissed: false }, 'nothing saved yet');
  await updateGuideProgress(asha, { completed: ['page:tour'], milestones: ['pageTour'], welcomeDismissed: true });
  const after = await updateGuideProgress(asha, { completed: ['chart:practice-funnel', 'page:tour'], milestones: ['studentList'] });
  assert.deepEqual(after.completed, ['page:tour', 'chart:practice-funnel'], 'added once, never removed');
  assert.deepEqual(after.milestones, ['pageTour', 'studentList']);
  assert.equal(after.welcomeDismissed, true);
  assert.equal((await updateGuideProgress(asha, { checklistDismissed: true })).checklistDismissed, true);
  assert.equal((await updateGuideProgress(asha, { checklistDismissed: false })).checklistDismissed, false, 'the checklist can be shown again');
  assert.deepEqual((await getGuideProgress(bilal)).completed, [], 'another admin starts fresh');
  assert.equal(await PrepAnalysisGuideProgress.countDocuments({ userId: asha._id }), 1, 'one record per admin');
});
