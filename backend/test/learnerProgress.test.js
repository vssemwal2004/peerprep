import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import User from '../src/models/User.js';
import { acknowledgeLearnerProgress } from '../src/controllers/authController.js';

const originalFindById = User.findById;
afterEach(() => { User.findById = originalFindById; });

function stubUser(learnerProgress) {
  const doc = {
    learnerProgress,
    saved: 0,
    async save() { this.saved += 1; },
  };
  User.findById = () => ({ select: async () => doc });
  return doc;
}

function call(body, role = 'student') {
  const req = { user: { _id: 'u1', role }, body };
  let payload;
  const res = { json(value) { payload = value; } };
  return acknowledgeLearnerProgress(req, res).then(() => payload);
}

test('first acknowledgement records the level and only whitelisted awards', async () => {
  const doc = stubUser(undefined);
  const result = await call({ level: 2, title: 'Quick Solver', awards: ['first-accept', 'bogus', 'first-accept'] });
  assert.equal(doc.saved, 1);
  assert.equal(result.learnerProgress.celebratedLevel, 2);
  assert.equal(result.learnerProgress.levelHistory.length, 1);
  assert.equal(result.learnerProgress.levelHistory[0].level, 2);
  assert.deepEqual(result.learnerProgress.awards.map((a) => a.id), ['first-accept']);
});

test('is idempotent: same level and awards add nothing new', async () => {
  const earnedAt = new Date('2026-10-01T00:00:00Z');
  stubUser({
    celebratedLevel: 2,
    levelHistory: [{ level: 2, title: 'Quick Solver', achievedAt: earnedAt }],
    awards: [{ id: 'first-accept', earnedAt }],
  });
  const result = await call({ level: 2, title: 'Quick Solver', awards: ['first-accept'] });
  assert.equal(result.learnerProgress.levelHistory.length, 1);
  assert.equal(result.learnerProgress.awards.length, 1);
  assert.equal(result.learnerProgress.awards[0].earnedAt, earnedAt);
});

test('a lower level never lowers celebratedLevel or adds history', async () => {
  stubUser({ celebratedLevel: 3, levelHistory: [{ level: 3, title: 'Consistent Performer' }], awards: [] });
  const result = await call({ level: 1, title: 'Rising Learner', awards: [] });
  assert.equal(result.learnerProgress.celebratedLevel, 3);
  assert.equal(result.learnerProgress.levelHistory.length, 1);
});

test('rejects invalid levels and non-students', async () => {
  stubUser(undefined);
  await assert.rejects(call({ level: 9, awards: [] }), /Invalid level/);
  await assert.rejects(call({ level: 0, awards: [] }), /Invalid level/);
  await assert.rejects(call({ level: 2, awards: [] }, 'admin'), /Only students/);
});
