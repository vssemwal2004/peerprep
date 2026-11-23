import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { STANDARD_STUDENT_FEATURES } from '../src/services/studentFeatureAccess.js';

test('peer network: same-university scope, private fields and Prep Mate states', async (t) => {
  let mongo;
  try { mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } }); }
  catch (error) {
    if (error?.code === 'EPERM') return t.skip('Local sockets are unavailable in this sandbox');
    throw error;
  }
  const previousRole = process.env.PEERPREP_DEPLOYMENT_ROLE;
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'shared';
  const connections = [];
  try {
    await import('../src/setup.js');
    const [{ runForTenant }, { default: User }, { default: Notification }, service, { PrepMate }] = await Promise.all([
      import('../src/platform/tenantContext.js'), import('../src/models/User.js'), import('../src/models/Notification.js'),
      import('../src/services/peerNetworkService.js'), import('../src/models/PeerNetwork.js'),
    ]);
    await mongoose.connect(mongo.getUri('platform'));
    // questions/learning off: those read the central content service, which this test does not run.
    const permissions = { questions: false, learning: false, interviews: true, events: true, assessments: true };
    const tenantFor = (universityId) => {
      const connection = mongoose.createConnection(mongo.getUri(universityId));
      connections.push(connection);
      return { universityId, connection, permissions, sources: {} };
    };
    const alpha = tenantFor('alpha');
    const beta = tenantFor('beta');
    const inAlpha = (work) => runForTenant(alpha, work);
    const inBeta = (work) => runForTenant(beta, work);

    const student = (name, extra = {}) => ({
      role: 'student', name, email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.test`, studentId: `ROLL-${name}`,
      phone: '9999999999', section: 'A', group: 'G1', course: 'B.Tech', branch: 'CSE', semester: 5,
      bio: 'Graph problems fan', linkedinUrl: 'linkedin.com/in/someone', githubUrl: 'javascript:alert(1)',
      // Prep Mates is opt-in: these students were given it by an admin.
      featureAccess: { mode: 'custom', features: [...STANDARD_STUDENT_FEATURES, 'peers'] },
      passwordHash: 'x', ...extra,
    });
    // Raw inserts: User.create reserves a university seat in the (absent) platform registry.
    const insertStudents = async (rows) => {
      const docs = rows.map((row) => ({ _id: new mongoose.Types.ObjectId(), ...row }));
      await User.collection.insertMany(docs);
      return docs;
    };
    const [asha, ravi, hidden, limited] = await inAlpha(async () => {
      await service.ensurePeerIndexes();
      return insertStudents([
        student('Asha Verma'), student('Ravi Kumar'), student('Hidden Person', { visibleToPeers: false }),
        student('Limited Access', { featureAccess: { mode: 'custom', features: ['prep_coding'] } }),
        // "All access" without the opt-in Prep Mates: never findable.
        student('Everyone Access', { featureAccess: { mode: 'all', features: [] } }),
      ]);
    });
    await inBeta(() => insertStudents([student('Asha Beta')]));

    // Search is name-only, same-university only, and skips self, hidden and peers-disabled students.
    const found = await inAlpha(() => service.searchPeers(asha, 'a'));
    assert.deepEqual(found.results, [], 'single-letter queries return nothing');
    const ashaSearch = await inAlpha(() => service.searchPeers(ravi, 'asha'));
    assert.deepEqual(ashaSearch.results.map((row) => row.name), ['Asha Verma'], 'beta university never appears');
    const everyone = await inAlpha(() => service.searchPeers(asha, 'er'));
    assert.ok(!everyone.results.some((row) => ['Asha Verma', 'Hidden Person', 'Limited Access', 'Everyone Access'].includes(row.name)));    assert.equal((await inAlpha(() => service.searchPeers(asha, 'ROLL-Ravi'))).results.length, 0, 'roll numbers are not searchable');
    assert.equal((await inAlpha(() => service.searchPeers(asha, '.*'))).results.length, 0, 'regex input is escaped');

    // Profile: allow-listed fields only, safe links only.
    const profile = await inAlpha(() => service.getPeerProfile(asha, ravi._id));
    const raw = JSON.stringify(profile);
    for (const secret of ['ravi.kumar@example.test', 'ROLL-Ravi Kumar', '9999999999', 'passwordHash', '"section"', '"group"', 'featureAccess']) {
      assert.ok(!raw.includes(secret), `peer profile must not expose ${secret}`);
    }
    assert.equal(profile.profile.name, 'Ravi Kumar');
    assert.equal(profile.profile.links.linkedin, 'https://linkedin.com/in/someone');
    assert.equal(profile.profile.links.github, '', 'javascript: links are dropped');
    assert.equal(profile.progress.unavailable, undefined, 'progress loads');
    assert.deepEqual(profile.progress.modules.map((module) => module.key), ['quickprep'], 'practice modules only: no assessment or interview records');
    // Exact allow-list of what another student receives.
    assert.deepEqual(Object.keys(profile.profile).sort(), ['avatarUrl', 'bio', 'branch', 'course', 'id', 'links', 'name', 'semester']);
    assert.deepEqual(Object.keys(profile.progress).sort(), ['activity', 'badgeFeatures', 'badgeMetrics', 'badges', 'coding', 'level', 'modules', 'quickPrepSheets']);
  // Which badge areas the classmate can use: booleans only, never counts or marks.
  assert.ok(Object.values(profile.progress.badgeFeatures).every((value) => typeof value === 'boolean'));

    // Heat map: practice submissions and completed topics count; assessment submissions and
    // logins never do.
    const day = (offset) => new Date(Date.UTC(2026, 10, 10 + offset, 9));
    await inAlpha(async () => {
      const { default: Submission } = await import('../src/models/Submission.js');
      const { default: Progress } = await import('../src/models/Progress.js');
      const { default: StudentActivity } = await import('../src/models/StudentActivity.js');
      await Submission.collection.insertMany([
        { user: ravi._id, mode: 'submit', status: 'AC', assessmentId: null, createdAt: day(0) },
        { user: ravi._id, mode: 'submit', status: 'WA', createdAt: day(0) },
        { user: ravi._id, mode: 'run', createdAt: day(1) },
        { user: ravi._id, mode: 'submit', status: 'AC', assessmentId: new mongoose.Types.ObjectId(), createdAt: day(2) },
      ]);
      await Progress.collection.insertOne({ studentId: ravi._id, topicId: new mongoose.Types.ObjectId(), completed: true, completedAt: day(3) });
      await StudentActivity.collection.insertOne({ studentId: ravi._id, activityType: 'LOGIN', date: day(4) });
    });
    const heat = await inAlpha(() => service.practiceActivity(ravi, { coding: true, learning: true }, day(5)));
    assert.deepEqual(heat, { byDate: { '2026-11-10': 2, '2026-11-13': 1 }, activeDays: 2 });
    for (const personal of ['prepCoins', 'prepScore', 'score', 'joinedAt', 'createdAt', 'percent', 'assessmentScore', 'interviewScore']) {
      assert.ok(!raw.includes(`"${personal}"`), `peer profile must not include ${personal}`);
    }
    assert.equal(profile.relation.mate, 'none');
    await assert.rejects(inAlpha(() => service.getPeerProfile(asha, hidden._id)), { status: 404 });
    await assert.rejects(inAlpha(() => service.getPeerProfile(asha, limited._id)), { status: 404 });
    await assert.rejects(inBeta(() => service.getPeerProfile(asha, ravi._id)), { status: 404 }, 'ids do not cross databases');

    // Badge metrics are counts only; no marks or dates leave the server.
    const withMetrics = await inAlpha(() => service.getPeerProfile(asha, ravi._id));
    assert.deepEqual(Object.keys(withMetrics.progress.badgeMetrics).sort(), ['activeDays', 'assessments', 'bestStreak', 'hardSolved', 'interviews', 'languages', 'solved']);
    assert.ok(Array.isArray(withMetrics.progress.quickPrepSheets));
    assert.deepEqual(withMetrics.network, { prepMates: 0 });
    await assert.rejects(inAlpha(() => service.requestPrepMate(asha, asha._id)), { status: 400 });
    await assert.rejects(inAlpha(() => service.requestPrepMate(hidden, ravi._id)), { status: 403 }, 'hidden students cannot act');

    // Prep Mate: request -> decline -> cooldown -> request after cooldown -> accept -> remove.
    let relation = (await inAlpha(() => service.requestPrepMate(asha, ravi._id))).relation;
    assert.equal(relation.mate, 'outgoing');
    relation = (await inAlpha(() => service.requestPrepMate(asha, ravi._id))).relation;
    assert.equal(relation.mate, 'outgoing', 'asking twice is idempotent');
    const incoming = await inAlpha(() => service.listNetwork(ravi, 'incoming'));
    assert.deepEqual(incoming.items.map((item) => item.name), ['Asha Verma']);
    const requestId = incoming.items[0].relation.requestId;
    await assert.rejects(inAlpha(() => service.respondPrepMateRequest(asha, requestId, 'accept')), { status: 409 }, 'only the recipient can answer');
    await inAlpha(() => service.respondPrepMateRequest(ravi, requestId, 'decline'));
    await assert.rejects(inAlpha(() => service.requestPrepMate(asha, ravi._id)), { status: 429 });
    await inAlpha(() => PrepMate.updateOne({ _id: requestId }, { $set: { declinedAt: new Date(Date.now() - service.MATE_REQUEST_COOLDOWN_MS - 1000) } }));
    relation = (await inAlpha(() => service.requestPrepMate(asha, ravi._id))).relation;
    assert.equal(relation.mate, 'outgoing');
    // Ravi asking back accepts the open request.
    relation = (await inAlpha(() => service.requestPrepMate(ravi, asha._id))).relation;
    assert.equal(relation.mate, 'mates');
    assert.equal(await inAlpha(() => Notification.countDocuments({ userId: asha._id, type: 'PREP_MATE_ACCEPTED' })), 1);
    assert.equal(await inAlpha(() => Notification.countDocuments({ userId: ravi._id, type: 'PREP_MATE_REQUEST' })), 2);
    assert.equal(await inAlpha(() => Notification.countDocuments({ userId: ravi._id, type: 'PREP_MATE_REQUEST', isRead: false })), 0,
      'answered requests (declined, then accepted) no longer count as unread');
    assert.deepEqual(await inAlpha(() => service.networkCounts(asha._id)), { prepMates: 1, incomingRequests: 0 });
    assert.deepEqual((await inAlpha(() => service.listNetwork(asha, 'mates'))).items.map((item) => item.name), ['Ravi Kumar']);
    // A classmate's Prep Mates list is viewable (the viewer is marked as "you"); requests are not.
    const ravisMates = await inAlpha(() => service.listNetwork(asha, 'mates', { ownerId: ravi._id }));
    assert.deepEqual(ravisMates.items.map((item) => [item.name, item.relation]), [['Asha Verma', { self: true }]]);
    await assert.rejects(inAlpha(() => service.listNetwork(asha, 'incoming', { ownerId: ravi._id })), { status: 404 });
    await assert.rejects(inAlpha(() => service.listNetwork(asha, 'mates', { ownerId: hidden._id })), { status: 404 });

    // Hiding a profile removes it from other students' counts and lists.
    await inAlpha(() => User.updateOne({ _id: asha._id }, { $set: { visibleToPeers: false } }));
    assert.equal((await inAlpha(() => service.networkCounts(ravi._id))).prepMates, 0);
    assert.deepEqual((await inAlpha(() => service.listNetwork(ravi, 'mates'))).items, []);
    await inAlpha(() => User.updateOne({ _id: asha._id }, { $set: { visibleToPeers: true } }));
    assert.equal((await inAlpha(() => service.networkCounts(ravi._id))).prepMates, 1);
    await inAlpha(() => service.removePrepMate(ravi, asha._id));
    assert.equal((await inAlpha(() => service.networkCounts(asha._id))).prepMates, 0);

    // Shared main database: classmates are grouped by institution-managed college, like rankings.
    const [geuA, geuB, gehu, noCollege] = await insertStudents([
      student('Geu Alpha', { college: 'GEU' }), student('Geu Beta', { college: ' geu ' }),
      student('Gehu Gamma', { college: 'GEHU' }), student('Nowhere Delta'),
    ]);
    assert.deepEqual((await service.searchPeers(geuA, 'ge')).results.map((row) => row.name), ['Geu Beta'], 'GEHU never mixes with GEU');
    await assert.rejects(service.getPeerProfile(geuA, gehu._id), { status: 404 });
    await assert.rejects(service.requestPrepMate(geuA, gehu._id), { status: 404 });
    await assert.rejects(service.searchPeers(noCollege, 'geu'), { status: 404 }, 'no college, no peer network');
    await service.requestPrepMate(geuA, geuB._id);
    await service.requestPrepMate(geuB, geuA._id);
    assert.equal((await service.networkCounts(geuB._id)).prepMates, 1);
    // A Prep Mate who moves to another college stops counting and cannot be opened from the old one.
    await User.collection.updateOne({ _id: geuA._id }, { $set: { college: 'GEHU' } });
    assert.equal((await service.networkCounts(geuB._id)).prepMates, 0);
    await assert.rejects(service.getPeerProfile(geuB, geuA._id), { status: 404 });
    // Alpha's ids are not in the shared database.
    await assert.rejects(service.getPeerProfile(geuB, ravi._id), { status: 404 });
  } finally {
    if (previousRole === undefined) delete process.env.PEERPREP_DEPLOYMENT_ROLE;
    else process.env.PEERPREP_DEPLOYMENT_ROLE = previousRole;
    await Promise.all(connections.map((connection) => connection.close()));
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test('students cannot change their own college, course or branch', async () => {
  const { updateMe } = await import('../src/controllers/authController.js');
  const { default: User } = await import('../src/models/User.js');
  const saved = [];
  const original = User.findById;
  const doc = { _id: 'u1', role: 'student', college: 'GEU', course: 'B.Tech', branch: 'CSE', bio: '', save: async () => { saved.push({ ...doc }); } };
  User.findById = async () => doc;
  try {
    const res = { json: () => {} };
    await updateMe({ user: { _id: 'u1', role: 'student', email: 'x@example.test' }, body: { college: 'GEHU', course: 'MCA', branch: 'ECE', bio: 'hi' }, headers: {}, ip: '127.0.0.1' }, res);
  } finally {
    User.findById = original;
  }
  assert.equal(doc.college, 'GEU');
  assert.equal(doc.course, 'B.Tech');
  assert.equal(doc.branch, 'CSE');
  assert.equal(doc.bio, 'hi');
});

test('safeLink keeps only http(s) links', async () => {
  const { safeLink } = await import('../src/services/peerNetworkService.js');
  assert.equal(safeLink('github.com/me'), 'https://github.com/me');
  assert.equal(safeLink('http://example.test/x'), 'http://example.test/x');
  assert.equal(safeLink('javascript:alert(1)'), '');
  assert.equal(safeLink('data:text/html,hi'), '');
  assert.equal(safeLink(''), '');
});
