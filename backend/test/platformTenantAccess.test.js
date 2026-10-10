import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

test('central API scopes assessments and revokes university access', async (t) => {
  let mongo;
  try { mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } }); }
  catch (error) {
    if (error?.code === 'EPERM') return t.skip('Local sockets are unavailable in this sandbox');
    throw error;
  }
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'control';
  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
  process.env.JWT_SECRET = 'test-secret-abcdefghijklmnopqrstuvwxyz-123456';
  await mongoose.connect(mongo.getUri());
  const { verifyDeploymentDatabaseIdentity } = await import('../src/platform/dbIdentity.js');
  await verifyDeploymentDatabaseIdentity();
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'university';
  process.env.PEERPREP_UNIVERSITY_ID = 'wrong-campus';
  await assert.rejects(verifyDeploymentDatabaseIdentity(), /another PeerPrep deployment/);
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'control';
  const { default: app } = await import('../src/setupApp.js');
  const { default: User } = await import('../src/models/User.js');
  const { default: Assessment } = await import('../src/models/Assessment.js');
  const { default: QuestionLibrary } = await import('../src/models/QuestionLibrary.js');
  const { default: Semester } = await import('../src/models/Subject.js');
  const { University, Publication } = await import('../src/platform/models.js');
  const { signToken } = await import('../src/utils/jwt.js');
  const admin = await User.create({ role: 'admin', email: 'admin@test.example', name: 'Admin', passwordHash: 'unused' });
  const token = signToken({ sub: admin._id, role: 'admin', email: admin.email });
  admin.activeSessionToken = crypto.createHash('sha256').update(token).digest('hex');
  await admin.save();
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = server.address();
  const root = `http://127.0.0.1:${address.port}/api/platform`;
  const adminHeaders = { Cookie: `accessToken=${token}`, 'Content-Type': 'application/json' };
  const request = async (path, options = {}) => {
    const response = await fetch(root + path, options);
    return { status: response.status, body: await response.json() };
  };
  try {
    const created = await request('/admin/universities', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ universityId: 'north-campus', name: 'North Campus' }) });
    assert.equal(created.status, 201);
    assert.ok(created.body.apiKey.length >= 32);
    assert.equal(created.body.university.apiKeyHash, undefined);
    const tenantHeaders = { 'X-PeerPrep-University': 'north-campus', 'X-PeerPrep-Key': created.body.apiKey };
    const wrong = await request('/tenant/policy', { headers: { ...tenantHeaders, 'X-PeerPrep-Key': 'x'.repeat(40) } });
    assert.equal(wrong.status, 401);
    const policy = await request('/tenant/policy', { headers: tenantHeaders });
    assert.equal(policy.status, 200);
    assert.equal(policy.body.sources.learning, 'university');
    assert.equal(policy.body.sources.questions, 'university');
    const savedDefaults = await request('/admin/defaults', { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ permissions: { events: false }, sources: { questions: 'shared' } }) });
    assert.equal(savedDefaults.status, 200);
    assert.equal((await request('/tenant/policy', { headers: tenantHeaders })).body.permissions.events, true);

    const assessmentId = new mongoose.Types.ObjectId();
    await Assessment.collection.insertOne({ _id: assessmentId, title: 'Shared exam', lifecycleStatus: 'published', isVisible: true, startTime: new Date(Date.now() - 1000), endTime: new Date(Date.now() + 3600000), duration: 60, sections: [], targetType: 'selected', assignedStudents: [new mongoose.Types.ObjectId()] });
    assert.equal((await request('/tenant/assessments', { headers: tenantHeaders })).body.assessments.length, 0);
    const published = await request(`/admin/publications/assessment/${assessmentId}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ published: true, universityIds: ['north-campus'] }) });
    assert.equal(published.status, 200);
    const visible = await request('/tenant/assessments', { headers: tenantHeaders });
    assert.equal(visible.body.assessments.length, 1);
    assert.equal(visible.body.assessments[0].targetType, 'all');
    assert.deepEqual(visible.body.assessments[0].assignedStudents, []);
    await request(`/admin/publications/assessment/${assessmentId}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ published: false, universityIds: [] }) });
    assert.equal((await request('/tenant/assessments', { headers: tenantHeaders })).body.assessments.length, 0);
    const historical = await request(`/tenant/assessments/${assessmentId}`, { headers: tenantHeaders });
    assert.equal(historical.status, 200);
    assert.equal(historical.body.assessment.platformPublished, false);

    const manualQuestion = new mongoose.Types.ObjectId();
    const privateQuestion = new mongoose.Types.ObjectId();
    const draftQuestion = new mongoose.Types.ObjectId();
    const assessmentQuestion = new mongoose.Types.ObjectId();
    await QuestionLibrary.collection.insertMany([
      { _id: manualQuestion, sourceKey: 'manual:one', sourceType: 'manual', status: 'published', visibility: 'public', questionType: 'mcq', questionText: 'Shared question', questionData: { type: 'mcq', options: ['A', 'B'], correctAnswer: 'A' } },
      { _id: privateQuestion, sourceKey: 'manual:private', sourceType: 'manual', status: 'published', visibility: 'private', questionType: 'mcq', questionText: 'Private question', questionData: { type: 'mcq' } },
      { _id: draftQuestion, sourceKey: 'manual:draft', sourceType: 'manual', status: 'draft', visibility: 'public', questionType: 'mcq', questionText: 'Draft question', questionData: { type: 'mcq' } },
      { _id: assessmentQuestion, sourceKey: 'assessment:one', sourceType: 'assessment', status: 'published', questionType: 'mcq', questionText: 'Private exam question', questionData: { type: 'mcq' } },
    ]);
    const sharedQuestions = await request('/tenant/questions', { headers: tenantHeaders });
    assert.deepEqual(sharedQuestions.body.questions.map((item) => String(item._id)), [String(manualQuestion)]);
    const safeQuestions = await request('/public-questions', { headers: adminHeaders });
    assert.deepEqual(safeQuestions.body.questions.map((item) => String(item._id)), [String(manualQuestion)]);
    assert.deepEqual(safeQuestions.body.questions[0].options, ['A', 'B']);
    assert.equal(JSON.stringify(safeQuestions.body).includes('correctAnswer'), false);
    const secondUniversity = await request('/admin/universities', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ universityId: 'south-campus', name: 'South Campus' }) });
    const secondTenantHeaders = { 'X-PeerPrep-University': 'south-campus', 'X-PeerPrep-Key': secondUniversity.body.apiKey };
    assert.equal(secondUniversity.body.university.permissions.events, false);
    assert.equal(secondUniversity.body.university.sources.questions, 'shared');
    assert.deepEqual((await request('/tenant/questions', { headers: secondTenantHeaders })).body.questions.map((item) => String(item._id)), [String(manualQuestion)]);
    const questionPublication = await request(`/admin/publications/question/${privateQuestion}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ published: true, universityIds: ['north-campus'] }) });
    assert.equal(questionPublication.status, 400);
    assert.deepEqual((await request('/tenant/questions', { headers: tenantHeaders })).body.questions.map((item) => String(item._id)), [String(manualQuestion)]);
    await QuestionLibrary.updateOne({ _id: manualQuestion }, { $set: { visibility: 'private' } });
    assert.equal((await request('/tenant/questions', { headers: tenantHeaders })).body.questions.length, 0);
    assert.equal((await request('/tenant/questions', { headers: secondTenantHeaders })).body.questions.length, 0);
    await QuestionLibrary.updateOne({ _id: manualQuestion }, { $set: { visibility: 'public' } });
    await request(`/admin/publications/assessment/${assessmentId}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ published: true, universityIds: ['south-campus'] }) });
    assert.equal((await request('/tenant/assessments', { headers: secondTenantHeaders })).body.assessments.length, 1);
    const deleted = await request('/admin/universities/south-campus', { method: 'DELETE', headers: adminHeaders });
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.body, { universityId: 'south-campus', deleted: true });
    assert.equal((await request('/tenant/policy', { headers: secondTenantHeaders })).status, 401);
    assert.equal((await request('/admin/overview', { headers: adminHeaders })).body.universities.some((item) => item.universityId === 'south-campus'), false);
    const recreated = await request('/admin/universities', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ universityId: 'south-campus', name: 'New South Campus' }) });
    assert.equal(recreated.status, 201);
    const newTenantHeaders = { 'X-PeerPrep-University': 'south-campus', 'X-PeerPrep-Key': recreated.body.apiKey };
    assert.equal((await request('/tenant/policy', { headers: newTenantHeaders })).status, 200);
    assert.equal((await request('/tenant/policy', { headers: secondTenantHeaders })).status, 401);
    assert.equal((await request('/tenant/assessments', { headers: newTenantHeaders })).body.assessments.length, 0);
    assert.equal((await request(`/tenant/assessments/${assessmentId}`, { headers: newTenantHeaders })).status, 404);
    await University.create({ universityId: 'legacy-campus', name: 'Old Campus', active: false, deletedAt: new Date(), apiKeyHash: '0'.repeat(64) });
    await Publication.updateOne({ kind: 'assessment', contentId: assessmentId }, { $addToSet: { everUniversityIds: 'legacy-campus' } });
    const legacyReplacement = await request('/admin/universities', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ universityId: 'legacy-campus', name: 'Replacement Campus' }) });
    assert.equal(legacyReplacement.status, 201);
    assert.equal((await request(`/tenant/assessments/${assessmentId}`, { headers: { 'X-PeerPrep-University': 'legacy-campus', 'X-PeerPrep-Key': legacyReplacement.body.apiKey } })).status, 404);
    await Assessment.collection.updateOne({ _id: assessmentId }, { $set: { sections: [{ title: 'Section 1', questions: [{ questionId: String(privateQuestion), questionText: 'Private question' }] }] } });
    const assignedAssessment = await request(`/tenant/assessments/${assessmentId}`, { headers: tenantHeaders });
    assert.equal(assignedAssessment.body.assessment.sections[0].questions[0].questionText, 'Private question');
    await Semester.collection.insertOne({ semesterName: 'Semester 1', coordinatorId: 'master', subjects: [], order: 0 });
    assert.equal((await request('/tenant/learning/semesters', { headers: tenantHeaders })).status, 403);

    const disabled = await request('/admin/universities/north-campus', { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ permissions: { assessments: false }, sources: { learning: 'shared' } }) });
    assert.equal(disabled.status, 200);
    assert.equal((await request('/tenant/assessments', { headers: tenantHeaders })).status, 403);
    assert.equal((await request('/tenant/learning/semesters', { headers: tenantHeaders })).body.semesters.length, 1);
    const rotated = await request('/admin/universities/north-campus/rotate-key', { method: 'POST', headers: adminHeaders });
    assert.equal(rotated.status, 200);
    assert.equal((await request('/tenant/policy', { headers: tenantHeaders })).status, 401);
    assert.equal((await request('/tenant/policy', { headers: { ...tenantHeaders, 'X-PeerPrep-Key': rotated.body.apiKey } })).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    const { closeValkeyClient } = await import('../src/utils/valkey.js');
    await closeValkeyClient();
    await mongoose.disconnect();
    await mongo.stop();
  }
});
