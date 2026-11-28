import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

test('Prep Mates analysis respects opt-in, campus scope and dated activity', async (t) => {
  let mongo;
  try { mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } }); }
  catch (error) {
    if (error?.code === 'EPERM') return t.skip('Local sockets are unavailable in this sandbox');
    throw error;
  }
  try {
    await import('../src/setup.js');
    const [{ default: User }, { PrepMate, PrepMateNudge }, { default: Submission }, { getPrepMatesAnalysis }] = await Promise.all([
      import('../src/models/User.js'), import('../src/models/PeerNetwork.js'), import('../src/models/Submission.js'),
      import('../src/modules/prepAnalysis/prepMatesAnalysis.js'),
    ]);
    await mongoose.connect(mongo.getUri('prep_mates_analysis'));
    const enabled = { mode: 'custom', features: ['peers'] };
    const student = (name, college = 'Alpha', extra = {}) => ({ _id: new mongoose.Types.ObjectId(), role: 'student',
      name, email: `${name.toLowerCase()}@example.test`, studentId: name, passwordHash: 'x', college, semester: 5,
      featureAccess: enabled, isActive: true, ...extra });
    const [asha, ben, eve, hidden, other] = [student('Asha'), student('Ben'), student('Eve', 'Alpha', { semester: 6 }),
      student('Hidden', 'Alpha', { featureAccess: { mode: 'all' } }), student('Other', 'Beta')];
    await User.collection.insertMany([asha, ben, eve, hidden, other]);
    const now = new Date();
    const old = new Date(now.getTime() - 60 * 86400000);
    await PrepMate.collection.insertMany([
      { pairKey: 'a-b', fromId: asha._id, toId: ben._id, status: 'accepted', requestedAt: old, respondedAt: old },
      { pairKey: 'b-e', fromId: ben._id, toId: eve._id, status: 'pending', requestedAt: now },
      { pairKey: 'a-o', fromId: asha._id, toId: other._id, status: 'accepted', requestedAt: now, respondedAt: now },
      { pairKey: 'b-h', fromId: ben._id, toId: hidden._id, status: 'pending', requestedAt: now },
    ]);
    await PrepMateNudge.collection.insertMany([
      { key: 'a-b', fromId: asha._id, toId: ben._id, sentAt: now },
      { key: 'a-o', fromId: asha._id, toId: other._id, sentAt: now },
    ]);
    const problem = new mongoose.Types.ObjectId();
    await Submission.collection.insertMany([
      { user: asha._id, problem, mode: 'submit', status: 'AC', assessmentId: null, createdAt: now },
      { user: asha._id, problem, mode: 'submit', status: 'AC', assessmentId: null, createdAt: now },
      { user: ben._id, problem: new mongoose.Types.ObjectId(), mode: 'submit', status: 'AC', assessmentId: null, createdAt: now },
    ]);
    const report = await getPrepMatesAnalysis({ user: { role: 'admin' }, query: { range: '30d', college: 'Alpha' } });
    assert.equal(report.summary.eligible, 3);
    assert.equal(report.summary.connected, 2);
    assert.equal(report.summary.acceptedLinks, 1);
    assert.equal(report.summary.pendingRequests, 1);
    assert.equal(report.summary.latestRequests, 1, 'old accepted request is not a new request');
    assert.equal(report.summary.pings, 1);
    assert.equal(report.summary.averageSolvedConnected, 1, 'duplicate accepted attempts count as one problem');
    assert.equal(report.students.rows.find((row) => row.name === 'Ben').pendingSent, 1);
    assert.ok(!report.students.rows.some((row) => row.name === 'Hidden' || row.name === 'Other'));
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
