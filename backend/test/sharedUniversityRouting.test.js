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
    // Still signed in elsewhere: the login asks first (200, no cookie) and the old session keeps working.
    const firstStudentCookie = mainStudentLogin.headers.get('set-cookie').split(';')[0];
    const studentIdLogin = (extra = {}, headers = {}) => fetch(`${origin}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', ...headers },
      body: JSON.stringify({ identifier: 'PEERPREP-S1', password: 'student-password', ...extra }) });
    const askedLogin = await studentIdLogin();
    const askedPayload = await askedLogin.json();
    assert.equal(askedLogin.status, 200, JSON.stringify(askedPayload));
    assert.equal(askedPayload.user, undefined);
    assert.ok(askedPayload.sessionConflict?.signedInAt, JSON.stringify(askedPayload));
    assert.equal(askedLogin.headers.get('set-cookie'), null);
    assert.equal((await fetch(`${origin}/api/auth/session`, { headers: { Cookie: firstStudentCookie } })).status, 200);
    // The same browser signing in again is not asked.
    const sameBrowser = await studentIdLogin({}, { Cookie: firstStudentCookie });
    assert.ok((await sameBrowser.json()).user);
    const sameBrowserCookie = sameBrowser.headers.get('set-cookie').split(';')[0];
    // Ending the other session: the new one works, the old one is told where the account was signed in.
    const mainStudentIdLogin = await studentIdLogin({ replaceSession: true });
    const mainStudentIdPayload = await mainStudentIdLogin.json();
    assert.equal(mainStudentIdLogin.status, 200, JSON.stringify(mainStudentIdPayload));
    assert.equal(mainStudentIdPayload.user.universityId, null);
    const replacingCookie = mainStudentIdLogin.headers.get('set-cookie').split(';')[0];
    const replaced = await fetch(`${origin}/api/auth/session`, { headers: { Cookie: sameBrowserCookie } });
    const replacedPayload = await replaced.json();
    assert.equal(replaced.status, 401);
    assert.equal(replacedPayload.code, 'SESSION_REPLACED');
    assert.equal(replacedPayload.session.device, 'Chrome on Windows');
    // An old session signing out leaves the new one alone; the new one signing out ends it on the server.
    await fetch(`${origin}/api/auth/logout`, { method: 'POST', headers: { Cookie: sameBrowserCookie } });
    assert.equal((await fetch(`${origin}/api/auth/session`, { headers: { Cookie: replacingCookie } })).status, 200);
    await fetch(`${origin}/api/auth/logout`, { method: 'POST', headers: { Cookie: replacingCookie } });
    const afterSignOut = await fetch(`${origin}/api/auth/session`, { headers: { Cookie: replacingCookie } });
    assert.equal(afterSignOut.status, 401);
    assert.equal((await afterSignOut.json()).code, 'SESSION_ENDED');
    const freshLogin = await studentIdLogin();
    assert.ok((await freshLogin.json()).user, 'after signing out, the next sign-in is not asked');
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
    assert.match((await unreachableDatabase.json()).error, /Could not connect to MongoDB/);
    assert.equal(await University.countDocuments({ universityId: 'gamma' }), 0);
    const wrongDatabase = await testDatabase('gamma', mongo.getUri('alpha'));
    assert.equal(wrongDatabase.status, 422);
    assert.match((await wrongDatabase.json()).error, /already claimed by another/);
    const occupiedUri = mongo.getUri('occupied');
    const occupiedConnection = await mongoose.createConnection(occupiedUri).asPromise();
    await occupiedConnection.collection('users').insertOne({ role: 'student' });
    await occupiedConnection.close();
    const occupiedDatabase = await testDatabase('gamma', occupiedUri);
    assert.equal(occupiedDatabase.status, 422);
    assert.match((await occupiedDatabase.json()).error, /already contains data/);
    const gamma = await fetch(`${origin}/api/platform/admin/universities`, { method: 'POST',
      headers: { Cookie: platformCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ universityId: 'gamma', name: 'Gamma University',
        serviceStartDate: '2020-01-01', serviceEndDate: '2099-12-31', coordinatorLimit: 100, studentLimit: 10000,
        dbUri: gammaUri, judge0Url: 'http://127.0.0.1:2358',
        adminEmail: 'gamma-admin@example.test', adminPassword: 'gamma-password-strong',
        limitedAdminEmail: 'gamma-content@example.test', limitedAdminPassword: 'gamma-content-password' }) });
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
        adminPassword: 'unused-password-strong', limitedAdminEmail: 'existing-content@example.test',
        limitedAdminPassword: 'existing-content-password' }) });
    assert.equal(existingRegistration.status, 201, await existingRegistration.text());
    const existingLogin = await fetch(`${origin}/api/u/existing/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'existing-admin@example.test', password: 'existing-password' }) });
    assert.equal(existingLogin.status, 200);
    const limitedLogin = await fetch(`${origin}/api/u/gamma/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'gamma-content@example.test', password: 'gamma-content-password' }) });
    assert.equal(limitedLogin.status, 200);
    assert.equal((await limitedLogin.json()).user.adminAccess, 'limited');
    const limitedCookie = limitedLogin.headers.get('set-cookie').split(';')[0];
    const limitedMe = await fetch(`${origin}/api/u/gamma/auth/me`, { headers: { Cookie: limitedCookie } });
    assert.equal((await limitedMe.json()).adminAccess, 'limited');
    const blockedStudentId = String(sharedStudentId);
    for (const [method, path] of [
      ['POST', '/students/create'], ['PUT', `/students/${blockedStudentId}`],
      ['DELETE', `/students/${blockedStudentId}`], ['POST', '/students/access/bulk'],
      ['POST', '/coordinators/create'], ['POST', '/coordinators/bulk-create'],
      ['DELETE', `/bulk-uploads/${blockedStudentId}`],
    ]) {
      const response = await fetch(`${origin}/api/u/gamma${path}`, { method,
        headers: { Cookie: limitedCookie, 'Content-Type': 'application/json' }, body: method === 'DELETE' ? undefined : '{}' });
      assert.equal(response.status, 403, `${method} ${path}: ${await response.text()}`);
    }
    const limitedStudents = await fetch(`${origin}/api/u/gamma/students/list`, { headers: { Cookie: limitedCookie } });
    assert.equal(limitedStudents.status, 200);
    const limitedCoordinators = await fetch(`${origin}/api/u/gamma/coordinators/list`, { headers: { Cookie: limitedCookie } });
    assert.equal(limitedCoordinators.status, 200);
    const blockedCandidateCreation = await fetch(`${origin}/api/u/gamma/admin/assessment/create`, {
      method: 'POST', headers: { Cookie: limitedCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedStudents: [{ name: 'New student', email: 'new@example.test', studentid: 'NEW-1' }] }),
    });
    assert.equal(blockedCandidateCreation.status, 403);
    const disablePrepFeatures = await fetch(`${origin}/api/platform/admin/universities/gamma`, {
      method: 'PATCH', headers: { Cookie: platformCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: { quickprep: false, prepmock: false } }),
    });
    assert.equal(disablePrepFeatures.status, 200, await disablePrepFeatures.text());
    for (const path of ['/quests', '/admin/assessment/mock-companies', '/admin/library/questions?scope=mock']) {
      const response = await fetch(`${origin}/api/u/gamma${path}`, { headers: { Cookie: limitedCookie } });
      assert.equal(response.status, 403, `${path}: ${await response.text()}`);
    }
    const enablePrepFeatures = await fetch(`${origin}/api/platform/admin/universities/gamma`, {
      method: 'PATCH', headers: { Cookie: platformCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: { quickprep: true, prepmock: true } }),
    });
    assert.equal(enablePrepFeatures.status, 200, await enablePrepFeatures.text());
    const gammaCookie = await (async () => {
      const response = await fetch(`${origin}/api/u/gamma/auth/login`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'gamma-admin@example.test', password: 'gamma-password-strong' }) });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie').split(';')[0];
    })();
    // Signed in through /u/gamma already: the root login ends that session (university sessions ask too).
    const rootUniversityAsked = await fetch(`${origin}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'gamma-admin@example.test', password: 'gamma-password-strong' }) });
    assert.ok((await rootUniversityAsked.json()).sessionConflict);
    const rootUniversityLogin = await fetch(`${origin}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'gamma-admin@example.test', password: 'gamma-password-strong', replaceSession: true }) });
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
    assert.equal(idOnlyLogin.status, 409);
    assert.match((await idOnlyLogin.json()).error, /more than one university/i);
    const {
      backfillLoginDirectory,
      loginDirectoryComplete,
      loginDirectoryCandidates,
    } = await import('../src/platform/loginDirectory.js');
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
    const indexedStudentIdLogin = await fetch(`${origin}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'late-001', password: 'late-password', replaceSession: true }) });
    const indexedStudentIdPayload = await indexedStudentIdLogin.json();
    assert.equal(indexedStudentIdLogin.status, 200, JSON.stringify(indexedStudentIdPayload));
    assert.equal(indexedStudentIdPayload.user.universityId, 'gamma');

    // Existing production rows may retain mixed-case emails from older imports.
    // Both the root router and university-specific login must still resolve them.
    const legacyUppercaseId = new mongoose.Types.ObjectId();
    const legacyUppercaseEmail = 'Legacy.Student@Example.Test';
    const gammaTenant = await getTenant('gamma');
    await gammaTenant.connection.collection('users').insertOne({
      _id: legacyUppercaseId,
      role: 'student',
      name: 'Legacy uppercase student',
      email: legacyUppercaseEmail,
      studentId: 'legacy-uppercase-001',
      passwordHash: await User.hashPassword('legacy-password'),
      isActive: true,
    });
    assert.equal((await loginDirectoryCandidates(legacyUppercaseEmail)).length, 0);
    const legacyRootLogin = await fetch(`${origin}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'legacy.student@example.test', password: 'legacy-password' }) });
    assert.equal(legacyRootLogin.status, 200, await legacyRootLogin.text());
    assert.equal((await loginDirectoryCandidates(legacyUppercaseEmail)).length, 1);
    const legacyTenantLogin = await fetch(`${origin}/api/u/gamma/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'LEGACY.STUDENT@EXAMPLE.TEST', password: 'legacy-password', replaceSession: true }) });
    assert.equal(legacyTenantLogin.status, 200);
    assert.ok((await legacyTenantLogin.json()).user);

    assert.equal((await getTenant('gamma')).universityId, 'gamma');
    const get = (id, path, cookie) => fetch(`${origin}/api/u/${id}${path}`, { headers: { Cookie: cookie } });
    const cross = await get('beta', '/auth/me', alphaCookie);
    assert.equal(cross.status, 401);
    const alpha = await get('alpha', '/students/list', alphaCookie);
    const beta = await get('beta', '/students/list', betaCookie);
    // The root login above is the newest session for the gamma administrator.
    const gammaMe = await get('gamma', '/auth/me', rootCookie);
    assert.equal(alpha.status, 200);
    assert.equal(beta.status, 200);
    assert.equal(gammaMe.status, 200);
    assert.match(JSON.stringify(await alpha.json()), /alpha student/);
    assert.match(JSON.stringify(await beta.json()), /beta student/);
    const { dropTenantDatabase } = await import('../src/platform/tenantConnections.js');
    await assert.rejects(dropTenantDatabase(mongo.getUri('alpha'), 'gamma'), /identity does not match/);
    await University.updateOne({ universityId: 'gamma' }, { $set: { dbUriEncrypted: encryptTenantSecret(mongo.getUri('alpha')) } });
    const wrongDatabaseDelete = await fetch(`${origin}/api/platform/admin/universities/gamma`, {
      method: 'DELETE', headers: { Cookie: platformCookie },
    });
    assert.equal(wrongDatabaseDelete.status, 422);
    assert.equal((await University.findOne({ universityId: 'gamma' })).active, true);
    await University.updateOne({ universityId: 'gamma' }, { $set: { dbUriEncrypted: encryptTenantSecret(gammaUri) } });
    const deletedGamma = await fetch(`${origin}/api/platform/admin/universities/gamma`, {
      method: 'DELETE', headers: { Cookie: platformCookie },
    });
    assert.equal(deletedGamma.status, 200, await deletedGamma.text());
    assert.equal(await University.countDocuments({ universityId: 'gamma' }), 0);
    assert.equal((await loginDirectoryCandidates('gamma-admin@example.test')).length, 0);
    const afterDelete = await mongoose.createConnection(gammaUri).asPromise();
    assert.deepEqual(await afterDelete.db.listCollections({}, { nameOnly: true }).toArray(), []);
    await afterDelete.close();
    const reusableDatabase = await testDatabase('gamma-replacement', gammaUri);
    assert.equal(reusableDatabase.status, 200, await reusableDatabase.text());
    const activeDatabaseInspect = await fetch(`${origin}/api/platform/admin/universities/orphaned-database/inspect`, {
      method: 'POST', headers: { Cookie: platformCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbUri: mongo.getUri('alpha') }),
    });
    assert.equal(activeDatabaseInspect.status, 409);
    const oldUri = mongo.getUri('old-deleted');
    await testTenantConnection(oldUri, 'old-deleted', { claim: true });
    const oldConnection = await mongoose.createConnection(oldUri).asPromise();
    await oldConnection.collection('old_students').insertOne({ name: 'Previously deleted student' });
    await oldConnection.close();
    const { PlatformAudit } = await import('../src/platform/models.js');
    await PlatformAudit.create({ actor: 'test', action: 'university.deleted', universityId: 'old-deleted' });
    const inspectOld = await fetch(`${origin}/api/platform/admin/universities/orphaned-database/inspect`, {
      method: 'POST', headers: { Cookie: platformCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbUri: oldUri }),
    });
    const inspectOldBody = await inspectOld.json();
    assert.equal(inspectOld.status, 200, JSON.stringify(inspectOldBody));
    assert.equal(inspectOldBody.universityId, 'old-deleted');
    const wrongConfirmation = await fetch(`${origin}/api/platform/admin/universities/orphaned-database`, {
      method: 'DELETE', headers: { Cookie: platformCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbUri: oldUri, confirmUniversityId: 'someone-else' }),
    });
    assert.equal(wrongConfirmation.status, 400);
    const eraseOld = await fetch(`${origin}/api/platform/admin/universities/orphaned-database`, {
      method: 'DELETE', headers: { Cookie: platformCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbUri: oldUri, confirmUniversityId: 'old-deleted' }),
    });
    assert.equal(eraseOld.status, 200, await eraseOld.text());
    const clearedOld = await mongoose.createConnection(oldUri).asPromise();
    assert.deepEqual(await clearedOld.db.listCollections({}, { nameOnly: true }).toArray(), []);
    await clearedOld.close();
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
