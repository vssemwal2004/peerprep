import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runForTenant } from '../src/platform/tenantContext.js';
import { accountLimit } from '../src/platform/accountLimits.js';
import { University, PlatformAccountCreationLock } from '../src/platform/models.js';
import User from '../src/models/User.js';

test('account limits stop concurrent student and coordinator creations and free slots after deletion', async (t) => {
  let mongo;
  try { mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } }); }
  catch (error) {
    if (error?.code === 'EPERM') return t.skip('Local sockets are unavailable in this sandbox');
    throw error;
  }
  process.env.PEERPREP_TENANT_SECRET_KEY = Buffer.alloc(32, 7).toString('base64');
  await mongoose.connect(mongo.getUri('main'));
  const connection = await mongoose.createConnection(mongo.getUri('north')).asPromise();
  const tenant = { universityId: 'north', connection };
  try {
    await Promise.all([University.createIndexes(), PlatformAccountCreationLock.createIndexes()]);
    await University.create({ universityId: 'north', name: 'North', studentLimit: 2, coordinatorLimit: 1 });
    await runForTenant(tenant, () => User.createIndexes());
    const attempts = await Promise.allSettled(Array.from({ length: 5 }, (_, index) => runForTenant(tenant, () => User.create({
      role: 'student', email: `student${index}@example.test`, name: `Student ${index}`, passwordHash: 'test-hash',
    }))));
    assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 2);
    assert.equal(attempts.filter((result) => result.status === 'rejected' && result.reason?.status === 409).length, 3);
    assert.equal(await runForTenant(tenant, () => User.countDocuments({ role: 'student' })), 2);
    await runForTenant(tenant, () => User.deleteOne({ role: 'student' }));
    const existingStudent = await runForTenant(tenant, () => User.findOne({ role: 'student' }).select('email').lean());
    await assert.rejects(runForTenant(tenant, () => User.create({ role: 'student', email: existingStudent.email, passwordHash: 'test-hash' })), (error) => error.code === 11000);
    await runForTenant(tenant, () => User.create({ role: 'student', email: 'replacement@example.test', passwordHash: 'test-hash' }));
    assert.equal(await runForTenant(tenant, () => User.countDocuments({ role: 'student' })), 2);
    await runForTenant(tenant, () => User.create({ role: 'coordinator', email: 'one@example.test', passwordHash: 'test-hash' }));
    await assert.rejects(runForTenant(tenant, () => User.create({ role: 'coordinator', email: 'two@example.test', passwordHash: 'test-hash' })), (error) => error.status === 409);
    assert.equal(accountLimit('0', 'student limit'), 0);
    assert.throws(() => accountLimit('-1', 'student limit'), /whole-number/);
  } finally {
    await connection.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
});
