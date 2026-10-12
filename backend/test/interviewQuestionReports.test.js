import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Problem from '../src/models/Problem.js';
import { interviewReportSummaries, reporterKey, saveInterviewReport } from '../src/platform/interviewQuestionReports.js';
import { resetCompanyCatalogCache, setVoteThreshold } from '../src/platform/interviewCompanies.js';

test('interview reports from different universities produce one global company tag and latest date', async (t) => {
  let mongo;
  try { mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } }); }
  catch (error) {
    if (error?.code === 'EPERM') return t.skip('Local sockets are unavailable in this sandbox');
    throw error;
  }
  try {
    await mongoose.connect(mongo.getUri());
    // A catalog company (problem tag) and a two-student threshold so this file keeps testing aggregation.
    await Problem.collection.insertOne({ title: 'Tagged', status: 'published', visibility: 'public', companyTags: ['Example Labs'] });
    await setVoteThreshold(2);
    resetCompanyCatalogCache();
    const questionId = new mongoose.Types.ObjectId();
    const first = { scopeKey: 'control', questionId,
      reporter: reporterKey('campus-one', new mongoose.Types.ObjectId()),
      body: { company: 'Example Labs', jobTitle: 'Engineer', interviewDate: '2025-01-15' } };
    const second = { ...first, reporter: reporterKey('campus-two', new mongoose.Types.ObjectId()),
      body: { company: 'example labs', jobTitle: 'Engineer', interviewDate: '2025-03-01' } };
    await saveInterviewReport(first);
    assert.deepEqual((await saveInterviewReport(first)).company, { name: 'Example Labs', status: 'listed' });
    await saveInterviewReport(second);
    await saveInterviewReport({ ...first, scopeKey: 'university:campus-one',
      reporter: reporterKey('campus-one', new mongoose.Types.ObjectId()),
      body: { company: 'Private Campus', jobTitle: 'Engineer', interviewDate: '2025-04-01' } });
    const summaries = await interviewReportSummaries(['control']);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].reports, 2);
    assert.equal(summaries[0].companyKey, 'example labs');
    assert.equal(summaries[0].latestDate.toISOString().slice(0, 10), '2025-03-01');
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
