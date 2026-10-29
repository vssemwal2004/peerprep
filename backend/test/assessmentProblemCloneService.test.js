import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Problem from '../src/models/Problem.js';
import TestCase from '../src/models/TestCase.js';
import QuestionLibrary from '../src/models/QuestionLibrary.js';
import { cloneProblemForAssessment, claimAssessmentDraftProblems } from '../src/services/assessmentProblemCloneService.js';
import { deleteAssessmentQuestionArtifacts } from '../src/services/assessmentQuestionCleanupService.js';

let mongo;
let skipped = false;

before(async () => {
  try {
    mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', launchTimeout: 60_000 } });
  } catch (error) {
    if (error?.code === 'EPERM') { skipped = true; return; }
    throw error;
  }
  await mongoose.connect(mongo.getUri(), { dbName: 'assessment_problem_clone_test' });
  await Promise.all([Problem.init(), TestCase.init(), QuestionLibrary.init()]);
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('assessment clone owns independent runners, templates, and test cases', async (t) => {
  if (skipped) return t.skip('Local sockets are unavailable in this sandbox');
  const userId = new mongoose.Types.ObjectId();
  const assessmentId = new mongoose.Types.ObjectId();
  const source = await Problem.create({
    title: 'Add two numbers',
    executionMode: 'function',
    functionContract: {
      methodName: 'add',
      parameters: [{ name: 'left', type: 'integer' }, { name: 'right', type: 'integer' }],
      returnType: 'integer',
    },
    supportedLanguages: ['cpp'],
    codeTemplates: { cpp: 'class Solution { public: int add(int left, int right) { } };' },
    executionHarnesses: { cpp: '{{USER_CODE}}\nint main() { return 0; }' },
    referenceSolutions: { cpp: 'class Solution { public: int add(int left, int right) { return left + right; } };' },
    status: 'published',
    visibility: 'public',
    createdBy: userId,
  });
  await TestCase.create({ problem: source._id, kind: 'hidden', position: 1, input: '2, 5', output: '7', marks: 4, createdBy: userId });

  const clone = await cloneProblemForAssessment(source._id, { assessmentId, userId });
  assert.notEqual(String(clone._id), String(source._id));
  assert.equal(String(clone.assessmentOwnerId), String(assessmentId));
  assert.equal(String(clone.assessmentSourceProblemId), String(source._id));
  assert.equal(clone.visibility, 'assessment');
  assert.match(clone.executionHarnesses.get('cpp'), /int main/);
  assert.equal(await TestCase.countDocuments({ problem: clone._id }), 1);

  clone.title = 'Assessment-specific wording';
  clone.codeTemplates.set('cpp', 'class Solution { public: int add(int a, int b) { return 0; } };');
  await clone.save();
  const unchanged = await Problem.findById(source._id);
  assert.equal(unchanged.title, 'Add two numbers');
  assert.match(unchanged.codeTemplates.get('cpp'), /left, int right/);

  const second = await cloneProblemForAssessment(source._id, { assessmentId, userId });
  assert.equal(String(second._id), String(clone._id), 'cloning is idempotent for an assessment');
});

test('saving an assessment claims a draft clone and rewrites every coding reference', async (t) => {
  if (skipped) return t.skip('Local sockets are unavailable in this sandbox');
  const userId = new mongoose.Types.ObjectId();
  const assessmentId = new mongoose.Types.ObjectId();
  const source = await Problem.create({ title: 'Draft source', createdBy: userId });
  const draftClone = await cloneProblemForAssessment(source._id, { draftKey: 'new_test', userId });
  const questionSets = [{ sections: [{ type: 'coding', questions: [{
    type: 'coding',
    problemId: draftClone._id,
    problemDataSnapshot: { _id: draftClone._id, title: draftClone.title },
    coding: { problemId: draftClone._id, problemData: { _id: draftClone._id } },
  }] }] }];

  await claimAssessmentDraftProblems(questionSets, { assessmentId, userId });
  const claimed = await Problem.findById(draftClone._id).select('+assessmentDraftKey');
  assert.equal(String(claimed.assessmentOwnerId), String(assessmentId));
  assert.equal(claimed.assessmentDraftKey, '');
  assert.equal(String(questionSets[0].sections[0].questions[0].problemId), String(draftClone._id));
});

test('assessment deletion removes assessment-only MCQs and coding clones but preserves reusable library questions', async (t) => {
  if (skipped) return t.skip('Local sockets are unavailable in this sandbox');
  const userId = new mongoose.Types.ObjectId();
  const assessmentId = new mongoose.Types.ObjectId();
  const source = await Problem.create({ title: 'Reusable coding problem', createdBy: userId });
  const clone = await cloneProblemForAssessment(source._id, { assessmentId, userId });
  await TestCase.create({ problem: clone._id, kind: 'sample', position: 1, input: '1', output: '1', createdBy: userId });

  await QuestionLibrary.create([
    {
      sourceKey: `assessment:${assessmentId}:temporary-mcq`,
      sourceType: 'assessment',
      sourceAssessmentId: assessmentId,
      questionType: 'mcq',
      questionText: 'Assessment-only MCQ',
      questionData: { type: 'mcq', saveToLibrary: false },
      createdBy: userId,
    },
    {
      sourceKey: 'manual:reusable-mcq',
      sourceType: 'manual',
      questionType: 'mcq',
      questionText: 'Reusable MCQ',
      questionData: { type: 'mcq', saveToLibrary: true },
      createdBy: userId,
    },
  ]);

  await deleteAssessmentQuestionArtifacts(assessmentId);
  assert.equal(await Problem.countDocuments({ _id: clone._id }), 0);
  assert.equal(await TestCase.countDocuments({ problem: clone._id }), 0);
  assert.equal(await QuestionLibrary.countDocuments({ sourceAssessmentId: assessmentId }), 0);
  assert.equal(await QuestionLibrary.countDocuments({ sourceKey: 'manual:reusable-mcq' }), 1);
  assert.equal(await Problem.countDocuments({ _id: source._id }), 1);
});
