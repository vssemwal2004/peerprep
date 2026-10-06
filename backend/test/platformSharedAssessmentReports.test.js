import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

test('university reports use local submissions for a central assessment definition', async (t) => {
  let mongo;
  try { mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } }); }
  catch (error) {
    if (error?.code === 'EPERM') return t.skip('Local sockets are unavailable in this sandbox');
    throw error;
  }
  const originalFetch = globalThis.fetch;
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'university';
  process.env.PEERPREP_CONTROL_URL = 'https://control.example.com';
  process.env.PEERPREP_UNIVERSITY_ID = 'north-campus';
  process.env.PEERPREP_SHARED_API_KEY = 'a'.repeat(40);
  const assessmentId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  globalThis.fetch = async (url) => {
    const path = String(url);
    const body = path.endsWith('/policy')
      ? { permissions: { assessments: true } }
      : { assessment: { _id: String(assessmentId), title: 'Central exam', assessmentType: 'mixed', lifecycleStatus: 'published', isVisible: true,
        targetType: 'all', startTime: new Date(Date.now() - 1000).toISOString(), endTime: new Date(Date.now() + 3600000).toISOString(), duration: 60,
        sections: [{ sectionName: 'Questions', type: 'mcq', questions: [{ questionId: 'q1', type: 'mcq', questionText: 'One?', options: ['A', 'B'], correctOptionIndex: 0 }] }],
        platformPublished: true } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await mongoose.connect(mongo.getUri());
    const { default: User } = await import('../src/models/User.js');
    const { default: AssessmentSubmission } = await import('../src/models/AssessmentSubmission.js');
    const { getAssessmentReports, getAssessmentReportsExportData } = await import('../src/controllers/assessmentController.js');
    await User.collection.insertOne({ _id: studentId, role: 'student', name: 'Sample Student', studentId: 'S100', email: 'student@test.example', passwordHash: 'unused' });
    await AssessmentSubmission.collection.insertOne({ _id: new mongoose.Types.ObjectId(), assessmentId, studentId, status: 'submitted', evaluationStatus: 'completed', score: 1, maxMarks: 1, accuracy: 100, attemptCount: 1, startedAt: new Date(), submittedAt: new Date(), tabSwitches: 0, fullscreenExits: 0, cameraFlags: 0, copyPasteCount: 0 });
    const call = async (handler) => {
      let result;
      const response = { json: (value) => { result = value; return value; }, status(code) { this.statusCode = code; return this; } };
      await handler({ query: { assessmentId: String(assessmentId) }, user: { role: 'admin' } }, response);
      return result;
    };
    const report = await call(getAssessmentReports);
    assert.equal(report.assessments[0].title, 'Central exam');
    assert.equal(report.students.length, 1);
    assert.equal(report.students[0].studentName, 'Sample Student');
    assert.equal(report.summary.avgScore, 1);
    const exported = await call(getAssessmentReportsExportData);
    assert.equal(exported.rows.length, 1);
    assert.equal(exported.rows[0].assessmentName, 'Central exam');
    assert.equal(exported.rows[0].candidateStudentId, 'S100');
  } finally {
    globalThis.fetch = originalFetch;
    await mongoose.disconnect();
    await mongo.stop();
  }
});
