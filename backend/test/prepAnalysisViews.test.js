import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import PrepAnalysisView from '../src/models/PrepAnalysisView.js';
import { createView, deleteView, listViews, updateView, validateViewBody, VIEW_LIMITS } from '../src/modules/prepAnalysis/prepAnalysis.views.js';

let mongo;
let skipped = false;
const asha = { _id: new mongoose.Types.ObjectId(), name: 'Asha (admin)', role: 'admin' };
const bilal = { _id: new mongoose.Types.ObjectId(), name: 'Bilal (admin)', role: 'admin' };
const state = { area: 'coding', range: { preset: '90d' }, groups: [{ id: 'g1', rules: [{ field: 'student.branch', operator: 'anyOf', value: ['CSE'] }] }], rank: { join: 'and', rules: [] } };

before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } }); } catch (error) { if (error?.code === 'EPERM') { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: 'prep_analysis_views_test' });
  await PrepAnalysisView.init();
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('a view is saved with its filters and charts, and only its owner can change it', async (t) => {
  if (skipped) return t.skip('MongoDB memory server is not available here');
  const saved = await createView({ user: asha, body: { name: '  Sem 5 CSE  ', area: 'coding', state, layout: [{ id: 'top-students', options: {} }] } });
  assert.equal(saved.name, 'Sem 5 CSE');
  assert.equal(saved.mine, true);
  assert.equal(saved.shared, false);
  assert.deepEqual(saved.state.range, { preset: '90d' });

  assert.equal((await listViews({ user: bilal })).views.length, 0, 'a private view is not listed for other admins');
  await assert.rejects(updateView({ user: bilal, id: saved.id, body: { name: 'mine now' } }), (error) => error.status === 404 || error.statusCode === 404);

  const shared = await updateView({ user: asha, id: saved.id, body: { shared: true } });
  assert.equal(shared.shared, true);
  const seen = (await listViews({ user: bilal })).views;
  assert.equal(seen.length, 1);
  assert.equal(seen[0].mine, false, 'shared views are read-only for others');
  assert.equal(seen[0].ownerName, 'Asha (admin)');
  await assert.rejects(updateView({ user: bilal, id: saved.id, body: { name: 'x' } }), (error) => error.status === 403 || error.statusCode === 403);
  await assert.rejects(deleteView({ user: bilal, id: saved.id }), (error) => error.status === 403 || error.statusCode === 403);

  const renamed = await updateView({ user: asha, id: saved.id, body: { name: 'Sem 5 CSE weekly' } });
  assert.equal(renamed.name, 'Sem 5 CSE weekly');
  assert.deepEqual(renamed.state.groups, state.groups, 'a rename keeps the filters');
  assert.deepEqual(await deleteView({ user: asha, id: saved.id }), { deleted: true });
  assert.equal((await listViews({ user: asha })).views.length, 0);
});

test('views are checked: a name, a known area, filters, a size limit and a per-admin limit', async (t) => {
  if (skipped) return t.skip('MongoDB memory server is not available here');
  assert.throws(() => validateViewBody({ name: ' ', area: 'coding', state }), /name/);
  assert.throws(() => validateViewBody({ name: 'x', area: 'nope', state }), /Unknown analysis area/);
  assert.throws(() => validateViewBody({ name: 'x', area: 'coding' }), /filters/);
  assert.throws(() => validateViewBody({ name: 'x', area: 'coding', state: { ...state, junk: 'a'.repeat(VIEW_LIMITS.maxBytes) } }), (error) => error.status === 413 || error.statusCode === 413);
  assert.throws(() => validateViewBody({ name: 'x', area: 'learning', state }, { questions: true, learning: false }), /Unknown analysis area/, 'an unlicensed area cannot be saved');

  await PrepAnalysisView.insertMany(Array.from({ length: VIEW_LIMITS.perOwner }, (_, index) => ({ ownerId: bilal._id, name: `View ${index}`, area: 'coding', state })));
  await assert.rejects(createView({ user: bilal, body: { name: 'One too many', area: 'coding', state } }), (error) => error.status === 409 || error.statusCode === 409);
});
