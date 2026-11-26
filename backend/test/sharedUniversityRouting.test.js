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
    const [{ default: app }, { University, Publication }, { encryptTenantSecret }, { testTenantConnection, getTenant, closeTenantConnections },
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
        serviceStartDate: '2020-01-01', serviceEndDate: '2099-12-31', coordinatorLimit: 100, studentLimit: 10000, prepMockStudentLimit: 3,
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
    const adminEmails = await fetch(`${origin}/api/platform/admin/universities/gamma/admin-emails`, {
      headers: { Cookie: platformCookie },
    });
    assert.equal(adminEmails.status, 200);
    assert.deepEqual(await adminEmails.json(), {
      spocEmail: 'gamma-admin@example.test', adminEmail: 'gamma-content@example.test',
    });
    const privateAdminEmails = await fetch(`${origin}/api/platform/admin/universities/gamma/admin-emails`);
    assert.equal(privateAdminEmails.status, 401);
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
    const missingMockDates = await fetch(`${origin}/api/platform/admin/universities/gamma`, {
      method: 'PATCH', headers: { Cookie: platformCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: { prepmock: true } }),
    });
    assert.equal(missingMockDates.status, 400);
    const enablePrepFeatures = await fetch(`${origin}/api/platform/admin/universities/gamma`, {
      method: 'PATCH', headers: { Cookie: platformCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: { assessments: true, quickprep: true, prepmock: true },
        prepMockStartDate: '2020-01-01', prepMockEndDate: '2099-12-31' }),
    });
    const enabledBody = await enablePrepFeatures.json();
    assert.equal(enablePrepFeatures.status, 200, JSON.stringify(enabledBody));
    assert.equal(enabledBody.university.permissions.prepmock, true, JSON.stringify(enabledBody.university.permissions));
    const enabledPolicy = await fetch(`${origin}/api/u/gamma/platform/university/policy`, { headers: { Cookie: limitedCookie } });
    assert.equal(enabledPolicy.status, 200);
    const enabledPermissions = (await enabledPolicy.json()).permissions;
    assert.equal(enabledPermissions.prepmock, true, JSON.stringify(enabledPermissions));
    assert.equal(enabledPermissions.assessments, true, JSON.stringify(enabledPermissions));
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
    assert.equal(idOnlyLogin.status, 401);
    const alphaStudentLogin = await fetch(`${origin}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'ALPHAsame-student-id', password: 'student-password' }) });
    assert.equal(alphaStudentLogin.status, 200);
    assert.equal((await alphaStudentLogin.json()).user.universityId, 'alpha');
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
    await runForTenant(await getTenant('alpha'), () => User.create({ role: 'student', email: 'alpha-mock@example.test',
      name: 'Alpha mock student', studentId: 'alpha-mock-001', passwordHash: latePasswordHash }));
    assert.equal((await loginDirectoryCandidates('late@example.test')).length, 1);
    const indexedLogin = await fetch(`${origin}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'late@example.test', password: 'late-password' }) });
    assert.equal(indexedLogin.status, 401, 'university students cannot sign in with email');
    const indexedStudentIdLogin = await fetch(`${origin}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'GAMMAlate-001', password: 'late-password', replaceSession: true }) });
    const indexedStudentIdPayload = await indexedStudentIdLogin.json();
    assert.equal(indexedStudentIdLogin.status, 200, JSON.stringify(indexedStudentIdPayload));
    assert.equal(indexedStudentIdPayload.user.universityId, 'gamma');
    assert.equal(indexedStudentIdPayload.user.loginStudentId, 'GAMMAlate-001');
    const tenantEmailStudentLogin = await fetch(`${origin}/api/u/gamma/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'late@example.test', password: 'late-password' }) });
    assert.equal(tenantEmailStudentLogin.status, 401);

    // An existing student does not need a database migration to use the prefixed ID.
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
      body: JSON.stringify({ identifier: 'GAMMAlegacy-uppercase-001', password: 'legacy-password' }) });
    assert.equal(legacyRootLogin.status, 200, await legacyRootLogin.clone().text());
    assert.equal((await legacyRootLogin.json()).user.loginStudentId, 'GAMMAlegacy-uppercase-001');
    const legacyTenantLogin = await fetch(`${origin}/api/u/gamma/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'GAMMAlegacy-uppercase-001', password: 'legacy-password', replaceSession: true }) });
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
    const universityOverview = (id, cookie = platformCookie) => fetch(`${origin}/api/platform/admin/universities/${id}/overview?range=7d`, {
      headers: { Cookie: cookie },
    });
    const alphaOverview = await universityOverview('alpha');
    const betaOverview = await universityOverview('beta');
    assert.equal(alphaOverview.status, 200, await alphaOverview.clone().text());
    assert.equal(betaOverview.status, 200, await betaOverview.clone().text());
    const alphaData = await alphaOverview.json();
    const betaData = await betaOverview.json();
    assert.equal(alphaData.role, 'admin');
    assert.equal(alphaData.range.range, '7d');
    assert.equal(alphaData.people.students, 2);
    assert.equal(betaData.people.students, 1);
    assert.equal(alphaOverview.headers.get('cache-control'), 'private, no-store');
    assert.notEqual((await universityOverview('alpha', alphaCookie)).status, 200);
    assert.equal((await universityOverview('missing')).status, 404);
    const mockStudentsUrl = `${origin}/api/u/gamma/admin/assessment/mock-students`;
    const uploadMockStudent = (cookie, name, email, studentId) => fetch(mockStudentsUrl, { method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, studentId }) });
    const mockStudents = await fetch(mockStudentsUrl, { headers: { Cookie: rootCookie } });
    assert.equal(mockStudents.status, 200, await mockStudents.clone().text());
    assert.equal((await mockStudents.json()).limit, 3);
    assert.equal((await fetch(mockStudentsUrl, { headers: { Cookie: limitedCookie } })).status, 403);
    assert.equal((await uploadMockStudent(limitedCookie, 'Late Student', 'late@example.test', 'late-001')).status, 403);
    const existingMockStudent = await uploadMockStudent(rootCookie, 'Late Student', 'late@example.test', 'late-001');
    assert.equal(existingMockStudent.status, 200);
    const existingMockBody = await existingMockStudent.json();
    assert.equal(existingMockBody.status, 'existing_student');
    assert.equal(existingMockBody.loginStudentId, 'GAMMAlate-001');
    const linkedMockStudent = await uploadMockStudent(rootCookie, 'Platform Student', 'peerprep-student@example.test', 'platform-001');
    assert.equal(linkedMockStudent.status, 200);
    assert.equal((await linkedMockStudent.json()).status, 'linked_student');
    const linkedMockLogin = await fetch(`${origin}/api/u/gamma/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'GAMMAplatform-001', password: 'student-password' }) });
    assert.equal(linkedMockLogin.status, 200);
    assert.deepEqual((await linkedMockLogin.json()).user.featureAccess.features, ['prep_mock']);
    const createdMockStudent = await uploadMockStudent(rootCookie, 'New Mock Student', 'new-mock@example.test', 'mock-001');
    assert.equal(createdMockStudent.status, 201);
    const createdMockBody = await createdMockStudent.json();
    assert.equal(createdMockBody.status, 'created');
    assert.equal(createdMockBody.loginStudentId, 'GAMMAmock-001');
    assert.ok(createdMockBody.temporaryPassword);
    const newMockLogin = await fetch(`${origin}/api/u/gamma/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'GAMMAmock-001', password: createdMockBody.temporaryPassword }) });
    assert.equal(newMockLogin.status, 200);
    const newMockUser = (await newMockLogin.json()).user;
    assert.deepEqual(newMockUser.featureAccess.features, ['prep_mock']);
    assert.ok(newMockUser.prepMockEnrolledAt);
    const newMockCookie = newMockLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await get('gamma', '/auth/dashboard', newMockCookie)).status, 403);
    assert.equal((await uploadMockStudent(rootCookie, 'Extra Mock Student', 'extra-mock@example.test', 'extra-001')).status, 409);
    const belowMockUsage = await fetch(`${origin}/api/platform/admin/universities/gamma`, { method: 'PATCH',
      headers: { Cookie: platformCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ prepMockStudentLimit: 2 }) });
    assert.equal(belowMockUsage.status, 409);
    const raiseMockLimit = await fetch(`${origin}/api/platform/admin/universities/gamma`, { method: 'PATCH',
      headers: { Cookie: platformCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ prepMockStudentLimit: 6 }) });
    assert.equal(raiseMockLimit.status, 200);
    const mockCsv = new FormData();
    mockCsv.append('file', new Blob(['name,email,studentId\nLate Student,late@example.test,late-001\nBulk One,bulk-one@example.test,bulk-001\nNo Email,invalid,bad-001\nBulk Two,bulk-two@example.test,bulk-002\n'], { type: 'text/csv' }), 'students.csv');
    const bulkMockUpload = await fetch(`${mockStudentsUrl}/bulk`, { method: 'POST', headers: { Cookie: rootCookie }, body: mockCsv });
    assert.equal(bulkMockUpload.status, 200, await bulkMockUpload.clone().text());
    const bulkMockResults = await bulkMockUpload.json();
    assert.deepEqual(bulkMockResults.entries.map((row) => row.status), ['already_enrolled', 'created', 'error', 'created']);
    assert.equal(bulkMockResults.used, 5);
    assert.ok(bulkMockResults.entries[1].temporaryPassword);
    const otherUniversityStudent = await uploadMockStudent(rootCookie, 'Alpha mock student', 'alpha-mock@example.test', 'alpha-mock-001');
    assert.equal(otherUniversityStudent.status, 200);
    assert.equal((await otherUniversityStudent.json()).status, 'linked_student');
    const otherUniversityLogin = await fetch(`${origin}/api/u/gamma/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'GAMMAalpha-mock-001', password: 'late-password' }) });
    assert.equal(otherUniversityLogin.status, 200);
    assert.deepEqual((await otherUniversityLogin.json()).user.featureAccess.features, ['prep_mock']);
    const mockStudentCookie = otherUniversityLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await uploadMockStudent(rootCookie, 'Limit Extra', 'limit-extra@example.test', 'limit-extra-001')).status, 409);
    const mockEligibleList = await get('gamma', '/students/list?prepMockOnly=true', limitedCookie);
    assert.equal(mockEligibleList.status, 200);
    const mockEligibleStudents = (await mockEligibleList.json()).students;
    assert.equal(mockEligibleStudents.length, 6);
    assert.ok(mockEligibleStudents.some((student) => student.email === 'late@example.test'));
    assert.ok(!mockEligibleStudents.some((student) => student.email === 'legacy.student@example.test'));
    const [{ default: Assessment }, { buildAssessmentRoster }, { assignedCountForAssessment }] = await Promise.all([
      import('../src/models/Assessment.js'), import('../src/controllers/assessmentLiveReportController.js'),
      import('../src/services/assessmentReportSummaryService.js'),
    ]);
    const localMockId = await runForTenant(await getTenant('gamma'), async () => {
      const mock = await Assessment.create({ kind: 'mock', company: 'Amazon', role: 'SDE 1', title: 'Uploaded students only',
        targetType: 'all', lifecycleStatus: 'published', createdBy: new mongoose.Types.ObjectId() });
      assert.equal(await assignedCountForAssessment(mock), 6);
      const roster = await buildAssessmentRoster(mock._id);
      assert.equal(roster.rows.length, 6);
      assert.ok(roster.rows.every((row) => row.email !== 'Legacy.Student@Example.Test'));
      return mock._id;
    });
    const masterMock = await Assessment.create({ kind: 'mock', company: 'Amazon', role: 'SDE 1', title: 'Master published mock',
      targetType: 'all', lifecycleStatus: 'published', createdBy: new mongoose.Types.ObjectId() });
    await Publication.create({ kind: 'assessment', contentId: masterMock._id, published: true, universityIds: ['gamma'] });
    const automaticMock = await Assessment.create({ kind: 'mock', company: 'Google', role: 'SDE 1', title: 'Automatic university mock',
      targetType: 'selected', assignedStudents: [], lifecycleStatus: 'published', createdBy: new mongoose.Types.ObjectId(),
      availabilityMode: 'always', startTime: new Date('2020-01-01'), endTime: new Date('9999-12-31T23:59:59.000Z'), duration: 30 });
    const masterCreatesMock = await fetch(`${origin}/api/admin/assessment/create`, { method: 'POST',
      headers: { Cookie: platformCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
        kind: 'mock', company: 'Amazon', role: 'SDE 1', title: 'Master draft', lifecycleStatus: 'draft',
        mockAudienceMode: 'universities', mockUniversityIds: ['gamma'], sections: [],
      }) });
    assert.equal(masterCreatesMock.status, 201, await masterCreatesMock.clone().text());
    const universityMocks = await get('gamma', '/admin/assessment/list?kind=mock', limitedCookie);
    assert.equal(universityMocks.status, 200);
    const universityMockRows = (await universityMocks.json()).assessments;
    assert.ok(!universityMockRows.some((mock) => String(mock._id) === String(localMockId)));
    assert.ok(universityMockRows.some((mock) => String(mock._id) === String(masterMock._id)));
    assert.ok(universityMockRows.some((mock) => String(mock._id) === String(automaticMock._id)), 'published mocks need no per-university assignment');
    const deliveredLegacyMock = universityMockRows.find((mock) => String(mock._id) === String(masterMock._id));
    assert.equal(deliveredLegacyMock.availabilityMode, 'always');
    assert.match(deliveredLegacyMock.endTime, /^9999-12-31/);
    const expiredMockWindow = await fetch(`${origin}/api/platform/admin/universities/gamma`, {
      method: 'PATCH', headers: { Cookie: platformCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prepMockEndDate: '2020-12-31' }),
    });
    assert.equal(expiredMockWindow.status, 200);
    const expiredPolicy = await get('gamma', '/platform/university/policy', limitedCookie);
    assert.equal((await expiredPolicy.json()).permissions.prepmock, false);
    assert.equal((await get('gamma', '/student/assessment-dashboard?kind=mock', mockStudentCookie)).status, 403);
    assert.equal((await get('gamma', `/student/assessment/${automaticMock._id}`, mockStudentCookie)).status, 404);
    assert.equal((await uploadMockStudent(rootCookie, 'Expired Student', 'expired@example.test', 'expired-001')).status, 403);
    const renewedMockWindow = await fetch(`${origin}/api/platform/admin/universities/gamma`, {
      method: 'PATCH', headers: { Cookie: platformCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prepMockEndDate: '2099-12-31' }),
    });
    assert.equal(renewedMockWindow.status, 200);
    const renewedDashboard = await get('gamma', '/student/assessment-dashboard?kind=mock', mockStudentCookie);
    assert.equal(renewedDashboard.status, 200, await renewedDashboard.clone().text());
    assert.match(JSON.stringify(await renewedDashboard.json()), /Automatic university mock/);
    const hiddenRegularId = await runForTenant(await getTenant('gamma'), async () => (await Assessment.create({
      kind: 'assessment', title: 'Regular assessment stays separate', assessmentId: 'regular-hidden-id', lifecycleStatus: 'draft',
      targetType: 'selected', createdBy: new mongoose.Types.ObjectId(),
    }))._id);
    const prepMockOnlyGrant = await fetch(`${origin}/api/platform/admin/universities/gamma`, {
      method: 'PATCH', headers: { Cookie: platformCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: { assessments: false } }),
    });
    assert.equal(prepMockOnlyGrant.status, 200, await prepMockOnlyGrant.clone().text());
    const prepMockOnlyPolicy = await get('gamma', '/platform/university/policy', limitedCookie);
    assert.deepEqual((await prepMockOnlyPolicy.json()).permissions, { ...enabledPermissions, assessments: false });
    assert.equal((await get('gamma', '/student/assessments', mockStudentCookie)).status, 403);
    const mockOnlyDashboard = await get('gamma', '/student/assessment-dashboard?kind=mock', mockStudentCookie);
    assert.equal(mockOnlyDashboard.status, 200, await mockOnlyDashboard.clone().text());
    assert.match(JSON.stringify(await mockOnlyDashboard.json()), /Automatic university mock/);
    assert.equal((await get('gamma', '/admin/assessment/list?kind=mock', limitedCookie)).status, 200);
    assert.equal((await get('gamma', `/admin/assessment/${automaticMock._id}`, limitedCookie)).status, 200);
    assert.equal((await get('gamma', `/admin/assessment/${hiddenRegularId}`, limitedCookie)).status, 403);
    assert.equal((await get('gamma', `/student/assessment/${hiddenRegularId}`, mockStudentCookie)).status, 403);
    assert.equal((await get('gamma', '/student/assessment/regular-hidden-id', mockStudentCookie)).status, 403);
    const mockOnlyAttempt = await get('gamma', `/student/assessment/${automaticMock._id}`, mockStudentCookie);
    assert.equal(mockOnlyAttempt.status, 200, await mockOnlyAttempt.clone().text());
    const restoreAssessments = await fetch(`${origin}/api/platform/admin/universities/gamma`, {
      method: 'PATCH', headers: { Cookie: platformCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: { assessments: true } }),
    });
    assert.equal(restoreAssessments.status, 200, await restoreAssessments.clone().text());
    assert.equal((await get('gamma', `/admin/assessment/${localMockId}`, limitedCookie)).status, 404);
    assert.equal((await get('gamma', `/admin/assessment/${masterMock._id}`, limitedCookie)).status, 200);
    assert.equal((await get('gamma', `/student/assessment/${localMockId}`, mockStudentCookie)).status, 404);
    assert.equal((await get('gamma', `/admin/assessment/reports?kind=mock&assessmentId=${localMockId}`, limitedCookie)).status, 404);
    assert.equal((await get('gamma', `/admin/assessment/reports?kind=mock&assessmentId=${masterMock._id}`, limitedCookie)).status, 200);
    const invalidMockAudience = await fetch(`${origin}/api/u/gamma/admin/assessment/create`, { method: 'POST',
      headers: { Cookie: limitedCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({
        kind: 'mock', company: 'Amazon', role: 'SDE 1', title: 'Invalid audience', lifecycleStatus: 'published',
        availabilityMode: 'always', duration: 30, targetType: 'selected',
        assignedStudents: [{ _id: String(legacyUppercaseId) }], sections: [],
      }) });
    assert.equal(invalidMockAudience.status, 403);
    const spocCreateMock = await fetch(`${origin}/api/u/gamma/admin/assessment/create`, { method: 'POST',
      headers: { Cookie: rootCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'mock' }) });
    assert.equal(spocCreateMock.status, 403);
    const adminCreateMock = await fetch(`${origin}/api/u/gamma/admin/assessment/create`, { method: 'POST',
      headers: { Cookie: limitedCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'mock' }) });
    assert.equal(adminCreateMock.status, 403);
    const quotaAssessments = await runForTenant(await getTenant('gamma'), () => Assessment.create([
      { kind: 'assessment', title: 'Quota assessment A', lifecycleStatus: 'published', targetType: 'selected', assignedStudents: [], createdBy: new mongoose.Types.ObjectId() },
      { kind: 'assessment', title: 'Quota assessment B', lifecycleStatus: 'published', targetType: 'selected', assignedStudents: [], createdBy: new mongoose.Types.ObjectId() },
      { kind: 'assessment', title: 'Preexisting assessment', lifecycleStatus: 'published', targetType: 'selected', assignedStudents: [legacyUppercaseId], createdBy: new mongoose.Types.ObjectId() },
    ]));
    await University.updateOne({ universityId: 'gamma' }, { $unset: { assessmentStudentLimit: 1, assessmentStudentUsed: 1 } });
    const changeAssessmentLimit = (assessmentStudentLimit) => fetch(`${origin}/api/platform/admin/universities/gamma`, {
      method: 'PATCH', headers: { Cookie: platformCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ assessmentStudentLimit }),
    });
    assert.equal((await changeAssessmentLimit(3)).status, 200);
    const quotaCounts = () => fetch(`${origin}/api/platform/admin/universities/gamma/account-counts`, { headers: { Cookie: platformCookie } });
    assert.equal((await (await quotaCounts()).json()).assessmentStudentUsed, 1, 'preexisting assignments count when the Master Admin first sets the limit');
    const addQuotaStudent = (assessment, studentId) => fetch(`${origin}/api/u/gamma/admin/assessment/${assessment._id}/students`, {
      method: 'POST', headers: { Cookie: limitedCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds: [String(studentId)] }),
    });
    assert.equal((await addQuotaStudent(quotaAssessments[0], legacyUppercaseId)).status, 200);
    assert.equal((await addQuotaStudent(quotaAssessments[1], legacyUppercaseId)).status, 200,
      'the same existing student in a second assessment uses another place');
    const anotherStudent = await runForTenant(await getTenant('gamma'), () => User.findOne({ email: 'late@example.test' }).select('_id').lean());
    assert.equal((await addQuotaStudent(quotaAssessments[1], anotherStudent._id)).status, 409);
    assert.equal((await (await quotaCounts()).json()).assessmentStudentUsed, 3);
    assert.equal((await changeAssessmentLimit(1)).status, 409);
    assert.equal((await fetch(`${origin}/api/platform/admin/universities/gamma/assessment-quota/reset`, { method: 'POST', headers: { Cookie: limitedCookie } })).status, 401);
    assert.equal((await fetch(`${origin}/api/platform/admin/universities/gamma/assessment-quota/reset`, { method: 'POST', headers: { Cookie: platformCookie } })).status, 200);
    assert.equal((await (await quotaCounts()).json()).assessmentStudentUsed, 0);
    const preexistingAfterReset = await runForTenant(await getTenant('gamma'), () => Assessment.findById(quotaAssessments[2]._id).select('assignedStudents').lean());
    assert.equal(preexistingAfterReset.assignedStudents.length, 1, 'reset preserves existing assignments');
    assert.equal((await addQuotaStudent(quotaAssessments[1], anotherStudent._id)).status, 200);
    assert.equal((await (await quotaCounts()).json()).assessmentStudentUsed, 1);
    const createQuotaAssessment = (title) => fetch(`${origin}/api/u/gamma/admin/assessment/create`, {
      method: 'POST', headers: { Cookie: limitedCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, lifecycleStatus: 'published', targetType: 'selected',
        assignedStudents: [{ _id: String(legacyUppercaseId) }],
        startTime: new Date(Date.now() + 120000).toISOString(), endTime: new Date(Date.now() + 3600000).toISOString(), duration: 30,
        sections: [{ sectionName: 'MCQ', type: 'mcq', questions: [{ type: 'mcq', questionText: 'Quota question?', options: ['A', 'B'], correctOptionIndex: 0, points: 1 }] }],
      }),
    });
    const quotaPublished = await createQuotaAssessment('Quota published assessment');
    assert.equal(quotaPublished.status, 201, await quotaPublished.clone().text());
    const quotaPublishedId = (await quotaPublished.json()).assessmentId;
    assert.equal((await (await quotaCounts()).json()).assessmentStudentUsed, 2);
    const unchangedCandidateEdit = await fetch(`${origin}/api/u/gamma/admin/assessment/${quotaPublishedId}`, {
      method: 'PUT', headers: { Cookie: limitedCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType: 'selected', assignedStudents: [{ _id: String(legacyUppercaseId) }], lifecycleStatus: 'published' }),
    });
    assert.equal(unchangedCandidateEdit.status, 200, await unchangedCandidateEdit.clone().text());
    assert.equal((await (await quotaCounts()).json()).assessmentStudentUsed, 2, 'editing the same assignment does not spend another place');
    assert.equal((await createQuotaAssessment('Second quota published assessment')).status, 201);
    assert.equal((await (await quotaCounts()).json()).assessmentStudentUsed, 3);
    assert.equal((await createQuotaAssessment('Blocked over quota')).status, 409);
    const draftBeyondQuota = await fetch(`${origin}/api/u/gamma/admin/assessment/create`, {
      method: 'POST', headers: { Cookie: limitedCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Draft with candidates', lifecycleStatus: 'draft', targetType: 'selected',
        assignedStudents: [{ _id: String(anotherStudent._id) }], sections: [] }),
    });
    assert.equal(draftBeyondQuota.status, 201, await draftBeyondQuota.clone().text());
    assert.equal((await (await quotaCounts()).json()).assessmentStudentUsed, 3);
    assert.equal((await fetch(`${origin}/api/platform/admin/universities/gamma/assessment-quota/reset`, { method: 'POST', headers: { Cookie: platformCookie } })).status, 200);
    const addByEditing = await fetch(`${origin}/api/u/gamma/admin/assessment/${quotaPublishedId}`, {
      method: 'PUT', headers: { Cookie: limitedCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType: 'selected', assignedStudents: [
        { _id: String(legacyUppercaseId) }, { _id: String(anotherStudent._id) },
      ], lifecycleStatus: 'published' }),
    });
    assert.equal(addByEditing.status, 200, await addByEditing.clone().text());
    assert.equal((await (await quotaCounts()).json()).assessmentStudentUsed, 1, 'adding a candidate while editing spends one place');
    const passwordUrl = `${origin}/api/platform/admin/universities/gamma/admin-password`;
    const resetPassword = (cookie, account, password) => fetch(passwordUrl, { method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ account, password }) });
    assert.equal((await resetPassword(limitedCookie, 'admin', 'Stronger@admin1234')).status, 401);
    assert.equal((await resetPassword(platformCookie, 'spoc', 'short')).status, 400);
    assert.equal((await resetPassword(platformCookie, 'student', 'Stronger@admin1234')).status, 400);
    assert.equal((await resetPassword(platformCookie, 'admin', 'Stronger@admin1234')).status, 200);
    assert.equal((await get('gamma', '/auth/me', limitedCookie)).status, 401);
    const oldAdminLogin = await fetch(`${origin}/api/u/gamma/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'gamma-content@example.test', password: 'gamma-content-password' }) });
    assert.equal(oldAdminLogin.status, 401);
    const newAdminLogin = await fetch(`${origin}/api/u/gamma/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'gamma-content@example.test', password: 'Stronger@admin1234' }) });
    assert.equal(newAdminLogin.status, 200);
    assert.equal((await newAdminLogin.json()).user.mustChangePassword, true);
    assert.equal((await resetPassword(platformCookie, 'spoc', 'Stronger@spoc1234')).status, 200);
    assert.equal((await get('gamma', '/auth/me', rootCookie)).status, 401);
    const newSpocLogin = await fetch(`${origin}/api/u/gamma/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'gamma-admin@example.test', password: 'Stronger@spoc1234' }) });
    assert.equal(newSpocLogin.status, 200);
    assert.equal((await newSpocLogin.json()).user.mustChangePassword, true);
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
