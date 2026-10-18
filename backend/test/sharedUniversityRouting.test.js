import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

test('one API isolates university users, sessions and student lists with duplicate IDs', async (t) => {
  let mongo;
  try { mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } }); }
  catch (error) {
    if (error?.code === 'EPERM') return t.skip('Local sockets are unavailable in this sandbox');
    throw error;
  }
  const previous = Object.fromEntries(['PEERPREP_DEPLOYMENT_ROLE', 'PEERPREP_TENANT_SECRET_KEY', 'JWT_SECRET', 'FRONTEND_ORIGIN', 'PEERPREP_SHARED_API_ORIGIN']
    .map((name) => [name, process.env[name]]));
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'shared';
  process.env.PEERPREP_TENANT_SECRET_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.JWT_SECRET = 'test-shared-university-key-strong-enough';
  process.env.FRONTEND_ORIGIN = 'http://127.0.0.1:5173';
  let server;
  try {
    await import('../src/setup.js');
    const [{ default: app }, { University }, { encryptTenantSecret }, { testTenantConnection, getTenant, closeTenantConnections },
      { runForTenant }, { default: User }] = await Promise.all([
      import('../src/setupApp.js'), import('../src/platform/models.js'), import('../src/platform/tenantSecrets.js'),
      import('../src/platform/tenantConnections.js'), import('../src/platform/tenantContext.js'), import('../src/models/User.js'),
    ]);
    await mongoose.connect(mongo.getUri('platform'));
    for (const id of ['alpha', 'beta']) {
      const uri = mongo.getUri(id);
      await testTenantConnection(uri, id, { claim: true });
      await University.create({ universityId: id, name: id, apiKeyHash: 'a'.repeat(64),
        dbUriEncrypted: encryptTenantSecret(uri), judge0UrlEncrypted: encryptTenantSecret('http://127.0.0.1:2358') });
    }
    const sharedId = new mongoose.Types.ObjectId();
    const sharedStudentId = new mongoose.Types.ObjectId();
    for (const id of ['alpha', 'beta']) {
      const tenant = await getTenant(id);
      await runForTenant(tenant, async () => {
        await User.create({ _id: sharedId, role: 'admin', email: 'admin@example.test',
          passwordHash: await User.hashPassword(id === 'alpha' ? 'alpha-password' : 'beta-password') });
        await User.create({ _id: sharedStudentId, role: 'student', email: 'student@example.test',
          name: `${id} student`, studentId: 'same-student-id', passwordHash: await User.hashPassword('student-password') });
      });
    }
    await User.create({ role: 'admin', email: 'platform@example.test',
      passwordHash: await User.hashPassword('platform-password') });
    await User.create({ role: 'coordinator', name: 'PeerPrep coordinator', email: 'peerprep-coordinator@example.test',
      coordinatorId: 'PEERPREP-C1', passwordHash: await User.hashPassword('coordinator-password') });
    await User.create({ role: 'student', name: 'PeerPrep student', email: 'peerprep-student@example.test',
      studentId: 'PEERPREP-S1', teacherIds: ['PEERPREP-C1'], passwordHash: await User.hashPassword('student-password') });
    server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    process.env.PEERPREP_SHARED_API_ORIGIN = origin;
    const [{ default: QuestionLibrary }, { sharedQuestions }] = await Promise.all([
      import('../src/models/QuestionLibrary.js'), import('../src/platform/sharedContent.js'),
    ]);
    await QuestionLibrary.collection.insertOne({ sourceKey: 'shared:mcq', sourceType: 'manual', status: 'published',
      visibility: 'public', questionType: 'mcq', questionText: 'Shared MCQ', questionData: { options: ['A', 'B'], correctOptionIndex: 0 } });
    const sharedRows = await runForTenant(await getTenant('alpha'), () => sharedQuestions());
    assert.ok(sharedRows.some((row) => row.questionText === 'Shared MCQ'));
    const login = async (id, password) => {
      const response = await fetch(`${origin}/api/u/${id}/auth/login`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'admin@example.test', password }) });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie').split(';')[0];
    };
    const alphaCookie = await login('alpha', 'alpha-password');
    const betaCookie = await login('beta', 'beta-password');
    const platformLogin = await fetch(`${origin}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'platform@example.test', password: 'platform-password' }) });
    assert.equal(platformLogin.status, 200);
    const platformCookie = platformLogin.headers.get('set-cookie').split(';')[0];
    const mainCoordinatorLogin = await fetch(`${origin}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'peerprep-coordinator@example.test', password: 'coordinator-password' }) });
    assert.equal(mainCoordinatorLogin.status, 200);
    assert.equal((await mainCoordinatorLogin.json()).user.universityId, null);
    const mainCoordinatorCookie = mainCoordinatorLogin.headers.get('set-cookie').split(';')[0];
    const mainCoordinatorWallet = await fetch(`${origin}/api/wallet`, { headers: { Cookie: mainCoordinatorCookie } });
    assert.equal(mainCoordinatorWallet.status, 200);
    assert.equal((await mainCoordinatorWallet.json()).balance, 0);
    const mainStudentLogin = await fetch(`${origin}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'peerprep-student@example.test', password: 'student-password' }) });
    assert.equal(mainStudentLogin.status, 200);
    const mainStudentWallet = await fetch(`${origin}/api/wallet`, {
      headers: { Cookie: mainStudentLogin.headers.get('set-cookie').split(';')[0] },
    });
    assert.equal(mainStudentWallet.status, 200);
    assert.equal((await mainStudentWallet.json()).balance, 0);
    const mainRecipientSearch = await fetch(`${origin}/api/platform/admin/wallet-recipients?role=student&search=peerprep-student`, {
      headers: { Cookie: platformCookie },
    });
    assert.equal(mainRecipientSearch.status, 200);
    assert.equal((await mainRecipientSearch.json()).recipients.length, 1);
    const blockedRecipientSearch = await fetch(`${origin}/api/platform/admin/wallet-recipients?role=student&search=peerprep-student`, {
      headers: { Cookie: mainCoordinatorCookie },
    });
    assert.equal(blockedRecipientSearch.status, 403);
    const gammaUri = mongo.getUri('gamma');
    const testDatabase = (universityId, dbUri) => fetch(`${origin}/api/platform/admin/universities/test-database`, {
      method: 'POST', headers: { Cookie: platformCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ universityId, dbUri }),
    });
    const unauthorizedCheck = await fetch(`${origin}/api/platform/admin/universities/test-database`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ universityId: 'gamma', dbUri: mongo.getUri('gamma') }),
    });
    assert.equal(unauthorizedCheck.status, 401);
    const connectionCheck = await testDatabase('gamma', gammaUri);
    assert.equal(connectionCheck.status, 200, await connectionCheck.text());
    const uncheckedConnection = await mongoose.createConnection(gammaUri).asPromise();
    assert.equal(await uncheckedConnection.collection('peerprep_deployment_identity').findOne({ _id: 'deployment' }), null);
    await uncheckedConnection.close();
    assert.equal(await University.countDocuments({ universityId: 'gamma' }), 0);
    const unreachableDatabase = await testDatabase('gamma', 'mongodb://127.0.0.1:1/gamma');
    assert.equal(unreachableDatabase.status, 422);
    assert.equal(await University.countDocuments({ universityId: 'gamma' }), 0);
    const wrongDatabase = await testDatabase('gamma', mongo.getUri('alpha'));
    assert.equal(wrongDatabase.status, 422);
    const gamma = await fetch(`${origin}/api/platform/admin/universities`, { method: 'POST',
      headers: { Cookie: platformCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ universityId: 'gamma', name: 'Gamma University',
        serviceStartDate: '2020-01-01', serviceEndDate: '2099-12-31', coordinatorLimit: 100, studentLimit: 10000,
        dbUri: gammaUri, judge0Url: 'http://127.0.0.1:2358',
        adminEmail: 'gamma-admin@example.test', adminPassword: 'gamma-password-strong' }) });
    const gammaBody = await gamma.json();
    assert.equal(gamma.status, 201, JSON.stringify(gammaBody));
    assert.equal(gammaBody.apiKey, undefined);
    const rejectedReplacement = await fetch(`${origin}/api/platform/admin/universities/gamma`, {
      method: 'PATCH', headers: { Cookie: platformCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbUri: mongo.getUri('alpha') }),
    });
    assert.equal(rejectedReplacement.status, 422);
    assert.equal((await getTenant('gamma')).connection.name, 'gamma');
    const retiredKeyRequest = await fetch(`${origin}/api/platform/tenant/policy`, {
      headers: { 'X-PeerPrep-University': 'alpha', 'X-PeerPrep-Key': 'a'.repeat(64) },
    });
    assert.equal(retiredKeyRequest.status, 401);
    const existingUri = mongo.getUri('existing');
    await testTenantConnection(existingUri, 'existing', { claim: true });
    const existingConnection = await mongoose.createConnection(existingUri).asPromise();
    await existingConnection.collection('users').insertOne({ role: 'admin', email: 'existing-admin@example.test',
      passwordHash: await User.hashPassword('existing-password'), isActive: true });
    await existingConnection.close();
    const existingRegistration = await fetch(`${origin}/api/platform/admin/universities`, { method: 'POST',
      headers: { Cookie: platformCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ universityId: 'existing', name: 'Existing University', dbUri: existingUri,
        serviceStartDate: '2020-01-01', serviceEndDate: '2099-12-31', coordinatorLimit: 100, studentLimit: 10000,
        judge0Url: 'http://127.0.0.1:2358', adminEmail: 'existing-admin@example.test',
        adminPassword: 'unused-password-strong' }) });
    assert.equal(existingRegistration.status, 201, await existingRegistration.text());
    const existingLogin = await fetch(`${origin}/api/u/existing/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'existing-admin@example.test', password: 'existing-password' }) });
    assert.equal(existingLogin.status, 200);
    const gammaCookie = await (async () => {
      const response = await fetch(`${origin}/api/u/gamma/auth/login`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'gamma-admin@example.test', password: 'gamma-password-strong' }) });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie').split(';')[0];
    })();
    const rootUniversityLogin = await fetch(`${origin}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'gamma-admin@example.test', password: 'gamma-password-strong' }) });
    assert.equal(rootUniversityLogin.status, 200);
    assert.equal((await rootUniversityLogin.json()).user.universityId, 'gamma');
    const rootCookie = rootUniversityLogin.headers.get('set-cookie').split(';')[0];
    const rootSession = await fetch(`${origin}/api/u/gamma/auth/me`, { headers: { Cookie: rootCookie } });
    assert.equal(rootSession.status, 200);
    const ambiguousLogin = await fetch(`${origin}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@example.test', password: 'alpha-password' }) });
    assert.equal(ambiguousLogin.status, 409);
    const ambiguousWrongPassword = await fetch(`${origin}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@example.test', password: 'wrong-password' }) });
    assert.equal(ambiguousWrongPassword.status, 401);
    const idOnlyLogin = await fetch(`${origin}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'same-student-id', password: 'student-password' }) });
    assert.equal(idOnlyLogin.status, 400);
    const { backfillLoginDirectory, loginDirectoryComplete, loginDirectoryCandidates } = await import('../src/platform/loginDirectory.js');
    assert.equal(await loginDirectoryComplete(), false);
    await backfillLoginDirectory();
    assert.equal(await loginDirectoryComplete(), true);
    assert.equal((await loginDirectoryCandidates('admin@example.test')).length, 2);
    const latePasswordHash = await User.hashPassword('late-password');
    await runForTenant(await getTenant('gamma'), () => User.create({ role: 'student', email: 'late@example.test',
      studentId: 'late-001', passwordHash: latePasswordHash }));
    assert.equal((await loginDirectoryCandidates('late@example.test')).length, 1);
    const indexedLogin = await fetch(`${origin}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'late@example.test', password: 'late-password' }) });
    assert.equal(indexedLogin.status, 200);
    assert.equal((await indexedLogin.json()).user.universityId, 'gamma');
    assert.equal((await getTenant('gamma')).universityId, 'gamma');
    const get = (id, path, cookie) => fetch(`${origin}/api/u/${id}${path}`, { headers: { Cookie: cookie } });
    const cross = await get('beta', '/auth/me', alphaCookie);
    assert.equal(cross.status, 401);
    const alpha = await get('alpha', '/students/list', alphaCookie);
    const beta = await get('beta', '/students/list', betaCookie);
    const gammaMe = await get('gamma', '/auth/me', gammaCookie);
    assert.equal(alpha.status, 200);
    assert.equal(beta.status, 200);
    assert.equal(gammaMe.status, 200);
    assert.match(JSON.stringify(await alpha.json()), /alpha student/);
    assert.match(JSON.stringify(await beta.json()), /beta student/);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    const { closeTenantConnections } = await import('../src/platform/tenantConnections.js');
    await closeTenantConnections();
    const { resetAdminAnalyticsInvalidationForTests } = await import('../src/modules/adminAnalytics/adminAnalytics.invalidation.js');
    resetAdminAnalyticsInvalidationForTests();
    const { closeValkeyClient } = await import('../src/utils/valkey.js');
    await closeValkeyClient();
    await mongoose.disconnect();
    await mongo.stop();
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
