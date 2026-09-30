import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import CodingTopic from '../src/models/CodingTopic.js';
import CodingTag from '../src/models/CodingTag.js';
import Problem from '../src/models/Problem.js';
import QuestionLibrary from '../src/models/QuestionLibrary.js';
import User from '../src/models/User.js';
import {
  assignCodingTopicsBulk,
  createCodingTag,
  createCodingTopic,
  listCodingTags,
  listCodingTopics,
  updateCodingTopic,
} from '../src/controllers/codingTopicController.js';
import { listLibraryQuestions } from '../src/controllers/questionLibraryController.js';
import { ensureQuestionLibrarySynchronized } from '../src/services/questionLibraryService.js';

let mongo;
const adminId = new mongoose.Types.ObjectId();

function responseCapture() {
  const state = { statusCode: 200, body: null };
  return {
    state,
    status(code) { state.statusCode = code; return this; },
    json(body) { state.body = body; return this; },
  };
}

async function createTopic(body) {
  const res = responseCapture();
  await createCodingTopic({ body, user: { _id: adminId, role: 'admin' } }, res);
  assert.equal(res.state.statusCode, 201);
  return res.state.body.topic;
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'coding_topics_test' });
  await Promise.all([CodingTopic.init(), CodingTag.init(), Problem.init(), QuestionLibrary.init(), User.init()]);
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('dynamic topics support arbitrary parent-child hierarchy and counts', async () => {
  const array = await createTopic({ name: 'Array' });
  const pointers = await createTopic({ name: 'Two Pointers', parentId: array._id });
  const advanced = await createTopic({ name: 'Opposing Pointers', parentId: pointers._id });
  assert.deepEqual(advanced.ancestorIds.map(String), [String(array._id), String(pointers._id)]);

  const problem = await Problem.create({
    title: 'Pair Search',
    difficulty: 'Easy',
    supportedLanguages: ['python'],
    topicIds: [advanced._id],
    topicAncestorIds: advanced.ancestorIds,
    createdBy: adminId,
  });
  await QuestionLibrary.create({
    sourceKey: `problem:${problem._id}`,
    sourceType: 'compiler',
    sourceProblemId: problem._id,
    questionType: 'coding',
    questionText: problem.title,
    topicIds: problem.topicIds,
    topicAncestorIds: problem.topicAncestorIds,
    questionData: { type: 'coding' },
    createdBy: adminId,
  });

  const res = responseCapture();
  await listCodingTopics({ query: {}, user: { role: 'admin' } }, res);
  const byName = new Map(res.state.body.topics.map((topic) => [topic.name, topic]));
  assert.equal(byName.get('Array').directQuestionCount, 0);
  assert.equal(byName.get('Array').totalQuestionCount, 1);
  assert.equal(byName.get('Opposing Pointers').directQuestionCount, 1);
});

test('bulk assignment supports add, remove and replace', async () => {
  const graph = await createTopic({ name: 'Graph' });
  const bfs = await createTopic({ name: 'BFS', parentId: graph._id });
  const problem = await Problem.findOne({ title: 'Pair Search' });
  const library = await QuestionLibrary.findOne({ sourceProblemId: problem._id });

  let res = responseCapture();
  await assignCodingTopicsBulk({ body: { questionIds: [library._id], topicIds: [bfs._id], mode: 'replace' }, user: { _id: adminId } }, res);
  assert.equal(res.state.body.updated, 1);
  let updated = await Problem.findById(problem._id).lean();
  assert.deepEqual(updated.topicIds.map(String), [String(bfs._id)]);
  assert.deepEqual(updated.topicAncestorIds.map(String), [String(graph._id)]);

  res = responseCapture();
  await assignCodingTopicsBulk({ body: { questionIds: [library._id], topicIds: [bfs._id], mode: 'remove' }, user: { _id: adminId } }, res);
  updated = await Problem.findById(problem._id).lean();
  assert.equal(updated.topicIds.length, 0);
});

test('moving a parent below its descendant is rejected', async () => {
  const array = await CodingTopic.findOne({ name: 'Array' });
  const child = await CodingTopic.findOne({ name: 'Two Pointers' });
  const res = responseCapture();
  await assert.rejects(
    updateCodingTopic({ params: { id: String(array._id) }, body: { parentId: String(child._id) }, user: { _id: adminId } }, res),
    /descendants/,
  );
});

test('topic and tag option APIs provide bounded server-side search', async () => {
  let res = responseCapture();
  await listCodingTopics({ query: { search: 'Graph', limit: '1', page: '1' }, user: { role: 'admin' } }, res);
  assert.equal(res.state.body.topics.length, 1);
  assert.equal(res.state.body.topics[0].name, 'Graph');
  assert.equal(res.state.body.pagination.limit, 1);

  const tagResponse = responseCapture();
  await createCodingTag({ body: { name: 'Binary Search' }, user: { _id: adminId, role: 'admin' } }, tagResponse);
  res = responseCapture();
  await listCodingTags({ query: { search: 'Binary', limit: '10' }, user: { role: 'admin' } }, res);
  assert.equal(res.state.body.tags.length, 1);
  assert.equal(res.state.body.tags[0].name, 'Binary Search');
});

