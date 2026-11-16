import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import { exportStudentsCsv, listAllStudents, studentListSort } from '../src/controllers/studentController.js';

let mongo;
let skipped = false;
const admin = { _id: new mongoose.Types.ObjectId(), email: 'admin@x.edu', role: 'admin', name: 'Admin' };

before(async () => {
  try {
    mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', launchTimeout: 60000 } });
  } catch (error) {
    if (error?.code === 'EPERM') { skipped = true; return; }
    throw error;
  }
  await mongoose.connect(mongo.getUri(), { dbName: 'student_list_sort_test' });
  const day = (n) => new Date(Date.UTC(2026, 0, n));
  // Created in this order (createdAt), deliberately not alphabetical.
  await User.insertMany([
    { role: 'student', name: 'charlie', email: 'c@x.edu', passwordHash: 'x', studentId: 'S3', branch: 'ME', semester: 8, section: 'A10', teacherIds: ['200'], createdAt: day(1), activeSessionCreatedAt: day(20), credentialEmailStatus: 'sent' },
    { role: 'student', name: 'Alice', email: 'a@x.edu', passwordHash: 'x', studentId: 'S1', branch: 'cse', semester: 2, section: 'A2', teacherIds: ['100'], createdAt: day(2), credentialEmailStatus: 'failed' },
    { role: 'student', name: 'bob', email: 'b@x.edu', passwordHash: 'x', studentId: 'S2', branch: 'CSE', semester: 5, section: 'B1', teacherIds: ['300'], createdAt: day(3), activeSessionCreatedAt: day(25) },
  ]);
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    send(body) { this.body = body; return this; },
  };
}

async function listNames(query) {
  const res = fakeRes();
  await listAllStudents({ query, user: admin }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  return res.body.students.map((student) => student.name);
}

test('studentListSort: whitelisted columns, direction, default and unknown keys', () => {
  assert.deepEqual(studentListSort({}).sort, { createdAt: 1, _id: 1 }, 'default is creation order, oldest first');
  assert.deepEqual(studentListSort({ sortOrder: 'desc' }).sort, { createdAt: -1, _id: -1 });
  assert.deepEqual(studentListSort({ sortBy: 'student', sortOrder: 'desc' }).sort, { name: -1, studentId: -1, createdAt: 1, _id: 1 });
  assert.deepEqual(studentListSort({ sortBy: 'coordinator' }).sort, { teacherIds: 1, createdAt: 1, _id: 1 });
  assert.deepEqual(studentListSort({ sortBy: 'status' }).sort, { activeSessionCreatedAt: -1, createdAt: 1, _id: 1 }, 'status ascending = Active first');
  assert.ok(studentListSort({ sortBy: 'email' }).collation, 'text columns sort case-insensitively');
  assert.equal(studentListSort({ sortBy: 'semester' }).collation, null);
  for (const sortBy of ['passwordHash', '__proto__', 'constructor', 'toString', 'createdAt']) {
    const result = studentListSort({ sortBy, sortOrder: 'desc' });
    assert.equal(result.sortBy, null, `${sortBy} is ignored`);
    assert.deepEqual(result.sort, { createdAt: -1, _id: -1 });
  }
});

test('list endpoint sorts by column, keeps the default order and ignores unknown sortBy', async (t) => {
  if (skipped) return t.skip('MongoDB memory server is not available here');
  assert.deepEqual(await listNames({}), ['charlie', 'Alice', 'bob'], 'default unchanged: oldest first');
  assert.deepEqual(await listNames({ sortOrder: 'desc' }), ['bob', 'Alice', 'charlie']);
  assert.deepEqual(await listNames({ sortBy: 'student' }), ['Alice', 'bob', 'charlie'], 'name sort ignores case');
  assert.deepEqual(await listNames({ sortBy: 'student', sortOrder: 'desc' }), ['charlie', 'bob', 'Alice']);
  assert.deepEqual(await listNames({ sortBy: 'semester' }), ['Alice', 'bob', 'charlie'], 'semester sorts numerically');
  assert.deepEqual(await listNames({ sortBy: 'section' }), ['Alice', 'charlie', 'bob'], 'A2 < A10 < B1');
  assert.deepEqual(await listNames({ sortBy: 'branch' }), ['Alice', 'bob', 'charlie'], 'equal branches keep creation order');
  assert.deepEqual(await listNames({ sortBy: 'status' }), ['bob', 'charlie', 'Alice'], 'signed-in (newest first) before awaiting login');
  assert.deepEqual(await listNames({ sortBy: 'passwordHash', sortOrder: 'desc' }), ['bob', 'Alice', 'charlie'], 'unknown sortBy falls back to the default order');
  assert.deepEqual(await listNames({ sortBy: 'student', page: '2', limit: '2' }), ['charlie'], 'paging applies after sorting');
});

test('CSV export uses the same sort as the list', async (t) => {
  if (skipped) return t.skip('MongoDB memory server is not available here');
  const res = fakeRes();
  await exportStudentsCsv({ query: { sortBy: 'student', sortOrder: 'desc' }, user: admin }, res);
  const names = String(res.body).split('\n').slice(1).map((line) => line.split(',')[0]);
  assert.deepEqual(names, ['charlie', 'bob', 'Alice']);
});