test('question-bank filtering supports descendant, direct and uncategorized modes', async () => {
  const graph = await CodingTopic.findOne({ name: 'Graph' }).lean();
  const bfs = await CodingTopic.findOne({ name: 'BFS' }).lean();
  const problem = await Problem.findOne({ title: 'Pair Search' });
  problem.topicIds = [bfs._id];
  problem.topicAncestorIds = [graph._id];
  await problem.save();
  await QuestionLibrary.updateMany({ sourceProblemId: problem._id }, { $set: { topicIds: [bfs._id], topicAncestorIds: [graph._id] } });

  const uncategorized = await Problem.create({ title: 'Uncategorized', supportedLanguages: ['python'], createdBy: adminId });
  await QuestionLibrary.create({ sourceKey: `problem:${uncategorized._id}`, sourceType: 'compiler', sourceProblemId: uncategorized._id, questionType: 'coding', questionText: uncategorized.title, topicIds: [], topicAncestorIds: [], questionData: { type: 'coding' }, createdBy: adminId });
  await ensureQuestionLibrarySynchronized({ force: true, blocking: true });

  let res = responseCapture();
  await listLibraryQuestions({ query: { type: 'coding', topicIds: String(graph._id), topicScope: 'descendants' }, user: { role: 'admin' } }, res);
  assert.equal(res.state.body.pagination.total, 1);
  assert.equal(res.state.body.questions[0].questionText, 'Pair Search');

  res = responseCapture();
  await listLibraryQuestions({ query: { type: 'coding', topicIds: String(graph._id), topicScope: 'direct' }, user: { role: 'admin' } }, res);
  assert.equal(res.state.body.pagination.total, 0);

  res = responseCapture();
  await listLibraryQuestions({ query: { type: 'coding', uncategorized: 'true' }, user: { role: 'admin' } }, res);
  assert.equal(res.state.body.pagination.total, 1);
  assert.equal(res.state.body.questions[0].questionText, 'Uncategorized');
});

test('controlled coding tags can be created, counted and filtered with AND matching', async () => {
  const firstResponse = responseCapture();
  await createCodingTag({ body: { name: 'Sliding Window' }, user: { _id: adminId, role: 'admin' } }, firstResponse);
  const secondResponse = responseCapture();
  await createCodingTag({ body: { name: 'Optimization' }, user: { _id: adminId, role: 'admin' } }, secondResponse);
  const first = firstResponse.state.body.tag;
  const second = secondResponse.state.body.tag;
  const problem = await Problem.findOne({ title: 'Pair Search' });
  problem.codingTagIds = [first._id, second._id];
  problem.tags = [first.name, second.name];
  await problem.save();
  await QuestionLibrary.updateMany({ sourceProblemId: problem._id }, { $set: { codingTagIds: problem.codingTagIds, tags: problem.tags } });

  const listResponse = responseCapture();
  await listCodingTags({ query: {}, user: { role: 'admin' } }, listResponse);
  const counts = new Map(listResponse.state.body.tags.map((tag) => [tag.name, tag.questionCount]));
  assert.equal(counts.get('Sliding Window'), 1);
  assert.equal(counts.get('Optimization'), 1);

  const filterResponse = responseCapture();
  await listLibraryQuestions({ query: { type: 'coding', tagIds: `${first._id},${second._id}`, tagMatch: 'all' }, user: { role: 'admin' } }, filterResponse);
  assert.equal(filterResponse.state.body.pagination.total, 1);
  assert.equal(filterResponse.state.body.questions[0].questionText, 'Pair Search');

  const arrayTopic = await CodingTopic.findOne({ name: 'Array' }).lean();
  const eitherResponse = responseCapture();
  await listLibraryQuestions({ query: { type: 'coding', topicIds: String(arrayTopic._id), topicScope: 'direct', tagIds: String(first._id), classificationMatch: 'any' }, user: { role: 'admin' } }, eitherResponse);
  assert.equal(eitherResponse.state.body.pagination.total, 1);
  assert.equal(eitherResponse.state.body.questions[0].questionText, 'Pair Search');

  const bothResponse = responseCapture();
  await listLibraryQuestions({ query: { type: 'coding', topicIds: String(arrayTopic._id), topicScope: 'direct', tagIds: String(first._id), classificationMatch: 'all' }, user: { role: 'admin' } }, bothResponse);
  assert.equal(bothResponse.state.body.pagination.total, 0);

  const searchResponse = responseCapture();
  const graphTopic = await CodingTopic.findOne({ name: 'Graph' }).lean();
  await listLibraryQuestions({ query: { type: 'coding', search: 'Pair', topicIds: String(graphTopic._id), topicScope: 'descendants' }, user: { role: 'admin' } }, searchResponse);
  assert.equal(searchResponse.state.body.pagination.total, 1);
});
